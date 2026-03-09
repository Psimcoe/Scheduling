[CmdletBinding()]
param(
    [ValidateSet('Launch', 'Backend', 'Frontend')]
    [string]$Mode = 'Launch',
    [string]$LogPath,
    [switch]$SkipBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Show-LauncherError {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            $Message,
            'ScheduleSync Web Launcher',
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    }
    catch {
        Write-Error $Message
    }
}

function Start-LauncherTranscript {
    param(
        [string]$Path
    )

    if (-not $Path) {
        return
    }

    $parent = Split-Path -Path $Path -Parent
    if ($parent -and -not (Test-Path $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }

    Start-Transcript -Path $Path -Append | Out-Null
}

function Stop-LauncherTranscript {
    try {
        Stop-Transcript | Out-Null
    }
    catch {
    }
}

function Get-RepoPaths {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $webRoot = Join-Path $repoRoot 'web'

    [pscustomobject]@{
        RepoRoot     = $repoRoot
        WebRoot      = $webRoot
        EngineRoot   = Join-Path $webRoot 'packages\engine'
        MspdiRoot    = Join-Path $webRoot 'packages\mspdi'
        BackendRoot  = Join-Path $webRoot 'packages\backend'
        FrontendRoot = Join-Path $webRoot 'packages\frontend'
        LogRoot      = Join-Path $env:LOCALAPPDATA 'ScheduleSync\logs'
    }
}

function Assert-CommandPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return (Get-Command $Name -ErrorAction Stop).Source
}

function Invoke-Pnpm {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    Push-Location $WorkingDirectory
    try {
        & $script:PnpmCommand @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "pnpm $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Test-DependenciesNeedInstall {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WebRoot
    )

    $installMarker = Join-Path $WebRoot 'node_modules\.modules.yaml'
    if (-not (Test-Path $installMarker)) {
        return $true
    }

    $markerTime = (Get-Item $installMarker).LastWriteTimeUtc
    $manifestFiles = @(
        Join-Path $WebRoot 'package.json'
        Join-Path $WebRoot 'pnpm-lock.yaml'
        Join-Path $WebRoot 'pnpm-workspace.yaml'
    ) + @(Get-ChildItem (Join-Path $WebRoot 'packages') -Recurse -Filter 'package.json' | Select-Object -ExpandProperty FullName)

    foreach ($file in $manifestFiles) {
        if ((Get-Item $file).LastWriteTimeUtc -gt $markerTime) {
            return $true
        }
    }

    return $false
}

function Test-SharedBuildNeeded {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackageRoot
    )

    $distEntry = Join-Path $PackageRoot 'dist\index.js'
    if (-not (Test-Path $distEntry)) {
        return $true
    }

    $distTime = (Get-Item $distEntry).LastWriteTimeUtc
    $inputs = @(
        Join-Path $PackageRoot 'package.json'
        Join-Path $PackageRoot 'tsconfig.json'
    ) + @(Get-ChildItem (Join-Path $PackageRoot 'src') -Recurse -File | Select-Object -ExpandProperty FullName)

    foreach ($file in $inputs) {
        if ((Get-Item $file).LastWriteTimeUtc -gt $distTime) {
            return $true
        }
    }

    return $false
}

function Test-UrlReady {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [string]$MustContain
    )

    $client = $null

    try {
        $client = New-Object System.Net.WebClient
        $client.Encoding = [System.Text.Encoding]::UTF8
        $content = $client.DownloadString($Uri)

        if ($MustContain) {
            return $content.Contains($MustContain)
        }

        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($null -ne $client) {
            $client.Dispose()
        }
    }
}

function Wait-ForUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [string]$MustContain,
        [int]$TimeoutSeconds = 90
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

    while ((Get-Date) -lt $deadline) {
        if (Test-UrlReady -Uri $Uri -MustContain $MustContain) {
            return $true
        }

        Start-Sleep -Seconds 1
    }

    return $false
}

function Test-PortListening {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    return [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Start-DevProcess {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('Backend', 'Frontend')]
        [string]$ServiceMode,
        [Parameter(Mandatory = $true)]
        [string]$ChildLogPath
    )

    $quotedScriptPath = "`"$PSCommandPath`""
    $quotedLogPath = "`"$ChildLogPath`""
    $arguments = "-NoLogo -ExecutionPolicy Bypass -File $quotedScriptPath -Mode $ServiceMode -LogPath $quotedLogPath"

    Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}

function Ensure-WebWorkspaceReady {
    param(
        [Parameter(Mandatory = $true)]
        [pscustomobject]$Paths,
        [switch]$IncludeBackendSetup
    )

    if (Test-DependenciesNeedInstall -WebRoot $Paths.WebRoot) {
        Invoke-Pnpm -WorkingDirectory $Paths.WebRoot -Arguments @('install')
    }

    if (Test-SharedBuildNeeded -PackageRoot $Paths.EngineRoot) {
        Invoke-Pnpm -WorkingDirectory $Paths.WebRoot -Arguments @('--filter', '@schedulesync/engine', 'build')
    }

    if (Test-SharedBuildNeeded -PackageRoot $Paths.MspdiRoot) {
        Invoke-Pnpm -WorkingDirectory $Paths.WebRoot -Arguments @('--filter', '@schedulesync/mspdi', 'build')
    }

    if ($IncludeBackendSetup) {
        Invoke-Pnpm -WorkingDirectory $Paths.WebRoot -Arguments @('--filter', '@schedulesync/backend', 'exec', 'prisma', 'generate')
        Invoke-Pnpm -WorkingDirectory $Paths.WebRoot -Arguments @('--filter', '@schedulesync/backend', 'exec', 'prisma', 'db', 'push')
    }
}

$paths = Get-RepoPaths
$backendHealthUrl = 'http://localhost:3001/api/health'
$frontendUrl = 'http://localhost:5173/'
Start-LauncherTranscript -Path $LogPath

try {
    $script:PnpmCommand = Assert-CommandPath -Name 'pnpm'
    [void](Assert-CommandPath -Name 'node')

    switch ($Mode) {
        'Backend' {
            Write-Host 'Starting backend dev server...'
            Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('--filter', '@schedulesync/backend', 'dev')
            exit 0
        }
        'Frontend' {
            Write-Host 'Starting frontend dev server...'
            Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('--filter', '@schedulesync/frontend', 'dev')
            exit 0
        }
    }

    Write-Host 'Checking current app status...'
    $backendReady = Wait-ForUrl -Uri $backendHealthUrl -MustContain '"status":"ok"' -TimeoutSeconds 5
    $frontendReady = Wait-ForUrl -Uri $frontendUrl -MustContain '<title>ScheduleSync</title>' -TimeoutSeconds 5
    $backendListening = Test-PortListening -Port 3001
    $frontendListening = Test-PortListening -Port 5173

    if (-not ($backendReady -and $frontendReady)) {
        Write-Host 'Preparing web workspace...'
        $needsBackendStart = (-not $backendReady) -and (-not $backendListening)
        $needsFrontendStart = (-not $frontendReady) -and (-not $frontendListening)

        Ensure-WebWorkspaceReady -Paths $paths -IncludeBackendSetup:$needsBackendStart

        if ($needsBackendStart) {
            Write-Host 'Launching backend in the background...'
            Start-DevProcess -ServiceMode 'Backend' -ChildLogPath (Join-Path $paths.LogRoot 'web-backend.log')
        }

        if ($needsFrontendStart) {
            Write-Host 'Launching frontend in the background...'
            Start-DevProcess -ServiceMode 'Frontend' -ChildLogPath (Join-Path $paths.LogRoot 'web-frontend.log')
        }
    }

    Write-Host 'Waiting for backend...'
    if (-not (Wait-ForUrl -Uri $backendHealthUrl -MustContain '"status":"ok"' -TimeoutSeconds 90)) {
        throw "The backend did not become ready. Check $($paths.LogRoot)\web-backend.log."
    }

    Write-Host 'Waiting for frontend...'
    if (-not (Wait-ForUrl -Uri $frontendUrl -MustContain '<title>ScheduleSync</title>' -TimeoutSeconds 90)) {
        throw "The frontend did not become ready. Check $($paths.LogRoot)\web-frontend.log."
    }

    if (-not $SkipBrowser) {
        Write-Host 'Opening browser...'
        Start-Process -FilePath 'explorer.exe' -ArgumentList $frontendUrl | Out-Null
    }

    Write-Host 'Launcher complete.'
}
catch {
    $message = $_.Exception.Message
    Show-LauncherError -Message $message
    exit 1
}
finally {
    Stop-LauncherTranscript
}
