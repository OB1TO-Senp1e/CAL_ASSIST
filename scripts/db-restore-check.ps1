[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,62}$')]
  [string]$ProjectName,

  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string]$BackupPath
)

$ErrorActionPreference = 'Stop'
$backup = (Resolve-Path -LiteralPath $BackupPath).Path
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
if ($postgresUser -notmatch '^[A-Za-z_][A-Za-z0-9_$-]{0,62}$') {
  throw 'PostgreSQL container user is not a supported identifier.'
}

$backupName = "calassist-restore-$([guid]::NewGuid().ToString('N')).dump"
$containerPath = "/tmp/$backupName"
$restoreDatabase = "calassist_restore_$([guid]::NewGuid().ToString('N'))"
$databaseCreated = $false
$backupCopied = $false

try {
  & docker cp $backup "${containerId}:$containerPath"
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not copy the database archive into the PostgreSQL container.'
  }
  $backupCopied = $true

  & docker exec $containerId pg_restore --list $containerPath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'The supplied file is not a valid PostgreSQL custom-format archive.'
  }

  & docker exec $containerId createdb -U $postgresUser $restoreDatabase
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create isolated restore-check database $restoreDatabase."
  }
  $databaseCreated = $true

  & docker exec $containerId pg_restore --exit-on-error --no-owner -U $postgresUser -d $restoreDatabase $containerPath
  if ($LASTEXITCODE -ne 0) {
    throw "Restoration into isolated database $restoreDatabase failed."
  }

  $countQuery = "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  $tableCount = & docker exec $containerId psql -U $postgresUser -d $restoreDatabase -Atc $countQuery
  if ($LASTEXITCODE -ne 0 -or [int]$tableCount -lt 1) {
    throw 'Restore completed but the isolated database contains no public tables.'
  }

  Write-Output "PASS: restored archive into isolated database and verified $tableCount public tables."
}
finally {
  if ($databaseCreated) {
    & docker exec $containerId dropdb --if-exists -U $postgresUser $restoreDatabase 2>$null | Out-Null
  }
  if ($backupCopied) {
    & docker exec $containerId rm -f $containerPath 2>$null | Out-Null
  }
}
