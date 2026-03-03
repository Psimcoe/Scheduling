using System.Collections.Generic;

namespace ScheduleSync.Core.Models
{
    /// <summary>
    /// Result of parsing an update source file.
    /// </summary>
    public class ParseResult
    {
        public List<TaskUpdate> Updates { get; set; } = new List<TaskUpdate>();
        public List<ParseError> Errors { get; set; } = new List<ParseError>();
        public bool Success => Errors.Count == 0;
    }

    public class ParseError
    {
        public int? RowNumber { get; set; }
        public string FieldName { get; set; }
        public string Message { get; set; }

        public ParseError() { }

        public ParseError(int? rowNumber, string fieldName, string message)
        {
            RowNumber = rowNumber;
            FieldName = fieldName;
            Message = message;
        }
    }
}
