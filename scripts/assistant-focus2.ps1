$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = 'http://localhost:3001'
$email = "focus2_$(Get-Random)@example.com"
$pw = 'Passw0rd!23'

function Show($label, $val) { [Console]::Out.WriteLine(("{0,-28} {1}" -f $label, $val)) }

Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw; name = 'Focus2' } | ConvertTo-Json) | Out-Null
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{ email = $email; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }
$conv = Invoke-RestMethod -Uri "$base/api/assistant/conversations" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title = 'Focus2' } | ConvertTo-Json)

function Probe($text, $listPath) {
  [Console]::Out.WriteLine('==================================================')
  [Console]::Out.WriteLine("PROMPT: $text")
  $raw = Invoke-WebRequest -UseBasicParsing -Uri "$base/api/assistant/message" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ message = $text; conversationId = $conv.id } | ConvertTo-Json)
  $json = $raw.Content | ConvertFrom-Json
  Show 'assistant content' $json.content
  Show 'requiresConfirmation' $json.requiresConfirmation
  $props = @($json.proposedActions)
  Show 'proposedActions count' $props.Count
  if ($props.Count -eq 0) { Show 'NOTE' 'auto-executed (no confirmation possible)'; return }
  $p = $props[0]
  Show 'toolName / action id' "$($p.toolName) $($p.id)"
  Show 'input' ($p.input | ConvertTo-Json -Compress -Depth 5)

  $before = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  $cfm = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ conversationId = $conv.id; actionId = $p.id; confirmed = $true } | ConvertTo-Json)
  Show 'confirm message' $cfm.message
  $after = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  Show "$listPath delta" "$before -> $after  (delta $($after - $before))"

  $cfm2 = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ conversationId = $conv.id; actionId = $p.id; confirmed = $true } | ConvertTo-Json)
  Show 're-confirm message' $cfm2.message
  $after2 = @((Invoke-RestMethod -Uri "$base/api/$listPath" -Headers $H)).Count
  Show "$listPath after re-confirm" $after2
}

Probe 'Create task buy milk' 'tasks'
Probe 'Create goal learn spanish' 'goals'
Probe 'Create event design review' 'calendar/events'
Probe 'Create project redesign website' 'tasks'
