using System;
using System.Collections.Generic;
using System.IO;

namespace ScheduleSync.Desktop;

public sealed class DesktopPaths
{
    public DesktopPaths()
    {
        InstallRoot = AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        RuntimeRoot = Path.Combine(InstallRoot, "runtime");
        FrontendRoot = Path.Combine(RuntimeRoot, "frontend");
        BackendRoot = Path.Combine(RuntimeRoot, "backend");
        NodeExePath = Path.Combine(RuntimeRoot, "node", "node.exe");
        WebViewBootstrapperPath = Path.Combine(RuntimeRoot, "MicrosoftEdgeWebView2Setup.exe");

        DataRoot = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "ScheduleSync",
            "Desktop");

        LogsRoot = Path.Combine(DataRoot, "logs");
        WebViewUserDataRoot = Path.Combine(DataRoot, "webview2");
        BackendLogPath = Path.Combine(LogsRoot, "backend.log");

        Directory.CreateDirectory(DataRoot);
        Directory.CreateDirectory(LogsRoot);
        Directory.CreateDirectory(WebViewUserDataRoot);
    }

    public string InstallRoot { get; }

    public string RuntimeRoot { get; }

    public string FrontendRoot { get; }

    public string BackendRoot { get; }

    public string NodeExePath { get; }

    public string WebViewBootstrapperPath { get; }

    public string DataRoot { get; }

    public string LogsRoot { get; }

    public string WebViewUserDataRoot { get; }

    public string BackendLogPath { get; }

    public IReadOnlyList<string> ValidateRuntimePayload()
    {
        var missing = new List<string>();

        if (!File.Exists(NodeExePath))
        {
            missing.Add(NodeExePath);
        }

        if (!File.Exists(Path.Combine(BackendRoot, "dist", "server.js")))
        {
            missing.Add(Path.Combine(BackendRoot, "dist", "server.js"));
        }

        if (!File.Exists(Path.Combine(FrontendRoot, "index.html")))
        {
            missing.Add(Path.Combine(FrontendRoot, "index.html"));
        }

        return missing;
    }
}
