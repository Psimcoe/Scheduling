using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using ScheduleSync.Desktop.Models;

namespace ScheduleSync.Desktop.Services
{
    /// <summary>
    /// Result of pushing crew assignments to MS Project.
    /// </summary>
    public class PushResult
    {
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int NotFound { get; set; }
        public List<string> Log { get; } = new();
    }

    /// <summary>
    /// Pushes crew assignments to the active MS Project instance via late-bound COM.
    /// Uses <c>MSProject.Application</c> ProgID — no interop assembly required.
    /// </summary>
    public static class MsProjectPusher
    {
        // .NET 8 removed Marshal.GetActiveObject. Re-implement via native CLSIDFromProgID + GetActiveObject.
        [DllImport("oleaut32.dll", PreserveSig = false)]
        private static extern void GetActiveObject(ref Guid rclsid, IntPtr pvReserved, [MarshalAs(UnmanagedType.IUnknown)] out object ppunk);

        [DllImport("ole32.dll")]
        private static extern int CLSIDFromProgID([MarshalAs(UnmanagedType.LPWStr)] string lpszProgID, out Guid lpclsid);

        private static object GetActiveComObject(string progId)
        {
            CLSIDFromProgID(progId, out var clsid);
            GetActiveObject(ref clsid, IntPtr.Zero, out var obj);
            return obj;
        }
        /// <summary>
        /// Connects to a running MS Project instance (or launches one),
        /// opens the given .mpp file if specified, and sets <c>ResourceNames</c>
        /// on each task that has a crew assignment.
        /// </summary>
        /// <param name="tasks">All tasks (assigned + unassigned). Only tasks with a non-empty CrewAssignment are pushed.</param>
        /// <param name="mppPath">Optional path to an .mpp file. If null/empty, uses the already-active project.</param>
        /// <returns>A result summary with counts and per-task log lines.</returns>
        public static PushResult Push(List<PrefabTask> tasks, string? mppPath)
        {
            var result = new PushResult();
            dynamic? app = null;

            try
            {
                // Try to attach to a running instance first
                try
                {
                    app = GetActiveComObject("MSProject.Application");
                }
                catch (COMException)
                {
                    // No running instance — start one
                    var progId = Type.GetTypeFromProgID("MSProject.Application", throwOnError: true)!;
                    app = Activator.CreateInstance(progId);
                    app!.Visible = true;
                }

                app!.DisplayAlerts = false;

                // Open file if a path was provided
                if (!string.IsNullOrWhiteSpace(mppPath))
                {
                    app.FileOpen(mppPath);
                }

                dynamic? project = app.ActiveProject;
                if (project == null)
                    throw new InvalidOperationException("No active project in MS Project.");

                result.Log.Add($"Connected to: {(string)project.Name}");

                // Build lookup: TaskName -> CrewAssignment (only assigned tasks)
                var crewByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var t in tasks.Where(t => !string.IsNullOrEmpty(t.CrewAssignment)))
                {
                    // Last-one-wins if duplicate names (shouldn't happen in well-formed schedule)
                    crewByName[t.TaskName] = t.CrewAssignment;
                }

                // Wrap in a single undo transaction
                app.OpenUndoTransaction("ScheduleSync: Apply Crew Assignments");
                try
                {
                    foreach (dynamic task in project.Tasks)
                    {
                        if (task == null) continue; // blank rows

                        string name = (string)task.Name;
                        if (!crewByName.TryGetValue(name, out var crew))
                        {
                            result.NotFound++;
                            continue;
                        }

                        try
                        {
                            task.ResourceNames = crew;
                            result.Updated++;
                            result.Log.Add($"[OK] {name} -> {crew}");
                        }
                        catch (COMException ex)
                        {
                            result.Skipped++;
                            result.Log.Add($"[SKIP] {name}: {ex.Message}");
                        }
                    }
                }
                finally
                {
                    app.CloseUndoTransaction();
                }

                // Save the file
                app.FileSave();
                result.Log.Add($"Saved project. {result.Updated} updated, {result.Skipped} skipped.");
            }
            finally
            {
                // Release COM references
                if (app != null)
                {
                    try { app.DisplayAlerts = true; } catch { /* best effort */ }
                    Marshal.ReleaseComObject(app);
                }
            }

            return result;
        }
    }
}
