# Project: ScheduleSync (Microsoft Project Desktop-first)

## Goal
Create a Microsoft Project Desktop VSTO Add-in that imports schedule updates (CSV/JSON) and applies them directly to the active .mpp plan.

## Tech constraints
- Use C# VSTO Add-in for Microsoft Project (in-process).
- Target .NET Framework 4.8 (or the framework used by the VSTO template).
- Do NOT use .NET 5+/Core in-process. (A separate optional service/CLI may use modern .NET.)
- UI: Ribbon buttons + modeless WPF/WinForms window for preview/settings.
- Avoid custom task panes (not supported for MS Project).

## Functional requirements
- Import updates from CSV and JSON.
- Match tasks using: Task.UniqueID preferred; fallback to a configured custom key field (e.g., Text30).
- Preview a diff list (before/after) and validation warnings.
- Apply changes in a single undo transaction (OpenUndoTransaction/CloseUndoTransaction).
- Write an audit log (CSV/JSON) of applied updates and failures.
- Never silently change logic links; only change links if explicitly requested in the update file.

## Validation rules
- Do not edit summary tasks.
- If task has constraints or is manual-scheduled, warn and require explicit override.
- If update would move a task earlier/later than constraints allow, warn and skip unless override is set.
- All changes must be idempotent: re-applying the same update should produce no additional drift.

## Code quality
- Separate core parsing/validation logic into a testable library with unit tests.
- Keep MS Project interop calls behind an adapter interface.
- Strong error handling; never crash Project; show user-friendly errors.
