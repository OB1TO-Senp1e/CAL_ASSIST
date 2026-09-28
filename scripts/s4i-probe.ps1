# Stage 4i live probe: connections token scrub + per-calendar delta sync.
# Exercises the LOCAL adapter path end-to-end (connect -> sync -> re-sync -> disconnect)
# against the running backend, asserting no OAuth/delta material leaves the server.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$email = "s4i_$(Get-Random)@example.com"
$pw = 'Probe!2345'
$fail = 0

function Check([bool]$cond, [string]$label) {
  if ($cond) { Write-Output "PASS  $label" }
  else { Write-Output "FAIL  $label"; $script:fail++ }
}
function KeysOf($obj) {
  $set = New-Object 'System.Collections.Generic.HashSet[string]'
  $walk = {
    param($v)
    if ($v -is [array]) { foreach ($i in $v) { & $walk $i }; return }
    if ($v -is [System.Management.Automation.PSCustomObject]) {
      foreach ($p in $v.PSObject.Properties) {
        [void]$set.Add($p.Name)
        & $walk $p.Value
      }
    }
  }
  & $walk $obj
  return $set
}

$null = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password=$pw; name='S4i Probe' } | ConvertTo-Json)
$tok = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password=$pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($tok.access_token)" }
$userId = $tok.user.id
if (-not $userId) { $u = Invoke-RestMethod -Uri "$base/api/users/me" -Headers $H; $userId = $u.id }
Write-Output "user id: $userId"

$FORBIDDEN = @('accessToken','refreshToken','syncToken')

# 1. Fresh user: empty connections list.
$conns0 = Invoke-RestMethod -Uri "$base/api/calendar/connections" -Headers $H
Check (@($conns0).Count -eq 0) "1 GET connections (fresh) empty"

# 2. Connect via LOCAL callback (writes accessToken/refreshToken server-side).
$cb = Invoke-RestMethod -Uri "$base/api/calendar/callback/LOCAL" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ code='probe-code'; state='unused' } | ConvertTo-Json)
Check ($cb.success -eq $true) "2 POST callback/LOCAL connects"

# 3. THE SCRUB: GET /connections must not expose token fields, incl. nested calendars.
$conns = Invoke-RestMethod -Uri "$base/api/calendar/connections" -Headers $H
$k = KeysOf $conns
foreach ($f in $FORBIDDEN) { Check (-not $k.Contains($f)) "3 GET connections leaks no $f" }
Check ($k.Contains('tokenExpiresAt')) "3b GET connections keeps tokenExpiresAt (UI health)"
Check ($k.Contains('syncError')) "3c GET connections keeps syncError"
Check ($k.Contains('isActive')) "3d GET connections keeps isActive"
Check (@($conns).Count -eq 1 -and @($conns[0].calendars).Count -ge 0) "3e connection present with calendars array"

# 4. Same scrub on the single-provider route.
$one = Invoke-RestMethod -Uri "$base/api/calendar/connections/LOCAL" -Headers $H
$k2 = KeysOf $one
foreach ($f in $FORBIDDEN) { Check (-not $k2.Contains($f)) "4 GET connections/LOCAL leaks no $f" }

# 5. Sync (Stage 4i rewrite: DB rows fed to syncCalendarEvents; pre-4i this 500'd
#    on the calendarId FK because raw provider objects were used).
try {
  $sy = Invoke-RestMethod -Uri "$base/api/calendar/sync/LOCAL" -Method Post -Headers $H
  Check ($sy.calendarsSynced -ge 1) "5 POST sync/LOCAL -> calendarsSynced=$($sy.calendarsSynced)"
} catch { Check $false "5 POST sync/LOCAL threw: $($_.ErrorDetails.Message)" }

# 6. Second sync = delta path (stored Calendar.syncToken now feeds listEvents).
try {
  $sy2 = Invoke-RestMethod -Uri "$base/api/calendar/sync/LOCAL" -Method Post -Headers $H
  Check ($sy2.calendarsSynced -ge 1) "6 re-sync (delta) -> calendarsSynced=$($sy2.calendarsSynced)"
} catch { Check $false "6 re-sync threw: $($_.ErrorDetails.Message)" }

# 7. sync/all must not error and must not leak tokens in its summary.
try {
  $sa = Invoke-RestMethod -Uri "$base/api/calendar/sync/all" -Method Post -Headers $H
  $k3 = KeysOf $sa
  Check (-not $k3.Contains('syncToken')) "7 POST sync/all response has no syncToken"
} catch { Check $false "7 POST sync/all threw: $($_.ErrorDetails.Message)" }

# 8. GET /calendars (flatMap over getAllConnections) must be scrubbed too.
$cals = Invoke-RestMethod -Uri "$base/api/calendar/calendars" -Headers $H
$k4 = KeysOf $cals
foreach ($f in $FORBIDDEN) { Check (-not $k4.Contains($f)) "8 GET calendars leaks no $f" }
Check (@($cals).Count -ge 1) "8b GET calendars count=$(@($cals).Count)"

# 9. DB-side truth: scrub is a projection, not data loss. Tokens + the per-
#    calendar delta cursor must still exist in Postgres while connected.
$db = & node scripts/s4i-check-db.js $userId
$dbExit = $LASTEXITCODE
Write-Output $db
Check ($dbExit -eq 0) "9 DB truth: tokens + Calendar.syncToken persisted"

# 10. Disconnect, then connections empty again.
$null = Invoke-RestMethod -Uri "$base/api/calendar/connections/LOCAL" -Method Delete -Headers $H
$connsEnd = Invoke-RestMethod -Uri "$base/api/calendar/connections" -Headers $H
Check (@($connsEnd).Count -eq 0) "10 DELETE connection -> list empty"
Write-Output "=================================================="
if ($fail -eq 0) { Write-Output "S4I PROBE: ALL PASS" } else { Write-Output "S4I PROBE: $fail FAILURES"; exit 1 }
