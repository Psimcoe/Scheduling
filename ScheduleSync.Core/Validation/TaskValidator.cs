using System;
using System.Collections.Generic;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Core.Validation
{
    /// <summary>
    /// Validates a proposed task update against the current task state.
    /// </summary>
    public static class TaskValidator
    {
        /// <summary>
        /// The PjConstraint value for "As Soon As Possible" (no active constraint).
        /// </summary>
        public const int ConstraintAsap = 0;

        /// <summary>
        /// Validate a single update against a task snapshot.
        /// Returns validation messages; errors mean the update should be blocked.
        /// </summary>
        public static List<ValidationMessage> Validate(TaskSnapshot snapshot, TaskUpdate update)
        {
            var messages = new List<ValidationMessage>();

            // Block summary tasks
            if (snapshot.IsSummary)
            {
                messages.Add(new ValidationMessage(ValidationSeverity.Error,
                    "Cannot update summary tasks. Summary task dates are computed from child tasks."));
                return messages;
            }

            // Warn about manually scheduled tasks
            if (snapshot.IsManuallyScheduled)
            {
                messages.Add(new ValidationMessage(ValidationSeverity.Warning,
                    "Task is manually scheduled. Date changes will be applied directly without recalculation."));
            }

            // Constraint checks
            bool hasActiveConstraint = snapshot.ConstraintType != ConstraintAsap;
            if (hasActiveConstraint && !update.AllowConstraintOverride)
            {
                bool dateChanges = update.NewStart.HasValue || update.NewFinish.HasValue;
                if (dateChanges)
                {
                    messages.Add(new ValidationMessage(ValidationSeverity.Error,
                        $"Task has constraint type {snapshot.ConstraintType}. " +
                        "Set AllowConstraintOverride=true to update dates on constrained tasks."));
                }
            }

            // Percent complete range check
            if (update.NewPercentComplete.HasValue)
            {
                if (update.NewPercentComplete.Value < 0 || update.NewPercentComplete.Value > 100)
                {
                    messages.Add(new ValidationMessage(ValidationSeverity.Error,
                        $"PercentComplete must be 0–100, got {update.NewPercentComplete.Value}."));
                }
            }

            // Duration must be positive
            if (update.NewDurationMinutes.HasValue && update.NewDurationMinutes.Value < 0)
            {
                messages.Add(new ValidationMessage(ValidationSeverity.Error,
                    $"Duration cannot be negative, got {update.NewDurationMinutes.Value}."));
            }

            // Finish must be >= Start
            DateTime effectiveStart = update.NewStart ?? snapshot.Start;
            DateTime effectiveFinish = update.NewFinish ?? snapshot.Finish;
            if (update.NewStart.HasValue || update.NewFinish.HasValue)
            {
                if (effectiveFinish < effectiveStart)
                {
                    messages.Add(new ValidationMessage(ValidationSeverity.Error,
                        "Effective Finish would be earlier than effective Start."));
                }
            }

            return messages;
        }
    }
}
