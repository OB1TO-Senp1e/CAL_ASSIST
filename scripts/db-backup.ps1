[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$')]
  [string]$ProjectName,

  [string]$DestinationDirectory = '.\backups'
)

$ErrorActionPreference = 'Stop'
$destination = [System.IO.Path]::GetFullPath($DestinationDirectory)
New-Item -ItemType Directory -Path $destination -Force | Out-Null

$containerId = (& docker compose -p $ProjectName ps -q postgres).Trim()
if ($LASTEXITCODE -ne 0 -or -not $containerId) {
  throw "No running PostgreSQL container found for Compose project $ProjectName."
}
$containerEnvironment = & docker inspect --format '{{json .Config.Env}}' $containerId | ConvertFrom-Json
$values = @{}
foreach ($entry in $containerEnvironment) {
  $parts = $entry.Split('=', 2)
  $values[$parts[0]] = $parts[1]
}
$postgresUser = if ($values.POSTGRES_USER) { $values.POSTGRES_USER } else { 'postgres' }
$postgresDatabase = if ($values.POSTGRES_DB) { $values.POSTGRES_DB } else { $postgresUser }
if ($postgresUser -notmatch '^[A-Za-z_][A-Za-z0-9_$-]{0,62}$' -or
    $postgresDatabase -notmatch '^[A-Za-z_][A-Za-z0-9_$-]{0,62}$') {
  throw 'PostgreSQL container user or database name is not a supported identifier.'
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupName = "calassist-$timestamp-$([guid]::NewGuid().ToString('N')).dump"
$containerPath = "/tmp/$backupName"
$backupPath = Join-Path $destination $backupName

try {
  & docker exec $containerId pg_dump -Fc -U $postgresUser -d $postgresDatabase -f $containerPath
  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE."
  }

  & docker exec $containerId pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The generated PostgreSQL archive failed pg_restore validation.'
  }

  & docker cp "${containerId}:$containerPath" $backupPath
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath)) {
    throw 'Could not copy the verified database archive to the destination.'
  }
  if ((Get-Item -LiteralPath $backupPath).Length -eq 0) {
    throw 'The database archive is empty.'
  }

  Write-Output "Verified PostgreSQL custom-format backup: $backupPath"
}
finally {
  & docker exec $containerId rm -f $containerPath 2>$null | Out-Null
}
