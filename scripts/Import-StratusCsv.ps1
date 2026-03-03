<#
.SYNOPSIS
    Imports a STRATUS Packages Dashboard CSV into a new Microsoft Project file.

.DESCRIPTION
    Opens MS Project via COM, creates a new plan, builds hierarchy
    (Project Number → Location → work tasks), and populates:
      - Task Name, Start, Finish, Duration, Deadline, % Complete, Text30 (external key)

    Hierarchy:
      Level 1 summary: Project Number (e.g. "320001TUR")
      Level 2 summary: Location       (e.g. "LEVEL 37")
      Level 3 tasks:   Individual fabrication packages

.PARAMETER CsvPath
    Path to the STRATUS CSV export file.

.PARAMETER OutputPath
    (Optional) Where to save the .mpp file. Defaults to same folder as CSV.

.EXAMPLE
    .\Import-StratusCsv.ps1 -CsvPath "C:\Users\psimcoe\Downloads\Packages Dashboard (17).csv"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$CsvPath,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath
)

# ── Status → % Complete mapping ──────────────────────────────────────────────
$StatusMap = @{
    "New Item"                               = 0
    "Design Stage"                           = 5
    "Design Stage-Prefab Early Planning"     = 10
    "CLASH"                                  = 5
    "BIM/VDC Released to Prefab"             = 20
    "Prefab Confirmed Received From BIM/VDC" = 25
    "Spool QA/QC Complete-Ready for Assembly" = 30
    "Assembly (Spool) Confirmed"             = 35
    "Packages (FAB) Confirmed"               = 40
    "Package-BOM Generated"                  = 45
    "Package-BOM Released for Purchasing"    = 50
    "Package-BOM Purchased"                  = 55
    "Package-BOM Received w/ Back Orders"    = 60
    "Assembly-BOM Received"                  = 65
    "Package-BOM Received No Backorders"     = 70
    "Ready for Fab Release to Shop"          = 75
    "Issued for Fabrication"                 = 80
    "Fabrication in Progress"                = 85
    "Fabrication Complete"                   = 90
    "QA QC Inspection"                       = 95
    "Packaged for Shipment"                  = 96
    "Waiting to Ship"                        = 99
    "Shipped to Jobsite"                     = 100
    "Received on Jobsite"                    = 100
    "Issued for Installation"                = 100
    "Installed"                              = 100
    "Wire Pulled"                            = 100
    "Trim and Terminations Complete"         = 100
    "Hold"                                   = 100
    "Point List Ready"                       = 100
    "FAB CANCELLED"                          = 100
    "NO PREFAB (FIELD INSTALL)"              = 100
}

# ── Validate input ───────────────────────────────────────────────────────────
if (-not (Test-Path $CsvPath)) {
    Write-Error "CSV file not found: $CsvPath"
    exit 1
}

if (-not $OutputPath) {
    $dir = Split-Path $CsvPath -Parent
    $OutputPath = Join-Path $dir "STRATUS_Import_$(Get-Date -Format 'yyyyMMdd_HHmmss').mpp"
}

# ── Read CSV ─────────────────────────────────────────────────────────────────
Write-Host "Reading CSV: $CsvPath" -ForegroundColor Cyan
$rows = Import-Csv $CsvPath
Write-Host "  Found $($rows.Count) rows" -ForegroundColor Green

# ── Group by Project Number → Location ───────────────────────────────────────
$grouped = $rows | Group-Object { 
    $pn = $_."Project Number Override"
    if (-not $pn) { $pn = $_."Project Number" }
    if (-not $pn) { $pn = "(No Project)" }
    $pn
} | Sort-Object Name

Write-Host "  Projects: $($grouped.Count)" -ForegroundColor Green
foreach ($pg in $grouped) {
    $locCount = ($pg.Group | Group-Object "Location").Count
    Write-Host "    $($pg.Name): $($pg.Count) packages across $locCount locations" -ForegroundColor Gray
}

# ── Launch Microsoft Project ─────────────────────────────────────────────────
Write-Host "`nStarting Microsoft Project..." -ForegroundColor Cyan

# Always create a fresh COM instance (don't attach to running)
$msProject = New-Object -ComObject MSProject.Application
$msProject.Visible = $true
$msProject.DisplayAlerts = $false   # Suppress dialogs that could block COM
Write-Host "  Launched MS Project" -ForegroundColor Green

# Wait for the app to fully initialize
Start-Sleep -Seconds 3

# Create a new blank project (SummaryInfo param = false to skip dialog)
$msProject.FileNew()
Start-Sleep -Seconds 2

# Access the active project via the Projects collection (most reliable via COM)
$project = $msProject.ActiveProject
if (-not $project) {
    # Fallback: pick the last project in the collection
    $count = $msProject.Projects.Count
    if ($count -gt 0) {
        $project = $msProject.Projects.Item($count)
    }
}

if (-not $project) {
    Write-Error "Failed to access the active MS Project file. Please open MS Project with a blank project and try again."
    exit 1
}

Write-Host "  Active project: $($project.Name)" -ForegroundColor Green

# Set project properties (wrapped in try/catch for COM quirks)
try { $project.Title = "STRATUS Fabrication Import - $(Get-Date -Format 'yyyy-MM-dd')" } catch {}

# ── PjField constants for Text30 ─────────────────────────────────────────────
# pjTaskText30 = 188744009
$pjTaskText30 = 188744009

# ── Helper: Parse date safely ────────────────────────────────────────────────
function Parse-Date([string]$dateStr) {
    if (-not $dateStr -or $dateStr.Trim() -eq "") { return $null }
    $d = [DateTime]::MinValue
    $formats = @("M/d/yyyy", "MM/dd/yyyy", "M/d/yyyy h:mm tt", "MM/dd/yyyy hh:mm tt")
    foreach ($fmt in $formats) {
        if ([DateTime]::TryParseExact($dateStr.Trim(), $fmt, 
            [System.Globalization.CultureInfo]::InvariantCulture, 
            [System.Globalization.DateTimeStyles]::None, [ref]$d)) {
            return $d
        }
    }
    # Fallback to general parse
    if ([DateTime]::TryParse($dateStr.Trim(), [ref]$d)) { return $d }
    return $null
}

# ── Begin undo transaction ───────────────────────────────────────────────────
$msProject.OpenUndoTransaction("STRATUS CSV Import")

$taskIndex = 0
$createdCount = 0
$errorCount = 0
$summaryIds = @{}  # Cache: "ProjectNum" → task ID, "ProjectNum|Location" → task ID

try {
    foreach ($projectGroup in $grouped) {
        $projectNumber = $projectGroup.Name
        
        # ── Create Project-level summary task ────────────────────────────────
        $taskIndex++
        $projSummary = $project.Tasks.Add($projectNumber)
        $projSummary.Manual = $false
        $projSummary.OutlineLevel = 1
        $summaryIds[$projectNumber] = $projSummary.UniqueID
        Write-Host "`n[$projectNumber] Creating project summary (task $taskIndex)..." -ForegroundColor Yellow

        # Group locations within this project
        $locationGroups = $projectGroup.Group | Group-Object "Location" | Sort-Object Name

        foreach ($locationGroup in $locationGroups) {
            $location = $locationGroup.Name
            if (-not $location) { $location = "(No Location)" }

            # ── Create Location-level summary task ───────────────────────────
            $taskIndex++
            $locSummary = $project.Tasks.Add($location)
            $locSummary.Manual = $false
            $locSummary.OutlineLevel = 2
            $cacheKey = "$projectNumber|$location"
            $summaryIds[$cacheKey] = $locSummary.UniqueID
            Write-Host "  [$location] $($locationGroup.Count) packages" -ForegroundColor DarkYellow

            # ── Create work tasks ────────────────────────────────────────────
            foreach ($row in $locationGroup.Group) {
                $taskIndex++
                try {
                    $taskName = $row.Name
                    if (-not $taskName) { $taskName = "Package-$($row.Number)" }

                    $task = $project.Tasks.Add($taskName)
                    $task.Manual = $false
                    $task.OutlineLevel = 3

                    # Composite external key: ProjectNumber-PackageNumber
                    $pkgNum = $row.Number
                    $externalKey = if ($projectNumber -and $projectNumber -ne "(No Project)") {
                        "$projectNumber-$pkgNum"
                    } else {
                        $pkgNum
                    }

                    # Set Text30 (external key for re-sync)
                    $task.SetField($pjTaskText30, $externalKey)

                    # FIELD ORDER: Duration → Start → Finish
                    # Project auto-calculates Finish from Start + Duration.
                    # Setting Duration first avoids it overriding an explicit Finish.

                    # Duration from Work Days (set BEFORE Start/Finish)
                    $workDaysStr = $row."Work Days (Reference)"
                    if ($workDaysStr -and $workDaysStr.Trim() -ne "") {
                        $workDays = 0
                        if ([double]::TryParse($workDaysStr.Trim(), [ref]$workDays) -and $workDays -gt 0) {
                            $task.Duration = [int]($workDays * 480)  # minutes (8hr day)
                        }
                    }

                    # Start date
                    $startDate = Parse-Date $row."Prefab Build Start Date"
                    if ($startDate) { $task.Start = $startDate }

                    # Finish date (overrides auto-calculated value if present)
                    $finishDate = Parse-Date $row."Prefab Build Finish Date"
                    if ($finishDate) { $task.Finish = $finishDate }

                    # Deadline (Required date)
                    $deadlineDate = Parse-Date $row.Required
                    if ($deadlineDate) { 
                        $task.Deadline = $deadlineDate 
                    }

                    # % Complete from Status
                    $status = $row.Status
                    if ($status -and $StatusMap.ContainsKey($status)) {
                        $task.PercentComplete = $StatusMap[$status]
                    }

                    # Notes (Description + Notes)
                    $notesParts = @()
                    if ($row.Description) { $notesParts += "Description: $($row.Description)" }
                    if ($row.Notes) { $notesParts += $row.Notes }
                    if ($row."Cost Code Category") { $notesParts += "Category: $($row.'Cost Code Category')" }
                    if ($row."Category Type") { $notesParts += "Type: $($row.'Category Type')" }
                    if ($notesParts.Count -gt 0) {
                        $task.Notes = $notesParts -join "`n"
                    }

                    $createdCount++
                } catch {
                    $errorCount++
                    Write-Warning "  Error on row $taskIndex ($($row.Name)): $_"
                }
            }
        }
    }
} finally {
    $msProject.CloseUndoTransaction()
}

# ── Save the file ────────────────────────────────────────────────────────────
Write-Host "`nSaving to: $OutputPath" -ForegroundColor Cyan
try {
    # pjMPP = 0 for .mpp format
    $project.SaveAs($OutputPath, 0)
    Write-Host "  Saved successfully" -ForegroundColor Green
} catch {
    Write-Warning "  SaveAs failed: $_"
    Write-Host "  You can save manually via File → Save As" -ForegroundColor Yellow
}

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host "`n════════════════════════════════════════" -ForegroundColor Green
Write-Host "  Import Complete!" -ForegroundColor Green
Write-Host "  Tasks created: $createdCount" -ForegroundColor Green
Write-Host "  Errors:        $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "  Saved to:      $OutputPath" -ForegroundColor Green
Write-Host "════════════════════════════════════════" -ForegroundColor Green
Write-Host "`nYou can Ctrl+Z in MS Project to undo the entire import." -ForegroundColor Gray
