using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Windows.Forms;
using ScheduleSync.AddIn.Models;
using ScheduleSync.AddIn.Services;

namespace ScheduleSync.AddIn.UI
{
    /// <summary>
    /// Modeless WinForms window for the crew assignment workflow.
    /// Runs inside MS Project (hosted by the COM add-in).
    /// Supports: Load CSV, Parse Email, Match Crews, Push to Active Project.
    /// </summary>
    public class CrewAssignmentForm : Form
    {
        // ── State ───────────────────────────────────────────────────────
        private List<PrefabTask> _tasks = new List<PrefabTask>();
        private List<CrewRule> _rules = new List<CrewRule>();
        private AppSettings _settings;
        private PatternStore _patternStore;
        private AiService _ai;

        /// <summary>When true, opens in quick-push mode (import assigned CSV → push).</summary>
        public bool QuickPushMode { get; set; }

        // ── Controls ────────────────────────────────────────────────────
        private TabControl _tabs;
        private TextBox _csvPathBox;
        private Button _browseCsvBtn;
        private Label _csvStatus;
        private TextBox _emailBox;
        private Button _parseBtn;
        private ListBox _rulesListBox;
        private Button _matchBtn;
        private DataGridView _resultsGrid;
        private Button _pushBtn;
        private Button _exportBtn;
        private Button _importAssignedBtn;
        private Label _statusBar;
        private ComboBox _providerCombo;
        private TextBox _apiKeyBox;
        private ComboBox _modelCombo;

        public CrewAssignmentForm()
        {
            _settings = SettingsManager.Load();
            _patternStore = PatternMemory.Load();
            InitializeComponent();
            RestoreSettings();
        }

        // ── Layout ──────────────────────────────────────────────────────

        private void InitializeComponent()
        {
            Text = "ScheduleSync - Crew Assignment";
            Size = new Size(1050, 700);
            MinimumSize = new Size(800, 500);
            StartPosition = FormStartPosition.CenterScreen;
            TopMost = true;
            Font = new Font("Segoe UI", 9f);

            var mainLayout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                RowCount = 3,
                ColumnCount = 1,
                Padding = new Padding(8)
            };
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));  // AI settings bar
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));  // Main content
            mainLayout.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));  // Status bar

            // ── AI Settings Bar ─────────────────────────────────────────
            var aiBar = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false,
                Padding = new Padding(4, 6, 4, 2)
            };

            aiBar.Controls.Add(MakeLabel("Provider:", 55));
            _providerCombo = new ComboBox { Width = 80, DropDownStyle = ComboBoxStyle.DropDownList };
            _providerCombo.Items.AddRange(new object[] { "OpenAI", "Gemini" });
            _providerCombo.SelectedIndex = 0;
            _providerCombo.SelectedIndexChanged += ProviderChanged;
            aiBar.Controls.Add(_providerCombo);

            aiBar.Controls.Add(MakeLabel("API Key:", 50));
            _apiKeyBox = new TextBox { Width = 180, UseSystemPasswordChar = true };
            _apiKeyBox.Leave += ApiKeyBox_Leave;
            aiBar.Controls.Add(_apiKeyBox);

            aiBar.Controls.Add(MakeLabel("Model:", 40));
            _modelCombo = new ComboBox { Width = 130, DropDownStyle = ComboBoxStyle.DropDownList };
            PopulateModelCombo();
            aiBar.Controls.Add(_modelCombo);

            mainLayout.Controls.Add(aiBar, 0, 0);

            // ── Tab Control (main area) ─────────────────────────────────
            _tabs = new TabControl { Dock = DockStyle.Fill };

            // Tab 1: Import & Match
            var tabImport = new TabPage("Import & Match");
            BuildImportTab(tabImport);
            _tabs.TabPages.Add(tabImport);

            // Tab 2: Results & Push
            var tabResults = new TabPage("Results & Push");
            BuildResultsTab(tabResults);
            _tabs.TabPages.Add(tabResults);

            mainLayout.Controls.Add(_tabs, 0, 1);

            // ── Status Bar ──────────────────────────────────────────────
            _statusBar = new Label
            {
                Dock = DockStyle.Fill,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.DimGray,
                Text = "Ready."
            };
            mainLayout.Controls.Add(_statusBar, 0, 2);

            Controls.Add(mainLayout);
        }

        private void BuildImportTab(TabPage tab)
        {
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                RowCount = 5,
                ColumnCount = 1,
                Padding = new Padding(6)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));   // CSV row
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 20));   // CSV status
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 60));    // Email box
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 40));    // Rules list
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36));   // Buttons

            // CSV row
            var csvRow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.LeftToRight,
                WrapContents = false
            };
            csvRow.Controls.Add(MakeLabel("Schedule CSV:", 80));
            _csvPathBox = new TextBox { Width = 450, ReadOnly = true, Text = "(no file loaded)" };
            csvRow.Controls.Add(_csvPathBox);
            _browseCsvBtn = new Button { Text = "Browse...", Width = 75 };
            _browseCsvBtn.Click += BrowseCsv_Click;
            csvRow.Controls.Add(_browseCsvBtn);
            _importAssignedBtn = new Button { Text = "Import Assigned CSV", Width = 130 };
            _importAssignedBtn.Click += ImportAssignedCsv_Click;
            csvRow.Controls.Add(_importAssignedBtn);
            layout.Controls.Add(csvRow, 0, 0);

            _csvStatus = new Label { Dock = DockStyle.Fill, ForeColor = Color.Teal };
            layout.Controls.Add(_csvStatus, 0, 1);

            // Email
            var emailGroup = new GroupBox { Text = "Foreman Email", Dock = DockStyle.Fill };
            _emailBox = new TextBox
            {
                Dock = DockStyle.Fill,
                Multiline = true,
                ScrollBars = ScrollBars.Vertical,
                Font = new Font("Consolas", 9.5f)
            };
            emailGroup.Controls.Add(_emailBox);
            layout.Controls.Add(emailGroup, 0, 2);

            // Rules list
            var rulesGroup = new GroupBox { Text = "Parsed Rules", Dock = DockStyle.Fill };
            _rulesListBox = new ListBox { Dock = DockStyle.Fill };
            rulesGroup.Controls.Add(_rulesListBox);
            layout.Controls.Add(rulesGroup, 0, 3);

            // Buttons
            var btnRow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft
            };
            _matchBtn = new Button { Text = "Match Crews", Width = 100, Enabled = false };
            _matchBtn.Click += MatchCrews_Click;
            btnRow.Controls.Add(_matchBtn);
            _parseBtn = new Button { Text = "Parse Email", Width = 100 };
            _parseBtn.Click += ParseEmail_Click;
            btnRow.Controls.Add(_parseBtn);
            layout.Controls.Add(btnRow, 0, 4);

            tab.Controls.Add(layout);
        }

        private void BuildResultsTab(TabPage tab)
        {
            var layout = new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                RowCount = 2,
                ColumnCount = 1,
                Padding = new Padding(6)
            };
            layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));  // Grid
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));  // Buttons

            // Results grid
            _resultsGrid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                RowHeadersVisible = false,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.None
            };
            _resultsGrid.Columns.Add("Id", "ID");
            _resultsGrid.Columns.Add("TaskName", "Task Name");
            _resultsGrid.Columns.Add("Project", "Project");
            _resultsGrid.Columns.Add("Category", "Category");
            _resultsGrid.Columns.Add("Status", "Status");
            _resultsGrid.Columns.Add("Crew", "Crew Assignment");
            _resultsGrid.Columns.Add("Notes", "Notes");
            _resultsGrid.Columns["Id"].Width = 40;
            _resultsGrid.Columns["Project"].Width = 100;
            _resultsGrid.Columns["Category"].Width = 50;
            _resultsGrid.Columns["Status"].Width = 100;
            _resultsGrid.Columns["Crew"].Width = 120;
            layout.Controls.Add(_resultsGrid, 0, 0);

            // Buttons
            var btnRow = new FlowLayoutPanel
            {
                Dock = DockStyle.Fill,
                FlowDirection = FlowDirection.RightToLeft
            };
            _exportBtn = new Button { Text = "Export CSV", Width = 100, Enabled = false };
            _exportBtn.Click += ExportCsv_Click;
            btnRow.Controls.Add(_exportBtn);
            _pushBtn = new Button
            {
                Text = "Push to Active Project",
                Width = 150,
                Enabled = false,
                BackColor = Color.FromArgb(0x2E, 0x7D, 0x32),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _pushBtn.Click += PushToProject_Click;
            btnRow.Controls.Add(_pushBtn);
            layout.Controls.Add(btnRow, 0, 1);

            tab.Controls.Add(layout);
        }

        private static Label MakeLabel(string text, int width)
        {
            return new Label
            {
                Text = text,
                Width = width,
                TextAlign = ContentAlignment.MiddleRight,
                Margin = new Padding(0, 4, 4, 0)
            };
        }

        // ── Settings ────────────────────────────────────────────────────

        private void RestoreSettings()
        {
            _providerCombo.SelectedIndex = _settings.Provider == "Gemini" ? 1 : 0;
            PopulateModelCombo();

            var savedKey = _providerCombo.SelectedIndex == 1
                ? _settings.GeminiApiKey : _settings.OpenAiApiKey;
            if (!string.IsNullOrEmpty(savedKey))
                _apiKeyBox.Text = savedKey;

            for (int i = 0; i < _modelCombo.Items.Count; i++)
            {
                if (_modelCombo.Items[i].ToString() == _settings.Model)
                {
                    _modelCombo.SelectedIndex = i;
                    break;
                }
            }
        }

        private void PopulateModelCombo()
        {
            _modelCombo.Items.Clear();
            if (_providerCombo.SelectedIndex == 1) // Gemini
            {
                _modelCombo.Items.AddRange(new object[]
                    { "gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash" });
            }
            else
            {
                _modelCombo.Items.AddRange(new object[]
                    { "codex-5.3", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini" });
            }
            _modelCombo.SelectedIndex = 0;
        }

        private void ProviderChanged(object sender, EventArgs e)
        {
            PopulateModelCombo();
            var savedKey = _providerCombo.SelectedIndex == 1
                ? _settings.GeminiApiKey : _settings.OpenAiApiKey;
            _apiKeyBox.Text = savedKey ?? "";
            _ai = null;
        }

        private void ApiKeyBox_Leave(object sender, EventArgs e)
        {
            var key = _apiKeyBox.Text.Trim();
            if (string.IsNullOrEmpty(key)) return;

            if (_providerCombo.SelectedIndex == 1)
                _settings.GeminiApiKey = key;
            else
                _settings.OpenAiApiKey = key;

            _settings.Provider = _providerCombo.SelectedItem.ToString();
            _settings.Model = _modelCombo.SelectedItem?.ToString() ?? "codex-5.3";
            SettingsManager.Save(_settings);
            _ai = null;
        }

        private bool IsAiAvailable()
        {
            var key = _providerCombo.SelectedIndex == 1
                ? _settings.GeminiApiKey : _settings.OpenAiApiKey;
            return !string.IsNullOrEmpty(key);
        }

        private AiService GetOrCreateAi()
        {
            var key = _providerCombo.SelectedIndex == 1
                ? _settings.GeminiApiKey : _settings.OpenAiApiKey;
            var model = _modelCombo.SelectedItem?.ToString() ?? "codex-5.3";
            var provider = _providerCombo.SelectedIndex == 1 ? AiProvider.Gemini : AiProvider.OpenAI;

            if (_ai == null || _ai.CurrentModel != model || _ai.Provider != provider)
                _ai = new AiService(key, model, provider, _patternStore);
            return _ai;
        }

        // ── CSV Browse ──────────────────────────────────────────────────

        private void BrowseCsv_Click(object sender, EventArgs e)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*";
                dlg.Title = "Select Prefab Packages CSV";

                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        var content = File.ReadAllText(dlg.FileName);
                        _tasks = CrewMatcher.LoadCsv(content);
                        _csvPathBox.Text = dlg.FileName;
                        _csvStatus.Text = _tasks.Count + " tasks loaded";
                        _statusBar.Text = "Loaded " + _tasks.Count + " tasks from CSV.";
                        UpdateMatchButton();
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Error loading CSV:\n" + ex.Message, "Error",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        private void ImportAssignedCsv_Click(object sender, EventArgs e)
        {
            using (var dlg = new OpenFileDialog())
            {
                dlg.Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*";
                dlg.Title = "Import Pre-Assigned CSV (with Crew_Assignment column)";

                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        var content = File.ReadAllText(dlg.FileName);
                        _tasks = CrewMatcher.LoadAssignedCsv(content);

                        int assigned = _tasks.Count(t => !string.IsNullOrEmpty(t.CrewAssignment));
                        _csvPathBox.Text = dlg.FileName;
                        _csvStatus.Text = string.Format("{0} tasks loaded ({1} pre-assigned)", _tasks.Count, assigned);
                        _statusBar.Text = "Imported " + _tasks.Count + " tasks from " + Path.GetFileName(dlg.FileName);

                        PopulateResultsGrid();
                        _tabs.SelectedIndex = 1; // Switch to Results tab
                        _pushBtn.Enabled = assigned > 0;
                        _exportBtn.Enabled = true;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Error importing CSV:\n" + ex.Message, "Error",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        // ── Parse Email ─────────────────────────────────────────────────

        private async void ParseEmail_Click(object sender, EventArgs e)
        {
            var text = _emailBox.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                MessageBox.Show("Paste a foreman email first.", "No Email",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            _parseBtn.Enabled = false;
            _statusBar.Text = "Parsing email...";

            try
            {
                if (IsAiAvailable())
                {
                    var ai = GetOrCreateAi();
                    var knownProjects = _tasks.Select(t => t.ProjectNumber)
                        .Where(s => !string.IsNullOrEmpty(s)).Distinct();
                    var knownCategories = _tasks.Select(t => t.CategoryType)
                        .Where(s => !string.IsNullOrEmpty(s)).Distinct();

                    _rules = await ai.ParseEmailAsync(text, knownProjects, knownCategories);
                    PopulateRulesList("(AI)");
                }
                else
                {
                    _rules = EmailParser.Parse(text);
                    PopulateRulesList("(regex)");
                }
            }
            catch (Exception ex)
            {
                _rules = EmailParser.Parse(text);
                PopulateRulesList("(regex fallback)");
                _statusBar.Text = "AI failed, used regex: " + ex.Message;
            }
            finally
            {
                _parseBtn.Enabled = true;
                _statusBar.Text = "Parsed " + _rules.Count + " crew rules.";
                UpdateMatchButton();
            }
        }

        private void PopulateRulesList(string source)
        {
            _rulesListBox.Items.Clear();
            _rulesListBox.Items.Add(string.Format("-- {0} rules {1} --", _rules.Count, source));
            foreach (var r in _rules)
            {
                var cat = string.IsNullOrEmpty(r.CategoryType) ? "*" : r.CategoryType;
                var proj = string.IsNullOrEmpty(r.ProjectNumber) ? "(no project)" : r.ProjectNumber;
                _rulesListBox.Items.Add(string.Format("{0}  ->  {1} / {2}", r.Crew, proj, cat));
            }
        }

        // ── Match Crews ─────────────────────────────────────────────────

        private async void MatchCrews_Click(object sender, EventArgs e)
        {
            if (_tasks.Count == 0 || _rules.Count == 0) return;

            _matchBtn.Enabled = false;
            _statusBar.Text = "Matching...";

            foreach (var t in _tasks)
            {
                t.CrewAssignment = string.Empty;
                t.CrewNotes = string.Empty;
            }

            var (assigned, unassigned) = CrewMatcher.Match(_tasks, _rules);

            int aiFuzzy = 0;
            if (IsAiAvailable() && unassigned.Count > 0)
            {
                _statusBar.Text = string.Format("AI fuzzy-matching {0} tasks...", unassigned.Count);
                try
                {
                    var ai = GetOrCreateAi();
                    var fuzzyMatches = await ai.FuzzyMatchAsync(unassigned, _rules);

                    foreach (var fm in fuzzyMatches.Where(m => m.Confidence >= 0.5))
                    {
                        var task = unassigned.FirstOrDefault(t => t.Id == fm.TaskId);
                        if (task != null)
                        {
                            task.CrewAssignment = fm.Crew;
                            task.CrewNotes = string.Format("[AI {0:P0}] {1}", fm.Confidence, fm.Reason);
                            aiFuzzy++;
                        }
                    }
                }
                catch (Exception ex)
                {
                    _statusBar.Text = "AI fuzzy match failed: " + ex.Message;
                }
            }

            PopulateResultsGrid();
            _tabs.SelectedIndex = 1;

            int assignedCount = _tasks.Count(t => !string.IsNullOrEmpty(t.CrewAssignment));
            var aiNote = aiFuzzy > 0 ? string.Format(" ({0} via AI)", aiFuzzy) : "";
            _statusBar.Text = string.Format("{0} assigned{1}, {2} unassigned of {3}",
                assignedCount, aiNote, _tasks.Count - assignedCount, _tasks.Count);

            _pushBtn.Enabled = assignedCount > 0;
            _exportBtn.Enabled = true;
            _matchBtn.Enabled = true;
        }

        // ── Results Grid ────────────────────────────────────────────────

        private void PopulateResultsGrid()
        {
            _resultsGrid.Rows.Clear();
            foreach (var t in _tasks.OrderBy(t => t.CrewAssignment).ThenBy(t => t.Id))
            {
                var rowIdx = _resultsGrid.Rows.Add(
                    t.Id, t.TaskName, t.ProjectNumber, t.CategoryType,
                    t.Status, t.CrewAssignment, t.CrewNotes);

                if (string.IsNullOrEmpty(t.CrewAssignment))
                    _resultsGrid.Rows[rowIdx].DefaultCellStyle.ForeColor = Color.Gray;
                else if (t.CrewNotes.StartsWith("[AI"))
                    _resultsGrid.Rows[rowIdx].DefaultCellStyle.ForeColor = Color.DarkBlue;
            }
        }

        // ── Export CSV ──────────────────────────────────────────────────

        private void ExportCsv_Click(object sender, EventArgs e)
        {
            using (var dlg = new SaveFileDialog())
            {
                dlg.Filter = "CSV files (*.csv)|*.csv";
                dlg.Title = "Save Crew Assignment CSV";
                dlg.FileName = "Prefab Packages_CrewAssigned.csv";

                if (dlg.ShowDialog() == DialogResult.OK)
                {
                    try
                    {
                        var csv = CrewMatcher.ExportCsv(_tasks);
                        File.WriteAllText(dlg.FileName, csv);
                        RecordLearnedPatterns();
                        _statusBar.Text = "Exported to " + dlg.FileName;
                    }
                    catch (Exception ex)
                    {
                        MessageBox.Show("Error saving CSV:\n" + ex.Message, "Error",
                            MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }
            }
        }

        // ── Push to Active Project ──────────────────────────────────────

        private async void PushToProject_Click(object sender, EventArgs e)
        {
            var assigned = _tasks.Where(t => !string.IsNullOrEmpty(t.CrewAssignment)).ToList();
            if (assigned.Count == 0)
            {
                MessageBox.Show("No crew assignments to push.", "Nothing to Push",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var confirm = MessageBox.Show(
                string.Format("Set Resource Names on {0} tasks in the active MS Project?\n\nChanges are undoable via Edit > Undo.", assigned.Count),
                "Push to Active Project",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (confirm != DialogResult.Yes) return;

            _pushBtn.Enabled = false;
            _statusBar.Text = "Pushing to MS Project...";

            try
            {
                var tasksCopy = _tasks;
                var result = await Task.Run(() => PushToActiveProject(tasksCopy));

                RecordLearnedPatterns();
                _statusBar.Text = string.Format("Push complete: {0} updated, {1} skipped.", result.Updated, result.Skipped);

                MessageBox.Show(
                    string.Format("Updated: {0}\nSkipped: {1}\nNot in schedule: {2}\n\nChanges are undoable via Edit > Undo.",
                        result.Updated, result.Skipped, result.NotFound),
                    "Push Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                _statusBar.Text = "Push failed.";
                MessageBox.Show("Error pushing to MS Project:\n\n" + ex.Message,
                    "Push Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally
            {
                _pushBtn.Enabled = true;
            }
        }

        /// <summary>
        /// Pushes crew assignments to the active MS Project via the COM Application object
        /// provided by the add-in's Connect class.
        /// </summary>
        private static PushResult PushToActiveProject(List<PrefabTask> tasks)
        {
            var result = new PushResult();
            dynamic app = Connect.ProjectApp;

            if (app == null)
                throw new InvalidOperationException("MS Project application not available. Is the add-in loaded?");

            dynamic project = app.ActiveProject;
            if (project == null)
                throw new InvalidOperationException("No active project in MS Project.");

            result.Log.Add("Connected to: " + (string)project.Name);

            var crewByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var t in tasks.Where(t => !string.IsNullOrEmpty(t.CrewAssignment)))
                crewByName[t.TaskName] = t.CrewAssignment;

            app.OpenUndoTransaction("ScheduleSync: Apply Crew Assignments");
            try
            {
                foreach (dynamic task in project.Tasks)
                {
                    if (task == null) continue;
                    string name = (string)task.Name;

                    string crew;
                    if (!crewByName.TryGetValue(name, out crew))
                    {
                        result.NotFound++;
                        continue;
                    }

                    try
                    {
                        task.ResourceNames = crew;
                        result.Updated++;
                    }
                    catch (COMException)
                    {
                        result.Skipped++;
                    }
                }
            }
            finally
            {
                app.CloseUndoTransaction();
            }

            app.FileSave();
            return result;
        }

        // ── Learning ────────────────────────────────────────────────────

        private void RecordLearnedPatterns()
        {
            var confirmed = _tasks
                .Where(t => !string.IsNullOrEmpty(t.CrewAssignment))
                .Select(t => new ConfirmedAssignment
                {
                    Crew = t.CrewAssignment,
                    ProjectNumber = t.ProjectNumber,
                    CategoryType = t.CategoryType,
                    Notes = t.CrewNotes
                });

            PatternMemory.RecordConfirmedRules(_patternStore, confirmed);
            _ai = null;
        }

        // ── Helpers ─────────────────────────────────────────────────────

        private void UpdateMatchButton()
        {
            _matchBtn.Enabled = _tasks.Count > 0 && _rules.Count > 0;
        }
    }

    // ── Push Result ─────────────────────────────────────────────────────

    public class PushResult
    {
        public int Updated { get; set; }
        public int Skipped { get; set; }
        public int NotFound { get; set; }
        public List<string> Log { get; } = new List<string>();
    }
}
