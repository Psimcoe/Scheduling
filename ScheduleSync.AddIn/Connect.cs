using System;
using System.IO;
using System.Runtime.InteropServices;
using ScheduleSync.AddIn.Interop;
using ScheduleSync.AddIn.UI;

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

        // ── Fallback Ribbon XML ─────────────────────────────────────────────

        private static string FallbackRibbonXml()
        {
            return @"<?xml version=""1.0"" encoding=""UTF-8""?>
<customUI xmlns=""http://schemas.microsoft.com/office/2009/07/customui"" onLoad=""Ribbon_Load"">
  <ribbon>
    <tabs>
      <tab id=""tabScheduleSync"" label=""ScheduleSync"">
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
