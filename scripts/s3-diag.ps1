$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3000'
$em = "diag_$(Get-Random)@example.com"; $pw = 'Passw0rd!23'
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' `
  -Body (@{ email = $em; password = $pw; name = 'Diag' } | ConvertTo-Json) | Out-Null
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{ email = $em; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }
$day = (Get-Date).ToString('yyyy-MM-dd')
$tmr = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')

$t = Invoke-RestMethod -Uri "$base/api/tasks" -Method Post -Headers $H -ContentType 'application/json' `
  -Body (@{ title = 'Diag task'; priority = 8; estimatedDurationMin = 60 } | ConvertTo-Json)

function Probe($name, $method, $url, $obj) {
  Write-Output ''
  Write-Output ("##### {0}  {1} {2}" -f $name, $method, $url)
  $body = if ($null -ne $obj) { $obj | ConvertTo-Json -Depth 10 -Compress } else { $null }
  if ($body) { Write-Output "REQ: $body" } else { Write-Output 'REQ: (none)' }
  try {
    if ($body) {
      $r = Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -ContentType 'application/json' -Body $body -UseBasicParsing
    } else {
      $r = Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -UseBasicParsing
    }
    $c = $r.Content; if ($c.Length -gt 500) { $c = $c.Substring(0,500) + '...' }
    Write-Output "RES $($r.StatusCode): $c"
  } catch {
    $resp = $_.Exception.Response
    $txt = ''
    try {
      $st = $resp.GetResponseStream(); $st.Position = 0
      $sr = New-Object System.IO.StreamReader($st); $txt = $sr.ReadToEnd()
    } catch { $txt = '<no body: ' + $_.Exception.Message + '>' }
    if ($txt.Length -gt 900) { $txt = $txt.Substring(0,900) }
    Write-Output ("RES ERR {0}: {1}" -f $resp.StatusCode.value__, $txt)
  }
}

Probe '3e compile' Post '/api/time-compiler/compile' @{
  timeRange = @{ start = "$($day)T09:00:00.000Z"; end = "$($day)T17:00:00.000Z" }
  timezone = 'UTC'; taskIds = @($t.id)
  preferences = @{ workingHoursStart = '09:00'; workingHoursEnd = '17:00' }
}
Probe '3f commitments' Post '/api/commitments' @{
  title = 'Deliver audit deck'; deadline = "$($tmr)T12:00:00.000Z"; source = 'USER'
}
Probe '3h memory' Post '/api/memory' @{
  category = 'PREFERENCE'; key = 'probe-lang'; value = 'Prefers morning deep work'; source = 'USER'
}
Probe '3i rules' Post '/api/rules' @{
  name = 'No meetings before 10'; ruleType = 'AVAILABILITY'; description = 'Protect mornings'
  priority = 5; isActive = $true; conditions = @{}; actions = @{}
}
Probe '3i nl-rule' Post '/api/rules/from-natural-language' @{ naturalLanguage = 'Never schedule anything on Sunday' }
Probe '3l prepare' Post '/api/meetings/prepare' @{
  eventId = 'probe-event'; title = 'Q3 Planning'; startTime = "$($day)T14:00:00.000Z"; attendees = @('Sam')
}
