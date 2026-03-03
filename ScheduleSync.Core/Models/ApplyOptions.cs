namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// Options controlling how updates are applied.
    /// </summary>
    public class ApplyOptions
    {
        /// <summary>
        /// Name of the custom text field used for external key matching (e.g. "Text30").
        /// </summary>
        public string ExternalKeyFieldName { get; set; } = "Text30";

        /// <summary>
        /// When true, apply will skip tasks that produce validation warnings instead of blocking.
        /// When false, warnings are informational only and do not block.
        /// </summary>
        public bool BlockOnWarnings { get; set; } = true;

        /// <summary>
        /// Label for the undo transaction group.
        /// </summary>
        public string UndoTransactionLabel { get; set; } = "Apply Schedule Updates";
    }
}
