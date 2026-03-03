using System;
using System.Collections.Generic;
using System.Linq;
using ScheduleSync.Core.Models;
using ScheduleSync.Core.Validation;

namespace ScheduleSync.Core.Diff
{
    /// <summary>
    /// Computes diffs between task snapshots and proposed updates.
    /// </summary>
    public static class DiffEngine
    {
        /// <summary>
        /// Compute a diff for a single task + update pair.
        /// </summary>
        public static TaskDiff ComputeDiff(TaskSnapshot snapshot, TaskUpdate update)
        {
            var diff = new TaskDiff
            {
                UniqueId = snapshot.UniqueId,
                TaskName = snapshot.Name,
                Before = snapshot,
                Update = update,
                Changes = ChangeFlags.None
            };

            // Compute which fields would change
            if (update.NewStart.HasValue && update.NewStart.Value != snapshot.Start)
                diff.Changes |= ChangeFlags.Start;

            if (update.NewFinish.HasValue && update.NewFinish.Value != snapshot.Finish)
                diff.Changes |= ChangeFlags.Finish;

            if (update.NewDurationMinutes.HasValue &&
                Math.Abs(update.NewDurationMinutes.Value - snapshot.DurationMinutes) > 0.001)
                diff.Changes |= ChangeFlags.Duration;

            if (update.NewPercentComplete.HasValue && update.NewPercentComplete.Value != snapshot.PercentComplete)
                diff.Changes |= ChangeFlags.PercentComplete;

            if (update.NewConstraintType.HasValue && update.NewConstraintType.Value != snapshot.ConstraintType)
                diff.Changes |= ChangeFlags.ConstraintType;

            if (update.NewConstraintDate.HasValue && update.NewConstraintDate != snapshot.ConstraintDate)
                diff.Changes |= ChangeFlags.ConstraintDate;

            if (!string.IsNullOrEmpty(update.NotesAppend))
                diff.Changes |= ChangeFlags.Notes;

            if (update.NewDeadline.HasValue && update.NewDeadline != snapshot.Deadline)
                diff.Changes |= ChangeFlags.Deadline;

            // Run validation
            diff.Warnings = TaskValidator.Validate(snapshot, update);
            diff.IsBlocked = diff.Warnings.Any(w => w.Severity == ValidationSeverity.Error);

            return diff;
        }

        /// <summary>
        /// Compute diffs for a batch of updates matched against project tasks.
        /// Unmatched updates are either marked as new (when <paramref name="allowCreation"/> is true)
        /// or blocked with an error.
        /// </summary>
        public static List<TaskDiff> ComputeDiffs(
            IEnumerable<TaskUpdate> updates,
            Func<TaskUpdate, TaskSnapshot> taskResolver,
            bool allowCreation = false)
        {
            var diffs = new List<TaskDiff>();
            foreach (var update in updates)
            {
                var snapshot = taskResolver(update);
                if (snapshot == null)
                {
                    if (allowCreation)
                    {
                        diffs.Add(ComputeNewTaskDiff(update));
                    }
                    else
                    {
                        diffs.Add(new TaskDiff
                        {
                            UniqueId = update.UniqueId ?? 0,
                            TaskName = update.Name ?? "(unmatched)",
                            Before = null,
                            Update = update,
                            Changes = ChangeFlags.None,
                            IsBlocked = true,
                            IsNewTask = false,
                            Warnings = new List<ValidationMessage>
                            {
                                new ValidationMessage(ValidationSeverity.Error,
                                    $"No matching task found (UniqueId={update.UniqueId}, ExternalKey={update.ExternalKey}).")
                            }
                        });
                    }
                }
                else
                {
                    diffs.Add(ComputeDiff(snapshot, update));
                }
            }
            return diffs;
        }

        /// <summary>
        /// Compute a diff for a new task that will be created.
        /// </summary>
        internal static TaskDiff ComputeNewTaskDiff(TaskUpdate update)
        {
            var changes = ChangeFlags.None;

            if (update.NewStart.HasValue) changes |= ChangeFlags.Start;
            if (update.NewFinish.HasValue) changes |= ChangeFlags.Finish;
            if (update.NewDurationMinutes.HasValue) changes |= ChangeFlags.Duration;
            if (update.NewPercentComplete.HasValue) changes |= ChangeFlags.PercentComplete;
            if (update.NewConstraintType.HasValue) changes |= ChangeFlags.ConstraintType;
            if (update.NewConstraintDate.HasValue) changes |= ChangeFlags.ConstraintDate;
            if (!string.IsNullOrEmpty(update.NotesAppend)) changes |= ChangeFlags.Notes;
            if (update.NewDeadline.HasValue) changes |= ChangeFlags.Deadline;

            var warnings = TaskValidator.ValidateNew(update);

            return new TaskDiff
            {
                UniqueId = 0,
                TaskName = update.Name ?? "(new task)",
                Before = null,
                Update = update,
                Changes = changes,
                IsNewTask = true,
                IsBlocked = warnings.Any(w => w.Severity == ValidationSeverity.Error),
                Warnings = warnings
            };
        }
    }
}
