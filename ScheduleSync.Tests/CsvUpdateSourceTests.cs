using System;
using Xunit;
using ScheduleSync.Core.Parsers;
using ScheduleSync.Core.Models;

namespace ScheduleSync.Tests
{
    public class CsvUpdateSourceTests
    {
        private readonly CsvUpdateSource _source = new CsvUpdateSource();

        [Fact]
        public void Parse_EmptyContent_ReturnsError()
        {
            var result = _source.Parse("");
            Assert.False(result.Success);
            Assert.Single(result.Errors);
        }

        [Fact]
        public void Parse_HeaderOnly_ReturnsError()
        {
            var result = _source.Parse("UniqueId,NewStart\n");
            Assert.False(result.Success);
        }

        [Fact]
        public void Parse_ValidSingleRow_ReturnsUpdate()
        {
            var csv = "UniqueId,NewStart,NewFinish,AllowConstraintOverride,NotesAppend\n" +
                      "123,2026-03-10 06:00,2026-03-12 14:00,false,\"Pulled in per field request\"\n";
            var result = _source.Parse(csv);
            Assert.True(result.Success);
            Assert.Single(result.Updates);

            var u = result.Updates[0];
            Assert.Equal(123, u.UniqueId);
            Assert.Equal(new DateTime(2026, 3, 10, 6, 0, 0), u.NewStart);
            Assert.Equal(new DateTime(2026, 3, 12, 14, 0, 0), u.NewFinish);
            Assert.False(u.AllowConstraintOverride);
            Assert.Equal("Pulled in per field request", u.NotesAppend);
        }

        [Fact]
        public void Parse_MultipleRows_ReturnsAllUpdates()
        {
            var csv = "UniqueId,NewStart\n" +
                      "1,2026-03-10\n" +
                      "2,2026-03-11\n";
            var result = _source.Parse(csv);
            Assert.True(result.Success);
            Assert.Equal(2, result.Updates.Count);
        }

        [Fact]
        public void Parse_CaseInsensitiveHeaders()
        {
            var csv = "uniqueid,NEWSTART\n" +
                      "42,2026-06-01\n";
            var result = _source.Parse(csv);
            Assert.True(result.Success);
            Assert.Equal(42, result.Updates[0].UniqueId);
        }

        [Fact]
        public void Parse_InvalidUniqueId_ReturnsError()
        {
            var csv = "UniqueId,NewStart\n" +
                      "abc,2026-03-10\n";
            var result = _source.Parse(csv);
            Assert.False(result.Success);
            Assert.Single(result.Errors);
            Assert.Equal("UniqueId", result.Errors[0].FieldName);
        }

        [Fact]
        public void Parse_InvalidDate_ReturnsError()
        {
            var csv = "UniqueId,NewStart\n" +
                      "1,not-a-date\n";
            var result = _source.Parse(csv);
            Assert.False(result.Success);
            Assert.Equal("NewStart", result.Errors[0].FieldName);
        }

        [Fact]
        public void Parse_ExternalKey_IsParsed()
        {
            var csv = "ExternalKey,NewFinish\n" +
                      "WBS-100,2026-04-01\n";
            var result = _source.Parse(csv);
            Assert.True(result.Success);
            Assert.Equal("WBS-100", result.Updates[0].ExternalKey);
        }

        [Fact]
        public void Parse_QuotedFieldWithComma()
        {
            var csv = "UniqueId,NotesAppend\n" +
                      "1,\"Note with, comma\"\n";
            var result = _source.Parse(csv);
            Assert.True(result.Success);
            Assert.Equal("Note with, comma", result.Updates[0].NotesAppend);
        }

        [Fact]
        public void Parse_AllFields_ParsedCorrectly()
        {
            var csv = "UniqueId,ExternalKey,Name,NewStart,NewFinish,NewDurationMinutes,NewPercentComplete," +
                      "NewConstraintType,NewConstraintDate,NotesAppend,AllowConstraintOverride\n" +
                      "10,EK-1,Task A,2026-01-01,2026-01-05,480,50,1,2026-01-01,Some note,true\n";
            var result = _source.Parse(csv);
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
        public void ParseCsvLine_HandlesEscapedQuotes()
        {
            var line = "hello,\"world \"\"quoted\"\"\"";
            var fields = CsvUpdateSource.ParseCsvLine(line);
            Assert.Equal(2, fields.Count);
            Assert.Equal("hello", fields[0]);
            Assert.Equal("world \"quoted\"", fields[1]);
        }
    }
}
