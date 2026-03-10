[CmdletBinding()]
param(
    [switch]$Launch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoPaths {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $webRoot = Join-Path $repoRoot 'web'

    [pscustomobject]@{
        RepoRoot    = $repoRoot
        WebRoot     = $webRoot
        BackendRoot = Join-Path $webRoot 'packages\backend'
        BackendDbPath = Join-Path $webRoot 'packages\backend\prisma\dev.db'
        BackendTemplateDbPath = Join-Path $webRoot 'packages\backend\prisma\dev-template.db'
    }
}

function Convert-ToPrismaSqliteUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    return "file:$($FilePath.Replace('\', '/'))"
}

function Resolve-DatabaseFilePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DefaultPath,
        [string]$DatabaseUrl
    )

    if (-not $DatabaseUrl) {
        return $DefaultPath
    }

    if (-not $DatabaseUrl.StartsWith('file:', [StringComparison]::OrdinalIgnoreCase)) {
        return $DefaultPath
    }

    $pathPart = $DatabaseUrl.Substring(5)
    if ([System.IO.Path]::IsPathRooted($pathPart)) {
        return $pathPart.Replace('/', '\')
    }

    $schemaDirectory = Split-Path -Path $DefaultPath -Parent
    return [System.IO.Path]::GetFullPath((Join-Path $schemaDirectory $pathPart))
}

function Find-NodeCommand {
    $nodeCommand = Get-Command 'node' -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        return $nodeCommand.Source
    }

    $commonPaths = @(
        'C:\Program Files\nodejs\node.exe'
        'C:\Program Files (x86)\nodejs\node.exe'
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe')
    )

    foreach ($path in $commonPaths) {
        if (Test-Path $path) {
            return $path
        }
    }

    $wingetPackagesRoot = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $wingetPackagesRoot) {
        $wingetNode = Get-ChildItem $wingetPackagesRoot -Recurse -Filter 'node.exe' -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTimeUtc -Descending |
            Select-Object -First 1 -ExpandProperty FullName
        if ($wingetNode) {
            return $wingetNode
        }
    }

    return $null
}

function Ensure-NodeCommand {
    $nodeCommand = Find-NodeCommand
    if ($nodeCommand) {
        return $nodeCommand
    }

    $wingetCommand = Get-Command 'winget' -ErrorAction SilentlyContinue
    if (-not $wingetCommand) {
        throw 'Node.js 20 or later is required. Install Node.js LTS, then rerun Setup-ScheduleSync.cmd.'
    }

    Write-Host 'Node.js not found. Installing Node.js LTS with winget...'
    & $wingetCommand.Source install --id OpenJS.NodeJS.LTS -e --scope user --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "winget failed to install Node.js LTS with exit code $LASTEXITCODE."
    }

    $nodeCommand = Find-NodeCommand
    if (-not $nodeCommand) {
        throw 'Node.js was installed, but the current session could not locate node.exe. Open a new shell and rerun Setup-ScheduleSync.cmd.'
    }

    return $nodeCommand
}

function Resolve-CorepackCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeCommand
    )

    $corepackCommand = Get-Command 'corepack' -ErrorAction SilentlyContinue
    if ($corepackCommand) {
        return $corepackCommand.Source
    }

    $nodeDirectory = Split-Path -Path $NodeCommand -Parent
    foreach ($candidate in @(
        (Join-Path $nodeDirectory 'corepack.cmd'),
        (Join-Path $nodeDirectory 'corepack.exe')
    )) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

function Ensure-PnpmInvoker {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeCommand
    )

    $pnpmCommand = Get-Command 'pnpm' -ErrorAction SilentlyContinue
    if ($pnpmCommand) {
        return [pscustomobject]@{
            Command         = $pnpmCommand.Source
            PrefixArguments = @()
        }
    }

    $corepackCommand = Resolve-CorepackCommand -NodeCommand $NodeCommand
    if (-not $corepackCommand) {
        throw 'pnpm is not available and corepack could not be found next to Node.js.'
    }

    Write-Host 'Enabling pnpm with corepack...'
    & $corepackCommand enable
    if ($LASTEXITCODE -ne 0) {
        throw "corepack enable failed with exit code $LASTEXITCODE."
    }

    $pnpmCommand = Get-Command 'pnpm' -ErrorAction SilentlyContinue
    if ($pnpmCommand) {
        return [pscustomobject]@{
            Command         = $pnpmCommand.Source
            PrefixArguments = @()
        }
    }

    return [pscustomobject]@{
        Command         = $corepackCommand
        PrefixArguments = @('pnpm')
    }
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
        & $script:PnpmCommand @script:PnpmPrefixArguments @Arguments
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

$paths = Get-RepoPaths

try {
    $nodeCommand = Ensure-NodeCommand
    $pnpmInvoker = Ensure-PnpmInvoker -NodeCommand $nodeCommand
    $script:PnpmCommand = $pnpmInvoker.Command
    $script:PnpmPrefixArguments = @($pnpmInvoker.PrefixArguments)

    if (Test-DependenciesNeedInstall -WebRoot $paths.WebRoot) {
        Write-Host 'Installing web workspace dependencies...'
        Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('install', '--force')
    }
    else {
        Write-Host 'Dependencies already installed.'
    }

    Write-Host 'Generating Prisma client...'
    if (-not $env:DATABASE_URL) {
        $env:DATABASE_URL = Convert-ToPrismaSqliteUrl -FilePath $paths.BackendDbPath
    }

    Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('db:generate')

    $databasePath = Resolve-DatabaseFilePath -DefaultPath $paths.BackendDbPath -DatabaseUrl $env:DATABASE_URL
    if (-not (Test-Path $databasePath) -and (Test-Path $paths.BackendTemplateDbPath)) {
        New-Item -ItemType Directory -Path (Split-Path -Path $databasePath -Parent) -Force | Out-Null
        Copy-Item -Path $paths.BackendTemplateDbPath -Destination $databasePath -Force
    }

    if (Test-Path $databasePath) {
        Write-Host 'Syncing local SQLite schema...'
        Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('db:push')
    }
    else {
        Write-Host 'Creating local SQLite database from migrations...'
        Invoke-Pnpm -WorkingDirectory $paths.WebRoot -Arguments @('db:deploy')
    }

    if ($Launch) {
        Write-Host 'Launching ScheduleSync web app...'
        & 'powershell.exe' -NoLogo -ExecutionPolicy Bypass -File (Join-Path $paths.RepoRoot 'scripts\Launch-WebApp.ps1') -Mode Launch
        if ($LASTEXITCODE -ne 0) {
            throw "Launch-WebApp.ps1 failed with exit code $LASTEXITCODE."
        }
    }
    else {
        Write-Host 'Web workspace setup complete.'
    }
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
