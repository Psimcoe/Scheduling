using System;
using Xunit;
using ScheduleSync.Core.Parsers;

namespace ScheduleSync.Tests
{
    public class StratusCsvUpdateSourceTests
    {
        private readonly StratusCsvUpdateSource _source = new StratusCsvUpdateSource();

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
            var result = _source.Parse("Number,Name,Prefab Build Start Date\n");
            Assert.False(result.Success);
        }

        [Fact]
        public void Parse_ValidSingleRow_ReturnsUpdate()
        {
            var csv =
                "Number,Name,Project Number Override,Prefab Build Start Date,Prefab Build Finish Date,Work Days (Reference),Required,Status,Notes,Location\n" +
                "0228,FAB-0228-L37-SUP-PKG-EAST,320001TUR,01/30/2026,2/3/2026,3,2/6/2026,Issued for Fabrication,Test note,LEVEL 37\n";

            var result = _source.Parse(csv);

            // Status "Issued for Fabrication" is valid, so no errors block the row
            Assert.Single(result.Updates);

            var u = result.Updates[0];
            Assert.Equal("320001TUR-0228", u.ExternalKey);
            Assert.Equal("FAB-0228-L37-SUP-PKG-EAST", u.Name);
            Assert.Equal(new DateTime(2026, 1, 30), u.NewStart);
            Assert.Equal(new DateTime(2026, 2, 3), u.NewFinish);
            Assert.Equal(3 * 480.0, u.NewDurationMinutes);
            Assert.Equal(new DateTime(2026, 2, 6), u.NewDeadline);
            Assert.Equal(80, u.NewPercentComplete); // "Issued for Fabrication" → 80%
            Assert.Contains("Test note", u.NotesAppend);
        }

        [Fact]
        public void Parse_CompositeKey_ProjectNumberAndPackageNumber()
        {
            var csv =
                "Number,Name,Project Number Override\n" +
                "0100,Test Task,PRJ001\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal("PRJ001-0100", result.Updates[0].ExternalKey);
        }

        [Fact]
        public void Parse_CompositeKey_FallbackToProjectNumber()
        {
            var csv =
                "Number,Name,Project Number\n" +
                "0100,Test Task,PRJ002\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal("PRJ002-0100", result.Updates[0].ExternalKey);
        }

        [Fact]
        public void Parse_CompositeKey_NoProjectNumber_PackageOnly()
        {
            var csv =
                "Number,Name\n" +
                "0100,Test Task\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal("0100", result.Updates[0].ExternalKey);
        }

        [Fact]
        public void Parse_MissingPackageNumber_Error()
        {
            var csv =
                "Number,Name\n" +
                ",Some Task\n";

            var result = _source.Parse(csv);
            Assert.Empty(result.Updates);
            Assert.Single(result.Errors);
            Assert.Equal("Number", result.Errors[0].FieldName);
        }

        [Fact]
        public void Parse_WorkDays_ConvertedToMinutes()
        {
            var csv =
                "Number,Name,Work Days (Reference)\n" +
                "0100,Task,5\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal(5 * 480.0, result.Updates[0].NewDurationMinutes);
        }

        [Fact]
        public void Parse_InvalidWorkDays_Error()
        {
            var csv =
                "Number,Name,Work Days (Reference)\n" +
                "0100,Task,abc\n";

            var result = _source.Parse(csv);
            Assert.Empty(result.Updates);
            Assert.Contains(result.Errors, e => e.FieldName == "Work Days (Reference)");
        }

        [Fact]
        public void Parse_StatusMappedToPercentComplete()
        {
            var csv =
                "Number,Name,Status\n" +
                "0100,Task A,New Item\n" +
                "0101,Task B,Fabrication Complete\n" +
                "0102,Task C,Shipped to Jobsite\n";

            var result = _source.Parse(csv);
            Assert.Equal(3, result.Updates.Count);
            Assert.Equal(0, result.Updates[0].NewPercentComplete);
            Assert.Equal(90, result.Updates[1].NewPercentComplete);
            Assert.Equal(100, result.Updates[2].NewPercentComplete);
        }

        [Fact]
        public void Parse_UnrecognizedStatus_WarningButNotBlocked()
        {
            var csv =
                "Number,Name,Status\n" +
                "0100,Task,Unknown Status XYZ\n";

            var result = _source.Parse(csv);
            // Row still parses — unrecognized status isn't fatal
            Assert.Single(result.Updates);
            Assert.Null(result.Updates[0].NewPercentComplete);
            // But there's a parse error/warning about it
            Assert.Contains(result.Errors, e => e.FieldName == "Status" && e.Message.Contains("Unrecognized"));
        }

        [Fact]
        public void Parse_NotesAndDescription_Combined()
        {
            var csv =
                "Number,Name,Description,Notes\n" +
                "0100,Task,EAST SIDE,Some notes here\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Contains("EAST SIDE", result.Updates[0].NotesAppend);
            Assert.Contains("Some notes here", result.Updates[0].NotesAppend);
        }

        [Fact]
        public void Parse_Metadata_Location()
        {
            var csv =
                "Number,Name,Location,Project Number Override,Category Type,Cost Code Category\n" +
                "0100,Task,LEVEL 37,PRJ001,SUP,HANGER STRUT\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);

            var meta = result.Updates[0].Metadata;
            Assert.Equal("LEVEL 37", meta["Location"]);
            Assert.Equal("PRJ001", meta["ProjectNumber"]);
            Assert.Equal("SUP", meta["CategoryType"]);
            Assert.Equal("HANGER STRUT", meta["CostCodeCategory"]);
        }

        [Fact]
        public void Parse_MultipleRows_ReturnsAll()
        {
            var csv =
                "Number,Name,Prefab Build Start Date\n" +
                "0100,Task A,01/15/2026\n" +
                "0101,Task B,01/20/2026\n" +
                "0102,Task C,01/25/2026\n";

            var result = _source.Parse(csv);
            Assert.Equal(3, result.Updates.Count);
        }

        [Fact]
        public void Parse_CaseInsensitiveHeaders()
        {
            var csv =
                "NUMBER,NAME,PREFAB BUILD START DATE\n" +
                "0100,Task A,01/15/2026\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal("0100", result.Updates[0].ExternalKey);
        }

        [Fact]
        public void Parse_RequiredDate_SetAsDeadline()
        {
            var csv =
                "Number,Name,Required\n" +
                "0100,Task,3/15/2026\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal(new DateTime(2026, 3, 15), result.Updates[0].NewDeadline);
        }

        [Fact]
        public void Parse_InvalidDate_Error()
        {
            var csv =
                "Number,Name,Prefab Build Start Date\n" +
                "0100,Task,not-a-date\n";

            var result = _source.Parse(csv);
            // Invalid date is non-fatal: row still parses, but the date field is not set
            Assert.Single(result.Updates);
            Assert.Null(result.Updates[0].NewStart);
            // Error is recorded
            Assert.Contains(result.Errors, e => e.Message.Contains("Invalid date"));
        }

        [Fact]
        public void Parse_FieldCountMismatch_Error()
        {
            var csv =
                "Number,Name,Status\n" +
                "0100,Task\n";

            var result = _source.Parse(csv);
            Assert.Empty(result.Updates);
            Assert.Contains(result.Errors, e => e.Message.Contains("fields"));
        }

        [Fact]
        public void Parse_QuotedFieldWithComma()
        {
            var csv =
                "Number,Name,Description\n" +
                "0100,Task,\"Description with, comma\"\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Contains("Description with, comma", result.Updates[0].NotesAppend);
        }

        [Fact]
        public void Parse_StratusPackageId_InMetadata()
        {
            var csv =
                "Number,Name,STRATUS.Package.Id\n" +
                "0100,Task,d1e2f3a4-5678-9abc-def0-123456789abc\n";

            var result = _source.Parse(csv);
            Assert.Single(result.Updates);
            Assert.Equal("d1e2f3a4-5678-9abc-def0-123456789abc", result.Updates[0].Metadata["StratusPackageId"]);
        }

        [Fact]
        public void IsStratusFormat_DetectsStratusHeaders()
        {
            var header = "Cost Code Number,Number,Name,Prefab Build Start Date,Status";
            Assert.True(StratusCsvUpdateSource.IsStratusFormat(header));
        }

        [Fact]
        public void IsStratusFormat_RejectNonStratusHeaders()
        {
            var header = "UniqueId,NewStart,NewFinish,Name";
            Assert.False(StratusCsvUpdateSource.IsStratusFormat(header));
        }

        [Fact]
        public void IsStratusFormat_Null_ReturnsFalse()
        {
            Assert.False(StratusCsvUpdateSource.IsStratusFormat(null));
            Assert.False(StratusCsvUpdateSource.IsStratusFormat(""));
        }
    }
}
