$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3001'
$email = "cal2_$(Get-Random)@example.com"
$pw = 'Passw0rd!23'

function Show($label, $val) { [Console]::Out.WriteLine(("{0,-30} {1}" -f $label, $val)) }

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw; name = 'Cal2' } | ConvertTo-Json) | Out-Null
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }
$READ = "$base/api/calendar/events?startDate=2026-09-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z"

# 1) Assistant create_event end-to-end through the proxy.
$conv = Invoke-RestMethod -Uri "$base/api/assistant/conversations" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title = 'C2' } | ConvertTo-Json)
$raw = Invoke-WebRequest -UseBasicParsing -Uri "$base/api/assistant/message" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ message = 'Create event design review meeting'; conversationId = $conv.id } | ConvertTo-Json)
$prop = (($raw.Content | ConvertFrom-Json).proposedActions | Select-Object -First 1)
Show '1 proposed tool' "$($prop.toolName) $($prop.id)"
$cfm = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ conversationId = $conv.id; actionId = $prop.id; confirmed = $true } | ConvertTo-Json)
Show '1 confirm message' $cfm.message
$list = @((Invoke-RestMethod -Uri $READ -Headers $H))
Show '1 events visible to client' $list.Count

# 2) Raw serialization shape of start/end (BUILD_LOG mismatch #2).
$first = $list | Select-Object -First 1
Show '2 raw start type' ($first.start.GetType().Name)
Show '2 raw start json' ($first.start | ConvertTo-Json -Compress)
Show '2 raw category' $first.category
Show '2 raw color' $first.color

# 3) Category filter, which previously would have thrown on where.category.
try {
  $f = @((Invoke-RestMethod -Uri "$READ&category=MEETING" -Headers $H))
  Show '3 filter MEETING' "count=$($f.Count)"
  $f2 = @((Invoke-RestMethod -Uri "$READ&category=HOLIDAY" -Headers $H))
  Show '3 filter HOLIDAY' "count=$($f2.Count)"
} catch {
  Show '3 category filter' "FAILED: $($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)"
}

# 4) User scoping: a second user must not see the first user's events.
$emailB = "cal2b_$(Get-Random)@example.com"
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = $emailB; password = $pw; name = 'Cal2B' } | ConvertTo-Json) | Out-Null
$logB = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = $emailB; password = $pw } | ConvertTo-Json)
$HB = @{ Authorization = "Bearer $($logB.access_token)" }
$other = @((Invoke-RestMethod -Uri $READ -Headers $HB))
Show '4 other user event count' "$($other.Count) (expect 0)"