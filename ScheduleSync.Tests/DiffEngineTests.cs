using ScheduleSync.Core.Diff;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Tests
{
    public class DiffEngineTests
    {
        private static TaskSnapshot MakeSnapshot(
            int uniqueId = 1,
            DateTime? start = null,
            DateTime? finish = null,
            double durationMinutes = 2400,
            int percentComplete = 0)
        {
            return new TaskSnapshot
            {
                UniqueId = uniqueId,
                Name = $"Task {uniqueId}",
                Start = start ?? new DateTime(2026, 3, 1),
                Finish = finish ?? new DateTime(2026, 3, 5),
                DurationMinutes = durationMinutes,
                PercentComplete = percentComplete,
                ConstraintType = 0
            };
        }

        [Fact]
        public void ComputeDiff_NoChanges_FlagsNone()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { UniqueId = 1 };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.Equal(ChangeFlags.None, diff.Changes);
            Assert.False(diff.IsBlocked);
        }

        [Fact]
        public void ComputeDiff_StartChange_FlagsStart()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NewStart = new DateTime(2026, 3, 10) };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Start));
            Assert.False(diff.Changes.HasFlag(ChangeFlags.Finish));
        }

        [Fact]
        public void ComputeDiff_FinishChange_FlagsFinish()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NewFinish = new DateTime(2026, 3, 20) };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Finish));
        }

        [Fact]
        public void ComputeDiff_DurationChange_FlagsDuration()
        {
            var snap = MakeSnapshot(durationMinutes: 100);
            var update = new TaskUpdate { NewDurationMinutes = 200 };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Duration));
        }

        [Fact]
        public void ComputeDiff_PercentCompleteChange_Flags()
        {
            var snap = MakeSnapshot(percentComplete: 10);
            var update = new TaskUpdate { NewPercentComplete = 50 };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.PercentComplete));
        }

        [Fact]
        public void ComputeDiff_NotesAppend_FlagsNotes()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate { NotesAppend = "Updated" };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Notes));
        }

        [Fact]
        public void ComputeDiff_SameValues_NoChangeFlags()
        {
            var snap = MakeSnapshot(start: new DateTime(2026, 3, 1), finish: new DateTime(2026, 3, 5));
            var update = new TaskUpdate
            {
                NewStart = new DateTime(2026, 3, 1),
                NewFinish = new DateTime(2026, 3, 5)
            };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.Equal(ChangeFlags.None, diff.Changes);
        }

        [Fact]
        public void ComputeDiff_SummaryTask_IsBlocked()
        {
            var snap = MakeSnapshot();
            snap.IsSummary = true;
            var update = new TaskUpdate { NewStart = new DateTime(2026, 4, 1) };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.IsBlocked);
        }

        [Fact]
        public void ComputeDiffs_UnmatchedTask_IsBlocked()
        {
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate { UniqueId = 999, NewStart = new DateTime(2026, 3, 10) }
            };
            var diffs = DiffEngine.ComputeDiffs(updates, _ => null);
            Assert.Single(diffs);
            Assert.True(diffs[0].IsBlocked);
            Assert.Null(diffs[0].Before);
        }

        [Fact]
        public void ComputeDiffs_MatchedTask_NotBlocked()
        {
            var snap = MakeSnapshot(uniqueId: 1);
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate { UniqueId = 1, NewStart = new DateTime(2026, 3, 10), NewFinish = new DateTime(2026, 3, 15) }
            };
            var diffs = DiffEngine.ComputeDiffs(updates, u => snap);
            Assert.Single(diffs);
            Assert.False(diffs[0].IsBlocked);
            Assert.NotNull(diffs[0].Before);
        }

        [Fact]
        public void ComputeDiff_MultipleFields_AllFlagged()
        {
            var snap = MakeSnapshot();
            var update = new TaskUpdate
            {
                NewStart = new DateTime(2026, 4, 1),
                NewFinish = new DateTime(2026, 4, 10),
                NewPercentComplete = 75,
                NotesAppend = "Updated"
            };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Start));
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Finish));
            Assert.True(diff.Changes.HasFlag(ChangeFlags.PercentComplete));
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Notes));
        }

        [Fact]
        public void ComputeDiff_DeadlineChange_FlagsDeadline()
        {
            var snap = MakeSnapshot();
            snap.Deadline = null;
            var update = new TaskUpdate { NewDeadline = new DateTime(2026, 4, 1) };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.True(diff.Changes.HasFlag(ChangeFlags.Deadline));
        }

        [Fact]
        public void ComputeDiff_SameDeadline_NoFlag()
        {
            var snap = MakeSnapshot();
            snap.Deadline = new DateTime(2026, 4, 1);
            var update = new TaskUpdate { NewDeadline = new DateTime(2026, 4, 1) };
            var diff = DiffEngine.ComputeDiff(snap, update);
            Assert.False(diff.Changes.HasFlag(ChangeFlags.Deadline));
        }

        [Fact]
        public void ComputeDiffs_AllowCreation_UnmatchedBecomesNewTask()
        {
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate
                {
                    ExternalKey = "NEW-001",
                    Name = "New Task",
                    NewStart = new DateTime(2026, 3, 10),
                    NewFinish = new DateTime(2026, 3, 15)
                }
            };
            var diffs = DiffEngine.ComputeDiffs(updates, _ => null, allowCreation: true);
            Assert.Single(diffs);
            Assert.True(diffs[0].IsNewTask);
            Assert.False(diffs[0].IsBlocked);
            Assert.Null(diffs[0].Before);
            Assert.True(diffs[0].Changes.HasFlag(ChangeFlags.Start));
            Assert.True(diffs[0].Changes.HasFlag(ChangeFlags.Finish));
        }

        [Fact]
        public void ComputeDiffs_AllowCreation_MatchedTaskNotMarkedAsNew()
        {
            var snap = MakeSnapshot(uniqueId: 1);
            var updates = new List<TaskUpdate>
            {
                new TaskUpdate { UniqueId = 1, NewStart = new DateTime(2026, 3, 10) }
            };
            var diffs = DiffEngine.ComputeDiffs(updates, u => snap, allowCreation: true);
            Assert.Single(diffs);
            Assert.False(diffs[0].IsNewTask);
        }

        [Fact]
        public void ComputeNewTaskDiff_InvalidDates_Blocked()
        {
            var update = new TaskUpdate
            {
                Name = "Bad Task",
                NewStart = new DateTime(2026, 4, 1),
                NewFinish = new DateTime(2026, 3, 1) // Finish before Start
            };
            var diff = DiffEngine.ComputeNewTaskDiff(update);
            Assert.True(diff.IsNewTask);
            Assert.True(diff.IsBlocked);
        }
    }
}
