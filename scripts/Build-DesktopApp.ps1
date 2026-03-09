[CmdletBinding()]
param(
    [string]$Configuration = 'Release',
    [string]$RuntimeIdentifier = 'win-x64',
    [switch]$SkipInstaller,
    [switch]$SkipWebViewBootstrapper
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return (Get-Command $Name -ErrorAction Stop).Source
}

function Invoke-External {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath $($Arguments -join ' ') failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}

function Ensure-EmptyDirectory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path $Path) {
        cmd.exe /c "rmdir /s /q `"$Path`"" | Out-Null
    }

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Copy-DirectoryContents {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Copy-Item (Join-Path $Source '*') -Destination $Destination -Recurse -Force
}

function Copy-DirectoryTree {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Source,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    & robocopy $Source $Destination /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy failed copying $Source to $Destination with exit code $LASTEXITCODE."
    }
}

function Remove-PathIfExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    if (Test-Path $Path) {
        $item = Get-Item $Path -Force
        if ($item.PSIsContainer) {
            cmd.exe /c "rmdir /s /q `"$Path`"" | Out-Null
        }
        else {
            Remove-Item $Path -Force
        }
    }
}

function Get-ProjectVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectPath
    )

    [xml]$projectXml = Get-Content $ProjectPath
    $version = $projectXml.Project.PropertyGroup.Version | Select-Object -First 1
    if (-not $version) {
        throw "Could not find <Version> in $ProjectPath."
    }

    return $version
}

function Remove-SourceMaps {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Root
    )

    if (-not (Test-Path $Root)) {
        return
    }

    Push-Location $Root
    try {
        cmd.exe /d /c "del /s /q *.map >nul 2>nul & exit /b 0" | Out-Null
    }
    finally {
        Pop-Location
    }

    Get-ChildItem $Root -Recurse -Force -File -Filter *.map -ErrorAction SilentlyContinue |
        ForEach-Object {
            try {
                Remove-Item $_.FullName -Force -ErrorAction Stop
            }
            catch {
            }
        }
}

function Sync-PrismaClientRuntime {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceNodeModules,
        [Parameter(Mandatory = $true)]
        [string]$DestinationNodeModules
    )

    $sourcePnpmRoot = Join-Path $SourceNodeModules '.pnpm'
    $destinationPnpmRoot = Join-Path $DestinationNodeModules '.pnpm'

    if (-not (Test-Path $sourcePnpmRoot) -or -not (Test-Path $destinationPnpmRoot)) {
        return
    }

    Get-ChildItem $sourcePnpmRoot -Directory |
        Where-Object { $_.Name -like '@prisma+client@*' } |
        ForEach-Object {
            $sourcePrismaDir = Join-Path $_.FullName 'node_modules\.prisma'
            $destinationClientRoot = Join-Path $destinationPnpmRoot $_.Name

            if ((Test-Path $sourcePrismaDir) -and (Test-Path $destinationClientRoot)) {
                $destinationPrismaDir = Join-Path $destinationClientRoot 'node_modules\.prisma'
                Copy-DirectoryTree -Source $sourcePrismaDir -Destination $destinationPrismaDir
            }
        }
}

function Assert-NoRunningBackendFromRepo {
    param(
        [Parameter(Mandatory = $true)]
        [string]$RepoRoot
    )

    $backendMarker = (Join-Path $RepoRoot 'web\packages\backend').ToLowerInvariant()
    $runningProcesses = @(
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Where-Object {
                $commandLine = $_.CommandLine
                $commandLine -and $commandLine.ToLowerInvariant().Contains($backendMarker)
            }
    )

    if ($runningProcesses.Count -gt 0) {
        $processList = $runningProcesses | ForEach-Object { "$($_.ProcessId): $($_.CommandLine)" }
        throw "Stop the running ScheduleSync backend before building the desktop app.`n$($processList -join [Environment]::NewLine)"
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $repoRoot 'web'
$desktopProject = Join-Path $repoRoot 'ScheduleSync.Desktop\ScheduleSync.Desktop.csproj'
$installerProject = Join-Path $repoRoot 'installer\ScheduleSync.Desktop.Installer.wixproj'
$artifactsRoot = Join-Path $repoRoot 'artifacts\desktop'
$workingRoot = Join-Path $env:SystemDrive 'ssdesk'
$publishRoot = Join-Path $workingRoot 'publish'
$runtimeRoot = Join-Path $publishRoot 'runtime'
$backendRuntimeRoot = Join-Path $runtimeRoot 'backend'
$frontendRuntimeRoot = Join-Path $runtimeRoot 'frontend'
$nodeRuntimeRoot = Join-Path $runtimeRoot 'node'
$installerOutputRoot = Join-Path $workingRoot 'installer'
$webViewBootstrapperPath = Join-Path $runtimeRoot 'MicrosoftEdgeWebView2Setup.exe'

$pnpm = Assert-Command 'pnpm'
$node = Assert-Command 'node'
$dotnet = Assert-Command 'dotnet'
$version = Get-ProjectVersion $desktopProject

Assert-NoRunningBackendFromRepo $repoRoot

Write-Host 'Preparing artifact directories...'
Ensure-EmptyDirectory $artifactsRoot
Ensure-EmptyDirectory $workingRoot
Ensure-EmptyDirectory $publishRoot
Ensure-EmptyDirectory $backendRuntimeRoot
Ensure-EmptyDirectory $frontendRuntimeRoot
Ensure-EmptyDirectory $nodeRuntimeRoot
Ensure-EmptyDirectory $installerOutputRoot

Write-Host 'Installing web workspace dependencies...'
Invoke-External -FilePath $pnpm -Arguments @('install', '--frozen-lockfile') -WorkingDirectory $webRoot

Write-Host 'Building shared web packages...'
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/engine', 'build') -WorkingDirectory $webRoot
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/mspdi', 'build') -WorkingDirectory $webRoot

Write-Host 'Generating Prisma client and building backend/frontend...'
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/backend', 'db:generate') -WorkingDirectory $webRoot
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/backend', 'build') -WorkingDirectory $webRoot
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/frontend', 'build') -WorkingDirectory $webRoot

Write-Host 'Creating deployable backend runtime...'
Invoke-External -FilePath $pnpm -Arguments @('--filter', '@schedulesync/backend', 'deploy', '--legacy', '--prod', $backendRuntimeRoot) -WorkingDirectory $webRoot
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'src')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'data')
Remove-PathIfExists (Join-Path $backendRuntimeRoot '.env')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'ai-config.json')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'tsconfig.json')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'vitest.config.ts')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\@schedulesync\backend\data')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\@schedulesync\backend\.env')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\@schedulesync\backend\ai-config.json')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\.pnpm\node_modules\@schedulesync\backend\data')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\.pnpm\node_modules\@schedulesync\backend\.env')
Remove-PathIfExists (Join-Path $backendRuntimeRoot 'node_modules\.pnpm\node_modules\@schedulesync\backend\ai-config.json')

Sync-PrismaClientRuntime -SourceNodeModules (Join-Path $webRoot 'node_modules') -DestinationNodeModules (Join-Path $backendRuntimeRoot 'node_modules')

Get-ChildItem $backendRuntimeRoot -Recurse -Force -File |
    Where-Object { $_.Extension -eq '.gguf' -or $_.Name -in @('.env', 'ai-config.json') } |
    Remove-Item -Force

Get-ChildItem $backendRuntimeRoot -Recurse -Force -Directory |
    Where-Object {
        $_.Name -eq 'data' -and $_.FullName -like '*@schedulesync*backend*'
    } |
    Remove-Item -Recurse -Force

Remove-SourceMaps $backendRuntimeRoot

Write-Host 'Copying frontend assets...'
Copy-DirectoryContents -Source (Join-Path $webRoot 'packages\frontend\dist') -Destination $frontendRuntimeRoot

Write-Host 'Copying Node runtime...'
Copy-Item $node -Destination (Join-Path $nodeRuntimeRoot 'node.exe') -Force

if (-not $SkipWebViewBootstrapper) {
    Write-Host 'Downloading WebView2 bootstrapper...'
    Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $webViewBootstrapperPath
}

Write-Host 'Publishing the WPF shell...'
Invoke-External -FilePath $dotnet -Arguments @(
    'publish',
    $desktopProject,
    '-c', $Configuration,
    '-r', $RuntimeIdentifier,
    '--self-contained', 'true',
    '-o', $publishRoot
) -WorkingDirectory $repoRoot
Remove-SourceMaps $publishRoot

if (-not $SkipInstaller) {
    Write-Host 'Building MSI installer...'
    Invoke-External -FilePath $dotnet -Arguments @(
        'build',
        $installerProject,
        '-c', $Configuration,
        "/p:PublishDir=$publishRoot\",
        "/p:InstallerOutputDir=$installerOutputRoot",
        "/p:ProductVersion=$version"
    ) -WorkingDirectory $repoRoot
}

$finalPublishRoot = Join-Path $artifactsRoot 'publish'
New-Item -ItemType Junction -Path $finalPublishRoot -Target $publishRoot | Out-Null

if (-not $SkipInstaller) {
    $finalInstallerRoot = Join-Path $artifactsRoot 'installer'
    Copy-DirectoryTree -Source $installerOutputRoot -Destination $finalInstallerRoot
}

Write-Host ''
Write-Host "Desktop publish folder: $finalPublishRoot"
if (-not $SkipInstaller) {
    Write-Host "Installer output folder: $finalInstallerRoot"
}
