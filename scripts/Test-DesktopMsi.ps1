[CmdletBinding()]
param(
    [string]$MsiPath,
    [string]$InstallRoot = 'C:\Program Files\ScheduleSync Desktop',
    [string]$ReportPath,
    [int]$StartupTimeoutSeconds = 90,
    [switch]$SkipInstall
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $MsiPath) {
    $MsiPath = Join-Path $repoRoot 'artifacts\desktop\installer\ScheduleSync.Desktop.msi'
}

if (-not $ReportPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $ReportPath = Join-Path $repoRoot "artifacts\desktop\diagnostics\desktop-msi-$timestamp.txt"
}

$reportDir = Split-Path $ReportPath -Parent
New-Item -ItemType Directory -Path $reportDir -Force | Out-Null

$installerLogPath = Join-Path $reportDir 'desktop-msi-install.log'
$backendLogPath = Join-Path $env:LOCALAPPDATA 'ScheduleSync\Desktop\logs\backend.log'
$reportLines = New-Object System.Collections.Generic.List[string]

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
                    ProductCode     = $productCode
                    DisplayVersion  = [string]$_.DisplayVersion
                    InstallDate     = [string]$_.InstallDate
                    UninstallString = [string]$_.UninstallString
                }
            }
    }

    return @($products | Sort-Object DisplayVersion, ProductCode -Unique)
}

function Stop-InstalledDesktopProcesses {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedInstallRoot
    )

    $desktopProcesses = @(
        Get-CimInstance Win32_Process -Filter "Name = 'ScheduleSync.Desktop.exe'" |
            Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($ResolvedInstallRoot, [StringComparison]::OrdinalIgnoreCase) }
    )

    foreach ($process in $desktopProcesses) {
        Write-ReportLine "Stopping running desktop shell PID $($process.ProcessId)."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }

    $nodeProcesses = @(
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object {
                ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($ResolvedInstallRoot, [StringComparison]::OrdinalIgnoreCase)) -or
                ($_.CommandLine -and $_.CommandLine.IndexOf($ResolvedInstallRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0)
            }
    )

    foreach ($process in $nodeProcesses) {
        Write-ReportLine "Stopping packaged backend PID $($process.ProcessId)."
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
}

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        throw "Missing required path: $Path"
    }

    Write-ReportLine "Verified path: $Path"
}

function Invoke-MsiInstall {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ResolvedMsiPath,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedInstallerLogPath
    )

    $arguments = @(
        '/i', "`"$ResolvedMsiPath`"",
        '/qn',
        '/norestart',
        '/L*v', "`"$ResolvedInstallerLogPath`""
    )

    Write-ReportLine "Installing MSI: $ResolvedMsiPath"
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
        throw "msiexec failed with exit code $($process.ExitCode). See $ResolvedInstallerLogPath"
    }

    Write-ReportLine "MSI install completed with exit code $($process.ExitCode)."
}

function Get-BackendBaseUri {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LogPath,
        [Parameter(Mandatory = $true)]
        [int]$TimeoutSeconds,
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$DesktopProcess
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $pattern = 'Server running on (?<uri>http://127\.0\.0\.1:\d+)'

    while ((Get-Date) -lt $deadline) {
        if ($DesktopProcess.HasExited) {
            throw "ScheduleSync.Desktop exited early with code $($DesktopProcess.ExitCode)."
        }

        if (Test-Path $LogPath) {
            $content = Get-Content $LogPath -Raw
            if ($content) {
                $match = [regex]::Match($content, $pattern)
                if ($match.Success) {
                    return $match.Groups['uri'].Value
                }
            }
        }

        Start-Sleep -Milliseconds 500
    }

    throw "Timed out waiting for backend startup. See $LogPath"
}

function Invoke-JsonPostWithoutBody {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    $client = [System.Net.Http.HttpClient]::new()
    try {
        $response = $client.PostAsync($Uri, $null).GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body       = $body
        }
    }
    finally {
        $client.Dispose()
    }
}

$resolvedMsiPath = (Resolve-Path $MsiPath).Path
$resolvedInstallRoot = $InstallRoot
$desktopProcess = $null

try {
    Write-ReportLine "Desktop MSI diagnostics starting."
    Write-ReportLine "MSI path: $resolvedMsiPath"
    Write-ReportLine "Install root: $resolvedInstallRoot"
    Write-ReportLine "Report path: $ReportPath"

    if (-not $SkipInstall) {
        if (-not (Test-IsAdministrator)) {
            throw 'MSI install diagnostics require an elevated PowerShell session because the installer is per-machine.'
        }

        $productsBefore = @(Get-InstalledDesktopProducts)
        Write-ReportLine "Installed products before update: $($productsBefore.Count)"
        foreach ($product in $productsBefore) {
            Write-ReportLine "  Before: version=$($product.DisplayVersion) productCode=$($product.ProductCode)"
        }

        Stop-InstalledDesktopProcesses -ResolvedInstallRoot $resolvedInstallRoot
        Invoke-MsiInstall -ResolvedMsiPath $resolvedMsiPath -ResolvedInstallerLogPath $installerLogPath

        $productsAfter = @(Get-InstalledDesktopProducts)
        Write-ReportLine "Installed products after update: $($productsAfter.Count)"
        foreach ($product in $productsAfter) {
            Write-ReportLine "  After: version=$($product.DisplayVersion) productCode=$($product.ProductCode)"
        }

        if ($productsAfter.Count -ne 1) {
            throw "Expected exactly one installed ScheduleSync Desktop product after MSI install; found $($productsAfter.Count)."
        }
    }
    else {
        Write-ReportLine 'Skipping MSI install step and validating the supplied desktop publish root directly.'
    }

    Assert-PathExists -Path $resolvedInstallRoot
    Assert-PathExists -Path (Join-Path $resolvedInstallRoot 'ScheduleSync.Desktop.exe')
    Assert-PathExists -Path (Join-Path $resolvedInstallRoot 'runtime\backend\dist\server.js')
    Assert-PathExists -Path (Join-Path $resolvedInstallRoot 'runtime\frontend\index.html')
    Assert-PathExists -Path (Join-Path $resolvedInstallRoot 'runtime\node\node.exe')
    Assert-PathExists -Path (Join-Path $resolvedInstallRoot 'runtime\MicrosoftEdgeWebView2Setup.exe')

    if (Test-Path $backendLogPath) {
        Remove-Item $backendLogPath -Force
    }

    $desktopExePath = Join-Path $resolvedInstallRoot 'ScheduleSync.Desktop.exe'
    Write-ReportLine "Launching installed desktop shell."
    $desktopProcess = Start-Process -FilePath $desktopExePath -PassThru

    $baseUri = Get-BackendBaseUri -LogPath $backendLogPath -TimeoutSeconds $StartupTimeoutSeconds -DesktopProcess $desktopProcess
    Write-ReportLine "Backend started at $baseUri"

    $health = Invoke-RestMethod -Uri "$baseUri/api/health" -Method Get
    if ($health.status -ne 'ok') {
        throw "Unexpected health response: $($health | ConvertTo-Json -Compress)"
    }
    Write-ReportLine 'Health endpoint returned status=ok.'

    $stratusTest = Invoke-JsonPostWithoutBody -Uri "$baseUri/api/stratus/test"
    Write-ReportLine "Stratus test endpoint returned HTTP $($stratusTest.StatusCode): $($stratusTest.Body)"
    if ($stratusTest.Body -match 'Body cannot be empty when content-type is set to ''application/json''' -or
        $stratusTest.Body -match 'FST_ERR_CTP_EMPTY_JSON_BODY') {
        throw 'Stratus test endpoint still fails with the empty JSON body parser error.'
    }

    $stratusImportPreview = Invoke-JsonPostWithoutBody -Uri "$baseUri/api/stratus/projects/preview"
    Write-ReportLine "Stratus project preview returned HTTP $($stratusImportPreview.StatusCode): $($stratusImportPreview.Body)"
    if ($stratusImportPreview.Body -match 'Body cannot be empty when content-type is set to ''application/json''' -or
        $stratusImportPreview.Body -match 'FST_ERR_CTP_EMPTY_JSON_BODY') {
        throw 'Stratus project preview still fails with the empty JSON body parser error.'
    }

    if ($desktopProcess.HasExited) {
        throw "ScheduleSync.Desktop exited unexpectedly with code $($desktopProcess.ExitCode)."
    }

    Write-ReportLine 'Desktop shell stayed alive through installer diagnostics.'
    Write-ReportLine "Diagnostics report saved to $ReportPath"
}
catch {
    Write-ReportLine "Diagnostics failed: $($_.Exception.Message)"
    throw
}
finally {
    if ($desktopProcess -and -not $desktopProcess.HasExited) {
        Write-ReportLine "Stopping launched desktop shell PID $($desktopProcess.Id)."
        Stop-Process -Id $desktopProcess.Id -Force -ErrorAction SilentlyContinue
    }

    Stop-InstalledDesktopProcesses -ResolvedInstallRoot $resolvedInstallRoot
    Save-Report
}
