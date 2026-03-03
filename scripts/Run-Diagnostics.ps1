<#
.SYNOPSIS
    Full diagnostic validation of STRATUS CSV to MS Project import.
    Uses COM directly - no XML export needed.
#>
param(
    [string]$CsvPath = "C:\Users\psimcoe\Downloads\Packages Dashboard (17).csv",
    [string]$ReportPath = "C:\Users\psimcoe\Downloads\diag_report.txt"
)

$ErrorActionPreference = "Continue"
$out = [System.Collections.ArrayList]::new()
function Log($msg, $color) { 
    $null = $out.Add($msg)
    if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg }
}

$StatusMap = @{
    "New Item" = 0; "Design Stage" = 5; "Design Stage-Prefab Early Planning" = 10
    "CLASH" = 5; "BIM/VDC Released to Prefab" = 20
    "Prefab Confirmed Received From BIM/VDC" = 25
    "Spool QA/QC Complete-Ready for Assembly" = 30; "Assembly (Spool) Confirmed" = 35
    "Packages (FAB) Confirmed" = 40; "Package-BOM Generated" = 45
    "Package-BOM Released for Purchasing" = 50; "Package-BOM Purchased" = 55
    "Package-BOM Received w/ Back Orders" = 60; "Assembly-BOM Received" = 65
    "Package-BOM Received No Backorders" = 70; "Ready for Fab Release to Shop" = 75
    "Issued for Fabrication" = 80; "Fabrication in Progress" = 85
    "Fabrication Complete" = 90; "QA QC Inspection" = 95
    "Packaged for Shipment" = 96; "Waiting to Ship" = 99
    "Shipped to Jobsite" = 100; "Received on Jobsite" = 100
    "Issued for Installation" = 100; "Installed" = 100; "Wire Pulled" = 100
    "Trim and Terminations Complete" = 100; "Hold" = 100; "Point List Ready" = 100
    "FAB CANCELLED" = 100; "NO PREFAB (FIELD INSTALL)" = 100
}
$pjTaskText30 = 188744009

Log "Connecting to MS Project..." "Cyan"
$msProject = [System.Runtime.InteropServices.Marshal]::GetActiveObject("MSProject.Application")
$proj = $msProject.ActiveProject
Log "  Project: $($proj.Name), Tasks: $($proj.Tasks.Count)" "Green"

Log "Reading all task data via COM..." "Cyan"
$mppData = [System.Collections.ArrayList]::new()
$tc = $proj.Tasks.Count
for ($i = 1; $i -le $tc; $i++) {
    $t = $proj.Tasks.Item($i)
    if (-not $t) { continue }
    $text30 = ""; try { $text30 = $t.GetField($pjTaskText30) } catch {}
    $deadline = $null; try { $dl = $t.Deadline; if ($dl.Year -gt 2000 -and $dl.Year -lt 2100) { $deadline = $dl } } catch {}
    $notes = ""; try { $notes = $t.Notes } catch {}
    $startDt = $null; try { $startDt = $t.Start } catch {}
    $finishDt = $null; try { $finishDt = $t.Finish } catch {}
    $dur = 0; try { $dur = $t.Duration } catch {}
    $null = $mppData.Add([PSCustomObject]@{
        ID=$t.ID; Name=$t.Name; Level=$t.OutlineLevel; Summary=$t.Summary
        Pct=$t.PercentComplete; Text30=$text30; Start=$startDt; Finish=$finishDt
        Duration=$dur; Deadline=$deadline; Notes=$notes; Manual=$t.Manual
    })
    if ($i % 100 -eq 0) { Write-Host "  ...$i/$tc" -ForegroundColor Gray }
}
Log "  Loaded $($mppData.Count) tasks" "Green"

$csvRows = Import-Csv $CsvPath
Log "  CSV: $($csvRows.Count) rows" "Green"

$errors = [System.Collections.ArrayList]::new()
$warnings = [System.Collections.ArrayList]::new()
$pass = 0

# ═══ DIAGNOSTIC 1: STRUCTURE ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 1: STRUCTURE & NESTING" "Cyan"
Log "================================================================" "Cyan"

$lvl1 = @($mppData | Where-Object { $_.Level -eq 1 })
$lvl2 = @($mppData | Where-Object { $_.Level -eq 2 })
$lvl3 = @($mppData | Where-Object { $_.Level -eq 3 })
$lvl4p = @($mppData | Where-Object { $_.Level -gt 3 })

foreach ($check in @(
    @{Label="Level 1 (Projects)"; Actual=$lvl1.Count; Expected=9},
    @{Label="Level 2 (Locations)"; Actual=$lvl2.Count; Expected=90},
    @{Label="Level 3 (Tasks)"; Actual=$lvl3.Count; Expected=300},
    @{Label="Level 4+ (Stray)"; Actual=$lvl4p.Count; Expected=0}
)) {
    $ok = $check.Actual -eq $check.Expected
    $tag = if ($ok) { $pass++; "[PASS]" } else { $null = $errors.Add("$($check.Label): $($check.Actual) != $($check.Expected)"); "[FAIL]" }
    Log "  $($check.Label): $($check.Actual)  $tag" $(if ($ok) {"Green"} else {"Red"})
}
Log "  Total: $($mppData.Count)" $null

Log "`n  Level 1 projects:" $null
$lvl1 | ForEach-Object { Log "    ID=$($_.ID) $($_.Name) Summary=$($_.Summary)" $null }

$nestErr = 0; $prevLvl = 0
foreach ($t in $mppData | Sort-Object ID) {
    if ($t.Level -gt $prevLvl + 1) { $nestErr++ }
    $prevLvl = $t.Level
}
$ok = $nestErr -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { $null = $errors.Add("$nestErr nesting jumps"); "[FAIL]" }
Log "  Nesting continuity: $nestErr errors  $tag" $(if ($ok) {"Green"} else {"Red"})

# ═══ DIAGNOSTIC 2: COUNTS PER PROJECT ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 2: TASK COUNTS PER PROJECT vs CSV" "Cyan"
Log "================================================================" "Cyan"

$csvGroups = $csvRows | Group-Object { $pn=$_."Project Number Override"; if(-not $pn){$pn=$_."Project Number"}; if(-not $pn){"(No Project)"}; $pn }
$curProj = ""; $mppPC = @{}
foreach ($t in $mppData | Sort-Object ID) {
    if ($t.Level -eq 1) { $curProj = $t.Name }
    if ($t.Level -eq 3) { if ($mppPC.ContainsKey($curProj)) { $mppPC[$curProj]++ } else { $mppPC[$curProj] = 1 } }
}
$cf = 0
foreach ($g in $csvGroups | Sort-Object Name) {
    $mc = if ($mppPC.ContainsKey($g.Name)) { $mppPC[$g.Name] } else { 0 }
    $ok = $g.Count -eq $mc; if (-not $ok) { $cf++ }
    Log "  $($g.Name): CSV=$($g.Count) MPP=$mc $(if($ok){'[PASS]'}else{'[FAIL]'})" $(if ($ok) {"Green"} else {"Red"})
}
if ($cf -eq 0) { $pass++ } else { $null = $errors.Add("$cf project count mismatches") }

# ═══ DIAGNOSTIC 3: TEXT30 KEYS ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 3: TEXT30 COMPOSITE KEYS" "Cyan"
Log "================================================================" "Cyan"

$keyed = @($lvl3 | Where-Object { $_.Text30 -and $_.Text30.Trim() -ne "" })
$ok = $keyed.Count -eq $lvl3.Count
$tag = if ($ok) { $pass++; "[PASS]" } else { $null = $warnings.Add("$($keyed.Count)/$($lvl3.Count) have Text30"); "[WARN]" }
Log "  Tasks with Text30: $($keyed.Count)/$($lvl3.Count)  $tag" $(if ($ok) {"Green"} else {"Yellow"})

$vf = @($keyed | Where-Object { $_.Text30 -match "^.+-.+$" })
$ok = $vf.Count -eq $keyed.Count
$tag = if ($ok) { $pass++; "[PASS]" } else { "[WARN]" }
Log "  Valid format: $($vf.Count)/$($keyed.Count)  $tag" $(if ($ok) {"Green"} else {"Yellow"})

$dups = @($keyed | Group-Object Text30 | Where-Object { $_.Count -gt 1 })
$ok = $dups.Count -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { $null = $warnings.Add("$($dups.Count) dup keys"); "[WARN]" }
Log "  Duplicate keys: $($dups.Count)  $tag" $(if ($ok) {"Green"} else {"Yellow"})

$csvKeys = @{}
foreach ($row in $csvRows) { $pn=$row."Project Number Override"; if(-not $pn){$pn=$row."Project Number"}; $csvKeys["$pn-$($row.Number)"]=$true }
$mppKS = @{}; $keyed | ForEach-Object { $mppKS[$_.Text30] = $true }
$missing = @($csvKeys.Keys | Where-Object { -not $mppKS.ContainsKey($_) })
$ok = $missing.Count -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { $null = $errors.Add("$($missing.Count) CSV keys missing"); "[FAIL]" }
Log "  CSV keys missing in MPP: $($missing.Count)  $tag" $(if ($ok) {"Green"} else {"Red"})
$missing | Select-Object -First 5 | ForEach-Object { Log "    Missing: $_" "Red" }

# ═══ DIAGNOSTIC 4: % COMPLETE ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 4: % COMPLETE / STATUS MAPPING" "Cyan"
Log "================================================================" "Cyan"

$csvKP = @{}
foreach ($row in $csvRows) {
    $pn=$row."Project Number Override"; if(-not $pn){$pn=$row."Project Number"}
    $st=$row.Status; if($st -and $StatusMap.ContainsKey($st)){$csvKP["$pn-$($row.Number)"]=$StatusMap[$st]}
}
$pctErr = 0; $pctChk = 0
foreach ($t in $lvl3) {
    if (-not $t.Text30 -or -not $csvKP.ContainsKey($t.Text30)) { continue }
    $pctChk++
    if ($t.Pct -ne $csvKP[$t.Text30]) {
        $pctErr++
        if ($pctErr -le 5) { $null = $errors.Add("% mismatch: $($t.Text30) exp=$($csvKP[$t.Text30]) got=$($t.Pct)") }
    }
}
$ok = $pctErr -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { "[FAIL]" }
Log "  Checked $pctChk tasks, Mismatches: $pctErr  $tag" $(if ($ok) {"Green"} else {"Red"})

Log "  Distribution:" $null
$lvl3 | Group-Object Pct | Sort-Object { [int]$_.Name } | ForEach-Object { Log "    $($_.Name)%: $($_.Count)" $null }

# ═══ DIAGNOSTIC 5: DATES ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 5: DATES & DURATION" "Cyan"
Log "================================================================" "Cyan"

$csvS = @($csvRows | Where-Object { $_."Prefab Build Start Date".Trim() -ne "" }).Count
$csvF = @($csvRows | Where-Object { $_."Prefab Build Finish Date".Trim() -ne "" }).Count
$csvD = @($csvRows | Where-Object { $_.Required.Trim() -ne "" }).Count
$csvW = @($csvRows | Where-Object { $_."Work Days (Reference)".Trim() -ne "" -and $_."Work Days (Reference)".Trim() -ne "0" }).Count
Log "  CSV: Start=$csvS Finish=$csvF Deadline=$csvD WorkDays=$csvW (of 300)" $null

$mppDL = @($lvl3 | Where-Object { $_.Deadline -ne $null }).Count
Log "  MPP tasks with Deadline set: $mppDL (CSV has $csvD)" $null

# Spot check 30 tasks
$dChk = 0; $dErr = 0
foreach ($row in $csvRows | Select-Object -First 30) {
    $pn=$row."Project Number Override"; if(-not $pn){$pn=$row."Project Number"}
    $key = "$pn-$($row.Number)"
    $mt = $lvl3 | Where-Object { $_.Text30 -eq $key } | Select-Object -First 1
    if (-not $mt -or -not $mt.Start) { continue }
    $cs = $row."Prefab Build Start Date"
    if (-not $cs -or $cs.Trim() -eq "") { continue }
    $dChk++
    try {
        $exp = [DateTime]::Parse($cs.Trim())
        $act = [DateTime]$mt.Start
        if ($exp.Date -ne $act.Date) { $dErr++; $null = $warnings.Add("Start: $key CSV=$($exp.ToString('M/d/yy')) MPP=$($act.ToString('M/d/yy'))") }
    } catch {}
}
$ok = $dErr -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { "[WARN]" }
Log "  Date spot-check: $dChk checked, $dErr mismatches  $tag" $(if ($ok) {"Green"} else {"Yellow"})

# ═══ DIAGNOSTIC 6: NOTES ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 6: NOTES" "Cyan"
Log "================================================================" "Cyan"

$csvN = @($csvRows | Where-Object { ($_.Description -and $_.Description.Trim() -ne "") -or ($_.Notes -and $_.Notes.Trim() -ne "") }).Count
$mppN = @($lvl3 | Where-Object { $_.Notes -and $_.Notes.Trim() -ne "" }).Count
$ok = $mppN -ge $csvN
$tag = if ($ok) { $pass++; "[PASS]" } else { $null = $warnings.Add("Notes: $mppN vs $csvN"); "[WARN]" }
Log "  CSV with Desc/Notes: $csvN, MPP with Notes: $mppN  $tag" $(if ($ok) {"Green"} else {"Yellow"})

# ═══ DIAGNOSTIC 7: SUMMARY & SCHEDULING ═══
Log "`n================================================================" "Cyan"
Log " DIAGNOSTIC 7: SUMMARY & SCHEDULING MODE" "Cyan"
Log "================================================================" "Cyan"

$l1ns = @($lvl1 | Where-Object { -not $_.Summary }).Count
$l2ns = @($lvl2 | Where-Object { -not $_.Summary }).Count
$ok = ($l1ns + $l2ns) -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { "[WARN]" }
Log "  Non-summary at L1: $l1ns, L2: $l2ns  $tag" $(if ($ok) {"Green"} else {"Yellow"})

$manW = @($lvl3 | Where-Object { $_.Manual }).Count
$ok = $manW -eq 0
$tag = if ($ok) { $pass++; "[PASS]" } else { "[WARN]" }
Log "  Manually-scheduled work tasks: $manW  $tag" $(if ($ok) {"Green"} else {"Yellow"})

# ═══ FINAL SUMMARY ═══
Log "`n================================================================" "Green"
Log " RESULTS SUMMARY" "Green"
Log "================================================================" "Green"
Log "  Checks passed: $pass" "Green"
Log "  Errors:        $($errors.Count)" $(if ($errors.Count -gt 0) {"Red"} else {"Green"})
Log "  Warnings:      $($warnings.Count)" $(if ($warnings.Count -gt 0) {"Yellow"} else {"Green"})

if ($errors.Count -gt 0) {
    Log "`n  ERRORS:" "Red"
    $errors | ForEach-Object { Log "    - $_" "Red" }
}
if ($warnings.Count -gt 0) {
    Log "`n  WARNINGS:" "Yellow"
    $warnings | ForEach-Object { Log "    - $_" "Yellow" }
}
Log "`n================================================================" "Green"

$out -join "`n" | Out-File $ReportPath -Encoding utf8
Log "Report saved: $ReportPath" "Cyan"
