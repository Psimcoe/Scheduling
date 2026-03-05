using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using Microsoft.Win32;
using ScheduleSync.Desktop.Models;
using ScheduleSync.Desktop.Services;

namespace ScheduleSync.Desktop
{
    public partial class MainWindow : Window
    {
        private List<PrefabTask> _tasks = new();
        private List<CrewRule> _rules = new();
        private List<CrewGroup> _crewGroups = new();
        private List<PrefabTask> _unassigned = new();
        private AppSettings _settings;
        private bool _apiKeyPlaceholder = true;
        private AiService? _ai;
        private PatternStore _patternStore;

        // Cached brushes (frozen = thread-safe, no per-call allocation)
        private static readonly Brush AiReadyBrush = Freeze(new SolidColorBrush(Color.FromRgb(0x4C, 0xAF, 0x50)));
        private static readonly Brush AiOffBrush = Freeze(new SolidColorBrush(Color.FromRgb(0xBD, 0xBD, 0xBD)));

        private static Brush Freeze(SolidColorBrush b) { b.Freeze(); return b; }

        public MainWindow()
        {
            InitializeComponent();
            _settings = SettingsManager.Load();
            _patternStore = PatternMemory.Load();
            RestoreSettings();
        }

        // ── Settings ────────────────────────────────────────────────────────

        private void RestoreSettings()
        {
            // Restore provider selection
            var providerIndex = _settings.Provider == "Gemini" ? 1 : 0;
            ProviderCombo.SelectedIndex = providerIndex;
            PopulateModelCombo(GetSelectedProvider());

            // Restore API key for the active provider
            var savedKey = GetSavedKeyForProvider(GetSelectedProvider());
            if (!string.IsNullOrEmpty(savedKey))
            {
                ApiKeyBox.Text = new string('*', 12);
                ApiKeyBox.Foreground = (Brush)FindResource("TextPrimaryBrush");
                ApiKeyBox.Tag = savedKey;
                _apiKeyPlaceholder = false;
                UpdateAiStatus(true);
            }

            // Restore model selection
            for (int i = 0; i < ModelCombo.Items.Count; i++)
            {
                if (((ComboBoxItem)ModelCombo.Items[i]).Content.ToString() == _settings.Model)
                {
                    ModelCombo.SelectedIndex = i;
                    break;
                }
            }
        }

        private AiProvider GetSelectedProvider() =>
            ProviderCombo.SelectedIndex == 1 ? AiProvider.Gemini : AiProvider.OpenAI;

        private string? GetSavedKeyForProvider(AiProvider provider) =>
            provider == AiProvider.Gemini ? _settings.GeminiApiKey : _settings.OpenAiApiKey;

        private void PopulateModelCombo(AiProvider provider)
        {
            ModelCombo.Items.Clear();
            if (provider == AiProvider.Gemini)
            {
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gemini-2.5-pro" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gemini-2.5-flash" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gemini-2.0-flash" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gemini-1.5-pro" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gemini-1.5-flash" });
            }
            else
            {
                ModelCombo.Items.Add(new ComboBoxItem { Content = "codex-5.3" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gpt-4.1" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gpt-4.1-mini" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gpt-4o" });
                ModelCombo.Items.Add(new ComboBoxItem { Content = "gpt-4o-mini" });
            }
            ModelCombo.SelectedIndex = 0;
        }

        private void ProviderCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (!IsInitialized) return;

            var provider = GetSelectedProvider();
            PopulateModelCombo(provider);

            // Swap displayed API key to the one stored for this provider
            var savedKey = GetSavedKeyForProvider(provider);
            if (!string.IsNullOrEmpty(savedKey))
            {
                ApiKeyBox.Text = new string('*', 12);
                ApiKeyBox.Foreground = (Brush)FindResource("TextPrimaryBrush");
                ApiKeyBox.Tag = savedKey;
                _apiKeyPlaceholder = false;
                UpdateAiStatus(true);
            }
            else
            {
                ApiKeyBox.Text = "Enter API key...";
                ApiKeyBox.Foreground = (Brush)FindResource("TextSecondaryBrush");
                ApiKeyBox.Tag = null;
                _apiKeyPlaceholder = true;
                UpdateAiStatus(false);
            }

            _settings.Provider = provider.ToString();
            _ai = null;
            SettingsManager.Save(_settings);
        }

        private void UpdateAiStatus(bool configured)
        {
            AiStatusDot.Fill = configured ? AiReadyBrush : AiOffBrush;
            AiStatusDot.ToolTip = configured ? "AI ready" : "AI not configured";
        }

        private void ApiKeyBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (_apiKeyPlaceholder || ApiKeyBox.Text.All(c => c == '*'))
            {
                ApiKeyBox.Text = "";
                ApiKeyBox.Foreground = (Brush)FindResource("TextPrimaryBrush");
                _apiKeyPlaceholder = false;
            }
        }

        private void ApiKeyBox_LostFocus(object sender, RoutedEventArgs e)
        {
            var text = ApiKeyBox.Text.Trim();
            if (string.IsNullOrEmpty(text))
            {
                ApiKeyBox.Text = "Enter API key...";
                ApiKeyBox.Foreground = (Brush)FindResource("TextSecondaryBrush");
                _apiKeyPlaceholder = true;
                ApiKeyBox.Tag = null;
                UpdateAiStatus(false);
                return;
            }

            // If user typed a real key (not all asterisks), save it
            if (!text.All(c => c == '*'))
            {
                ApiKeyBox.Tag = text;

                // Save to the correct provider slot
                var provider = GetSelectedProvider();
                if (provider == AiProvider.Gemini)
                    _settings.GeminiApiKey = text;
                else
                    _settings.OpenAiApiKey = text;

                _settings.Provider = provider.ToString();
                _settings.Model = GetModel();
                SettingsManager.Save(_settings);
                _ai = null; // force re-creation with new key
                UpdateAiStatus(true);

                // Mask the display
                ApiKeyBox.Text = new string('*', 12);
            }
        }

        private string? GetApiKey() => ApiKeyBox.Tag as string;

        private string GetModel() =>
            ((ComboBoxItem)ModelCombo.SelectedItem).Content.ToString() ?? "codex-5.3";

        private bool IsAiAvailable() => !string.IsNullOrEmpty(GetApiKey());

        private AiService GetOrCreateAi()
        {
            var key = GetApiKey()!;
            var model = GetModel();
            var provider = GetSelectedProvider();
            if (_ai == null || _ai.CurrentModel != model || _ai.Provider != provider)
                _ai = new AiService(key, model, provider, _patternStore);
            return _ai;
        }

        // ── CSV Browse ──────────────────────────────────────────────────────

        private void ModelCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            // Guard against firing during InitializeComponent
            if (!IsInitialized) return;
            SaveModelSetting();
        }
        private void BrowseCsv_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "CSV files (*.csv)|*.csv|All files (*.*)|*.*",
                Title = "Select Prefab Packages CSV"
            };

            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var content = File.ReadAllText(dlg.FileName);
                    _tasks = CrewMatcher.LoadCsv(content);
                    CsvPathBox.Text = dlg.FileName;
                    CsvPathBox.Foreground = (Brush)FindResource("TextPrimaryBrush");
                    CsvStatusText.Text = $"{_tasks.Count} tasks loaded";
                    StatusBar.Text = $"Loaded {_tasks.Count} tasks from CSV.";
                    UpdateMatchButtonState();
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Error loading CSV:\n{ex.Message}", "Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        // ── Parse Email ─────────────────────────────────────────────────────
        private async void ParseEmail_Click(object sender, RoutedEventArgs e)
        {
            var text = EmailBox.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                MessageBox.Show("Paste a foreman email first.", "No Email",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            if (IsAiAvailable())
            {
                await ParseEmailWithAi(text);
            }
            else
            {
                // Fallback: regex-based parser
                _rules = EmailParser.Parse(text);
                PopulateRulesList("(regex)");
            }

            StatusBar.Text = $"Parsed {_rules.Count} crew rules from email.";
            UpdateMatchButtonState();
        }

        private async Task ParseEmailWithAi(string emailText)
        {
            ParseButton.IsEnabled = false;
            StatusBar.Text = "AI is parsing email...";

            try
            {
                var ai = GetOrCreateAi();

                // Feed the AI the known values from the CSV so it can map to them
                var knownProjects = _tasks.Select(t => t.ProjectNumber).Where(s => !string.IsNullOrEmpty(s)).Distinct();
                var knownCategories = _tasks.Select(t => t.CategoryType).Where(s => !string.IsNullOrEmpty(s)).Distinct();

                _rules = await ai.ParseEmailAsync(emailText, knownProjects, knownCategories);
                PopulateRulesList("(AI)");
            }
            catch (Exception ex)
            {
                // Fall back to regex parser
                _rules = EmailParser.Parse(emailText);
                PopulateRulesList("(regex fallback)");
                StatusBar.Text = $"AI parse failed, used regex fallback: {ex.Message}";
            }
            finally
            {
                ParseButton.IsEnabled = true;
            }
        }

        private void PopulateRulesList(string source)
        {
            RulesListBox.Items.Clear();
            RulesListBox.Items.Add($"── {_rules.Count} rules {source} ──");
            foreach (var rule in _rules)
            {
                var cat = string.IsNullOrEmpty(rule.CategoryType) ? "*" : rule.CategoryType;
                var proj = string.IsNullOrEmpty(rule.ProjectNumber) ? "(no project)" : rule.ProjectNumber;
                RulesListBox.Items.Add($"{rule.Crew}  ->  {proj} / {cat}");
            }
        }

        // ── Match Crews ─────────────────────────────────────────────────────
        private async void MatchCrews_Click(object sender, RoutedEventArgs e)
        {
            if (_tasks.Count == 0 || _rules.Count == 0) return;

            MatchButton.IsEnabled = false;

            // Reset previous assignments
            foreach (var t in _tasks)
            {
                t.CrewAssignment = string.Empty;
                t.CrewNotes = string.Empty;
            }

            // Phase 1: Deterministic exact matching
            StatusBar.Text = "Matching by ProjectNumber + CategoryType...";
            var (assigned, unassigned) = CrewMatcher.Match(_tasks, _rules);

            // Phase 2: AI fuzzy matching for remaining unassigned tasks
            int aiFuzzyCount = 0;
            if (IsAiAvailable() && unassigned.Count > 0)
            {
                StatusBar.Text = $"AI fuzzy-matching {unassigned.Count} unassigned tasks...";
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
                            task.CrewNotes = $"[AI {fm.Confidence:P0}] {fm.Reason}";
                            aiFuzzyCount++;
                        }
                    }

                    // Re-partition after AI matching
                    (assigned, unassigned) = RepartitionResults(_tasks);
                }
                catch (Exception ex)
                {
                    StatusBar.Text = $"AI fuzzy match failed: {ex.Message}";
                }
            }

            _crewGroups = assigned;
            _unassigned = unassigned;

            int assignedCount = assigned.Sum(g => g.Tasks.Count);
            var aiNote = aiFuzzyCount > 0 ? $" ({aiFuzzyCount} via AI)" : "";
            SummaryText.Text = $"{assignedCount} assigned{aiNote}, {unassigned.Count} unassigned of {_tasks.Count} total";
            StatusBar.Text = "Matching complete.";
            ExportButton.IsEnabled = true;
            PushButton.IsEnabled = true;
            MatchButton.IsEnabled = true;

            BuildResultsTree(assigned, unassigned);
        }

        private static (List<CrewGroup> Assigned, List<PrefabTask> Unassigned) RepartitionResults(List<PrefabTask> tasks)
        {
            var assigned = tasks
                .Where(t => !string.IsNullOrEmpty(t.CrewAssignment))
                .GroupBy(t => t.CrewAssignment)
                .Select(g => new CrewGroup
                {
                    Crew = g.Key,
                    Notes = g.First().CrewNotes,
                    Tasks = g.OrderBy(t => t.StartDate).ToList()
                })
                .OrderBy(g => g.Crew)
                .ToList();

            var unassigned = tasks
                .Where(t => string.IsNullOrEmpty(t.CrewAssignment))
                .OrderBy(t => t.Id)
                .ToList();

            return (assigned, unassigned);
        }

        // ── Build TreeView ──────────────────────────────────────────────────
        private void BuildResultsTree(List<CrewGroup> groups, List<PrefabTask> unassigned)
        {
            ResultsTree.Items.Clear();

            foreach (var group in groups)
            {
                var crewNode = new TreeViewItem
                {
                    Header = BuildCrewHeader(group.Crew, group.Tasks.Count, group.Notes),
                    IsExpanded = false
                };

                // Sub-group by Project / Category
                var subGroups = group.Tasks
                    .GroupBy(t => $"{t.ProjectNumber} / {t.CategoryType}")
                    .OrderBy(g => g.Key);

                foreach (var sg in subGroups)
                {
                    var subNode = new TreeViewItem
                    {
                        Header = BuildSubHeader(sg.Key, sg.Count()),
                        IsExpanded = false
                    };

                    foreach (var task in sg.OrderBy(t => t.StartDate))
                    {
                        subNode.Items.Add(new TreeViewItem
                        {
                            Header = BuildTaskLine(task)
                        });
                    }
                    crewNode.Items.Add(subNode);
                }

                ResultsTree.Items.Add(crewNode);
            }

            // Unassigned section
            if (unassigned.Count > 0)
            {
                var unNode = new TreeViewItem
                {
                    Header = BuildUnassignedHeader(unassigned.Count),
                    IsExpanded = false
                };

                var uGroups = unassigned
                    .GroupBy(t => $"{t.ProjectNumber} / {t.CategoryType}")
                    .OrderBy(g => g.Key);

                foreach (var ug in uGroups)
                {
                    var subNode = new TreeViewItem
                    {
                        Header = BuildSubHeader(ug.Key, ug.Count()),
                        IsExpanded = false
                    };

                    foreach (var task in ug.OrderBy(t => t.StartDate))
                    {
                        subNode.Items.Add(new TreeViewItem
                        {
                            Header = BuildTaskLine(task)
                        });
                    }
                    unNode.Items.Add(subNode);
                }

                ResultsTree.Items.Add(unNode);
            }
        }

        // ── TreeView Header Builders ────────────────────────────────────────
        private static TextBlock BuildCrewHeader(string crew, int count, string notes)
        {
            var tb = new TextBlock();
            tb.Inlines.Add(new Run(crew) { FontWeight = FontWeights.Bold, FontSize = 14 });
            tb.Inlines.Add(new Run($"  ({count} tasks)") { Foreground = Brushes.Gray, FontSize = 12 });
            if (!string.IsNullOrEmpty(notes))
            {
                tb.Inlines.Add(new Run($"\n    {notes}")
                    { Foreground = Brushes.DarkGray, FontSize = 11, FontStyle = FontStyles.Italic });
            }
            return tb;
        }

        private static TextBlock BuildSubHeader(string label, int count)
        {
            var tb = new TextBlock();
            tb.Inlines.Add(new Run($"[{label}]") { FontWeight = FontWeights.SemiBold });
            tb.Inlines.Add(new Run($"  {count} tasks") { Foreground = Brushes.Gray });
            return tb;
        }

        private static TextBlock BuildUnassignedHeader(int count)
        {
            var tb = new TextBlock();
            tb.Inlines.Add(new Run($"UNASSIGNED ({count} tasks)")
                { FontWeight = FontWeights.Bold, Foreground = Brushes.OrangeRed, FontSize = 14 });
            return tb;
        }

        private static TextBlock BuildTaskLine(PrefabTask task)
        {
            var brush = GetStatusBrush(task.Status);
            var tb = new TextBlock();
            tb.Inlines.Add(new Run($"#{task.Id} ") { Foreground = Brushes.Gray });
            tb.Inlines.Add(new Run(task.TaskName) { Foreground = brush });
            tb.Inlines.Add(new Run($"  {task.StartDate} -> {task.FinishDate}") { Foreground = Brushes.DarkGray, FontSize = 11 });
            tb.Inlines.Add(new Run($"  [{task.Status}]") { Foreground = Brushes.Gray, FontSize = 10 });
            return tb;
        }

        private static Brush GetStatusBrush(string status)
        {
            if (string.IsNullOrEmpty(status)) return Brushes.Black;
            if (status.Contains("Complete")) return Brushes.Green;
            if (status.Contains("Issued for Fabrication")) return Brushes.DarkGoldenrod;
            if (status.StartsWith("Ready for Fab")) return Brushes.Teal;
            if (status.Contains("Hold")) return Brushes.Red;
            return Brushes.Black;
        }

        // ── Export CSV ──────────────────────────────────────────────────────
        private void ExportCsv_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new SaveFileDialog
            {
                Filter = "CSV files (*.csv)|*.csv",
                Title = "Save Crew Assignment CSV",
                FileName = "Prefab Packages_CrewAssigned.csv"
            };

            if (dlg.ShowDialog() == true)
            {
                try
                {
                    var csv = CrewMatcher.ExportCsv(_tasks);
                    File.WriteAllText(dlg.FileName, csv);
                    RecordLearnedPatterns();
                    StatusBar.Text = $"Exported to {dlg.FileName}";
                    MessageBox.Show($"Saved {_tasks.Count} tasks to:\n{dlg.FileName}",
                        "Export Complete", MessageBoxButton.OK, MessageBoxImage.Information);
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Error saving CSV:\n{ex.Message}", "Error",
                        MessageBoxButton.OK, MessageBoxImage.Error);
                }
            }
        }

        // ── Browse MPP ──────────────────────────────────────────────────
        private void BrowseMpp_Click(object sender, RoutedEventArgs e)
        {
            var dlg = new OpenFileDialog
            {
                Filter = "MS Project files (*.mpp)|*.mpp|All files (*.*)|*.*",
                Title = "Select MS Project File (optional)"
            };

            if (dlg.ShowDialog() == true)
            {
                MppPathBox.Text = dlg.FileName;
                MppPathBox.Foreground = (Brush)FindResource("TextPrimaryBrush");
            }
        }

        // ── Push to MS Project ──────────────────────────────────────────────
        private async void PushToProject_Click(object sender, RoutedEventArgs e)
        {
            var assigned = _tasks.Where(t => !string.IsNullOrEmpty(t.CrewAssignment)).ToList();
            if (assigned.Count == 0)
            {
                MessageBox.Show("No crew assignments to push. Run Match Crews first.",
                    "Nothing to Push", MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            // Determine MPP path (empty = use active project)
            string? mppPath = null;
            var mppText = MppPathBox.Text;
            if (!string.IsNullOrWhiteSpace(mppText) && !mppText.StartsWith("("))
                mppPath = mppText;

            var confirm = MessageBox.Show(
                $"This will set Resource Names on {assigned.Count} tasks in MS Project.\n\n" +
                (mppPath != null
                    ? $"File: {mppPath}"
                    : "Target: currently active project") +
                "\n\nChanges are undoable via Edit > Undo.\nContinue?",
                "Push to MS Project",
                MessageBoxButton.YesNo, MessageBoxImage.Question);

            if (confirm != MessageBoxResult.Yes) return;

            StatusBar.Text = "Pushing to MS Project...";
            PushButton.IsEnabled = false;

            try
            {
                // Run COM interop off the UI thread to prevent freeze
                var tasksCopy = _tasks;
                var result = await System.Threading.Tasks.Task.Run(() => MsProjectPusher.Push(tasksCopy, mppPath));

                RecordLearnedPatterns();
                StatusBar.Text = $"Push complete: {result.Updated} updated, {result.Skipped} skipped.";

                var details = string.Join("\n", result.Log);
                MessageBox.Show(
                    $"Updated: {result.Updated}\nSkipped: {result.Skipped}\n" +
                    $"Not in schedule: {result.NotFound}\n\n" +
                    "Changes are undoable in MS Project via Edit > Undo.\n\n" +
                    $"Log:\n{details}",
                    "Push Complete", MessageBoxButton.OK, MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                StatusBar.Text = "Push failed.";
                MessageBox.Show($"Error pushing to MS Project:\n\n{ex.Message}",
                    "Push Failed", MessageBoxButton.OK, MessageBoxImage.Error);
            }
            finally
            {
                PushButton.IsEnabled = true;
            }
        }

        // ── Helpers ─────────────────────────────────────────────────────────
        private void UpdateMatchButtonState()
        {
            MatchButton.IsEnabled = _tasks.Count > 0 && _rules.Count > 0;
        }

        /// <summary>
        /// Records all confirmed crew assignments into PatternMemory so future
        /// AI calls benefit from historically successful matches.
        /// </summary>
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
            _ai = null; // force re-creation so next run picks up new memory
        }

        private void SaveModelSetting()
        {
            if (!string.IsNullOrEmpty(_settings.OpenAiApiKey))
            {
                _settings.Model = GetModel();
                SettingsManager.Save(_settings);
                _ai = null; // force re-creation on next use
            }
        }
    }
}
