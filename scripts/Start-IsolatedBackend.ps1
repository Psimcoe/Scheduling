[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [int]$Port,
    [Parameter(Mandatory = $true)]
    [string]$DataDir,
    [string]$BindHost = '127.0.0.1',
    [string]$WebRoot,
    [string]$StaticDir,
    [int]$ReadyTimeoutSeconds = 60
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $WebRoot) {
    $WebRoot = Join-Path $PSScriptRoot '..\web'
}

if (-not $StaticDir) {
    $StaticDir = Join-Path $PSScriptRoot '..\web\packages\frontend\dist'
}

function Get-NodeCommand {
    $nodeCommand = Get-Command 'node' -ErrorAction SilentlyContinue
    if ($nodeCommand) {
        return $nodeCommand.Source
    }

    $commonPaths = @(
        'C:\Program Files\nodejs\node.exe',
        'C:\Program Files (x86)\nodejs\node.exe',
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

    throw 'Node.js was not found.'
}

$resolvedDataDir = (Resolve-Path -LiteralPath (New-Item -ItemType Directory -Path $DataDir -Force)).Path
$resolvedWebRoot = (Resolve-Path -LiteralPath $WebRoot).Path
$resolvedStaticDir = (Resolve-Path -LiteralPath $StaticDir).Path
$backendRoot = Join-Path $resolvedWebRoot 'packages\backend'
$serverScript = Join-Path $backendRoot 'dist\server.js'
$logDir = Join-Path $resolvedDataDir 'logs'
$stdoutPath = Join-Path $logDir 'backend.out.log'
$stderrPath = Join-Path $logDir 'backend.err.log'

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (-not (Test-Path $serverScript)) {
    throw "Backend build output was not found at $serverScript."
}

$nodeCommand = Get-NodeCommand

$previousPort = $env:PORT
$previousHost = $env:HOST
$previousDataDir = $env:SCHEDULESYNC_DATA_DIR
$previousStaticDir = $env:SCHEDULESYNC_STATIC_DIR

try {
    $env:PORT = $Port.ToString()
    $env:HOST = $BindHost
    $env:SCHEDULESYNC_DATA_DIR = $resolvedDataDir
    $env:SCHEDULESYNC_STATIC_DIR = $resolvedStaticDir

    $process = Start-Process -FilePath $nodeCommand -ArgumentList 'dist/server.js' -WorkingDirectory $backendRoot -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
}
finally {
    $env:PORT = $previousPort
    $env:HOST = $previousHost
    $env:SCHEDULESYNC_DATA_DIR = $previousDataDir
    $env:SCHEDULESYNC_STATIC_DIR = $previousStaticDir
}

$deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
do {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod -Uri "http://$BindHost`:$Port/api/health" -TimeoutSec 5
        [pscustomobject]@{
            pid = $process.Id
            port = $Port
            dataDir = $resolvedDataDir
            status = $health.status
            stdout = $stdoutPath
            stderr = $stderrPath
        }
        exit 0
    }
    catch {
    }
} while ((Get-Date) -lt $deadline)

$stderr = if (Test-Path $stderrPath) { Get-Content $stderrPath -Raw } else { '' }
throw "The isolated backend did not become ready on port $Port. $stderr"
