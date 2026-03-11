using ScheduleSync.Core.Mapping;

namespace ScheduleSync.Tests
{
    public class StatusPercentMapTests
    {
        [Theory]
        [InlineData("New Item", 0)]
        [InlineData("Design Stage", 5)]
        [InlineData("Design Stage-Prefab Early Planning", 10)]
        [InlineData("CLASH", 5)]
        [InlineData("BIM/VDC Released to Prefab", 20)]
        [InlineData("Prefab Confirmed Received From BIM/VDC", 25)]
        [InlineData("Spool QA/QC Complete-Ready for Assembly", 30)]
        [InlineData("Assembly (Spool) Confirmed", 35)]
        [InlineData("Packages (FAB) Confirmed", 40)]
        [InlineData("Package-BOM Generated", 45)]
        [InlineData("Package-BOM Released for Purchasing", 50)]
        [InlineData("Package-BOM Purchased", 55)]
        [InlineData("Package-BOM Received w/ Back Orders", 60)]
        [InlineData("Assembly-BOM Received", 65)]
        [InlineData("Package-BOM Received No Backorders", 70)]
        [InlineData("Ready for Fab Release to Shop", 75)]
        [InlineData("Issued for Fabrication", 80)]
        [InlineData("Fabrication in Progress", 85)]
        [InlineData("Fabrication Complete", 90)]
        [InlineData("QA QC Inspection", 95)]
        [InlineData("Packaged for Shipment", 96)]
        [InlineData("Waiting to Ship", 99)]
        [InlineData("Shipped to Jobsite", 100)]
        [InlineData("Received on Jobsite", 100)]
        [InlineData("Issued for Installation", 100)]
        [InlineData("Installed", 100)]
        [InlineData("Wire Pulled", 100)]
        [InlineData("Trim and Terminations Complete", 100)]
        [InlineData("Hold", 100)]
        [InlineData("Point List Ready", 100)]
        [InlineData("FAB CANCELLED", 100)]
        [InlineData("NO PREFAB (FIELD INSTALL)", 100)]
        public void Resolve_KnownStatus_ReturnsExpected(string status, int expected)
        {
            var result = StatusPercentMap.Resolve(status);
            Assert.NotNull(result);
            Assert.Equal(expected, result.Value);
        }

        [Fact]
        public void Resolve_CaseInsensitive()
        {
            Assert.Equal(80, StatusPercentMap.Resolve("issued for fabrication"));
            Assert.Equal(80, StatusPercentMap.Resolve("ISSUED FOR FABRICATION"));
            Assert.Equal(80, StatusPercentMap.Resolve("Issued For Fabrication"));
        }

        [Fact]
        public void Resolve_TrimmedInput()
        {
            Assert.Equal(0, StatusPercentMap.Resolve("  New Item  "));
            Assert.Equal(90, StatusPercentMap.Resolve("  Fabrication Complete\t"));
        }

        [Fact]
        public void Resolve_UnknownStatus_ReturnsNull()
        {
            Assert.Null(StatusPercentMap.Resolve("Unknown Status"));
            Assert.Null(StatusPercentMap.Resolve("Random Text"));
        }

        [Fact]
        public void Resolve_NullOrEmpty_ReturnsNull()
        {
            Assert.Null(StatusPercentMap.Resolve(null));
            Assert.Null(StatusPercentMap.Resolve(""));
            Assert.Null(StatusPercentMap.Resolve("   "));
        }

        [Fact]
        public void GetAll_ReturnsNonEmptyDictionary()
        {
            var all = StatusPercentMap.GetAll();
            Assert.True(all.Count >= 32);
        }
    }
}
