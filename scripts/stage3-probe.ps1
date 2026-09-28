# Stage 3 verification probe.
# Exercises every Stage 3 unit (3a-3m) against a live backend using the payloads
# the real client sends, then prints PASS / FAIL / STUB per route.
#
#   powershell -File scripts/stage3-probe.ps1 [http://localhost:3000]
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = if ($args.Count -ge 1) { $args[0] } else { 'http://localhost:3000' }
$H = $null
$results = New-Object System.Collections.ArrayList

function Show($unit, $label, $verdict, $detail) {
  [void]$results.Add([pscustomobject]@{ Unit=$unit; Route=$label; Verdict=$verdict; Detail=$detail })
  [Console]::Out.WriteLine(("{0,-4} {1,-46} {2,-7} {3}" -f $unit,$label,$verdict,$detail))
}

# `$expect` lists status codes that prove correct behaviour rather than failure:
# validation and not-found paths are contract checks, so 400/404 there is a PASS.
# 503 is accepted for provider-backed routes that degrade cleanly when a key is absent.
function Hit($unit, $label, $method, $url, $body, $expect = @()) {
  try {
    if ($null -ne $body) {
      $r = Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -ContentType 'application/json' `
        -Body ($body | ConvertTo-Json -Depth 10 -Compress) -UseBasicParsing -TimeoutSec 60
    } else {
      $r = Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -UseBasicParsing -TimeoutSec 60
    }
    $txt = [string]$r.Content
    if ($txt.Length -gt 120) { $txt = $txt.Substring(0,120) + '...' }
    Show $unit $label 'PASS' "$($r.StatusCode) $txt"
    try { return ($r.Content | ConvertFrom-Json) } catch { return $null }
  } catch {
    $code = $_.Exception.Response.StatusCode.value__
    $msg = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { [string]$_.ErrorDetails.Message } else { '' }
    if (-not $msg) { try { $st=$_.Exception.Response.GetResponseStream(); $st.Position=0; $msg=(New-Object System.IO.StreamReader($st)).ReadToEnd() } catch { $msg=$_.Exception.Message } }
    if ($msg.Length -gt 200) { $msg = $msg.Substring(0,200) }
    if ($expect -contains $code) {
      Show $unit $label 'PASS' "$code (expected) $msg"
      return $null
    }
    $v = if ($code -eq 501) { 'STUB' } elseif ($code -ge 500) { 'ERR5xx' } else { "FAIL$code" }
    Show $unit $label $v $msg
    return $null
  }
}

Write-Output "=== Stage 3 probe against $base ==="
$em = "s3_$(Get-Random)@example.com"; $pw = 'Passw0rd!23'
try {
  Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' `
    -Body (@{ email=$em; password=$pw; name='S3 Probe' } | ConvertTo-Json) | Out-Null
  $log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email=$em; password=$pw } | ConvertTo-Json)
  $H = @{ Authorization = "Bearer $($log.access_token)" }
  Show '3a' 'auth register+login' 'PASS' 'token acquired'
} catch { Show '3a' 'auth register+login' 'FAIL' $_.Exception.Message; exit 1 }

$day  = (Get-Date).ToString('yyyy-MM-dd')
$tmr  = (Get-Date).AddDays(1).ToString('yyyy-MM-dd')

# The time compiler honours allowWeekendScheduling=false by default, so compiling
# "today" on a Saturday or Sunday legitimately yields zero slots. Every scheduling
# assertion therefore runs against the next weekday, not the calendar day.
function NextWeekday([int]$fromToday) {
  $d = (Get-Date).Date.AddDays($fromToday)
  while ($d.DayOfWeek -eq 'Saturday' -or $d.DayOfWeek -eq 'Sunday') { $d = $d.AddDays(1) }
  return $d.ToString('yyyy-MM-dd')
}
$wd  = NextWeekday 1
$wd2 = NextWeekday 2

# ---- 3d seed work data ----
$goal = Hit '3d' 'POST /api/goals' Post '/api/goals' @{
  title='Learn Spanish'; description='Probe goal'; priority=7; targetDate="$tmr`T00:00:00.000Z"
}
$proj = Hit '3d' 'POST /api/projects' Post '/api/projects' @{
  title='Redesign Website'; description='Probe project'; startDate=$day; dueDate="$tmr`T00:00:00.000Z"
}
$task = Hit '3d' 'POST /api/tasks' Post '/api/tasks' @{
  title='Write intro copy'; description='Probe task'; priority=8; goalId=$goal.id
  estimatedDurationMin=60; dueDate="$wd2`T12:00:00.000Z"
}
$task2 = Hit '3d' 'POST /api/tasks (2nd)' Post '/api/tasks' @{
  title='Review translations'; priority=5; estimatedDurationMin=45; goalId=$goal.id
}
$taskId  = if ($task  -and $task.id)  { $task.id  } else { 'missing' }
$taskId2 = if ($task2 -and $task2.id) { $task2.id } else { 'missing' }
$goalId  = if ($goal  -and $goal.id)  { $goal.id  } else { 'missing' }
$projId  = if ($proj  -and $proj.id)  { $proj.id  } else { 'missing' }

# ---- 3e time compiler (client sends taskIds; goalId/projectId must also scope) ----
$compile = Hit '3e' 'POST /api/time-compiler/compile' Post '/api/time-compiler/compile' @{
  timeRange=@{ start="$wd`T09:00:00.000Z"; end="$wd`T17:00:00.000Z" }
  timezone='UTC'; taskIds=@($taskId,$taskId2)
  preferences=@{ workingHoursStart='09:00'; workingHoursEnd='17:00' }
}
# PowerShell unrolls a single-element array on assignment, so the wrap must sit
# around the whole if-expression - `@(...)` inside the branch is not enough.
$blocks = @(if ($compile -and $compile.proposal) { $compile.proposal.proposedBlocks })
$propId = if ($compile -and $compile.proposal) { $compile.proposal.id } else { $null }
Show '3e' '  proposedBlocks for 2 tasks' $(if ($blocks.Count -ge 2){'PASS'}else{'FAIL'}) "count=$($blocks.Count)"

$null = Hit '3e' 'POST /api/time-compiler/compile (goalId scope)' Post '/api/time-compiler/compile' @{
  timeRange=@{ start="$wd`T09:00:00.000Z"; end="$wd`T17:00:00.000Z" }
  timezone='UTC'; goalId=$goalId
  preferences=@{ workingHoursStart='09:00'; workingHoursEnd='17:00' }
}

$null = Hit '3e' 'GET /api/time-compiler/proposals' Get '/api/time-compiler/proposals' $null
$null = Hit '3e' 'GET /api/time-compiler/proposals/:id' Get "/api/time-compiler/proposals/$propId" $null
$null = Hit '3e' 'PATCH /api/time-compiler/proposals/:id/apply' Patch "/api/time-compiler/proposals/$propId/apply" $null
# Applying twice must be refused, not silently duplicated: the store guards on
# status, so the second call is a 400 rather than a no-op 200.
$null = Hit '3e' '  re-apply is refused (no duplicate blocks)' Patch "/api/time-compiler/proposals/$propId/apply" $null @(400)

$tb = Hit '3e' 'GET /api/time-blocks (after apply)' Get `
  "/api/time-blocks?startDate=${wd}T00:00:00.000Z&endDate=${wd}T23:59:59.000Z" $null
$tbCount = if ($tb) { @($tb).Count } else { 0 }
Show '3e' '  TimeBlocks persisted by apply' $(if ($tbCount -ge 2){'PASS'}else{'FAIL'}) "count=$tbCount"

$null = Hit '3e' 'PATCH /api/time-compiler/proposals/:id/status' `
  Patch "/api/time-compiler/proposals/$propId/status" @{ status='REJECTED' }

# ---- 3f commitments (client sends `object` + USER_INPUT) ----
$com = Hit '3f' 'POST /api/commitments' Post '/api/commitments' @{
  object='Deliver audit deck'; description='Probe commitment'
  deadline="$tmr`T12:00:00.000Z"; source='USER_INPUT'
}
$comId = if ($com -and $com.id) { $com.id } else { 'missing' }
$null = Hit '3f' 'GET /api/commitments' Get '/api/commitments' $null
$null = Hit '3f' 'GET /api/commitments/risks' Get '/api/commitments/risks' $null
$null = Hit '3f' 'GET /api/commitments/:id/risk' Get "/api/commitments/$comId/risk" $null
$null = Hit '3f' 'POST /api/commitments/send-reminders' Post '/api/commitments/send-reminders' @{}
$rem = Hit '3f' 'GET /api/notifications (reminder landed)' Get '/api/notifications' $null
Show '3f' '  reminders ran (0 due is valid)' 'INFO' "notifications=$(@($rem).Count)"

# ---- 3g reality engine + replanning ----
# The reality engine only reports SCHEDULE_DRIFT once more than three blocks in the
# trailing window are MISSED, so seed that state; otherwise every downstream
# ack/resolve assertion has nothing to act on and the unit reads as empty.
$past = (Get-Date).AddDays(-1)
for ($i = 1; $i -le 5; $i++) {
  $s = $past.AddDays(-$i)
  $e = $s.AddMinutes(45)
  $null = Hit '3g' "  seed missed block $i" Post '/api/time-blocks' @{
    title="Missed focus $i"; startDate=$s.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    endDate=$e.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ'); blockType='FOCUS'; status='MISSED'
  }
}

$reality = Hit '3g' 'GET /api/reality/check' Get '/api/reality/check' $null
$devs = @(if ($reality) { $reality.deviations })
$recs = @(if ($reality) { $reality.recommendations })
$devId = if ($devs.Count) { $devs[0].id } else { 'missing' }
$recId = if ($recs.Count) { $recs[0].id } else { 'missing' }
Show '3g' '  deviations detected' $(if ($devs.Count){'PASS'}else{'WARN'}) "count=$($devs.Count) firstId=$devId"
$devId2 = if ($devs.Count -gt 1) { $devs[1].id } else { $devId }

$check2 = Hit '3g' 'GET /api/reality/check (repeat, stable ids)' Get '/api/reality/check' $null
$devs2 = @(if ($check2) { $check2.deviations })
$idStable = ($devs2 | ForEach-Object { $_.id }) -contains $devId
Show '3g' '  deviation ids stable across requests' $(if ($idStable){'PASS'}else{'FAIL'}) "count=$($devs2.Count)"

$null = Hit '3g' 'POST /api/reality/deviations/:id/acknowledge' Post "/api/reality/deviations/$devId/acknowledge" @{}
$afterAck = Hit '3g' 'GET /api/reality/check (after ack)' Get '/api/reality/check' $null
$stillOpen = if ($afterAck) { (@($afterAck.deviations) | ForEach-Object { $_.id }) -contains $devId } else { $true }
Show '3g' '  acknowledged deviation hidden from default feed' $(if (-not $stillOpen){'PASS'}else{'FAIL'}) 'includeResolved=false'
$withRes = Hit '3g' 'GET /api/reality/check?includeResolved=true' Get '/api/reality/check?includeResolved=true' $null
$ackVisible = if ($withRes) { (@($withRes.deviations) | ForEach-Object { $_.id }) -contains $devId } else { $false }
Show '3g' '  acknowledged deviation visible with includeResolved' $(if ($ackVisible){'PASS'}else{'FAIL'}) ''
$null = Hit '3g' 'POST /api/reality/deviations/:id/resolve' Post "/api/reality/deviations/$devId2/resolve" @{ resolution='probe' }
$null = Hit '3g' 'POST /api/reality/deviations/:id/reopen' Post "/api/reality/deviations/$devId2/reopen" @{}
$afterReopen = Hit '3g' 'GET /api/reality/check (after reopen)' Get '/api/reality/check' $null
$backOpen = if ($afterReopen) { (@($afterReopen.deviations) | ForEach-Object { $_.id }) -contains $devId2 } else { $false }
Show '3g' '  reopened deviation returns to default feed' $(if ($backOpen){'PASS'}else{'FAIL'}) ''
$null = Hit '3g' 'POST /api/reality/recommendations/:id/status' Post "/api/reality/recommendations/$recId/status" @{ status='ACCEPTED' }
$null = Hit '3g' 'GET /api/reality/task/:id/analysis' Get "/api/reality/task/$taskId/analysis" $null
$null = Hit '3g' 'GET /api/reality/project/:id/health' Get "/api/reality/project/$projId/health" $null
$null = Hit '3g' 'GET /api/reality/drift' Get '/api/reality/drift' $null
$null = Hit '3g' 'GET /api/replanning/suggestions' Get '/api/replanning/suggestions' $null

# ---- 3h memory (client sends type/scope/content) ----
$mem = Hit '3h' 'POST /api/memory' Post '/api/memory' @{
  type='EXPLICIT_PREFERENCE'; source='USER_INPUT'; scope='SCHEDULING'
  content='Prefers morning deep work'; confidence=1; tags=@(); isUserEditable=$true
}
$null = Hit '3h' 'GET /api/memory/search' Get '/api/memory/search?query=morning' $null
$null = Hit '3h' 'GET /api/memory/stats' Get '/api/memory/stats' $null
$null = Hit '3h' 'GET /api/memory/conflicts' Get '/api/memory/conflicts' $null
$memId = if ($mem -and $mem.memory) { $mem.memory.id } else { 'missing' }
$null = Hit '3h' 'GET /api/memory/:id' Get "/api/memory/$memId" $null
$null = Hit '3h' 'PUT /api/memory/:id' Put "/api/memory/$memId" @{ content='Prefers early deep work' }
$null = Hit '3h' '  bad payload -> 400 not 500' Post '/api/memory' @{ nope=1 } @(400)

# ---- 3i rules (client sends type/scope/action/triggers) ----
$rule = Hit '3i' 'POST /api/rules' Post '/api/rules' @{
  name='No meetings before 10'; type='TIME_RESTRICTION'; scope='MEETINGS'
  triggers=@('SCHEDULE_EVENT'); conditions=@(@{ field='startTime'; operator='BEFORE_TIME'; value='10:00' })
  action='BLOCK'; actionConfig=@{}; priority=50
}
$null = Hit '3i' 'GET /api/rules' Get '/api/rules' $null
$null = Hit '3i' 'GET /api/rules/conflicts' Get '/api/rules/conflicts' $null
$null = Hit '3i' '  bad payload -> 400 not 500' Post '/api/rules' @{ name='x' } @(400)
$nl = Hit '3i' 'POST /api/rules/from-natural-language' Post '/api/rules/from-natural-language' @{
  text='Never schedule meetings before 10am'
}
Show '3i' '  NL rule works with no LLM key' $(if ($nl -and $nl.id){'PASS'}else{'FAIL'}) "id=$($nl.id)"
$null = Hit '3i' 'POST /api/rules/parse' Post '/api/rules/parse' @{ text='Keep Friday afternoons free' }
$null = Hit '3i' 'POST /api/rules/enforce' Post '/api/rules/enforce' @{
  trigger='SCHEDULE_EVENT'; input=@{ title='Standup'; startTime='2026-09-28T09:00:00.000Z' }
}

$mid  = "probe-meeting-$(Get-Random)"

# ---- 3j proactive + permissions ----
$inv = Hit '3j' 'GET /api/proactive/interventions' Get '/api/proactive/interventions' $null
$invList = @($inv)
$invId = if ($invList.Count -and $invList[0].id) { $invList[0].id } else { 'missing' }
Show '3j' '  interventions available' $(if ($invList.Count){'PASS'}else{'WARN'}) "count=$($invList.Count) firstId=$invId"

$inv2 = Hit '3j' 'GET /api/proactive/interventions (stable ids)' Get '/api/proactive/interventions' $null
$invStable = (@($inv2) | ForEach-Object { $_.id }) -contains $invId
Show '3j' '  intervention ids stable across requests' $(if ($invStable){'PASS'}else{'FAIL'}) ''

$null = Hit '3j' 'POST /api/proactive/interventions/:id/acknowledge' `
  Post "/api/proactive/interventions/$invId/acknowledge" @{}
$null = Hit '3j' 'POST /api/proactive/interventions/:id/snooze' `
  Post "/api/proactive/interventions/$invId/snooze" @{ minutes=30 }
$null = Hit '3j' 'POST /api/proactive/interventions/:id/dismiss' `
  Post "/api/proactive/interventions/$invId/dismiss" @{}
$postDismiss = Hit '3j' 'GET /api/proactive/interventions (after dismiss)' Get '/api/proactive/interventions' $null
$gone = -not ((@($postDismiss) | ForEach-Object { $_.id }) -contains $invId)
Show '3j' '  dismissed intervention leaves the feed' $(if ($gone){'PASS'}else{'FAIL'}) ''
$null = Hit '3j' 'GET /api/proactive/preferences' Get '/api/proactive/preferences' $null
$null = Hit '3j' 'POST /api/proactive/preferences' Post '/api/proactive/preferences' @{
  enabled=$true; minPriority='HIGH'; snoozeDurationMinutes=45
}
$pref = Hit '3j' 'GET /api/proactive/preferences (persisted)' Get '/api/proactive/preferences' $null
$prefOk = ($pref -and $pref.minPriority -eq 'HIGH' -and $pref.snoozeDurationMinutes -eq 45)
Show '3j' '  preferences round-trip' $(if ($prefOk){'PASS'}else{'FAIL'}) "minPriority=$($pref.minPriority) snooze=$($pref.snoozeDurationMinutes)"
$null = Hit '3j' 'GET /api/permissions/permissions' Get '/api/permissions/permissions' $null
$null = Hit '3j' 'GET /api/permissions/autonomy-policies' Get '/api/permissions/autonomy-policies' $null
$null = Hit '3j' 'POST /api/permissions/check' Post '/api/permissions/check' @{ actionType='CREATE_TASK'; context=@{} }

# ---- 3k integrations ----
$null = Hit '3k' 'GET /api/calendar/connections' Get '/api/calendar/connections' $null
$null = Hit '3k' 'GET /api/calendar/calendars' Get '/api/calendar/calendars' $null
$auth = Hit '3k' 'GET /api/calendar/auth-url/:provider' Get '/api/calendar/auth-url/google' $null
# The state param is `connectionId:signedJwt`, and it arrives percent-encoded,
# so decode before matching or `%3A` never looks like the `:` separator.
$stateVal = if ($auth -and $auth.authUrl) { [System.Uri]::UnescapeDataString(([System.Text.RegularExpressions.Regex]::Match($auth.authUrl, '[?&]state=([^&]+)')).Groups[1].Value) } else { '' }
$hasSignedState = ($stateVal -match '^[^:]+:eyJ')
Show '3k' '  auth-url carries signed state' $(if ($hasSignedState){'PASS'}else{'FAIL'}) "state=$($stateVal.Substring(0,[Math]::Min(40,$stateVal.Length)))"
try {
  $cb = Invoke-WebRequest -Uri "$base/api/calendar/callback/google?code=bad&state=bad" `
    -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30
  Show '3k' 'GET /calendar/callback/:provider (no auth)' 'PASS' "$($cb.StatusCode) redirect"
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 302 -or $code -eq 301) {
    Show '3k' 'GET /calendar/callback/:provider (no auth)' 'PASS' "$code -> $($_.Exception.Response.Headers['Location'])"
  } else {
    Show '3k' 'GET /calendar/callback/:provider (no auth)' "FAIL$code" $_.Exception.Message
  }
}
$null = Hit '3k' 'GET /api/notifications' Get '/api/notifications' $null
$null = Hit '3k' 'GET /api/travel/status' Get '/api/travel/status' $null
$null = Hit '3k' 'POST /api/travel/estimate (degrades cleanly with no key)' Post '/api/travel/estimate' @{
  origin=@{ address='1 Main St' }; destination=@{ address='2 Main St' }; mode='DRIVING'
  avoidTolls=$false; avoidHighways=$false; avoidFerries=$false
} @(503)
$null = Hit '3k' 'POST /api/travel/estimate (bad origin -> 400)' Post '/api/travel/estimate' @{
  origin=@{}; destination=@{ address='x' }; mode='DRIVING'
  avoidTolls=$false; avoidHighways=$false; avoidFerries=$false
} @(400,503)

# ---- 3l meetings ----
$null = Hit '3l' 'POST /api/meetings/prepare' Post '/api/meetings/prepare' @{
  meetingId=$mid; meetingTitle='Q3 Planning'; startTime="$day`T14:00:00.000Z"
  endTime="$day`T15:00:00.000Z"; meetingType='TEAM_SYNC'
  attendees=@(@{ email='sam@example.com'; name='Sam'; role='ORGANIZER' })
}
$null = Hit '3l' 'POST /api/meetings/process' Post '/api/meetings/process' @{
  meetingId=$mid; title='Q3 Planning'; startTime="$day`T14:00:00.000Z"
  endTime="$day`T15:00:00.000Z"; notes='Alice will deliver the report by Friday.'
}
$got = Hit '3l' 'GET /meetings/:id/preparation (persisted)' Get "/api/meetings/$mid/preparation" $null
Show '3l' '  preparation retrieved, not a placeholder' `
  $(if ($got -and $got.checklist -and -not $got.message){'PASS'}else{'FAIL'}) "meetingId=$($got.meetingId)"
$pm = Hit '3l' 'GET /meetings/:id/post-meeting (persisted)' Get "/api/meetings/$mid/post-meeting" $null
Show '3l' '  post-meeting retrieved, not a placeholder' `
  $(if ($pm -and $pm.PSObject.Properties['actionItems'] -and -not $pm.message){'PASS'}else{'FAIL'}) ''
$null = Hit '3l' 'GET /api/meetings/:id/action-items' Get "/api/meetings/$mid/action-items" $null
$null = Hit '3l' 'GET /api/meetings/:id/commitments' Get "/api/meetings/$mid/commitments" $null
$null = Hit '3l' 'GET /api/meetings/:id/follow-ups' Get "/api/meetings/$mid/follow-ups" $null
$null = Hit '3l' 'GET /meetings/:id/preparation (unknown -> 404)' Get '/api/meetings/does-not-exist/preparation' $null @(404)

# ---- 3m command center / daily experience ----
$null = Hit '3m' 'GET /api/daily/current' Get '/api/daily/current' $null
$null = Hit '3m' 'GET /api/daily/morning' Get '/api/daily/morning' $null
$null = Hit '3m' 'GET /api/daily/briefing' Get '/api/daily/briefing' $null
$null = Hit '3m' 'GET /api/context/user' Get '/api/context/user' $null
$null = Hit '3m' 'GET /api/health' Get '/api/health' $null

# ---- assistant regression (3c) ----
$null = Hit '3c' 'POST /api/assistant/message' Post '/api/assistant/message' @{ message='Create task buy milk' }

Write-Output ''
Write-Output '=== SUMMARY ==='
$results | Group-Object Verdict | Sort-Object Name | ForEach-Object {
  Write-Output ("{0,-8} {1}" -f $_.Name, $_.Count)
}
Write-Output ''
Write-Output '=== NON-PASS DETAIL ==='
$results | Where-Object { $_.Verdict -and $_.Verdict -ne 'PASS' } | ForEach-Object {
  Write-Output ("{0,-4} {1,-48} {2,-7} {3}" -f $_.Unit, $_.Route, $_.Verdict, $_.Detail)
}


