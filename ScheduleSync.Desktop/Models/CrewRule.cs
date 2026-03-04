namespace ScheduleSync.Desktop.Models
{
    /// <summary>
    /// A single crew assignment rule extracted from a foreman email.
    /// </summary>
    public class CrewRule
    {
        public string Crew { get; set; } = string.Empty;
        public string? ProjectNumber { get; set; }
        public string? CategoryType { get; set; }
        public string Notes { get; set; } = string.Empty;
    }
}
