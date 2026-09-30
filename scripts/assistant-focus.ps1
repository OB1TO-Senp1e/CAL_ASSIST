$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3001'
$email = "focus_$(Get-Random)@example.com"
$pw = 'Passw0rd!23'

function Show($label, $val) { [Console]::Out.WriteLine(("{0,-30} {1}" -f $label, $val)) }

$reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw; name = 'Focus' } | ConvertTo-Json)
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }
Show 'user' $reg.id

$conv = Invoke-RestMethod -Uri "$base/api/assistant/conversations" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title = 'Focus Chat' } | ConvertTo-Json)

function Send-And-Confirm($text, $listPath) {
  [Console]::Out.WriteLine('==================================================')
  [Console]::Out.WriteLine("PROMPT: $text")
  $raw = Invoke-WebRequest -UseBasicParsing -Uri "$base/api/assistant/message" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ message = $text; conversationId = $conv.id } | ConvertTo-Json)
  $json = $raw.Content | ConvertFrom-Json
  Show 'top-level keys' (($json.PSObject.Properties.Name) -join ', ')
  Show 'id (message id)' $json.id
  Show 'conversationId' $json.conversationId
  $p = $json.proposedActions | Select-Object -First 1
  Show 'toolName' $p.toolName
  Show 'action id' $p.id
  Show 'proposal input' ($p.input | ConvertTo-Json -Compress -Depth 5)

  $before = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  Show "$listPath before" $before
  $cfm = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ conversationId = $conv.id; actionId = $p.id; confirmed = $true } | ConvertTo-Json)
  Show 'confirm message' $cfm.message
  $after = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  Show "$listPath after" "$after (delta $($after - $before))"

  # idempotency: confirming the same action again must NOT write twice
  $cfm2 = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ conversationId = $conv.id; actionId = $p.id; confirmed = $true } | ConvertTo-Json)
  Show 're-confirm message' $cfm2.message
  $after2 = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  Show "$listPath after re-confirm" "$after2"
}

Send-And-Confirm 'Add task: Buy groceries tomorrow at 5pm' 'tasks'
Send-And-Confirm 'Schedule a meeting with design team tomorrow at 2pm for 1 hour' 'calendar/events'

[Console]::Out.WriteLine('==================================================')
$msgs = Invoke-RestMethod -Uri "$base/api/assistant/conversations/$($conv.id)/messages" -Headers $H
foreach ($m in $msgs) { Show "msg $($m.role)" "id=$($m.id) len=$($m.content.Length)" }
