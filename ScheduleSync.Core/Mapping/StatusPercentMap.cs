using System;
using System.Collections.Generic;

namespace ScheduleSync.Core.Mapping
{
    /// <summary>
    /// Maps STRATUS fabrication status strings to MS Project percent-complete values.
    /// </summary>
    public static class StatusPercentMap
    {
        private static readonly Dictionary<string, int> Map =
            new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["New Item"] = 0,
                ["Design Stage"] = 5,
                ["Design Stage-Prefab Early Planning"] = 10,
                ["CLASH"] = 5,
                ["BIM/VDC Released to Prefab"] = 20,
                ["Prefab Confirmed Received From BIM/VDC"] = 25,
                ["Spool QA/QC Complete-Ready for Assembly"] = 30,
                ["Assembly (Spool) Confirmed"] = 35,
                ["Packages (FAB) Confirmed"] = 40,
                ["Package-BOM Generated"] = 45,
                ["Package-BOM Released for Purchasing"] = 50,
                ["Package-BOM Purchased"] = 55,
                ["Package-BOM Received w/ Back Orders"] = 60,
                ["Assembly-BOM Received"] = 65,
                ["Package-BOM Received No Backorders"] = 70,
                ["Ready for Fab Release to Shop"] = 75,
                ["Issued for Fabrication"] = 80,
                ["Fabrication in Progress"] = 85,
                ["Fabrication Complete"] = 90,
                ["QA QC Inspection"] = 95,
                ["Packaged for Shipment"] = 96,
                ["Waiting to Ship"] = 99,
                ["Shipped to Jobsite"] = 100,
                ["Received on Jobsite"] = 100,
                ["Issued for Installation"] = 100,
                ["Installed"] = 100,
                ["Wire Pulled"] = 100,
                ["Trim and Terminations Complete"] = 100,
                ["Hold"] = 100,
                ["Point List Ready"] = 100,
                ["FAB CANCELLED"] = 100,
                ["NO PREFAB (FIELD INSTALL)"] = 100,
            };

        /// <summary>
        /// Resolve a STRATUS status string to a percent-complete value.
        /// Returns null if the status is not recognized.
        /// </summary>
        public static int? Resolve(string status)
        {
            if (string.IsNullOrWhiteSpace(status))
                return null;

            return Map.TryGetValue(status.Trim(), out var pct) ? pct : (int?)null;
        }

        /// <summary>
        /// Returns all known status-to-percent mappings (for UI/diagnostics).
        /// </summary>
        public static IReadOnlyDictionary<string, int> GetAll() => Map;
    }
}
