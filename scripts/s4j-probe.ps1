# Stage 4j live probe: the two calendar-boundary fixes carried from Stage 3/4 notes.
#  (A) DateTime.toJSON(): start/end serialise as bare ISO-8601, never {_utc,_timeZone}.
#  (B) EntityIdSchema: an id-bearing create (Prisma CUID calendarId) passes the zod boundary.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$email = "s4j_$(Get-Random)@example.com"
$pw = 'Probe!2345'
$fail = 0
function Check([bool]$cond, [string]$label) {
  if ($cond) { Write-Output "PASS  $label" }
  else { Write-Output "FAIL  $label"; $script:fail++ }
}

$null = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password=$pw; name='S4j Probe' } | ConvertTo-Json)
$tok = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password=$pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($tok.access_token)" }

# --- (B) seed a real calendar row: LOCAL connect + sync (the 4i path) gives a CUID id.
$null = Invoke-RestMethod -Uri "$base/api/calendar/callback/LOCAL" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ code='probe-code'; state='unused' } | ConvertTo-Json)
$null = Invoke-RestMethod -Uri "$base/api/calendar/sync/LOCAL" -Method Post -Headers $H
$cals = Invoke-RestMethod -Uri "$base/api/calendar/calendars" -Headers $H
$calId = @($cals)[0].id
Check ($calId -and $calId -notmatch '-') "B0 seeded calendar id=$calId (cuid-shaped)"

# --- (A1) POST event (no calendarId): raw response start/end must be strings.
$body = @{ title='S4j iso check'; start='2026-10-06T10:00:00.000Z'; end='2026-10-06T11:00:00.000Z'; timeZone='UTC' } | ConvertTo-Json
$evt = Invoke-RestMethod -Uri "$base/api/calendar/events" -Method Post -Headers $H -ContentType 'application/json' -Body $body
$rawStart = (Invoke-WebRequest -Uri "$base/api/calendar/events/$($evt.id)" -Headers $H -UseBasicParsing).Content
Check ($evt.start -is [string]) "A1 POST response start is a bare string ($($evt.start))"
Check ($rawStart -notmatch '_utc' -and $rawStart -notmatch '_timeZone') "A1 GET by id raw JSON has no _utc/_timeZone"
Check ($rawStart -match '"start":"2026-10-06T10:00:00.000Z"') "A1 start round-trips as exact ISO"

# --- (A2) list endpoint shape (this is what cal2/cal3 observed as PSCustomObject pre-fix).
$listRaw = (Invoke-WebRequest -Uri "$base/api/calendar/events?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z" -Headers $H -UseBasicParsing).Content
Check ($listRaw -notmatch '_utc') "A2 GET /events list raw JSON has no _utc wrapper"
$ls = $listRaw | ConvertFrom-Json
Check (@($ls).Count -ge 1 -and @($ls)[0].start -is [string]) "A2 list start is a string"

# --- (B1) id-bearing create with a Prisma CUID calendarId (pre-fix: z.string().uuid() -> 400).
$b1 = @{ title='S4j cuid create'; start='2026-10-07T09:00:00.000Z'; end='2026-10-07T10:00:00.000Z'; calendarId=$calId } | ConvertTo-Json
$e1 = Invoke-RestMethod -Uri "$base/api/calendar/events" -Method Post -Headers $H -ContentType 'application/json' -Body $b1
Check ([bool]$e1.id) "B1 create with CUID calendarId accepted (id=$($e1.id))"
Check ($e1.calendarId -eq $calId) "B1 calendarId persisted"

# --- (B2) boundary still rejects garbage: empty-string calendarId must not sneak through.
try {
  $b2 = @{ title='S4j bad'; start='2026-10-07T09:00:00.000Z'; end='2026-10-07T10:00:00.000Z'; calendarId='' } | ConvertTo-Json
  $null = Invoke-RestMethod -Uri "$base/api/calendar/events" -Method Post -Headers $H -ContentType 'application/json' -Body $b2
  Check $false "B2 empty calendarId -> expected 400, got 2xx"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  Check ($code -eq 400) "B2 empty calendarId -> $code (expect 400)"
}

# --- (A3) recurrence exceptionDates / participants responseAt also bare (same class).
$rawAll = (Invoke-WebRequest -Uri "$base/api/calendar/events?startDate=2026-10-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z" -Headers $H -UseBasicParsing).Content
Check ($rawAll -notmatch '"_utc"') "A3 no _utc anywhere in the events payload"

Write-Output "=================================================="
if ($fail -eq 0) { Write-Output "S4J PROBE: ALL PASS" } else { Write-Output "S4J PROBE: $fail FAILURES"; exit 1 }
