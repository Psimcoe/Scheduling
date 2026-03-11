[CmdletBinding()]
param(
    [string]$BaseUri,
    [string]$InstallRoot = 'C:\Program Files\ScheduleSync Desktop',
    [string]$ProjectName,
    [string]$ReportPath,
    [int]$StartupTimeoutSeconds = 90,
    [switch]$AsJson
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $ReportPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ReportPath = Join-Path $repoRoot "artifacts\desktop\diagnostics\desktop-stratus-hierarchy-$timestamp.txt"
}

$reportDir = Split-Path $ReportPath -Parent
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$backendLogPath = Join-Path $env:LOCALAPPDATA 'ScheduleSync\Desktop\logs\backend.log'
$desktopExePath = Join-Path $InstallRoot 'ScheduleSync.Desktop.exe'
$reportLines = New-Object System.Collections.Generic.List[string]
$startedDesktop = $null

function Write-ReportLine {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $timestamped = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    $reportLines.Add($timestamped)
    Write-Host $timestamped
}

function Save-Report {
    $reportLines | Set-Content -Path $ReportPath -Encoding utf8
}

function Get-BackendBaseUriFromLog {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LogPath
    )

    if (-not (Test-Path $LogPath)) {
        return $null
    }

    $line = Get-Content $LogPath | Select-String 'Server running on' | Select-Object -Last 1
    if (-not $line) {
        return $null
    }

    $match = [regex]::Match($line.Line, 'http://127\.0\.0\.1:\d+')
    if (-not $match.Success) {
        return $null
    }

    return $match.Value
}

function Ensure-DesktopBackend {
    param(
        [string]$ExistingBaseUri,
        [Parameter(Mandatory = $true)]
        [string]$DesktopExePath,
        [Parameter(Mandatory = $true)]
        [string]$LogPath,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds
    )

    if ($ExistingBaseUri) {
        return [pscustomobject]@{
            BaseUri = $ExistingBaseUri
            Process = $null
        }
    }

    if (-not (Test-Path $DesktopExePath)) {
        throw "Installed desktop executable not found at $DesktopExePath"
    }

    Write-ReportLine "Launching installed desktop shell from $DesktopExePath"
    $process = Start-Process -FilePath $DesktopExePath -PassThru
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if ($process.HasExited) {
            throw "ScheduleSync.Desktop exited early with code $($process.ExitCode)."
        }

        $baseUri = Get-BackendBaseUriFromLog -LogPath $LogPath
        if ($baseUri) {
            return [pscustomobject]@{
                BaseUri = $baseUri
                Process = $process
            }
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for the desktop backend to start. See $LogPath"
}

function Invoke-ApiGet {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    return Invoke-RestMethod -Uri $Uri -Method Get
}

function Get-StratusHierarchySummary {
    param(
        [Parameter(Mandatory = $true)]
        [object[]]$Projects,
        [Parameter(Mandatory = $true)]
        [object[]]$Tasks
    )

    $projectNames = @($Projects | ForEach-Object { $_.name })
    $taskById = @{}
    foreach ($task in $Tasks) {
        $taskById[$task.id] = $task
    }

    $stratusTasks = @($Tasks | Where-Object { $_.externalKey })
    $projectSummaryTasks = @($stratusTasks | Where-Object { $_.externalKey -like 'stratus-project:*' })
    $packageTasks = @($stratusTasks | Where-Object {
        $_.externalKey -notlike 'stratus-project:*' -and $_.externalKey -notlike '*::assembly:*'
    })
    $assemblyTasks = @($stratusTasks | Where-Object { $_.externalKey -like '*::assembly:*' })
    $nestedPackages = @($packageTasks | Where-Object { $_.parentId })
    $assembliesWithoutPackageParent = @($assemblyTasks | Where-Object {
        -not $_.parentId -or
        -not $taskById.ContainsKey($_.parentId) -or
        $taskById[$_.parentId].externalKey -like '*::assembly:*'
    })
    $taskNamesMatchingProjects = @($stratusTasks | Where-Object { $projectNames -contains $_.name })
    $duplicatePackageExternalKeys = @(
        $packageTasks |
            Group-Object externalKey |
            Where-Object { $_.Count -gt 1 }
    )
    $maxOutlineLevel = 0
    if ($stratusTasks.Count -gt 0) {
        $outlineMeasure = $stratusTasks | Measure-Object -Property outlineLevel -Maximum
        if ($null -ne $outlineMeasure -and $null -ne $outlineMeasure.Maximum) {
            $maxOutlineLevel = [int]$outlineMeasure.Maximum
        }
    }

    return [pscustomobject]@{
        StratusTaskCount = $stratusTasks.Count
        ProjectSummaryCount = $projectSummaryTasks.Count
        PackageCount = $packageTasks.Count
        AssemblyCount = $assemblyTasks.Count
        NestedPackageCount = $nestedPackages.Count
        AssemblyParentIssueCount = $assembliesWithoutPackageParent.Count
        MatchingProjectNameCount = $taskNamesMatchingProjects.Count
        UndefinedPackageCount = @($packageTasks | Where-Object { $_.name -eq 'Undefined Package' }).Count
        DuplicatePackageExternalKeyGroups = $duplicatePackageExternalKeys.Count
        MaxOutlineLevel = $maxOutlineLevel
    }
}

try {
    Write-ReportLine "Desktop Stratus hierarchy audit starting."
    $backend = Ensure-DesktopBackend `
        -ExistingBaseUri $BaseUri `
        -DesktopExePath $desktopExePath `
        -LogPath $backendLogPath `
        -TimeoutSeconds $StartupTimeoutSeconds

    $BaseUri = $backend.BaseUri
    $startedDesktop = $backend.Process
    Write-ReportLine "Using backend $BaseUri"

    $projectResponse = Invoke-ApiGet -Uri "$BaseUri/api/projects"
    $projects = @()
    if ($null -ne $projectResponse) {
        $projects = @($projectResponse)
    }
    if ($ProjectName) {
        $projects = @($projects | Where-Object { $_.name -eq $ProjectName })
    }

    if ($projects.Count -eq 0) {
        throw 'No matching projects were found for the hierarchy audit.'
    }

    $results = @(
        foreach ($project in $projects) {
            $taskResponse = Invoke-ApiGet -Uri "$BaseUri/api/projects/$($project.id)/tasks"
            $tasks = @()
            if ($null -ne $taskResponse) {
                $tasks = @($taskResponse)
            }

            if ($tasks.Count -eq 0) {
                continue
            }

            $summary = Get-StratusHierarchySummary -Projects $projects -Tasks $tasks
            if ($summary.StratusTaskCount -le 0) {
                continue
            }

            [pscustomobject]@{
                ProjectName = $project.name
                ProjectId = $project.id
                StratusTaskCount = $summary.StratusTaskCount
                ProjectSummaryCount = $summary.ProjectSummaryCount
                PackageCount = $summary.PackageCount
                AssemblyCount = $summary.AssemblyCount
                NestedPackageCount = $summary.NestedPackageCount
                AssemblyParentIssueCount = $summary.AssemblyParentIssueCount
                MatchingProjectNameCount = $summary.MatchingProjectNameCount
                UndefinedPackageCount = $summary.UndefinedPackageCount
                DuplicatePackageExternalKeyGroups = $summary.DuplicatePackageExternalKeyGroups
                MaxOutlineLevel = $summary.MaxOutlineLevel
            }
        }
    )

    if ($results.Count -eq 0) {
        throw 'No Stratus-managed tasks were found in the selected projects.'
    }

    foreach ($result in $results) {
        Write-ReportLine (
            "{0}: summaries={1}, packages={2}, assemblies={3}, nestedPackages={4}, assemblyParentIssues={5}, projectNameMatches={6}, undefinedPackages={7}, duplicatePackageKeys={8}, maxOutline={9}" -f
            $result.ProjectName,
            $result.ProjectSummaryCount,
            $result.PackageCount,
            $result.AssemblyCount,
            $result.NestedPackageCount,
            $result.AssemblyParentIssueCount,
            $result.MatchingProjectNameCount,
            $result.UndefinedPackageCount,
            $result.DuplicatePackageExternalKeyGroups,
            $result.MaxOutlineLevel
        )
    }

    if ($AsJson) {
        Write-Host ($results | ConvertTo-Json -Depth 5)
    }

    $violations = @(
        $results | Where-Object {
            $_.ProjectSummaryCount -gt 0 -or
            $_.NestedPackageCount -gt 0 -or
            $_.AssemblyParentIssueCount -gt 0 -or
            $_.MatchingProjectNameCount -gt 0 -or
            $_.DuplicatePackageExternalKeyGroups -gt 0 -or
            $_.MaxOutlineLevel -gt 1
        }
    )

    if ($violations.Count -gt 0) {
        throw ("Stratus hierarchy audit failed for: {0}" -f (($violations | ForEach-Object { $_.ProjectName }) -join ', '))
    }

    Write-ReportLine "Stratus hierarchy audit passed."
}
catch {
    Write-ReportLine "Hierarchy audit failed: $($_.Exception.Message)"
    throw
}
finally {
    Save-Report

    if ($startedDesktop -and -not $startedDesktop.HasExited) {
        Write-ReportLine "Stopping launched desktop shell PID $($startedDesktop.Id)."
        Stop-Process -Id $startedDesktop.Id -Force -ErrorAction SilentlyContinue
    }
}
