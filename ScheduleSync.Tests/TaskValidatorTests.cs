using ScheduleSync.Core.Models;
using ScheduleSync.Core.Validation;

namespace ScheduleSync.Tests
{
    public class TaskValidatorTests
    {
        private static TaskSnapshot MakeSnapshot(
            bool isSummary = false,
            bool isManual = false,
            int constraintType = 0,
            DateTime? constraintDate = null)
        {
            return new TaskSnapshot
            {
                UniqueId = 1,
                Name = "Test Task",
                Start = new DateTime(2026, 3, 1),
                Finish = new DateTime(2026, 3, 5),
                DurationMinutes = 480 * 5,
                PercentComplete = 0,
                ConstraintType = constraintType,
                ConstraintDate = constraintDate,
                IsSummary = isSummary,
                IsManuallyScheduled = isManual
            };
        }

        [Fact]
        public void Validate_SummaryTask_Blocked()
        {
            var snap = MakeSnapshot(isSummary: true);
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 10) };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("summary"));
        }

        [Fact]
        public void Validate_ManualTask_Warning()
        {
            var snap = MakeSnapshot(isManual: true);
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 10) };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Warning && m.Message.Contains("manually scheduled"));
        }

        [Fact]
        public void Validate_ManualTask_NonDateChanges_NoWarning()
        {
            var snap = MakeSnapshot(isManual: true);
            var update = new TaskUpdate { NewPercentComplete = 50 };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.DoesNotContain(msgs, m => m.Severity == ValidationSeverity.Warning);
        }

        [Fact]
        public void Validate_ConstrainedTask_NoOverride_Blocked()
        {
            var snap = MakeSnapshot(constraintType: 1);
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 10), AllowConstraintOverride = false };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("constraint"));
        }

        [Fact]
        public void Validate_ConstrainedTask_WithOverride_NotBlocked()
        {
            var snap = MakeSnapshot(constraintType: 1);
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 10), NewFinish = new DateTime(2026, 3, 15), AllowConstraintOverride = true };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.DoesNotContain(msgs, m => m.Severity == ValidationSeverity.Error);
        }

        [Fact]
        public void Validate_PercentCompleteOutOfRange_Blocked()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NewPercentComplete = 150 };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("0–100"));
        }

        [Fact]
        public void Validate_NegativePercentComplete_Blocked()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NewPercentComplete = -1 };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error);
        }

        [Fact]
        public void Validate_NegativeDuration_Blocked()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NewDurationMinutes = -100 };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("negative"));
        }

        [Fact]
        public void Validate_FinishBeforeStart_Blocked()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate
            {
                NewStart = new DateTime(2026, 4, 1),
                NewFinish = new DateTime(2026, 3, 1)
            };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("Finish"));
        }

        [Fact]
        public void Validate_ValidUpdate_NoErrors()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate
            {
                NewStart = new DateTime(2026, 3, 10),
                NewFinish = new DateTime(2026, 3, 15),
                NewPercentComplete = 50
            };
            var msgs = TaskValidator.Validate(snap, update);
            Assert.DoesNotContain(msgs, m => m.Severity == ValidationSeverity.Error);
        }

        [Fact]
        public void Validate_NoChanges_NoMessages()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate();
            var msgs = TaskValidator.Validate(snap, update);
            Assert.Empty(msgs);
        }

        // ── ValidateNew tests ──

        [Fact]
        public void ValidateNew_ValidUpdate_NoErrors()
        {
            var update = new TaskUpdate
            {
                Name = "New Task",
                NewStart = new DateTime(2026, 3, 1),
                NewFinish = new DateTime(2026, 3, 5),
                NewDurationMinutes = 480,
                NewPercentComplete = 50
            };
            var msgs = TaskValidator.ValidateNew(update);
            Assert.DoesNotContain(msgs, m => m.Severity == ValidationSeverity.Error);
        }

        [Fact]
        public void ValidateNew_NegativeDuration_Error()
        {
            var update = new TaskUpdate { Name = "Task", NewDurationMinutes = -100 };
            var msgs = TaskValidator.ValidateNew(update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("negative"));
        }

        [Fact]
        public void ValidateNew_PercentOutOfRange_Error()
        {
            var update = new TaskUpdate { Name = "Task", NewPercentComplete = 150 };
            var msgs = TaskValidator.ValidateNew(update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("0–100"));
        }

        [Fact]
        public void ValidateNew_FinishBeforeStart_Error()
        {
            var update = new TaskUpdate
            {
                Name = "Task",
                NewStart = new DateTime(2026, 4, 1),
                NewFinish = new DateTime(2026, 3, 1)
            };
            var msgs = TaskValidator.ValidateNew(update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Error && m.Message.Contains("Finish"));
        }

        [Fact]
        public void ValidateNew_NoName_Warning()
        {
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 1) };
            var msgs = TaskValidator.ValidateNew(update);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Warning && m.Message.Contains("name"));
        }

        [Fact]
        public void ValidateNew_EmptyUpdate_OnlyNameWarning()
        {
            var update = new TaskUpdate();
            var msgs = TaskValidator.ValidateNew(update);
            // Only a warning about missing name
            Assert.DoesNotContain(msgs, m => m.Severity == ValidationSeverity.Error);
            Assert.Contains(msgs, m => m.Severity == ValidationSeverity.Warning);
        }
    }
}
