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

function Get-NodeModulesPackages {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeModulesPath
    )

    $packages = New-Object System.Collections.Generic.List[object]
    if (-not (Test-Path $NodeModulesPath)) {
        return $packages
    }

    Get-ChildItem $NodeModulesPath -Force |
        Where-Object { $_.PSIsContainer -and $_.Name -ne '.bin' } |
        ForEach-Object {
            if ($_.Name.StartsWith('@', [StringComparison]::Ordinal)) {
                Get-ChildItem $_.FullName -Force |
                    Where-Object { $_.PSIsContainer } |
                    ForEach-Object {
                        $packages.Add([pscustomobject]@{
                            Name = "$($_.Parent.Name)/$($_.Name)"
                            FullName = $_.FullName
                        })
                    }
            }
            else {
                $packages.Add([pscustomobject]@{
                    Name = $_.Name
                    FullName = $_.FullName
                })
            }
        }

    return $packages
}

function Get-PackageInstallPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeModulesRoot,
        [Parameter(Mandatory = $true)]
        [string]$PackageName
    )

    if ($PackageName.StartsWith('@', [StringComparison]::Ordinal)) {
        $segments = $PackageName.Split('/', 2)
        return Join-Path (Join-Path $NodeModulesRoot $segments[0]) $segments[1]
    }

    return Join-Path $NodeModulesRoot $PackageName
}

function Get-PnpmPackageContexts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeModulesRoot
    )

    $contexts = New-Object System.Collections.Generic.List[object]
    $pnpmRoot = Join-Path $NodeModulesRoot '.pnpm'
    if (-not (Test-Path $pnpmRoot)) {
        return $contexts
    }

    Get-ChildItem $pnpmRoot -Directory |
        ForEach-Object {
            $pnpmPackageRoot = $_
            $packageNodeModules = Join-Path $pnpmPackageRoot.FullName 'node_modules'
            $packages = @(Get-NodeModulesPackages -NodeModulesPath $packageNodeModules)
            if ($packages.Count -eq 0) {
                return
            }

            $primaryPackage = $packages |
                Where-Object {
                    $encodedName = $_.Name.Replace('/', '+')
                    $pnpmPackageRoot.Name.StartsWith("$encodedName@", [StringComparison]::Ordinal)
                } |
                Select-Object -First 1

            if (-not $primaryPackage) {
                return
            }

            $packageJsonPath = Join-Path $primaryPackage.FullName 'package.json'
            if (-not (Test-Path $packageJsonPath)) {
                return
            }

            $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
            $packageMap = @{}
            foreach ($package in $packages) {
                $packageMap[$package.Name] = $package.FullName
            }

            $contexts.Add([pscustomobject]@{
                Name = [string]$packageJson.name
                Version = [string]$packageJson.version
                PackageJson = $packageJson
                Packages = $packageMap
            })
        }

    return $contexts
}

function Get-PackageDependencyNames {
    param(
        [Parameter(Mandatory = $true)]
        [psobject]$PackageJson
    )

    $dependencyNames = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::Ordinal)
    foreach ($sectionName in @('dependencies', 'optionalDependencies', 'peerDependencies')) {
        $dependencyProperty = $PackageJson.PSObject.Properties[$sectionName]
        if ($null -eq $dependencyProperty) {
            continue
        }

        foreach ($property in $dependencyProperty.Value.PSObject.Properties) {
            [void]$dependencyNames.Add($property.Name)
        }
    }

    return $dependencyNames
}

function Get-PackageVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PackagePath
    )

    $packageJsonPath = Join-Path $PackagePath 'package.json'
    if (-not (Test-Path $packageJsonPath)) {
        return $null
    }

    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    return [string]$packageJson.version
}

function Resolve-InstalledDependencyPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallPath,
        [Parameter(Mandatory = $true)]
        [string]$PackageName
    )

    $currentPath = $InstallPath
    while ($true) {
        $candidatePath = Get-PackageInstallPath -NodeModulesRoot (Join-Path $currentPath 'node_modules') -PackageName $PackageName
        if (Test-Path $candidatePath) {
            return $candidatePath
        }

        $parentPath = Split-Path $currentPath -Parent
        if (-not $parentPath -or $parentPath -eq $currentPath) {
            return $null
        }

        $currentPath = $parentPath
    }
}

function Materialize-PnpmPackageInstallPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$InstallPath,
        [Parameter(Mandatory = $true)]
        [object[]]$Contexts,
        [AllowEmptyCollection()]
        [Parameter(Mandatory = $true)]
        [System.Collections.Generic.HashSet[string]]$Visited
    )

    $packageJsonPath = Join-Path $InstallPath 'package.json'
    if (-not (Test-Path $packageJsonPath)) {
        return
    }

    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    $visitKey = "$($packageJson.name)|$($packageJson.version)|$InstallPath"
    if ($Visited.Contains($visitKey)) {
        return
    }

    [void]$Visited.Add($visitKey)

    $context = $Contexts |
        Where-Object { $_.Name -eq $packageJson.name -and $_.Version -eq $packageJson.version } |
        Select-Object -First 1

    if (-not $context) {
        return
    }

    $packageLocalNodeModules = Join-Path $InstallPath 'node_modules'
    foreach ($dependencyName in Get-PackageDependencyNames -PackageJson $context.PackageJson) {
        if (-not $context.Packages.ContainsKey($dependencyName)) {
            continue
        }

        $dependencySourcePath = $context.Packages[$dependencyName]
        $sourceVersion = Get-PackageVersion -PackagePath $dependencySourcePath
        $resolvedDependencyPath = Resolve-InstalledDependencyPath -InstallPath $InstallPath -PackageName $dependencyName
        $resolvedVersion = if ($resolvedDependencyPath) { Get-PackageVersion -PackagePath $resolvedDependencyPath } else { $null }

        if ($resolvedDependencyPath -and $resolvedVersion -eq $sourceVersion) {
            continue
        }

        $dependencyDestination = Get-PackageInstallPath -NodeModulesRoot $packageLocalNodeModules -PackageName $dependencyName
        if (-not (Test-Path $dependencyDestination)) {
            Copy-DirectoryTree -Source $dependencySourcePath -Destination $dependencyDestination
        }

        Materialize-PnpmPackageInstallPath -InstallPath $dependencyDestination -Contexts $Contexts -Visited $Visited
    }
}

function Materialize-PnpmPackageDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeModulesRoot
    )

    $contexts = @(Get-PnpmPackageContexts -NodeModulesRoot $NodeModulesRoot)
    if ($contexts.Count -eq 0) {
        return
    }

    $visited = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($rootPackage in Get-NodeModulesPackages -NodeModulesPath $NodeModulesRoot) {
        if ($rootPackage.Name -eq '@schedulesync/backend' -or $rootPackage.Name -eq '@schedulesync/engine' -or $rootPackage.Name -eq '@schedulesync/mspdi') {
            continue
        }

        Materialize-PnpmPackageInstallPath -InstallPath $rootPackage.FullName -Contexts $contexts -Visited $visited
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

function Hoist-PnpmDependencies {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodeModulesRoot
    )

    $pnpmRoot = Join-Path $NodeModulesRoot '.pnpm'
    if (-not (Test-Path $pnpmRoot)) {
        return
    }

    Get-ChildItem $pnpmRoot -Directory |
        ForEach-Object {
            $packageNodeModules = Join-Path $_.FullName 'node_modules'
            if (Test-Path $packageNodeModules) {
                Get-NodeModulesPackages -NodeModulesPath $packageNodeModules |
                    ForEach-Object {
                        if ($_.Name -ne '@schedulesync/backend' -and $_.Name -ne '@schedulesync/engine' -and $_.Name -ne '@schedulesync/mspdi') {
                            $destinationPath = Get-PackageInstallPath -NodeModulesRoot $NodeModulesRoot -PackageName $_.Name
                            if (-not (Test-Path $destinationPath)) {
                                Copy-DirectoryTree -Source $_.FullName -Destination $destinationPath
                            }
                        }
                    }
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

$backendPrismaSource = Join-Path $webRoot 'packages\backend\prisma'
$backendPrismaRuntimeRoot = Join-Path $backendRuntimeRoot 'prisma'
Ensure-EmptyDirectory $backendPrismaRuntimeRoot
Copy-DirectoryContents -Source (Join-Path $backendPrismaSource 'migrations') -Destination (Join-Path $backendPrismaRuntimeRoot 'migrations')
Copy-Item (Join-Path $backendPrismaSource 'schema.prisma') -Destination (Join-Path $backendPrismaRuntimeRoot 'schema.prisma') -Force
Copy-Item (Join-Path $backendPrismaSource 'dev-template.db') -Destination (Join-Path $backendPrismaRuntimeRoot 'dev-template.db') -Force
Remove-PathIfExists (Join-Path $backendPrismaRuntimeRoot 'dev.db')

Sync-PrismaClientRuntime -SourceNodeModules (Join-Path $webRoot 'node_modules') -DestinationNodeModules (Join-Path $backendRuntimeRoot 'node_modules')
Hoist-PnpmDependencies -NodeModulesRoot (Join-Path $backendRuntimeRoot 'node_modules')
Materialize-PnpmPackageDependencies -NodeModulesRoot (Join-Path $backendRuntimeRoot 'node_modules')

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
