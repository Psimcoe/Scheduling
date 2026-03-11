using ScheduleSync.AddIn.Adapters;
using ScheduleSync.AddIn.Interop;
using ScheduleSync.AddIn.UI;
using ScheduleSync.Core;
using ScheduleSync.Core.Interfaces;
using ScheduleSync.Core.Logging;
using ScheduleSync.Core.Models;
using ScheduleSync.Core.Parsers;
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;

namespace ScheduleSync.AddIn
{
    /// <summary>
    /// COM add-in entry point for Microsoft Project.
    /// Implements IDTExtensibility2 (add-in lifecycle) and IRibbonExtensibility (custom Ribbon).
    /// </summary>
    [ComVisible(true)]
    [Guid("A3E7B8C1-4D2F-4A9E-B6D3-8F1C2E5A7B90")]
    [ProgId("ScheduleSync.Connect")]
    public class Connect : IDTExtensibility2, IRibbonExtensibility
    {
        private dynamic _application;
        private object _addInInst;
        private object _ribbon;

        /// <summary>The active MS Project Application COM object.</summary>
        internal static dynamic ProjectApp { get; private set; }

        // ── IDTExtensibility2 ───────────────────────────────────────────────

        public void OnConnection(object application, ext_ConnectMode connectMode,
            object addInInst, ref Array custom)
        {
            _application = application;
            _addInInst = addInInst;
            ProjectApp = application;
        }

        public void OnDisconnection(ext_DisconnectMode removeMode, ref Array custom)
        {
            ProjectApp = null;
            _application = null;
        }

        public void OnAddInsUpdate(ref Array custom) { }
        public void OnStartupComplete(ref Array custom) { }
        public void OnBeginShutdown(ref Array custom) { }

        // ── IRibbonExtensibility (Office Ribbon) ────────────────────────────

        /// <summary>
        /// Called by Office to get the custom Ribbon XML.
        /// The method name must match the onLoad callback name in the XML.
        /// </summary>
        public string GetCustomUI(string ribbonId)
        {
            var asm = System.Reflection.Assembly.GetExecutingAssembly();
            var resourceName = "ScheduleSync.AddIn.Ribbon.ScheduleSyncRibbon.xml";
            using (var stream = asm.GetManifestResourceStream(resourceName))
            {
                if (stream == null)
                    return FallbackRibbonXml();
                using (var reader = new StreamReader(stream))
                    return reader.ReadToEnd();
            }
        }

        /// <summary>Called by Office when the Ribbon loads.</summary>
        public void Ribbon_Load(object ribbonUI)
        {
            _ribbon = ribbonUI;
        }

        // ── Ribbon Button Callbacks ─────────────────────────────────────────

        /// <summary>Opens the Crew Assignment form.</summary>
        public void BtnCrewAssignment_Click(object control)
        {
            try
            {
                var form = new CrewAssignmentForm();
                form.Show(); // Modeless — user can still use MS Project
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show(
                    "Error opening Crew Assignment window:\n" + ex.Message,
                    "ScheduleSync", System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        /// <summary>Quick import: load an assigned CSV and push directly to the active project.</summary>
        public void BtnQuickPush_Click(object control)
        {
            try
            {
                var form = new CrewAssignmentForm();
                form.QuickPushMode = true;
                form.Show();
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show(
                    "Error opening Quick Push:\n" + ex.Message,
                    "ScheduleSync", System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        /// <summary>Import schedule updates from CSV, preview diffs, and apply.</summary>
        public void BtnImportCsv_Click(object control)
        {
            RunImportWorkflow("CSV files (*.csv)|*.csv|All files (*.*)|*.*", "Select Schedule Update CSV",
                filePath =>
                {
                    var content = File.ReadAllText(filePath);
                    IUpdateSource source;
                    // Auto-detect Stratus CSV (has "Project Number" column)
                    if (content.IndexOf("Project Number", StringComparison.OrdinalIgnoreCase) >= 0)
                        source = new StratusCsvUpdateSource();
                    else
                        source = new CsvUpdateSource();
                    return source.Parse(content);
                });
        }

        /// <summary>Import schedule updates from JSON, preview diffs, and apply.</summary>
        public void BtnImportJson_Click(object control)
        {
            RunImportWorkflow("JSON files (*.json)|*.json|All files (*.*)|*.*", "Select Schedule Update JSON",
                filePath =>
                {
                    var content = File.ReadAllText(filePath);
                    var source = new JsonUpdateSource();
                    return source.Parse(content);
                });
        }

        /// <summary>
        /// Shared import workflow: open file dialog, parse, compute diffs, preview, apply.
        /// </summary>
        private void RunImportWorkflow(string filter, string title, Func<string, ParseResult> parseFunc)
        {
            try
            {
                string filePath;
                using (var dlg = new System.Windows.Forms.OpenFileDialog())
                {
                    dlg.Filter = filter;
                    dlg.Title = title;
                    if (dlg.ShowDialog() != System.Windows.Forms.DialogResult.OK) return;
                    filePath = dlg.FileName;
                }

                var parseResult = parseFunc(filePath);

                if (parseResult.Errors.Count > 0)
                {
                    var errorMessages = new List<string>();
                    foreach (var err in parseResult.Errors)
                        errorMessages.Add(string.Format("Row {0}: {1} - {2}",
                            err.RowNumber?.ToString() ?? "?", err.FieldName ?? "", err.Message));

                    System.Windows.Forms.MessageBox.Show(
                        "Parse errors:\n" + string.Join("\n", errorMessages),
                        "Parse Errors", System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Warning);
                    if (parseResult.Updates.Count == 0) return;
                }

                var adapter = new MsProjectAdapter();
                var options = new ApplyOptions();
                var orchestrator = new ImportOrchestrator(adapter, options);
                var diffs = orchestrator.ComputeDiffs(parseResult.Updates);

                var preview = new PreviewWindow(diffs, applicable =>
                {
                    var result = orchestrator.Apply(applicable);

                    // Write audit log
                    try
                    {
                        var logDir = Path.Combine(
                            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                            "ScheduleSync", "Logs");
                        Directory.CreateDirectory(logDir);
                        var logPath = Path.Combine(logDir,
                            "apply_" + DateTime.Now.ToString("yyyyMMdd_HHmmss") + ".csv");
                        File.WriteAllText(logPath, ApplyLogExporter.ToCsv(result));
                    }
                    catch { /* Non-critical: don't let logging failure block success */ }

                    System.Windows.Forms.MessageBox.Show(
                        string.Format("Applied: {0}\nSkipped: {1}\nFailed: {2}\n\nChanges are undoable via Edit > Undo.",
                            result.Applied, result.Skipped, result.Failed),
                        "Import Complete", System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Information);
                });
                preview.Show(); // Modeless
            }
            catch (Exception ex)
            {
                System.Windows.Forms.MessageBox.Show(
                    "Error during import:\n" + ex.Message,
                    "ScheduleSync", System.Windows.Forms.MessageBoxButtons.OK,
                    System.Windows.Forms.MessageBoxIcon.Error);
            }
        }

        // ── Fallback Ribbon XML ─────────────────────────────────────────────

        private static string FallbackRibbonXml()
        {
            return @"<?xml version=""1.0"" encoding=""UTF-8""?>
<customUI xmlns=""http://schemas.microsoft.com/office/2009/07/customui"" onLoad=""Ribbon_Load"">
  <ribbon>
    <tabs>
      <tab id=""tabScheduleSync"" label=""ScheduleSync"">
        <group id=""grpImport"" label=""Schedule Import"">
          <button id=""btnImportCsv""
                  label=""Import CSV""
                  size=""large""
                  imageMso=""ImportTextFile""
                  onAction=""BtnImportCsv_Click""
                  screentip=""Import schedule updates from a CSV file."" />
          <button id=""btnImportJson""
                  label=""Import JSON""
                  size=""large""
                  imageMso=""ImportXMLFile""
                  onAction=""BtnImportJson_Click""
                  screentip=""Import schedule updates from a JSON file."" />
        </group>
        <group id=""grpCrew"" label=""Crew Assignment"">
          <button id=""btnCrewAssignment""
                  label=""Crew Assignment""
                  size=""large""
                  imageMso=""GroupSmartArtQuickStyles""
                  onAction=""BtnCrewAssignment_Click""
                  screentip=""Open the crew assignment workflow window."" />
          <button id=""btnQuickPush""
                  label=""Quick Push CSV""
                  size=""large""
                  imageMso=""FileOpen""
                  onAction=""BtnQuickPush_Click""
                  screentip=""Import an assigned CSV and push to the active project."" />
        </group>
      </tab>
    </tabs>
  </ribbon>
</customUI>";
        }
    }
}
