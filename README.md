# ScheduleSync — Microsoft Project Desktop VSTO Add-in

A Microsoft Project Desktop VSTO Add-in (C#) that imports schedule updates from CSV/JSON files, previews changes as a diff, and applies them directly to the active `.mpp` plan via the Project object model.

## Solution Structure

```
ScheduleSync.slnx
├── ScheduleSync.Core/          # .NET Standard 2.0 — models, parsers, validation, diff engine
│   ├── Models/                 # TaskUpdate, TaskSnapshot, TaskDiff, ApplyResult, ApplyOptions
│   ├── Interfaces/             # IUpdateSource, IProjectAdapter
│   ├── Parsers/                # CsvUpdateSource, JsonUpdateSource
│   ├── Validation/             # TaskValidator
│   ├── Diff/                   # DiffEngine
│   └── Logging/                # ApplyLogExporter
├── ScheduleSync.Tests/         # xUnit tests for Core logic
├── ScheduleSync.AddIn/         # VSTO Add-in for MS Project (.NET Framework 4.8)
│   ├── ThisAddIn.cs            # VSTO entry point
│   ├── Adapters/               # MsProjectAdapter (IProjectAdapter implementation)
│   ├── Ribbon/                 # Custom Ribbon tab XML + code-behind
│   └── UI/                     # PreviewWindow (modeless WinForms)
└── .github/
    └── copilot-instructions.md # Repo-wide Copilot instructions
```

## Workflow

1. **Import Updates** — Open a CSV or JSON file containing schedule changes.
2. **Preview Changes** — View a diff grid showing before/after values for each matched task, with validation warnings.
3. **Apply Changes** — Apply all non-blocked updates in a single undo transaction (`OpenUndoTransaction` / `CloseUndoTransaction`).
4. **Export Log** — Save an audit log (CSV/JSON) of what was applied, skipped, or failed.

## Update File Formats

### JSON (recommended)

```json
[
  {
    "uniqueId": 123,
    "newStart": "2026-03-10T06:00:00",
    "newFinish": "2026-03-12T14:00:00",
    "allowConstraintOverride": false,
    "notesAppend": "Pulled in per field request 2026-03-03"
  }
]
```

### CSV

```csv
UniqueId,NewStart,NewFinish,AllowConstraintOverride,NotesAppend
123,2026-03-10 06:00,2026-03-12 14:00,false,"Pulled in per field request 2026-03-03"
```

**Required column:** `UniqueId` or `ExternalKey` (fallback key stored in a custom field like `Text30`).

## Task Matching

1. **UniqueId** (preferred) — matches the MS Project task `UniqueID` property.
2. **ExternalKey** — matches a value stored in a configurable custom text field (default: `Text30`).

## Validation Rules

- Summary tasks are never edited (their dates derive from children).
- Constrained or manually-scheduled tasks produce a warning; set `AllowConstraintOverride = true` to override.
- Percent complete must be 0–100; duration must be non-negative.
- Finish must not precede Start.
- Re-applying the same update is idempotent (no additional drift).

## Prerequisites

| Component | Version |
|---|---|
| Visual Studio | 2022 (or later) with **Office/SharePoint development** workload |
| .NET Framework | 4.8 |
| Microsoft Project | 2016 / 2019 / 2021 / 365 (desktop) |

> **Note:** The `ScheduleSync.Core` and `ScheduleSync.Tests` projects target .NET Standard 2.0 and can be built and tested on any OS with the .NET SDK. The `ScheduleSync.AddIn` project requires Visual Studio on Windows with the VSTO tooling.

## Build & Run

### Core Library + Tests (any OS)

```bash
dotnet build ScheduleSync.Core/ScheduleSync.Core.csproj
dotnet test  ScheduleSync.Tests/ScheduleSync.Tests.csproj
```

### VSTO Add-in (Windows + Visual Studio)

1. Open `ScheduleSync.slnx` in Visual Studio 2022.
2. If the `ScheduleSync.AddIn` project was created from a template, ensure it references `ScheduleSync.Core`.
3. If starting fresh, add a new **Microsoft Project VSTO Add-in** project via *File → New → Project → "Office/SharePoint" → "Project Add-in"*, then copy the source files from `ScheduleSync.AddIn/` into the generated project.
4. Set `ScheduleSync.AddIn` as the startup project.
5. Press **F5** — Visual Studio will launch Microsoft Project with the add-in loaded.
6. Look for the **ScheduleSync** tab on the Project Ribbon.

### Debugging

- Breakpoints in `ScheduleSync.Core` will hit when the add-in calls parsing/validation/diff logic.
- Breakpoints in `ScheduleSync.AddIn` will hit for Ribbon callbacks and COM interop calls.
- If Project crashes, check the Windows Event Log for VSTO/COM errors.

## Architecture Notes

- **Core is COM-free.** All MS Project interop lives behind `IProjectAdapter`, implemented only in the AddIn project.
- **Custom task panes are not used.** MS Project does not support custom task panes; the add-in uses Ribbon buttons and a modeless WinForms window instead.
- **Single undo group.** All applied changes are wrapped in `OpenUndoTransaction` / `CloseUndoTransaction` so the user can undo the entire batch with one Ctrl+Z.
