<#
.SYNOPSIS
    Registers the ScheduleSync COM add-in for Microsoft Project.
.DESCRIPTION
    1. Runs RegAsm to register the assembly as a COM server.
    2. Creates the MS Project add-in registry key so Project discovers
       and loads the add-in on startup.
    Must be run as Administrator (RegAsm writes to HKCR / registry).
.PARAMETER Unregister
    When specified, removes the COM registration and the MS Project add-in key.
#>
[CmdletBinding()]
param(
    [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# -- Paths -----------------------------------------------------------------
$addInProject  = Join-Path $PSScriptRoot 'ScheduleSync.AddIn'
$configuration = 'Debug'
$tfm           = 'net48'
$outputDir     = Join-Path $addInProject "bin\$configuration\$tfm"
$assemblyPath  = Join-Path $outputDir 'ScheduleSync.AddIn.dll'

if (-not (Test-Path $assemblyPath)) {
    Write-Error ("Assembly not found at '{0}'. Build first: dotnet build ScheduleSync.AddIn\ScheduleSync.AddIn.csproj" -f $assemblyPath)
    return
}

# -- Locate RegAsm for .NET Framework 4.x ----------------------------------
$frameworkDir = Join-Path $env:windir 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path $frameworkDir)) {
    $frameworkDir = Join-Path $env:windir 'Microsoft.NET\Framework\v4.0.30319'
}
$regAsm = Join-Path $frameworkDir 'RegAsm.exe'
if (-not (Test-Path $regAsm)) {
    Write-Error 'RegAsm.exe not found. Ensure .NET Framework 4.x is installed.'
    return
}

# -- Registry constants -----------------------------------------------------
$progId   = 'ScheduleSync.Connect'
$addInKey = "HKCU:\Software\Microsoft\Office\MS Project\Addins\$progId"

# -- Unregister -------------------------------------------------------------
if ($Unregister) {
    Write-Host 'Unregistering COM assembly...' -ForegroundColor Cyan
    & $regAsm $assemblyPath /unregister /silent
    if (Test-Path $addInKey) {
        Remove-Item $addInKey -Force
        Write-Host "Removed MS Project add-in key: $addInKey" -ForegroundColor Yellow
    }
    Write-Host 'Done - add-in unregistered.' -ForegroundColor Green
    return
}

# -- Register COM assembly --------------------------------------------------
Write-Host 'Registering COM assembly with RegAsm...' -ForegroundColor Cyan
& $regAsm $assemblyPath /codebase /silent
if ($LASTEXITCODE -ne 0) {
    Write-Error "RegAsm failed with exit code $LASTEXITCODE."
    return
}
Write-Host 'COM registration succeeded.' -ForegroundColor Green

# -- Create MS Project add-in registry key ----------------------------------
Write-Host 'Creating MS Project add-in registry key...' -ForegroundColor Cyan
if (-not (Test-Path $addInKey)) {
    New-Item -Path $addInKey -Force | Out-Null
}
Set-ItemProperty -Path $addInKey -Name 'FriendlyName'   -Value 'ScheduleSync'
Set-ItemProperty -Path $addInKey -Name 'Description'    -Value 'Import schedule updates (CSV/JSON) into MS Project plans.'
Set-ItemProperty -Path $addInKey -Name 'LoadBehavior'   -Value 3 -Type DWord
Set-ItemProperty -Path $addInKey -Name 'CommandLineSafe' -Value 1 -Type DWord

Write-Host "Registry key created at: $addInKey" -ForegroundColor Green
Write-Host 'Registration complete. Restart Microsoft Project to load ScheduleSync.' -ForegroundColor Green
