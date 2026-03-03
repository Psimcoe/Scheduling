using System;
using Xunit;
using ScheduleSync.Core.Parsers;

namespace ScheduleSync.Tests
{
    public class JsonUpdateSourceTests
    {
        private readonly JsonUpdateSource _source = new JsonUpdateSource();

        [Fact]
        public void Parse_EmptyContent_ReturnsError()
        {
            var result = _source.Parse("");
            Assert.False(result.Success);
        }

        [Fact]
        public void Parse_NotAnArray_ReturnsError()
        {
            var result = _source.Parse("{\"uniqueId\": 1}");
            Assert.False(result.Success);
            Assert.Contains("array", result.Errors[0].Message, StringComparison.OrdinalIgnoreCase);
        }

        [Fact]
        public void Parse_InvalidJson_ReturnsError()
        {
            var result = _source.Parse("[{bad json}]");
            Assert.False(result.Success);
        }

        [Fact]
        public void Parse_ValidSingleObject_ReturnsUpdate()
        {
            var json = @"[{
                ""uniqueId"": 123,
                ""newStart"": ""2026-03-10T06:00:00"",
                ""newFinish"": ""2026-03-12T14:00:00"",
                ""allowConstraintOverride"": false,
                ""notesAppend"": ""Pulled in per field request 2026-03-03""
            }]";

            var result = _source.Parse(json);
            Assert.True(result.Success);
            Assert.Single(result.Updates);

            var u = result.Updates[0];
            Assert.Equal(123, u.UniqueId);
            Assert.Equal(new DateTime(2026, 3, 10, 6, 0, 0), u.NewStart);
            Assert.Equal(new DateTime(2026, 3, 12, 14, 0, 0), u.NewFinish);
            Assert.False(u.AllowConstraintOverride);
            Assert.Equal("Pulled in per field request 2026-03-03", u.NotesAppend);
        }

        [Fact]
        public void Parse_CaseInsensitiveProperties()
        {
            var json = @"[{""UNIQUEID"": 42, ""NEWSTART"": ""2026-06-01""}]";
            var result = _source.Parse(json);
            Assert.True(result.Success);
            Assert.Equal(42, result.Updates[0].UniqueId);
        }

        [Fact]
        public void Parse_MultipleObjects_ReturnsAll()
        {
            var json = @"[{""uniqueId"": 1}, {""uniqueId"": 2}]";
            var result = _source.Parse(json);
            Assert.True(result.Success);
            Assert.Equal(2, result.Updates.Count);
        }

        [Fact]
        public void Parse_InvalidUniqueId_ReturnsError()
        {
            var json = @"[{""uniqueId"": ""not-a-number""}]";
            var result = _source.Parse(json);
            Assert.False(result.Success);
            Assert.Single(result.Errors);
        }

        [Fact]
        public void Parse_AllFields_Parsed()
        {
            var json = @"[{
                ""uniqueId"": 10,
                ""externalKey"": ""EK-1"",
                ""name"": ""Task A"",
                ""newStart"": ""2026-01-01"",
                ""newFinish"": ""2026-01-05"",
                ""newDurationMinutes"": 480.0,
                ""newPercentComplete"": 50,
                ""newConstraintType"": 1,
                ""newConstraintDate"": ""2026-01-01"",
                ""notesAppend"": ""A note"",
                ""allowConstraintOverride"": true
            }]";

            var result = _source.Parse(json);
            Assert.True(result.Success);

            var u = result.Updates[0];
            Assert.Equal(10, u.UniqueId);
            Assert.Equal("EK-1", u.ExternalKey);
            Assert.Equal("Task A", u.Name);
            Assert.Equal(480.0, u.NewDurationMinutes);
            Assert.Equal(50, u.NewPercentComplete);
            Assert.Equal(1, u.NewConstraintType);
            Assert.True(u.AllowConstraintOverride);
        }

        [Fact]
        public void Parse_NonObjectElement_ReturnsError()
        {
            var json = @"[1, 2, 3]";
            var result = _source.Parse(json);
            Assert.Equal(3, result.Errors.Count);
        }

        [Fact]
        public void Parse_ExternalKeyOnly_Valid()
        {
            var json = @"[{""externalKey"": ""WBS-100"", ""newFinish"": ""2026-04-01""}]";
            var result = _source.Parse(json);
            Assert.True(result.Success);
            Assert.Equal("WBS-100", result.Updates[0].ExternalKey);
            Assert.Null(result.Updates[0].UniqueId);
        }
    }
}
