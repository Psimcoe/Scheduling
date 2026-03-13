[CmdletBinding()]
param(
    [string]$LogPath,
    [switch]$SkipBrowser,
    [int]$LaunchRetryCount = 3,
    [int]$LaunchRetryDelaySeconds = 5
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Stop-WebAppProcesses {
    param(
        [int[]]$Ports = @(3001, 5173)
    )

    $owningProcesses = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $owningProcesses) {
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Wait-Process -Id $processId -Timeout 10 -ErrorAction SilentlyContinue
        }
        catch {
            Write-Warning ("Failed to stop process {0}: {1}" -f $processId, $_.Exception.Message)
        }
    }
}

$launchScriptPath = Join-Path $PSScriptRoot 'Launch-WebApp.ps1'
if (-not (Test-Path $launchScriptPath)) {
    throw "Could not find launcher script at $launchScriptPath."
}

Write-Host 'Stopping existing ScheduleSync web app processes on ports 3001 and 5173...'
Stop-WebAppProcesses

Start-Sleep -Seconds 2

$launchArguments = @(
    '-NoLogo'
    '-ExecutionPolicy'
    'Bypass'
    '-File'
    $launchScriptPath
    '-Mode'
    'Launch'
)

if ($LogPath) {
    $launchArguments += @('-LogPath', $LogPath)
}

if ($SkipBrowser) {
    $launchArguments += '-SkipBrowser'
}

for ($attempt = 1; $attempt -le $LaunchRetryCount; $attempt++) {
    Write-Host "Launching ScheduleSync web app (attempt $attempt of $LaunchRetryCount)..."
    & powershell.exe @launchArguments

    if ($LASTEXITCODE -eq 0) {
        exit 0
    }

    if ($attempt -lt $LaunchRetryCount) {
        Write-Warning "Launch attempt $attempt failed with exit code $LASTEXITCODE. Retrying in $LaunchRetryDelaySeconds seconds..."
        Start-Sleep -Seconds $LaunchRetryDelaySeconds
    }
}

exit $LASTEXITCODE
