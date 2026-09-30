$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3001'
$email = "calchk_$(Get-Random)@example.com"
$pw = 'Passw0rd!23'

function Show($label, $val) { [Console]::Out.WriteLine(("{0,-30} {1}" -f $label, $val)) }

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw; name = 'CalChk' } | ConvertTo-Json) | Out-Null
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }

$READ = "$base/api/calendar/events?startDate=2026-09-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z"

# A) GET the client calendar read path (should be empty for a brand-new user).
try {
  $r = Invoke-RestMethod -Uri $READ -Headers $H
  Show 'A GET /api/calendar/events' "HTTP OK count=$(@($r).Count)"
} catch {
  Show 'A GET /api/calendar/events' "FAILED: $($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)"
}

# B) Direct CalendarService write via POST (previously a 500).
$evtBody = @{
  title    = 'Direct Calendar Write'
  start    = '2026-10-01T10:00:00.000Z'
  end      = '2026-10-01T11:00:00.000Z'
  timeZone = 'UTC'
  category = 'MEETING'
  color    = '#6366f1'
} | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Uri "$base/api/calendar/events" -Method Post -Headers $H -ContentType 'application/json' -Body $evtBody
  Show 'B POST /api/calendar/events' "HTTP OK id=$($r.id)"
  Show '   category persisted' $r.category
  Show '   color persisted' $r.color
} catch {
  Show 'B POST /api/calendar/events' "FAILED: $($_.Exception.Response.StatusCode.value__)"
  Show '   error body' "$($_.ErrorDetails.Message)"
}

# C) The client's read path must now see it, normalised.
try {
  $r = @((Invoke-RestMethod -Uri $READ -Headers $H))
  Show 'C read after POST' "count=$($r.Count)"
  $mine = $r | Where-Object { $_.title -eq 'Direct Calendar Write' } | Select-Object -First 1
  Show '   category on read' $mine.category
  Show '   color on read' $mine.color
} catch {
  Show 'C read after POST' "FAILED: $($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)"
}
