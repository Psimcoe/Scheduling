using Microsoft.Web.WebView2.Core;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Windows;

namespace ScheduleSync.Desktop;

public partial class MainWindow : Window
{
    private readonly DesktopLaunchOptions _launchOptions;
    private readonly DesktopPaths _paths;
    private readonly CancellationTokenSource _startupCancellation = new();

    private LocalBackendHost? _backendHost;
    private bool _isShuttingDown;

    public MainWindow()
        : this(DesktopLaunchOptions.Parse(Array.Empty<string>()))
    {
    }

    public MainWindow(DesktopLaunchOptions launchOptions)
    {
        _launchOptions = launchOptions;
        _paths = new DesktopPaths();

        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
        Closed += OnClosed;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        await StartShellAsync();
    }

    private void OnClosing(object? sender, CancelEventArgs e)
    {
        _isShuttingDown = true;
        _startupCancellation.Cancel();
    }

    private async void OnClosed(object? sender, EventArgs e)
    {
        if (_backendHost is not null)
        {
            await _backendHost.DisposeAsync();
            _backendHost = null;
        }

        _startupCancellation.Dispose();
    }

    private async void Retry_Click(object sender, RoutedEventArgs e)
    {
        await StartShellAsync();
    }

    private void OpenLogs_Click(object sender, RoutedEventArgs e)
    {
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = _paths.LogsRoot,
            UseShellExecute = true,
        });
    }

    private async Task StartShellAsync()
    {
        if (_isShuttingDown)
        {
            return;
        }

        ErrorPanel.Visibility = Visibility.Collapsed;
        Browser.Visibility = Visibility.Collapsed;
        LoadingPanel.Visibility = Visibility.Visible;
        StatusText.Text = "Preparing the desktop shell...";
        ModeText.Text = _launchOptions.UseDevServer
            ? "Debug mode: attaching to a running web app"
            : "Production mode: launching the bundled web runtime";

        if (_backendHost is not null)
        {
            await _backendHost.DisposeAsync();
            _backendHost = null;
        }

        try
        {
            var targetUri = await ResolveTargetUriAsync(_startupCancellation.Token);
            await EnsureBrowserReadyAsync(_startupCancellation.Token);
            await NavigateAsync(targetUri, _startupCancellation.Token);

            LoadingPanel.Visibility = Visibility.Collapsed;
            Browser.Visibility = Visibility.Visible;
        }
        catch (OperationCanceledException) when (_isShuttingDown)
        {
        }
        catch (Exception ex)
        {
            ShowStartupError(ex);
        }
    }

    private async Task<Uri> ResolveTargetUriAsync(CancellationToken cancellationToken)
    {
        if (_launchOptions.UseDevServer)
        {
            StatusText.Text = $"Connecting to {_launchOptions.DevUrl}...";
            return _launchOptions.DevUrl!;
        }

        await EnsureWebViewRuntimeInstalledAsync(cancellationToken);

        _backendHost = new LocalBackendHost(_paths);
        return await _backendHost.StartAsync(
            new Progress<string>(message => StatusText.Text = message),
            cancellationToken);
    }

    private async Task EnsureBrowserReadyAsync(CancellationToken cancellationToken)
    {
        if (Browser.CoreWebView2 is not null)
        {
            return;
        }

        StatusText.Text = "Starting the embedded browser...";
        var environment = await CoreWebView2Environment.CreateAsync(
            browserExecutableFolder: null,
            userDataFolder: _paths.WebViewUserDataRoot);

        cancellationToken.ThrowIfCancellationRequested();
        await Browser.EnsureCoreWebView2Async(environment);

        if (Browser.CoreWebView2 is null)
        {
            throw new InvalidOperationException("WebView2 did not initialize.");
        }

        Browser.CoreWebView2.Settings.AreBrowserAcceleratorKeysEnabled = true;
        Browser.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
        Browser.CoreWebView2.Settings.AreDevToolsEnabled = _launchOptions.UseDevServer;
        Browser.CoreWebView2.Settings.IsStatusBarEnabled = false;
    }

    private async Task NavigateAsync(Uri uri, CancellationToken cancellationToken)
    {
        StatusText.Text = $"Loading {uri}...";

        var navigationCompletion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        void HandleNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs args)
        {
            Browser.NavigationCompleted -= HandleNavigationCompleted;

            if (args.IsSuccess)
            {
                navigationCompletion.TrySetResult();
                return;
            }

            navigationCompletion.TrySetException(
                new InvalidOperationException(
                    $"Navigation to {uri} failed with status {args.WebErrorStatus}."));
        }

        Browser.NavigationCompleted += HandleNavigationCompleted;

        using var registration = cancellationToken.Register(() =>
        {
            Browser.NavigationCompleted -= HandleNavigationCompleted;
            navigationCompletion.TrySetCanceled(cancellationToken);
        });

        Browser.Source = uri;
        await navigationCompletion.Task;
    }

    private async Task EnsureWebViewRuntimeInstalledAsync(CancellationToken cancellationToken)
    {
        if (IsWebViewRuntimeAvailable())
        {
            return;
        }

        if (!File.Exists(_paths.WebViewBootstrapperPath))
        {
            throw new InvalidOperationException(
                $"Microsoft Edge WebView2 Runtime is not installed, and the bundled bootstrapper is missing.\nExpected: {_paths.WebViewBootstrapperPath}");
        }

        StatusText.Text = "Installing Microsoft Edge WebView2 Runtime...";

        using var installer = Process.Start(new ProcessStartInfo
        {
            FileName = _paths.WebViewBootstrapperPath,
            Arguments = "/install /silent",
            UseShellExecute = true,
        });

        if (installer is null)
        {
            throw new InvalidOperationException("Failed to launch the WebView2 runtime installer.");
        }

        await installer.WaitForExitAsync(cancellationToken);

        if (!IsWebViewRuntimeAvailable())
        {
            throw new InvalidOperationException("Microsoft Edge WebView2 Runtime is still unavailable after installation.");
        }
    }

    private static bool IsWebViewRuntimeAvailable()
    {
        try
        {
            return !string.IsNullOrWhiteSpace(CoreWebView2Environment.GetAvailableBrowserVersionString());
        }
        catch
        {
            return false;
        }
    }

    private void ShowStartupError(Exception ex)
    {
        LoadingPanel.Visibility = Visibility.Collapsed;
        Browser.Visibility = Visibility.Collapsed;
        ErrorPanel.Visibility = Visibility.Visible;
        ErrorSummaryText.Text = ex.Message;
        ErrorDetailsText.Text =
            $"Logs: {_paths.BackendLogPath}{Environment.NewLine}{Environment.NewLine}{ex}";
    }
}
