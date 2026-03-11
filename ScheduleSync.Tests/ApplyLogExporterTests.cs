using ScheduleSync.Core.Logging;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Tests
{
    public class ApplyLogExporterTests
    {
        [Fact]
        public void ToCsv_EmptyResult_HasHeaderOnly()
        {
            var result = new ApplyResult();
            var csv = ApplyLogExporter.ToCsv(result);
            Assert.Contains("UniqueId,ExternalKey,TaskName,Status,ChangesApplied,Message", csv);
            // Only header line + trailing newline
            var lines = csv.Split('\n');
            Assert.Equal(2, lines.Length); // header + empty trailing
        }

        [Fact]
        public void ToCsv_WithDetails_ContainsData()
        {
            var result = new ApplyResult
            {
                TotalProcessed = 1,
                Applied = 1,
                Details =
                {
                    new TaskApplyDetail
                    {
                        UniqueId = 10,
                        TaskName = "Task 10",
                        Status = TaskApplyStatus.Applied,
                        ChangesApplied = ChangeFlags.Start | ChangeFlags.Finish,
                        Message = "OK"
                    }
                }
            };
            var csv = ApplyLogExporter.ToCsv(result);
            Assert.Contains("10", csv);
            Assert.Contains("Task 10", csv);
            Assert.Contains("Applied", csv);
        }

        [Fact]
        public void ToJson_EmptyResult_ValidJson()
        {
            var result = new ApplyResult();
            var json = ApplyLogExporter.ToJson(result);
            Assert.Contains("\"TotalProcessed\": 0", json);
        }

        [Fact]
        public void ToCsv_EscapesCommaInMessage()
        {
            var result = new ApplyResult
            {
                Details =
                {
                    new TaskApplyDetail
                    {
                        UniqueId = 1,
                        Message = "Error, with comma"
                    }
                }
            };
            var csv = ApplyLogExporter.ToCsv(result);
            Assert.Contains("\"Error, with comma\"", csv);
        }
    }
}
