$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001'
$email = "proxysmoke_$(Get-Random)@example.com"
$pw = 'Passw0rd!23'

function Show($label, $val) { Write-Output ("{0,-34} {1}" -f $label, $val) }

# 1) register via the client's exact path: POST /auth/register (unprefixed, proxied)
$regBody = @{ email = $email; password = $pw; name = 'Proxy Smoke' } | ConvertTo-Json
$reg = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body $regBody
Show '1 POST /auth/register' "id=$($reg.id) email=$($reg.email)"

# 2) login via the client's exact path: POST /auth/login
$logBody = @{ email = $email; password = $pw } | ConvertTo-Json
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body $logBody
$token = $log.access_token
Show '2 POST /auth/login' "token_len=$($token.Length) user=$($log.user.email)"
$H = @{ Authorization = "Bearer $token" }

# 3) me via the client's exact path: GET /api/users/me
$me = Invoke-RestMethod -Uri "$base/api/users/me" -Headers $H
Show '3 GET /api/users/me' "id=$($me.id) name=$($me.name)"

# 4) the 3d list endpoints the work pages call
foreach ($p in 'goals','projects','tasks') {
  $r = Invoke-RestMethod -Uri "$base/api/$p" -Headers $H
  Show "4 GET /api/$p" "type=$($r.GetType().Name) count=$(@($r).Count)"
}

# 5) assistant flow on the exact client paths (all under /api)
$conv = Invoke-RestMethod -Uri "$base/api/assistant/conversations" -Method Post -Headers $H -ContentType 'application/json' -Body (@{ title = 'Proxy Chat' } | ConvertTo-Json)
Show '5 POST /api/assistant/conversations' "id=$($conv.id)"

$msgBody = @{ message = 'create a task called Buy groceries tomorrow at 5pm'; conversationId = $conv.id } | ConvertTo-Json
$msg = Invoke-RestMethod -Uri "$base/api/assistant/message" -Method Post -Headers $H -ContentType 'application/json' -Body $msgBody
Show '6 POST /api/assistant/message' "messageId=$($msg.messageId) convId=$($msg.conversationId)"
$prop = $msg.proposedActions | Select-Object -First 1
Show '   proposed tool' "$($prop.toolName) actionId=$($prop.id)"

$tasksBefore = @((Invoke-RestMethod -Uri "$base/api/tasks" -Headers $H)).Count
Show '7 GET /api/tasks (before confirm)' "count=$($tasksBefore)"

$cfmBody = @{ conversationId = $conv.id; actionId = $prop.id; confirmed = $true } | ConvertTo-Json
$cfm = Invoke-RestMethod -Uri "$base/api/assistant/confirm" -Method Post -Headers $H -ContentType 'application/json' -Body $cfmBody
Show '8 POST /api/assistant/confirm' "$($cfm.message)"

$tasksAfter = @((Invoke-RestMethod -Uri "$base/api/tasks" -Headers $H)).Count
Show '9 GET /api/tasks (after confirm)' "count=$($tasksAfter) delta=$($tasksAfter - $tasksBefore)"

$del = Invoke-RestMethod -Uri "$base/api/assistant/conversations/$($conv.id)" -Method Delete -Headers $H
Show '10 DELETE /api/assistant/conversations/:id' "ok"

# 11) logout on the client's exact path: POST /api/auth/logout
try {
  Invoke-RestMethod -Uri "$base/api/auth/logout" -Method Post -Headers $H | Out-Null
  Show '11 POST /api/auth/logout' '2xx OK'
} catch {
  Show '11 POST /api/auth/logout' "FAILED $($_.Exception.Response.StatusCode.value__) $($_.Exception.Message)"
}
