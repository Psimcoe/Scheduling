using System.Collections.Generic;

namespace ScheduleSync.Desktop.Models
{
    /// <summary>
    /// One row from the Prefab Packages CSV (MS Project export).
    /// </summary>
    public class PrefabTask
    {
        public int Id { get; set; }
        public string TaskMode { get; set; } = string.Empty;
        public string TaskName { get; set; } = string.Empty;
        public string StartDate { get; set; } = string.Empty;
        public string FinishDate { get; set; } = string.Empty;
        public string LateStart { get; set; } = string.Empty;
        public string LateFinish { get; set; } = string.Empty;
        public string FreeSlack { get; set; } = string.Empty;
        public string TotalSlack { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string CategoryType { get; set; } = string.Empty;
        public string Location { get; set; } = string.Empty;
        public string Detailer { get; set; } = string.Empty;
        public string ProjectNumber { get; set; } = string.Empty;
        public string PackageNumber { get; set; } = string.Empty;
        public string CostCodeCategory { get; set; } = string.Empty;
        public string Status { get; set; } = string.Empty;

        // Populated by matching
        public string CrewAssignment { get; set; } = string.Empty;
        public string CrewNotes { get; set; } = string.Empty;
    }

    /// <summary>
    /// A group of tasks assigned to one crew member.
    /// </summary>
    public class CrewGroup
    {
        public string Crew { get; set; } = string.Empty;
        public string Notes { get; set; } = string.Empty;
        public List<PrefabTask> Tasks { get; set; } = new();
    }
}
