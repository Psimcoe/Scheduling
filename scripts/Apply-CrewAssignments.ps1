<#
.SYNOPSIS
    Applies crew assignments from foreman email to the Prefab Packages schedule.

.DESCRIPTION
    Reads the Prefab Packages CSV, applies crew grouping rules derived from
    James Campbell's manpower email (2026-03-04), and:
      1. Prints a crew-grouped summary to the console.
      2. Saves an updated CSV with Crew_Assignment and Crew_Notes columns.
      3. Optionally updates the MS Project file (sets Resource Names on matching tasks).

    Matching rules use Packages_ProjectNumber_ + Packages_CategoryType_ as the
    primary key, with special handling for Mike M. (matched by description/project).

.PARAMETER CsvPath
    Path to the Prefab Packages CSV export.

.PARAMETER MppPath
    (Optional) Path to the Prefab Packages .mpp file to update resource names via COM.
    If omitted, only the CSV report is generated.

.PARAMETER OutputCsvPath
    (Optional) Where to save the updated CSV. Defaults to same folder as input CSV
    with "_CrewAssigned" suffix.

.EXAMPLE
    .\Apply-CrewAssignments.ps1 -CsvPath "C:\Users\psimcoe\Downloads\Prefab Packages.csv"

.EXAMPLE
    .\Apply-CrewAssignments.ps1 -CsvPath "C:\Users\psimcoe\Downloads\Prefab Packages.csv" `
        -MppPath "C:\Users\psimcoe\OneDrive - SullyMac\Prefab Packages.mpp"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,

    [Parameter(Mandatory = $false)]
    [string]$MppPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputCsvPath
)

# ---- Crew Assignment Rules ---------------------------------------------------
# Derived from James Campbell's email to Paul (2026-03-04)
# Each rule: ProjectNumber + CategoryType -> Crew member(s) + notes
$CrewRules = @(
    @{
        Crew        = "Eric Hopkins"
        Project     = "320001TUR"
        Category    = "DE"
        Notes       = "Load centers level 23 need a guy to keep up"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Dan/Jon Fagan"
        Project     = "320001TUR"
        Category    = "IW"
        Notes       = "Unit inwalls"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Glenn/Ali"
        Project     = "680122SCC"
        Category    = "LGT"
        Notes       = "Lighting control (leave Ali alone)"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Glenn"
        Project     = "680122SCC"
        Category    = "DE"
        Notes       = "15-20 panels when ready (peeled from LGT)"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Rosenberg"
        Project     = "320001TUR"
        Category    = "LGT"
        Notes       = "Kind of floating; lighting control for 121 Broadway; Gauvin wants more fast"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Thuan Le/Nolan"
        Project     = "680122SCC"
        Category    = "IW"
        Notes       = "Bdonegan inwall; need to do two more floors"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Mike M."
        Project     = "200020TUR"
        Category    = "BRS"
        Notes       = "Wiremold level 10 fitout"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Mike M."
        Project     = "120048TUR"
        Category    = "BRS"
        Notes       = "IDF plates - due this week, HOT"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Owen G"
        Project     = "10CAMPCN"
        Category    = $null
        Notes       = "Canton Fixtures"
        MatchType   = "ProjectOnly"
    },
    @{
        Crew        = "Josh"
        Project     = "200019SKA"
        Category    = "LGT"
        Notes       = "Lighting control for Simmons; cannot stop"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Zack"
        Project     = "120048TUR"
        Category    = "CND"
        Notes       = "Pipe spools for MGH; stays on pipe"
        MatchType   = "ProjectCategory"
    },
    @{
        Crew        = "Shubert/Noah"
        Project     = "320001TUR"
        Category    = "CND"
        Notes       = "Penthouse pipe"
        MatchType   = "ProjectCategory"
    }
)

# ---- Helper: Match a CSV row to a crew rule ---------------------------------
function Get-CrewForTask {
    param(
        [Parameter(Mandatory)] $Row,
        [Parameter(Mandatory)] $Rules
    )
    $proj = $Row.Packages_ProjectNumber_
    $cat  = $Row.Packages_CategoryType_

    foreach ($rule in $Rules) {
        if ($rule.MatchType -eq "ProjectCategory") {
            if ($proj -eq $rule.Project -and $cat -eq $rule.Category) {
                return $rule
            }
        }
        elseif ($rule.MatchType -eq "ProjectOnly") {
            if ($proj -eq $rule.Project) {
                return $rule
            }
        }
    }
    return $null
}

$separator = ("=" * 61)
$thinSep   = ("-" * 61)

# ---- Validate input ----------------------------------------------------------
if (-not (Test-Path $CsvPath)) {
    Write-Error "CSV file not found: $CsvPath"
    exit 1
}

if (-not $OutputCsvPath) {
    $dir  = Split-Path $CsvPath -Parent
    $base = [System.IO.Path]::GetFileNameWithoutExtension($CsvPath)
    $OutputCsvPath = Join-Path $dir "${base}_CrewAssigned.csv"
}

# ---- Read CSV ----------------------------------------------------------------
Write-Host ""
Write-Host $separator -ForegroundColor Cyan
Write-Host " Prefab Packages -- Crew Assignment" -ForegroundColor Cyan
Write-Host $separator -ForegroundColor Cyan
Write-Host "Source: $CsvPath" -ForegroundColor Gray
$rows = Import-Csv $CsvPath
Write-Host "Tasks loaded: $($rows.Count)" -ForegroundColor Green
Write-Host ""

# ---- Apply crew assignments --------------------------------------------------
$assigned   = @()
$unassigned = @()

foreach ($row in $rows) {
    $match = Get-CrewForTask -Row $row -Rules $CrewRules
    if ($match) {
        $row | Add-Member -NotePropertyName "Crew_Assignment" -NotePropertyValue $match.Crew -Force
        $row | Add-Member -NotePropertyName "Crew_Notes"      -NotePropertyValue $match.Notes -Force
        $assigned += $row
    }
    else {
        $row | Add-Member -NotePropertyName "Crew_Assignment" -NotePropertyValue "" -Force
        $row | Add-Member -NotePropertyName "Crew_Notes"      -NotePropertyValue "" -Force
        $unassigned += $row
    }
}

# ---- Console Report: Grouped by Crew ----------------------------------------
Write-Host $separator -ForegroundColor DarkGray
Write-Host " CREW ASSIGNMENTS (matched to prefab schedule)" -ForegroundColor Yellow
Write-Host $separator -ForegroundColor DarkGray

$crewGroups = $assigned | Group-Object Crew_Assignment | Sort-Object Name
foreach ($group in $crewGroups) {
    Write-Host ""
    Write-Host "  $($group.Name)  ($($group.Count) tasks)" -ForegroundColor Cyan
    $note = ($group.Group | Select-Object -First 1).Crew_Notes
    Write-Host "  Notes: $note" -ForegroundColor DarkGray

    # Sub-group by project + category for readability
    $subGroups = $group.Group | Group-Object { "$($_.Packages_ProjectNumber_) / $($_.Packages_CategoryType_)" }
    foreach ($sg in $subGroups) {
        Write-Host "    [$($sg.Name)]" -ForegroundColor White
        foreach ($task in ($sg.Group | Sort-Object { $_.Start_Date })) {
            $status = $task.Packages_Status__
            $color  = switch -Wildcard ($status) {
                "Fabrication Complete" { "Green" }
                "Issued for Fabrication" { "Yellow" }
                "Ready for Fab*" { "DarkYellow" }
                "Hold" { "Red" }
                default { "Gray" }
            }
            Write-Host "      ID $($task.ID): $($task.Task_Name)" -ForegroundColor $color -NoNewline
            Write-Host "  |  $($task.Start_Date) -> $($task.Finish_Date)  |  $status" -ForegroundColor DarkGray
        }
    }
}

# ---- Unassigned tasks --------------------------------------------------------
if ($unassigned.Count -gt 0) {
    Write-Host ""
    Write-Host $separator -ForegroundColor DarkGray
    $msg = " UNASSIGNED TASKS ({0} tasks - no crew match in email)" -f $unassigned.Count
    Write-Host $msg -ForegroundColor Red
    Write-Host $separator -ForegroundColor DarkGray

    $unGroups = $unassigned | Group-Object { "$($_.Packages_ProjectNumber_) / $($_.Packages_CategoryType_)" } | Sort-Object Name
    foreach ($ug in $unGroups) {
        Write-Host ""
        Write-Host "    [$($ug.Name)] - $($ug.Count) tasks" -ForegroundColor DarkYellow
        foreach ($task in ($ug.Group | Sort-Object { $_.Start_Date })) {
            Write-Host "      ID $($task.ID): $($task.Task_Name)" -ForegroundColor Gray -NoNewline
            Write-Host "  |  $($task.Start_Date) -> $($task.Finish_Date)" -ForegroundColor DarkGray
        }
    }
}

# ---- Crew members with NO matching prefab tasks -----------------------------
$matchedCrews   = $crewGroups | ForEach-Object { $_.Name }
$allCrewNames   = $CrewRules | ForEach-Object { $_.Crew } | Sort-Object -Unique
$unmatchedCrews = $allCrewNames | Where-Object { $_ -notin $matchedCrews }

if ($unmatchedCrews.Count -gt 0) {
    Write-Host ""
    Write-Host $separator -ForegroundColor DarkGray
    Write-Host " CREW WITH NO PREFAB TASKS (work not in this schedule)" -ForegroundColor Magenta
    Write-Host $separator -ForegroundColor DarkGray
    foreach ($c in $unmatchedCrews) {
        $rules = $CrewRules | Where-Object { $_.Crew -eq $c }
        foreach ($r in $rules) {
            $catDisplay = if ($r.Category) { $r.Category } else { "(any)" }
            Write-Host "    $c  ->  $($r.Project) / $catDisplay  -  $($r.Notes)" -ForegroundColor Magenta
        }
    }
}

# ---- Save updated CSV -------------------------------------------------------
Write-Host ""
Write-Host $thinSep -ForegroundColor DarkGray
$allRows = $assigned + $unassigned | Sort-Object { [int]$_.ID }
$allRows | Export-Csv -Path $OutputCsvPath -NoTypeInformation -Encoding UTF8
Write-Host "Saved: $OutputCsvPath" -ForegroundColor Green
Write-Host "  $($assigned.Count) tasks assigned, $($unassigned.Count) unassigned" -ForegroundColor Gray
Write-Host ""

# ---- Optional: Update MS Project file ----------------------------------------
if ($MppPath) {
    if (-not (Test-Path $MppPath)) {
        Write-Warning "MPP file not found: $MppPath -- skipping MS Project update."
    }
    else {
        Write-Host $separator -ForegroundColor DarkGray
        Write-Host " UPDATING MS PROJECT: $MppPath" -ForegroundColor Yellow
        Write-Host $separator -ForegroundColor DarkGray

        $msProject = New-Object -ComObject MSProject.Application
        $msProject.Visible = $true
        $msProject.DisplayAlerts = $false
        Start-Sleep -Seconds 2

        $msProject.FileOpen($MppPath)
        Start-Sleep -Seconds 3

        $project = $msProject.ActiveProject
        if (-not $project) {
            Write-Error "Could not access the active project after opening $MppPath"
            exit 1
        }

        Write-Host "  Opened: $($project.Name)" -ForegroundColor Green

        # Build a lookup: Task Name -> Crew
        $crewLookup = @{}
        foreach ($row in ($allRows | Where-Object { $_.Crew_Assignment })) {
            $crewLookup[$row.Task_Name] = $row.Crew_Assignment
        }

        $updated = 0
        $skipped = 0

        # Use OpenUndoTransaction for safe batch update
        $msProject.OpenUndoTransaction("Apply Crew Assignments")

        foreach ($t in $project.Tasks) {
            if (-not $t) { continue }
            $crew = $crewLookup[$t.Name]
            if ($crew) {
                try {
                    $t.ResourceNames = $crew
                    $updated++
                    Write-Host "    [OK] $($t.Name) -> $crew" -ForegroundColor Green
                }
                catch {
                    $skipped++
                    Write-Host "    [SKIP] $($t.Name): $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
        }

        $msProject.CloseUndoTransaction()

        Write-Host ""
        Write-Host "  Updated: $updated tasks, Skipped: $skipped" -ForegroundColor Cyan
        Write-Host "  Changes are undoable via Edit > Undo" -ForegroundColor DarkGray

        # Save
        $msProject.FileSave()
        Write-Host "  Saved: $MppPath" -ForegroundColor Green
        Write-Host ""
    }
}

Write-Host "Done." -ForegroundColor Cyan
Write-Host ""
