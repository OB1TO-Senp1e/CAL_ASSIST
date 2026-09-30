$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3000'
$em = "s4f-$([Guid]::NewGuid().ToString('N').Substring(0,8))@probe.test"
$pw = 'Probe!2345'

function Show($label, $verdict, $detail) {
  Write-Output ("[{0}] {1} :: {2}" -f $verdict, $label, $detail)
}

$null = Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' `
  -Body (@{ email = $em; password = $pw; name = 'S4f Probe' } | ConvertTo-Json)
$log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
  -Body (@{ email = $em; password = $pw } | ConvertTo-Json)
$H = @{ Authorization = "Bearer $($log.access_token)" }
Show 'auth' 'PASS' 'token acquired'

$deadline = (Get-Date).AddDays(30).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')

# --- create with full metadata ---
$body = @{
  object            = 'Send revised contract'
  description       = 'Stage 4f probe'
  deadline          = $deadline
  source            = 'AI_INFERRED'
  person            = 'Sam'
  personEmail       = 'sam@example.com'
  confidence        = 0.82
  context           = 'I will send Sam the revised contract'
  relatedEntityType = 'PROJECT'
  relatedEntityId   = 'prj_probe_1'
} | ConvertTo-Json
$created = Invoke-RestMethod -Uri "$base/api/commitments" -Method Post -ContentType 'application/json' `
  -Headers $H -Body $body

foreach ($k in 'person','personEmail','confidence','context','relatedEntityType','relatedEntityId') {
  if ($created.$k) { Show "create persists $k" 'PASS' $created.$k }
  else { Show "create persists $k" 'FAIL' 'missing from response'; }
}

# --- read it back from the DB, not just the create echo ---
$fetched = Invoke-RestMethod -Uri "$base/api/commitments/$($created.id)" -Method Get -Headers $H
if ($fetched.person -eq 'Sam' -and $fetched.confidence -eq 0.82) {
  Show 'read-back from DB' 'PASS' "person=$($fetched.person) confidence=$($fetched.confidence)"
} else {
  Show 'read-back from DB' 'FAIL' ($fetched | ConvertTo-Json -Compress)
}
if ($fetched.relatedEntityType -eq 'PROJECT' -and $fetched.relatedEntityId -eq 'prj_probe_1') {
  Show 'related entity link survives' 'PASS' "$($fetched.relatedEntityType)/$($fetched.relatedEntityId)"
} else {
  Show 'related entity link survives' 'FAIL' "got $($fetched.relatedEntityType)/$($fetched.relatedEntityId)"
}

# --- LOW_CONFIDENCE risk factor is now reachable ---
$lowBody = @{
  object     = 'Vague thing someone half-promised'
  deadline   = $deadline
  source     = 'AI_INFERRED'
  person     = 'Riley'
  confidence = 0.2
} | ConvertTo-Json
$low = Invoke-RestMethod -Uri "$base/api/commitments" -Method Post -ContentType 'application/json' `
  -Headers $H -Body $lowBody
$risk = Invoke-RestMethod -Uri "$base/api/commitments/$($low.id)/risk" -Method Get -Headers $H
if ($risk.riskFactors -contains 'LOW_CONFIDENCE') {
  Show 'LOW_CONFIDENCE reachable' 'PASS' "level=$($risk.riskLevel) factors=$($risk.riskFactors -join ',')"
} else {
  Show 'LOW_CONFIDENCE reachable' 'FAIL' "factors=$($risk.riskFactors -join ',')"
}
$hi = Invoke-RestMethod -Uri "$base/api/commitments/$($created.id)/risk" -Method Get -Headers $H
if ($hi.riskFactors -notcontains 'LOW_CONFIDENCE') {
  Show 'confident commitment not flagged' 'PASS' "factors=$($hi.riskFactors -join ',')"
} else {
  Show 'confident commitment not flagged' 'FAIL' 'flagged'
}

# --- stats report an average confidence ---
$stats = Invoke-RestMethod -Uri "$base/api/commitments/stats" -Method Get -Headers $H
if ($stats.averageConfidence) {
  Show 'stats.averageConfidence' 'PASS' $stats.averageConfidence
} else {
  Show 'stats.averageConfidence' 'FAIL' ($stats | ConvertTo-Json -Compress)
}

# --- update preserves metadata it did not mention ---
$upd = Invoke-RestMethod -Uri "$base/api/commitments/$($created.id)" -Method Put -ContentType 'application/json' `
  -Headers $H -Body (@{ object = 'Send final contract' } | ConvertTo-Json)
if ($upd.person -eq 'Sam' -and $upd.confidence -eq 0.82 -and $upd.context) {
  Show 'update preserves metadata' 'PASS' "person=$($upd.person) confidence=$($upd.confidence)"
} else {
  Show 'update preserves metadata' 'FAIL' ($upd | ConvertTo-Json -Compress)
}

# --- a commitment with no metadata stays clean ---
$plain = Invoke-RestMethod -Uri "$base/api/commitments" -Method Post -ContentType 'application/json' `
  -Headers $H -Body (@{ object = 'Hand typed only'; deadline = $deadline; source = 'USER_INPUT' } | ConvertTo-Json)
if ($null -eq $plain.person -and $null -eq $plain.confidence) {
  Show 'absent metadata stays absent' 'PASS' 'person/confidence omitted'
} else {
  Show 'absent metadata stays absent' 'FAIL' ($plain | ConvertTo-Json -Compress)
}
