using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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

        public MainWindow()
        {
            InitializeComponent();
        }

        // ── CSV Browse ──────────────────────────────────────────────────────
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
        private void ParseEmail_Click(object sender, RoutedEventArgs e)
        {
            var text = EmailBox.Text;
            if (string.IsNullOrWhiteSpace(text))
            {
                MessageBox.Show("Paste a foreman email first.", "No Email",
                    MessageBoxButton.OK, MessageBoxImage.Information);
                return;
            }

            _rules = EmailParser.Parse(text);

            RulesListBox.Items.Clear();
            foreach (var rule in _rules)
            {
                var cat = string.IsNullOrEmpty(rule.CategoryType) ? "*" : rule.CategoryType;
                var proj = string.IsNullOrEmpty(rule.ProjectNumber) ? "(no project)" : rule.ProjectNumber;
                RulesListBox.Items.Add($"{rule.Crew}  ->  {proj} / {cat}");
            }

            StatusBar.Text = $"Parsed {_rules.Count} crew rules from email.";
            UpdateMatchButtonState();
        }

        // ── Match Crews ─────────────────────────────────────────────────────
        private void MatchCrews_Click(object sender, RoutedEventArgs e)
        {
            if (_tasks.Count == 0 || _rules.Count == 0) return;

            // Reset previous assignments
            foreach (var t in _tasks)
            {
                t.CrewAssignment = string.Empty;
                t.CrewNotes = string.Empty;
            }

            var (assigned, unassigned) = CrewMatcher.Match(_tasks, _rules);
            _crewGroups = assigned;
            _unassigned = unassigned;

            int assignedCount = assigned.Sum(g => g.Tasks.Count);
            SummaryText.Text = $"{assignedCount} assigned, {unassigned.Count} unassigned of {_tasks.Count} total";
            StatusBar.Text = "Matching complete.";
            ExportButton.IsEnabled = true;

            BuildResultsTree(assigned, unassigned);
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

        // ── Helpers ─────────────────────────────────────────────────────────
        private void UpdateMatchButtonState()
        {
            MatchButton.IsEnabled = _tasks.Count > 0 && _rules.Count > 0;
        }
    }
}
