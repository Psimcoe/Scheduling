[CmdletBinding()]
param(
    [string]$DiagnosticsReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Test-IsAdministrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-InstalledDesktopProducts {
    $registryPaths = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )

    $products = foreach ($path in $registryPaths) {
        Get-ItemProperty $path -ErrorAction SilentlyContinue |
            Where-Object {
                $displayNameProperty = $_.PSObject.Properties['DisplayName']
                $displayNameProperty -and [string]$displayNameProperty.Value -eq 'ScheduleSync Desktop'
            } |
            ForEach-Object {
                $productCode = $null
                if ($_.PSChildName -match '^\{[0-9A-Fa-f-]+\}$') {
                    $productCode = $_.PSChildName
                }

                [pscustomobject]@{
                    ProductCode    = $productCode
                    DisplayVersion = [string]$_.DisplayVersion
                    InstallDate    = [string]$_.InstallDate
                }
            }
    }

    return @($products | Sort-Object DisplayVersion, ProductCode -Unique)
}

function Invoke-MsiExec {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $Arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 1605, 1614, 3010)) {
        throw "msiexec $($Arguments -join ' ') failed with exit code $($process.ExitCode)."
    }
}

if (-not (Test-IsAdministrator)) {
    throw 'Repair-DesktopInstall.ps1 must run from an elevated PowerShell session.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$diagnosticsScript = Join-Path $PSScriptRoot 'Test-DesktopMsi.ps1'

$installedProducts = @(Get-InstalledDesktopProducts)
Write-Host "Found $($installedProducts.Count) installed ScheduleSync Desktop product(s)."

foreach ($product in $installedProducts) {
    if (-not $product.ProductCode) {
        continue
    }

    Write-Host "Uninstalling $($product.ProductCode) version $($product.DisplayVersion)..."
    Invoke-MsiExec -Arguments @('/x', $product.ProductCode, '/qn', '/norestart')
}

Write-Host 'Running elevated desktop MSI diagnostics...'
$diagnosticArgs = @(
    '-NoLogo',
    '-ExecutionPolicy', 'Bypass',
    '-File', $diagnosticsScript
)

if ($DiagnosticsReportPath) {
    $diagnosticArgs += @('-ReportPath', $DiagnosticsReportPath)
}

$diagnosticProcess = Start-Process -FilePath 'powershell.exe' -ArgumentList $diagnosticArgs -Wait -PassThru
if ($diagnosticProcess.ExitCode -ne 0) {
    throw "Desktop MSI diagnostics failed with exit code $($diagnosticProcess.ExitCode)."
}

Write-Host 'Desktop repair and diagnostics completed successfully.'
