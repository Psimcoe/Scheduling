using ScheduleSync.Core.Models;

namespace ScheduleSync.Core.Interfaces
{
    /// <summary>
    /// Reads task updates from an external source (CSV, JSON, etc.).
    /// </summary>
    public interface IUpdateSource
    {
        /// <summary>
        /// Parse the given content string and return updates with any parse errors.
        /// </summary>
        ParseResult Parse(string content);
    }
}
