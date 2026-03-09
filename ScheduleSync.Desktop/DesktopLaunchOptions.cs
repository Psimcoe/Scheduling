using System;
using System.Collections.Generic;
using System.Diagnostics;

namespace ScheduleSync.Desktop;

public sealed class DesktopLaunchOptions
{
    private DesktopLaunchOptions(Uri? devUrl)
    {
        DevUrl = devUrl;
    }

    public Uri? DevUrl { get; }

    public bool UseDevServer => DevUrl is not null;

    public static DesktopLaunchOptions Parse(IReadOnlyList<string> args)
    {
        string? configuredUrl = Environment.GetEnvironmentVariable("SCHEDULESYNC_DESKTOP_DEV_URL");

        foreach (var arg in args)
        {
            if (arg.StartsWith("--dev-url=", StringComparison.OrdinalIgnoreCase))
            {
                configuredUrl = arg["--dev-url=".Length..];
            }
        }

        if (!IsDevServerAllowed() || string.IsNullOrWhiteSpace(configuredUrl))
        {
            return new DesktopLaunchOptions(null);
        }

        if (Uri.TryCreate(configuredUrl, UriKind.Absolute, out var devUrl) &&
            (devUrl.Scheme == Uri.UriSchemeHttp || devUrl.Scheme == Uri.UriSchemeHttps))
        {
            return new DesktopLaunchOptions(devUrl);
        }

        return new DesktopLaunchOptions(null);
    }

    private static bool IsDevServerAllowed()
    {
#if DEBUG
        return true;
#else
        return Debugger.IsAttached ||
               string.Equals(
                   Environment.GetEnvironmentVariable("SCHEDULESYNC_DESKTOP_ALLOW_DEV_URL"),
                   "1",
                   StringComparison.Ordinal);
#endif
    }
}
