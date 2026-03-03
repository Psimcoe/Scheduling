// Requires: System.Windows.Forms (part of .NET Framework)
// This file shows the intended implementation for the Preview/Apply window.
// It uses WinForms because WinForms is universally available in .NET Framework
// and does not require additional WPF assemblies.

// using System.Windows.Forms;
// using System.Drawing;

namespace ScheduleSync.AddIn.UI
{
    /// <summary>
    /// Modeless window that shows a diff grid (before/after) for previewing
    /// schedule updates before applying them to the active MS Project plan.
    /// </summary>
    /// <remarks>
    /// Custom task panes are not supported for MS Project VSTO add-ins.
    /// This modeless window is shown with TopMost = true so it stays above Project.
    ///
    /// Layout:
    /// ┌─────────────────────────────────────────────────────┐
    /// │ [Filter: ○ All  ○ Changed Only  ○ Errors Only]      │
    /// ├─────┬──────┬────────────┬────────────┬──────────────┤
    /// │ UID │ Name │ Before     │ After      │ Warnings     │
    /// │     │      │ Start/Fin  │ Start/Fin  │              │
    /// ├─────┼──────┼────────────┼────────────┼──────────────┤
    /// │ 123 │ T-1  │ 03/01-03/05│ 03/10-03/12│              │
    /// │ 456 │ T-2  │ 03/02-03/06│ (no change)│ Constrained  │
    /// └─────┴──────┴────────────┴────────────┴──────────────┘
    /// │                         [ Apply ]  [ Cancel ]        │
    /// └─────────────────────────────────────────────────────┘
    ///
    /// This window is displayed as modeless (Show, not ShowDialog) so the user
    /// can still interact with Microsoft Project while reviewing changes.
    /// </remarks>
    public partial class PreviewWindow // : Form
    {
        // Fields:
        // private DataGridView _grid;
        // private RadioButton _filterAll, _filterChanged, _filterErrors;
        // private Button _btnApply, _btnCancel;
        // private List<TaskDiff> _diffs;
        // private Action<List<TaskDiff>> _onApply;

        // public PreviewWindow(List<TaskDiff> diffs, Action<List<TaskDiff>> onApply)
        // {
        //     _diffs = diffs;
        //     _onApply = onApply;
        //     InitializeComponent();
        //     BindGrid();
        // }

        // private void InitializeComponent()
        // {
        //     Text = "ScheduleSync – Preview Changes";
        //     Size = new Size(900, 500);
        //     TopMost = true;           // Stay above Project window
        //     StartPosition = FormStartPosition.CenterScreen;
        //
        //     // Grid
        //     _grid = new DataGridView
        //     {
        //         Dock = DockStyle.Fill,
        //         ReadOnly = true,
        //         AllowUserToAddRows = false,
        //         AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill
        //     };
        //
        //     _grid.Columns.Add("UniqueId", "UID");
        //     _grid.Columns.Add("Name", "Name");
        //     _grid.Columns.Add("BeforeStart", "Before Start");
        //     _grid.Columns.Add("BeforeFinish", "Before Finish");
        //     _grid.Columns.Add("AfterStart", "After Start");
        //     _grid.Columns.Add("AfterFinish", "After Finish");
        //     _grid.Columns.Add("Warnings", "Warnings");
        //
        //     // Filter radio buttons
        //     var filterPanel = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 30 };
        //     _filterAll = new RadioButton { Text = "All", Checked = true };
        //     _filterChanged = new RadioButton { Text = "Changed Only" };
        //     _filterErrors = new RadioButton { Text = "Errors Only" };
        //     _filterAll.CheckedChanged += (s, e) => BindGrid();
        //     _filterChanged.CheckedChanged += (s, e) => BindGrid();
        //     _filterErrors.CheckedChanged += (s, e) => BindGrid();
        //     filterPanel.Controls.AddRange(new Control[] { _filterAll, _filterChanged, _filterErrors });
        //
        //     // Buttons
        //     var buttonPanel = new FlowLayoutPanel
        //     {
        //         Dock = DockStyle.Bottom,
        //         Height = 40,
        //         FlowDirection = FlowDirection.RightToLeft
        //     };
        //     _btnCancel = new Button { Text = "Cancel", Width = 80 };
        //     _btnApply = new Button { Text = "Apply", Width = 80 };
        //     _btnCancel.Click += (s, e) => Close();
        //     _btnApply.Click += (s, e) =>
        //     {
        //         _onApply?.Invoke(_diffs);
        //         Close();
        //     };
        //     buttonPanel.Controls.AddRange(new Control[] { _btnCancel, _btnApply });
        //
        //     Controls.Add(_grid);
        //     Controls.Add(filterPanel);
        //     Controls.Add(buttonPanel);
        // }

        // private void BindGrid()
        // {
        //     _grid.Rows.Clear();
        //     var filtered = _diffs.AsEnumerable();
        //
        //     if (_filterChanged != null && _filterChanged.Checked)
        //         filtered = filtered.Where(d => d.Changes != ChangeFlags.None);
        //     else if (_filterErrors != null && _filterErrors.Checked)
        //         filtered = filtered.Where(d => d.IsBlocked);
        //
        //     foreach (var d in filtered)
        //     {
        //         _grid.Rows.Add(
        //             d.UniqueId,
        //             d.TaskName,
        //             d.Before?.Start.ToString("yyyy-MM-dd"),
        //             d.Before?.Finish.ToString("yyyy-MM-dd"),
        //             d.Update.NewStart?.ToString("yyyy-MM-dd") ?? "(no change)",
        //             d.Update.NewFinish?.ToString("yyyy-MM-dd") ?? "(no change)",
        //             string.Join("; ", d.Warnings.Select(w => w.Message))
        //         );
        //     }
        // }
    }
}
