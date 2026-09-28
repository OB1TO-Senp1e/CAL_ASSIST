$base = 'http://localhost:3000'
$email = "s4g_$(Get-Random)@example.com"
function Step([string]$label, [scriptblock]$body) {
  try { & $body } catch {
    $detail = $_.Exception.Message
    if ($_.Exception.Response) { try { $sr = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $detail += " BODY: $($sr.ReadToEnd())" } catch {} }
    Write-Output "$label FAILED: $detail"
  }
}
$login = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password='Probe!2345'; name='S4 Gate' } | ConvertTo-Json)
$tok = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email=$email; password='Probe!2345' } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($tok.access_token)" }
Step '1' { $e1 = Invoke-RestMethod -Uri "$base/api/calendar/events?startDate=2026-09-01T00:00:00.000Z&endDate=2026-10-31T00:00:00.000Z" -Headers $H; Write-Output "1 events startDate/endDate     OK count=$(@($e1).Count)" }
Step '2' { $e2 = Invoke-RestMethod -Uri "$base/api/calendar/events?timeMin=2026-09-01T00:00:00.000Z&timeMax=2026-10-31T00:00:00.000Z" -Headers $H; Write-Output "2 events timeMin/timeMax       OK count=$(@($e2).Count)" }
Step '3' {
  $evt = Invoke-RestMethod -Uri "$base/api/calendar/events" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title='S4 gate event'; start='2026-10-06T10:00:00.000Z'; end='2026-10-06T11:00:00.000Z' } | ConvertTo-Json)
  Write-Output "3 POST event                   OK id=$($evt.id)"
  $upd = Invoke-RestMethod -Uri "$base/api/calendar/events/$($evt.id)" -Method Patch -Headers $H -ContentType 'application/json' -Body (@{ status='CONFIRMED'; source='USER' } | ConvertTo-Json)
  Write-Output "4 PATCH status+source          OK status=$($upd.status) source=$($upd.source)"
}
Step '5' {
  $cals = Invoke-RestMethod -Uri "$base/api/calendar/calendars" -Headers $H
  Write-Output "5 GET calendars                OK count=$(@($cals).Count)"
  if (@($cals).Count -gt 0) {
    $c = @($cals)[0]
    $vis = Invoke-RestMethod -Uri "$base/api/calendar/calendars/$($c.id)/visibility" -Method Patch -Headers $H -ContentType 'application/json' -Body (@{ isVisible = -not $c.isVisible } | ConvertTo-Json)
    Write-Output "6 PATCH visibility             OK isVisible=$($vis.isVisible)"
  } else { Write-Output "6 PATCH visibility             SKIP no calendars" }
}
Step '7' {
  # compile operates on existing work; a brand-new user has none and the API
  # correctly answers 400 "No tasks to schedule". Create one first.
  $task = Invoke-RestMethod -Uri "$base/api/tasks" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title='S4 gate task'; priority=5; estimatedDurationMin=45 } | ConvertTo-Json)
  $prop = Invoke-RestMethod -Uri "$base/api/time-compiler/compile" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ timeRange=@{ start='2026-10-06T09:00:00.000Z'; end='2026-10-06T17:00:00.000Z' }; timezone='UTC'; taskIds=@($task.id) } | ConvertTo-Json -Depth 5)
  Write-Output "7 POST compile                 OK status=$($prop.proposal.status) blocks=$(@($prop.proposal.proposedBlocks).Count)"
  $ap = Invoke-RestMethod -Uri "$base/api/time-compiler/proposals/$($prop.proposal.id)/apply" -Method Patch -Headers $H -ContentType 'application/json'
  Write-Output "7b PATCH apply                OK status=$($ap.status)"
}
Step '8' { $rc = Invoke-RestMethod -Uri "$base/api/reality/check" -Headers $H; Write-Output "8 GET reality check            OK deviations=$(@($rc.deviations).Count)" }
Step '9' { $pi = Invoke-RestMethod -Uri "$base/api/proactive/check" -Headers $H; Write-Output "9 GET proactive check          OK interventions=$(@($pi.interventions).Count)" }
Step '10' { $ev = Invoke-RestMethod -Uri "$base/api/daily/evening" -Headers $H; Write-Output "10 GET daily evening           OK adjustments=$(@($ev.scheduleAdjustments).Count)" }
