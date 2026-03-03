using System.Collections.Generic;
using System.IO;
using System.Text;

namespace ScheduleSync.Core.Parsers
{
    /// <summary>
    /// Shared CSV parsing utilities used by both <see cref="CsvUpdateSource"/>
    /// and <see cref="StratusCsvUpdateSource"/>.
    /// </summary>
    public static class CsvParserHelper
    {
        /// <summary>Simple CSV line parser that respects quoted fields.</summary>
        public static List<string> ParseCsvLine(string line)
        {
            var fields = new List<string>();
            bool inQuotes = false;
            var current = new StringBuilder();

            for (int i = 0; i < line.Length; i++)
            {
                char c = line[i];
                if (inQuotes)
                {
                    if (c == '"')
                    {
                        if (i + 1 < line.Length && line[i + 1] == '"')
                        {
                            current.Append('"');
                            i++;
                        }
                        else
                        {
                            inQuotes = false;
                        }
                    }
                    else
                    {
                        current.Append(c);
                    }
                }
                else
                {
                    if (c == '"')
                    {
                        inQuotes = true;
                    }
                    else if (c == ',')
                    {
                        fields.Add(current.ToString());
                        current.Clear();
                    }
                    else
                    {
                        current.Append(c);
                    }
                }
            }

            fields.Add(current.ToString());
            return fields;
        }

        /// <summary>Read all lines from a content string.</summary>
        public static List<string> ReadLines(string content)
        {
            var lines = new List<string>();
            using (var reader = new StringReader(content))
            {
                string line;
                while ((line = reader.ReadLine()) != null)
                {
                    lines.Add(line);
                }
            }
            return lines;
        }
    }
}
