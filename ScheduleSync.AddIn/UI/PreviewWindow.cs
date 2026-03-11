using ScheduleSync.Core.Models;
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Linq;
using System.Windows.Forms;

namespace ScheduleSync.AddIn.UI
{
    /// <summary>
    /// Modeless window that shows a diff grid (before/after) for previewing
    /// schedule updates before applying them to the active MS Project plan.
    /// Custom task panes are not supported for MS Project VSTO add-ins.
    /// This modeless window is shown with TopMost = true so it stays above Project.
    /// </summary>
    public class PreviewWindow : Form
    {
        private DataGridView _grid;
        private RadioButton _filterAll, _filterChanged, _filterErrors;
        private Button _btnApply, _btnCancel;
        private Label _summaryLabel;
        private readonly List<TaskDiff> _diffs;
        private readonly Action<List<TaskDiff>> _onApply;

        public PreviewWindow(List<TaskDiff> diffs, Action<List<TaskDiff>> onApply)
        {
            _diffs = diffs ?? throw new ArgumentNullException(nameof(diffs));
            _onApply = onApply;
            InitializeComponent();
            BindGrid();
            UpdateSummary();
        }

        private void InitializeComponent()
        {
            Text = "ScheduleSync \u2013 Preview Changes";
            Size = new Size(960, 540);
            MinimumSize = new Size(700, 350);
            TopMost = true;
            StartPosition = FormStartPosition.CenterScreen;
            Font = new Font("Segoe UI", 9f);

            // Summary label
            _summaryLabel = new Label
            {
                Dock = DockStyle.Top,
                Height = 24,
                TextAlign = ContentAlignment.MiddleLeft,
                ForeColor = Color.DimGray,
                Padding = new Padding(6, 0, 0, 0)
            };

            // Filter radio buttons
            var filterPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Top,
                Height = 30,
                Padding = new Padding(6, 4, 0, 0)
            };
            filterPanel.Controls.Add(new Label
            {
                Text = "Filter:",
                Width = 40,
                TextAlign = ContentAlignment.MiddleLeft
            });
            _filterAll = new RadioButton { Text = "All", Checked = true, AutoSize = true };
            _filterChanged = new RadioButton { Text = "Changed Only", AutoSize = true };
            _filterErrors = new RadioButton { Text = "Errors Only", AutoSize = true };
            _filterAll.CheckedChanged += (s, e) => { if (_filterAll.Checked) BindGrid(); };
            _filterChanged.CheckedChanged += (s, e) => { if (_filterChanged.Checked) BindGrid(); };
            _filterErrors.CheckedChanged += (s, e) => { if (_filterErrors.Checked) BindGrid(); };
            filterPanel.Controls.AddRange(new Control[] { _filterAll, _filterChanged, _filterErrors });

            // Grid
            _grid = new DataGridView
            {
                Dock = DockStyle.Fill,
                ReadOnly = true,
                AllowUserToAddRows = false,
                AllowUserToDeleteRows = false,
                AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill,
                SelectionMode = DataGridViewSelectionMode.FullRowSelect,
                RowHeadersVisible = false,
                BackgroundColor = Color.White,
                BorderStyle = BorderStyle.None
            };
            _grid.Columns.Add("UniqueId", "UID");
            _grid.Columns.Add("Name", "Name");
            _grid.Columns.Add("BeforeStart", "Before Start");
            _grid.Columns.Add("BeforeFinish", "Before Finish");
            _grid.Columns.Add("AfterStart", "After Start");
            _grid.Columns.Add("AfterFinish", "After Finish");
            _grid.Columns.Add("Status", "Status");
            _grid.Columns.Add("Warnings", "Warnings");
            _grid.Columns["UniqueId"].Width = 50;
            _grid.Columns["Status"].Width = 70;

            // Buttons
            var buttonPanel = new FlowLayoutPanel
            {
                Dock = DockStyle.Bottom,
                Height = 44,
                FlowDirection = FlowDirection.RightToLeft,
                Padding = new Padding(6, 6, 6, 4)
            };
            _btnCancel = new Button { Text = "Cancel", Width = 80, Height = 28 };
            _btnApply = new Button
            {
                Text = "Apply",
                Width = 80,
                Height = 28,
                BackColor = Color.FromArgb(0x2E, 0x7D, 0x32),
                ForeColor = Color.White,
                FlatStyle = FlatStyle.Flat
            };
            _btnCancel.Click += (s, e) => Close();
            _btnApply.Click += BtnApply_Click;
            buttonPanel.Controls.AddRange(new Control[] { _btnCancel, _btnApply });

            // WinForms docking order: last Added is innermost (Fill)
            Controls.Add(_grid);
            Controls.Add(filterPanel);
            Controls.Add(_summaryLabel);
            Controls.Add(buttonPanel);
        }

        private void BindGrid()
        {
            _grid.Rows.Clear();
            IEnumerable<TaskDiff> filtered = _diffs;

            if (_filterChanged.Checked)
                filtered = filtered.Where(d => d.Changes != ChangeFlags.None || d.IsNewTask);
            else if (_filterErrors.Checked)
                filtered = filtered.Where(d => d.IsBlocked);

            foreach (var d in filtered)
            {
                string status = d.IsBlocked ? "Blocked"
                    : d.IsNewTask ? "New"
                    : d.Changes != ChangeFlags.None ? "Changed"
                    : "No Change";

                var rowIdx = _grid.Rows.Add(
                    d.IsNewTask ? "(new)" : d.UniqueId.ToString(),
                    d.TaskName,
                    d.Before?.Start.ToString("yyyy-MM-dd") ?? "",
                    d.Before?.Finish.ToString("yyyy-MM-dd") ?? "",
                    d.Update.NewStart?.ToString("yyyy-MM-dd") ?? "(no change)",
                    d.Update.NewFinish?.ToString("yyyy-MM-dd") ?? "(no change)",
                    status,
                    d.Warnings.Count > 0
                        ? string.Join("; ", d.Warnings.Select(w => w.Message))
                        : ""
                );

                // Color-code rows
                if (d.IsBlocked)
                    _grid.Rows[rowIdx].DefaultCellStyle.ForeColor = Color.Red;
                else if (d.IsNewTask)
                    _grid.Rows[rowIdx].DefaultCellStyle.ForeColor = Color.DarkBlue;
                else if (d.Changes == ChangeFlags.None)
                    _grid.Rows[rowIdx].DefaultCellStyle.ForeColor = Color.Gray;
            }
        }

        private void UpdateSummary()
        {
            int changed = _diffs.Count(d => d.Changes != ChangeFlags.None || d.IsNewTask);
            int blocked = _diffs.Count(d => d.IsBlocked);
            int newTasks = _diffs.Count(d => d.IsNewTask);
            _summaryLabel.Text = string.Format(
                "{0} total  |  {1} changed  |  {2} new  |  {3} blocked",
                _diffs.Count, changed, newTasks, blocked);

            _btnApply.Enabled = changed > 0 || newTasks > 0;
        }

        private void BtnApply_Click(object sender, EventArgs e)
        {
            var applicable = _diffs.Where(d => !d.IsBlocked).ToList();
            if (applicable.Count == 0)
            {
                MessageBox.Show("No applicable changes to apply.", "Nothing to Apply",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }

            var confirm = MessageBox.Show(
                string.Format("Apply {0} changes to the active MS Project?\n\nThis is undoable via Edit > Undo.", applicable.Count),
                "Confirm Apply",
                MessageBoxButtons.YesNo, MessageBoxIcon.Question);

            if (confirm != DialogResult.Yes) return;

            try
            {
                _onApply?.Invoke(applicable);
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show("Error applying changes:\n\n" + ex.Message,
                    "Apply Failed", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }
}
