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
        'db push' { @('--filter', '@schedulesync/backend', 'db:push') }
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
