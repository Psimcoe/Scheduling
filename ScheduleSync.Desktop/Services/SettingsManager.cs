using System;
using System.IO;
using System.Text.Json;

namespace ScheduleSync.Desktop.Services
{
    /// <summary>
    /// Persists user settings (API key, model preference) to a local JSON file
    /// in the user's AppData folder.
    /// </summary>
    public static class SettingsManager
    {
        private static readonly string SettingsDir =
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ScheduleSync");
        private static readonly string SettingsFile = Path.Combine(SettingsDir, "settings.json");

        public static AppSettings Load()
        {
            try
            {
                if (File.Exists(SettingsFile))
                {
                    var json = File.ReadAllText(SettingsFile);
                    return JsonSerializer.Deserialize<AppSettings>(json) ?? new AppSettings();
                }
            }
            catch
            {
                // Corrupted file — reset
            }
            return new AppSettings();
        }

        public static void Save(AppSettings settings)
        {
            Directory.CreateDirectory(SettingsDir);
            var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(SettingsFile, json);
        }
    }

    public class AppSettings
    {
        public string OpenAiApiKey { get; set; } = string.Empty;
        public string Model { get; set; } = "codex-5.3";
    }
}
