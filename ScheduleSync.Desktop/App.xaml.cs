using System.Threading;
using System.Windows;

namespace ScheduleSync.Desktop;

public partial class App : Application
{
    private const string SingleInstanceMutexName = @"Global\ScheduleSync.Desktop.WebShell";

    private Mutex? _singleInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        bool createdNew;
        _singleInstanceMutex = new Mutex(initiallyOwned: true, SingleInstanceMutexName, createdNew: out createdNew);

        if (!createdNew)
        {
            MessageBox.Show(
                "ScheduleSync is already running.",
                "ScheduleSync",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        base.OnStartup(e);

        MainWindow = new MainWindow(DesktopLaunchOptions.Parse(e.Args));
        MainWindow.Show();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _singleInstanceMutex?.ReleaseMutex();
        _singleInstanceMutex?.Dispose();
        base.OnExit(e);
    }
}
