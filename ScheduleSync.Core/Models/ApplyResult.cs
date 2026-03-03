using System.Collections.Generic;

namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// Result of applying a batch of updates.
    /// </summary>
    public class ApplyResult
    {
        public int TotalProcessed { get; set; }
        public int Applied { get; set; }
        public int Skipped { get; set; }
        public int Failed { get; set; }

        public List<TaskApplyDetail> Details { get; set; } = new List<TaskApplyDetail>();
    }

    public class TaskApplyDetail
    {
        public int? UniqueId { get; set; }
        public string ExternalKey { get; set; }
        public string TaskName { get; set; }
        public TaskApplyStatus Status { get; set; }
        public string Message { get; set; }
        public ChangeFlags ChangesApplied { get; set; }
    }

    public enum TaskApplyStatus
    {
        Applied,
        Skipped,
        Failed,
        NotMatched
    }
}
