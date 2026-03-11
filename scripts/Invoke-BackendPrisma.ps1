[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, ValueFromRemainingArguments = $true)]
    [string[]]$PrismaArguments
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Convert-ToPrismaSqliteUrl {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath
    )

    return "file:$($FilePath.Replace('\', '/'))"
}

function Remove-DerivedScheduleKnowledgeTables {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DatabasePath
    )

    if (-not (Test-Path $DatabasePath)) {
        return
    }

    $dropScript = @'
const { DatabaseSync } = require("node:sqlite");

const databasePath = process.argv[2];
const database = new DatabaseSync(databasePath);

try {
  database.exec('DROP TABLE IF EXISTS "AiScheduleChunkFts"');
} finally {
  database.close();
}
'@

    $tempScriptPath = [System.IO.Path]::ChangeExtension([System.IO.Path]::GetTempFileName(), '.cjs')

    try {
        Set-Content -Path $tempScriptPath -Value $dropScript -Encoding utf8

        & 'node' $tempScriptPath $DatabasePath
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to drop derived schedule knowledge tables from $DatabasePath."
        }
    }
    finally {
        Remove-Item $tempScriptPath -ErrorAction SilentlyContinue
    }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$webRoot = Join-Path $repoRoot 'web'
$backendDbPath = Join-Path $webRoot 'packages\backend\prisma\dev.db'

if (-not $env:DATABASE_URL) {
    $env:DATABASE_URL = Convert-ToPrismaSqliteUrl -FilePath $backendDbPath
}

Push-Location $webRoot
try {
    $pnpmArguments = switch (($PrismaArguments -join ' ')) {
        'generate' { @('--filter', '@schedulesync/backend', 'db:generate') }
        'migrate deploy' { @('--filter', '@schedulesync/backend', 'db:deploy') }
        'db push' {
            Remove-DerivedScheduleKnowledgeTables -DatabasePath $backendDbPath
            @('--filter', '@schedulesync/backend', 'db:push')
        }
        default { throw "Unsupported Prisma command: $($PrismaArguments -join ' ')." }
    }

    & 'pnpm' @pnpmArguments
    if ($LASTEXITCODE -ne 0) {
        throw "prisma $($PrismaArguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}
finally {
    Pop-Location
}
