using System;
using System.Collections.Generic;

namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// Represents an incoming schedule update for a single task.
    /// </summary>
    public class TaskUpdate
    {
        /// <summary>External key stored in a custom field (e.g. Text30).</summary>
        public string ExternalKey { get; set; }

        /// <summary>MS Project UniqueID (preferred for matching).</summary>
        public int? UniqueId { get; set; }

        /// <summary>Task name (informational, not used for matching).</summary>
        public string Name { get; set; }

        public DateTime? NewStart { get; set; }
        public DateTime? NewFinish { get; set; }

        /// <summary>New duration in minutes.</summary>
        public double? NewDurationMinutes { get; set; }

        /// <summary>New percent complete (0–100).</summary>
        public int? NewPercentComplete { get; set; }

        /// <summary>New constraint type (as integer matching PjConstraint enum).</summary>
        public int? NewConstraintType { get; set; }

        public DateTime? NewConstraintDate { get; set; }

        /// <summary>New deadline date (informational constraint that warns but does not restrict scheduling).</summary>
        public DateTime? NewDeadline { get; set; }

        /// <summary>Text to append to the task Notes field.</summary>
        public string NotesAppend { get; set; }

        /// <summary>
        /// When true, the update may override existing constraints.
        /// When false (default), constrained tasks produce a warning and are skipped.
        /// </summary>
        public bool AllowConstraintOverride { get; set; }

        /// <summary>
        /// When true, this update represents a new task that should be created
        /// rather than matched to an existing task.
        /// </summary>
        public bool IsNew { get; set; }

        /// <summary>
        /// Additional metadata used for task creation (hierarchy, categorization, etc.).
        /// Keys include: ProjectNumber, Location, CategoryType, CostCodeCategory, etc.
        /// </summary>
        public Dictionary<string, string> Metadata { get; set; } = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
    }
}
