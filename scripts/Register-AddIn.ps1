<#
.SYNOPSIS
    Registers (or unregisters) the ScheduleSync COM add-in for Microsoft Project.

.DESCRIPTION
    This script:
      1. Runs regasm to register the DLL as a COM server.
      2. Creates registry keys so MS Project loads the add-in on startup.

    Run from an elevated (Administrator) PowerShell prompt.

.PARAMETER Unregister
    When specified, removes the COM registration and registry keys.

.PARAMETER Configuration
    Build configuration to use (Debug or Release). Default: Debug.

.EXAMPLE
    .\Register-AddIn.ps1
    .\Register-AddIn.ps1 -Unregister
    .\Register-AddIn.ps1 -Configuration Release
#>
[CmdletBinding()]
param(
    [switch]$Unregister,
    [ValidateSet('Debug','Release')]
    [string]$Configuration = 'Debug'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Paths
$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$dllPath     = Join-Path $projectRoot "ScheduleSync.AddIn\bin\$Configuration\net48\ScheduleSync.AddIn.dll"
$progId      = 'ScheduleSync.Connect'

# Registry key where MS Project looks for COM add-ins
$addinRegKey = "HKCU:\Software\Microsoft\Office\MS Project\Addins\$progId"

# Find regasm for .NET Framework 4.x
$regasm = Join-Path ([System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()) 'regasm.exe'
if (-not (Test-Path $regasm)) {
    # Fallback: try the 64-bit .NET Framework directory
    $regasm = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\regasm.exe'
}
if (-not (Test-Path $regasm)) {
    Write-Error "regasm.exe not found. Ensure .NET Framework 4.8 is installed."
    return
}

if (-not (Test-Path $dllPath)) {
    Write-Error "DLL not found at: $dllPath`nBuild the project first: dotnet build ScheduleSync.AddIn\ScheduleSync.AddIn.csproj"
    return
}

if ($Unregister) {
    Write-Host "Unregistering ScheduleSync COM add-in..." -ForegroundColor Yellow

    # Remove registry keys
    if (Test-Path $addinRegKey) {
        Remove-Item $addinRegKey -Force
        Write-Host "  Removed registry key: $addinRegKey"
    }

    # Unregister COM
    & $regasm /unregister $dllPath 2>&1 | ForEach-Object { Write-Host "  $_" }

    Write-Host "Done. Restart MS Project to apply." -ForegroundColor Green
}
else {
    Write-Host "Registering ScheduleSync COM add-in..." -ForegroundColor Cyan
    Write-Host "  DLL: $dllPath"
    Write-Host "  ProgId: $progId"

    # Register COM server
    Write-Host "`n  Running regasm /codebase..." -ForegroundColor DarkGray
    & $regasm /codebase $dllPath 2>&1 | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-Error "regasm failed. Try running as Administrator."
        return
    }

    # Create MS Project add-in registry key
    if (-not (Test-Path $addinRegKey)) {
        New-Item -Path $addinRegKey -Force | Out-Null
    }
    # LoadBehavior 3 = Load at startup
    Set-ItemProperty -Path $addinRegKey -Name 'FriendlyName'    -Value 'ScheduleSync - Crew Assignment'
    Set-ItemProperty -Path $addinRegKey -Name 'Description'     -Value 'AI-powered crew assignment and schedule sync for MS Project.'
    Set-ItemProperty -Path $addinRegKey -Name 'LoadBehavior'    -Value 3 -Type DWord
    Set-ItemProperty -Path $addinRegKey -Name 'CommandLineSafe' -Value 1 -Type DWord

    Write-Host "`nRegistration complete!" -ForegroundColor Green
    Write-Host "  1. Open Microsoft Project"
    Write-Host "  2. Go to File > Options > Add-ins"
    Write-Host "  3. Select 'COM Add-ins' from the Manage dropdown and click Go"
    Write-Host "  4. 'ScheduleSync - Crew Assignment' should be listed and checked"
    Write-Host "  5. A 'ScheduleSync' tab will appear in the Ribbon"
}
