using System;
using System.IO;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Net.Sockets;
using System.Text;

namespace ScheduleSync.Desktop;

public sealed class LocalBackendHost : IAsyncDisposable
{
    private static readonly HttpClient HttpClient = new()
    {
        Timeout = TimeSpan.FromSeconds(2),
    };

    private readonly DesktopPaths _paths;
    private readonly object _logSync = new();

    private Process? _process;
    private StreamWriter? _logWriter;

    public LocalBackendHost(DesktopPaths paths)
    {
        _paths = paths;
    }

    public Uri? BaseUri { get; private set; }

    public async Task<Uri> StartAsync(IProgress<string> progress, CancellationToken cancellationToken)
    {
        var missingPayload = _paths.ValidateRuntimePayload();
        if (missingPayload.Count > 0)
        {
            throw new InvalidOperationException(
                "The desktop runtime payload is incomplete:\n" + string.Join("\n", missingPayload));
        }

        progress.Report("Allocating a local port...");
        var port = GetFreeTcpPort();
        var baseUri = new Uri($"http://127.0.0.1:{port}/");
        BaseUri = baseUri;

        ResetLogFile();

        progress.Report("Starting the local backend...");
        var startInfo = new ProcessStartInfo
        {
            FileName = _paths.NodeExePath,
            Arguments = "dist/server.js",
            WorkingDirectory = _paths.BackendRoot,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };

        startInfo.Environment["NODE_ENV"] = "production";
        startInfo.Environment["HOST"] = "127.0.0.1";
        startInfo.Environment["PORT"] = port.ToString();
        startInfo.Environment["SCHEDULESYNC_DATA_DIR"] = _paths.DataRoot;
        startInfo.Environment["SCHEDULESYNC_STATIC_DIR"] = _paths.FrontendRoot;
        startInfo.Environment["SCHEDULESYNC_SHUTDOWN_ON_STDIN_CLOSE"] = "1";

        _process = new Process
        {
            StartInfo = startInfo,
            EnableRaisingEvents = true,
        };

        _process.OutputDataReceived += (_, e) => AppendLog("OUT", e.Data);
        _process.ErrorDataReceived += (_, e) => AppendLog("ERR", e.Data);

        if (!_process.Start())
        {
            throw new InvalidOperationException("Failed to launch the bundled backend runtime.");
        }

        _process.BeginOutputReadLine();
        _process.BeginErrorReadLine();

        progress.Report("Waiting for the backend API...");
        await WaitForHealthAsync(baseUri, progress, cancellationToken);
        return baseUri;
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }

    public async Task StopAsync()
    {
        if (_process is null)
        {
            return;
        }

        try
        {
            _process.StandardInput.Close();
        }
        catch
        {
        }

        try
        {
            await _process.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));
        }
        catch
        {
            if (!_process.HasExited)
            {
                _process.Kill(entireProcessTree: true);
                await _process.WaitForExitAsync();
            }
        }

        _process.Dispose();
        _process = null;

        if (_logWriter is not null)
        {
            await _logWriter.FlushAsync();
            _logWriter.Dispose();
            _logWriter = null;
        }
    }

    private static int GetFreeTcpPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    private void ResetLogFile()
    {
        if (_logWriter is not null)
        {
            _logWriter.Dispose();
        }

        _logWriter = new StreamWriter(_paths.BackendLogPath, append: false, Encoding.UTF8)
        {
            AutoFlush = true,
        };
    }

    private void AppendLog(string streamName, string? line)
    {
        if (string.IsNullOrWhiteSpace(line) || _logWriter is null)
        {
            return;
        }

        lock (_logSync)
        {
            _logWriter.WriteLine($"[{DateTimeOffset.Now:O}] {streamName}: {line}");
        }
    }

    private async Task WaitForHealthAsync(
        Uri baseUri,
        IProgress<string> progress,
        CancellationToken cancellationToken)
    {
        var healthUri = new Uri(baseUri, "api/health");
        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(90));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        while (!linkedCts.IsCancellationRequested)
        {
            if (_process is not null && _process.HasExited)
            {
                throw new InvalidOperationException(
                    $"The backend exited with code {_process.ExitCode}. See {_paths.BackendLogPath}.");
            }

            try
            {
                using var response = await HttpClient.GetAsync(healthUri, linkedCts.Token);
                if (response.IsSuccessStatusCode)
                {
                    return;
                }
            }
            catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
            {
                break;
            }
            catch
            {
            }

            progress.Report("Waiting for the backend API...");
            await Task.Delay(TimeSpan.FromSeconds(1), linkedCts.Token);
        }

        throw new TimeoutException(
            $"The desktop backend did not become ready. See {_paths.BackendLogPath}.");
    }
}
