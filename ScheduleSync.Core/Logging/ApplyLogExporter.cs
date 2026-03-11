using Newtonsoft.Json;
using ScheduleSync.Core.Models;
using System.Text;

namespace ScheduleSync.Core.Logging
{
    /// <summary>
    /// Exports apply results to CSV or JSON for audit logging.
    /// </summary>
    public static class ApplyLogExporter
    {
        public static string ToCsv(ApplyResult result)
        {
            var sb = new StringBuilder();
            sb.AppendLine("UniqueId,ExternalKey,TaskName,Status,ChangesApplied,Message");
            foreach (var detail in result.Details)
            {
                sb.AppendLine(string.Join(",",
                    Escape(detail.UniqueId?.ToString()),
                    Escape(detail.ExternalKey),
                    Escape(detail.TaskName),
                    detail.Status.ToString(),
                    Escape(detail.ChangesApplied.ToString()),
                    Escape(detail.Message)));
            }
            return sb.ToString();
        }

        public static string ToJson(ApplyResult result)
        {
            return JsonConvert.SerializeObject(result, Formatting.Indented);
        }

        private static string Escape(string value)
        {
            if (string.IsNullOrEmpty(value)) return "";
            if (value.Contains(",") || value.Contains("\"") || value.Contains("\n"))
                return "\"" + value.Replace("\"", "\"\"") + "\"";
            return value;
        }
    }
}
