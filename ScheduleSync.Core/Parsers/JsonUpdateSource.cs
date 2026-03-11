using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Models;
using System;
using System.Collections.Generic;

namespace ScheduleSync.Core.Parsers
{
    /// <summary>
    /// Parses task updates from a JSON array. Property names are matched case-insensitively.
    /// </summary>
    public class JsonUpdateSource : IUpdateSource
    {
        public ParseResult Parse(string content)
        {
            var result = new ParseResult();
            if (string.IsNullOrWhiteSpace(content))
            {
                result.Errors.Add(new ParseError(null, null, "JSON content is empty."));
                return result;
            }

            JArray array;
            try
            {
                var token = JToken.Parse(content);
                if (token.Type == JTokenType.Array)
                {
                    array = (JArray)token;
                }
                else
                {
                    result.Errors.Add(new ParseError(null, null, "JSON must be an array of update objects."));
                    return result;
                }
            }
            catch (JsonReaderException ex)
            {
                result.Errors.Add(new ParseError(null, null, $"Invalid JSON: {ex.Message}"));
                return result;
            }

            for (int i = 0; i < array.Count; i++)
            {
                int rowNumber = i + 1;
                var item = array[i];

                if (item.Type != JTokenType.Object)
                {
                    result.Errors.Add(new ParseError(rowNumber, null, "Array element is not an object."));
                    continue;
                }

                var obj = (JObject)item;
                var update = new TaskUpdate();
                bool hasError = false;

                // Build a case-insensitive lookup
                var props = new Dictionary<string, JToken>(StringComparer.OrdinalIgnoreCase);
                foreach (var prop in obj.Properties())
                {
                    props[prop.Name] = prop.Value;
                }

                // UniqueId
                if (props.TryGetValue("uniqueId", out var uidToken))
                {
                    if (TryInt(uidToken, out var uid))
                        update.UniqueId = uid;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "uniqueId", $"Invalid integer value."));
                        hasError = true;
                    }
                }

                // ExternalKey
                if (props.TryGetValue("externalKey", out var ekToken))
                    update.ExternalKey = ekToken.Type == JTokenType.Null ? null : ekToken.ToString();

                // Name
                if (props.TryGetValue("name", out var nameToken))
                    update.Name = nameToken.Type == JTokenType.Null ? null : nameToken.ToString();

                // NewStart
                if (props.TryGetValue("newStart", out var nsToken))
                {
                    if (TryDateTime(nsToken, out var ns))
                        update.NewStart = ns;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newStart", "Invalid date value."));
                        hasError = true;
                    }
                }

                // NewFinish
                if (props.TryGetValue("newFinish", out var nfToken))
                {
                    if (TryDateTime(nfToken, out var nf))
                        update.NewFinish = nf;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newFinish", "Invalid date value."));
                        hasError = true;
                    }
                }

                // NewDurationMinutes
                if (props.TryGetValue("newDurationMinutes", out var ndToken))
                {
                    if (TryDouble(ndToken, out var nd))
                        update.NewDurationMinutes = nd;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newDurationMinutes", "Invalid number value."));
                        hasError = true;
                    }
                }

                // NewPercentComplete
                if (props.TryGetValue("newPercentComplete", out var npcToken))
                {
                    if (TryInt(npcToken, out var npc))
                        update.NewPercentComplete = npc;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newPercentComplete", "Invalid integer value."));
                        hasError = true;
                    }
                }

                // NewConstraintType
                if (props.TryGetValue("newConstraintType", out var nctToken))
                {
                    if (TryInt(nctToken, out var nct))
                        update.NewConstraintType = nct;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newConstraintType", "Invalid integer value."));
                        hasError = true;
                    }
                }

                // NewConstraintDate
                if (props.TryGetValue("newConstraintDate", out var ncdToken))
                {
                    if (TryDateTime(ncdToken, out var ncd))
                        update.NewConstraintDate = ncd;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "newConstraintDate", "Invalid date value."));
                        hasError = true;
                    }
                }

                // NotesAppend
                if (props.TryGetValue("notesAppend", out var notesToken))
                    update.NotesAppend = notesToken.Type == JTokenType.Null ? null : notesToken.ToString();

                // AllowConstraintOverride
                if (props.TryGetValue("allowConstraintOverride", out var acoToken))
                {
                    if (acoToken.Type == JTokenType.Boolean)
                        update.AllowConstraintOverride = acoToken.Value<bool>();
                    else if (bool.TryParse(acoToken.ToString(), out var aco))
                        update.AllowConstraintOverride = aco;
                    else
                    {
                        result.Errors.Add(new ParseError(rowNumber, "allowConstraintOverride", "Invalid boolean value."));
                        hasError = true;
                    }
                }

                if (!hasError)
                    result.Updates.Add(update);
            }

            return result;
        }

        private static bool TryInt(JToken token, out int value)
        {
            value = 0;
            if (token.Type == JTokenType.Integer)
            {
                value = token.Value<int>();
                return true;
            }
            return int.TryParse(token.ToString(), out value);
        }

        private static bool TryDouble(JToken token, out double value)
        {
            value = 0;
            if (token.Type == JTokenType.Float || token.Type == JTokenType.Integer)
            {
                value = token.Value<double>();
                return true;
            }
            return double.TryParse(token.ToString(), out value);
        }

        private static bool TryDateTime(JToken token, out DateTime value)
        {
            value = default;
            if (token.Type == JTokenType.Date)
            {
                value = token.Value<DateTime>();
                return true;
            }
            return DateTime.TryParse(token.ToString(), out value);
        }
    }
}
