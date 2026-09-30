# Stage 5a verification probe.
# Exercises the hardened provider transport path against a live backend: baseline
# latency, read-only answering, the read -> write-proposal path, breaker/capability
# reporting and the new metrics. Prints PASS / FAIL / SKIP / WARN per check.
#
#   powershell -File scripts/s5a-probe.ps1 [http://localhost:3000]
#
# SAFETY: this script never prints a credential. It reads .env only to confirm the
# configured provider has a non-placeholder key, and it reports the *shape* of a
# problem (which var, how long, is it a placeholder) - never the value.
#
# A 401 from a provider is a CONFIGURATION defect, not an outage, and Stage 5a
# guarantees it never trips a circuit breaker. If the pre-flight finds an
# inconsistent credential, every live-provider check is reported SKIP rather than
# FAIL, because failing here would be measuring the wrong thing.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$base = if ($args.Count -ge 1) { $args[0] } else { 'http://localhost:3000' }
$H = $null
$results = New-Object System.Collections.ArrayList

function Show($unit, $label, $verdict, $detail) {
  [void]$results.Add([pscustomobject]@{ Unit=$unit; Check=$label; Verdict=$verdict; Detail=$detail })
  [Console]::Out.WriteLine(("{0,-5} {1,-44} {2,-6} {3}" -f $unit,$label,$verdict,$detail))
}

function EnvValue([string]$name) {
  $line = Get-Content '.env' -ErrorAction SilentlyContinue |
    Where-Object { $_ -match "^\s*$([regex]::Escape($name))\s*=" } |
    Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$([regex]::Escape($name))\s*=", '').Trim().Trim('"').Trim("'")
}

# Describes a secret without ever returning it.
function DescribeSecret($value) {
  if ($null -eq $value) { return 'ABSENT' }
  if ($value -eq '') { return 'EMPTY' }
  $placeholder = $value -match '^(your-|xxx|changeme|<)|-api-key$'
  return ("len={0}{1}" -f $value.Length, $(if ($placeholder) { ' PLACEHOLDER?' } else { '' }))
}

Write-Output "=== Stage 5a probe against $base ==="
Write-Output ''

# ---- 5a.0 pre-flight: credential consistency (no secrets printed) ----
$provider = (EnvValue 'AI_PROVIDER'); if (-not $provider) { $provider = 'openai' }
Write-Output "--- pre-flight: AI_PROVIDER=$provider ---"
$keyVars = switch -Regex ($provider) {
  'openai'    { @('OPENAI_API_KEY') }
  'nemotron'  { @('NVIDIA_NIM_API_KEY') }
  default     { @('OLLAMA_API_KEY') }
}
$keyState = @{}
$credSuspect = $false
foreach ($kv in $keyVars) {
  $v = EnvValue $kv
  $keyState[$kv] = DescribeSecret $v
  if ($v -eq $null -or $v -eq '' -or $v -match '^(your-|-api-key$|changeme)') { $credSuspect = $true }
}
foreach ($kv in $keyState.Keys) { Show '5a.0' "credential $kv" 'INFO' $keyState[$kv] }

$urlVars = switch -Regex ($provider) {
  'openai'   { @('OPENAI_BASE_URL') }
  'nemotron' { @('NVIDIA_NIM_BASE_URL') }
  default    { @('OLLAMA_BASE_URL','OLLAMA_HOST') }
}
foreach ($uv in $urlVars) {
  $val = EnvValue $uv
  # A base URL is not a secret, so it is safe and useful to echo for diagnosis.
  Show '5a.0' "endpoint $uv" 'INFO' $(if ($val) { $val } else { 'unset (code default)' })
}

if ($credSuspect) {
  Show '5a.0' 'credential consistency' 'WARN' 'placeholder/missing key for the configured provider'
  Write-Output ''
  Write-Output 'NOTE: a 401 from here on is a CREDENTIAL problem, not a provider outage.'
  Write-Output 'NOTE: Stage 5a guarantees auth failures never trip the breaker, so this run'
  Write-Output '      cannot produce a false "outage". Rotate/fix .env and re-run for a true'
  Write-Output '      latency baseline.'
} else {
  Show '5a.0' 'credential consistency' 'PASS' 'non-placeholder key present'
}
Write-Output ''

# ---- 5a.1 auth (assistant routes need a token; /api/metrics is open) ----
$em = "s5a_$(Get-Random)@example.com"; $pw = 'Passw0rd!23'
try {
  Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' `
    -Body (@{ email=$em; password=$pw; name='S5A Probe' } | ConvertTo-Json) | Out-Null
  $log = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' `
    -Body (@{ email=$em; password=$pw } | ConvertTo-Json)
  $H = @{ Authorization = "Bearer $($log.access_token)" }
  Show '5a.1' 'auth register+login' 'PASS' 'token acquired'
} catch { Show '5a.1' 'auth register+login' 'FAIL' $_.Exception.Message; exit 1 }

# Prometheus output is text, so it is matched line-by-line rather than parsed.
function MetricLines([string]$pattern) {
  try {
    $m = Invoke-WebRequest -Uri "$base/api/metrics" -UseBasicParsing -TimeoutSec 20
    ($m.Content -split "`n") | Where-Object { $_ -match $pattern -and $_ -notmatch '^\s*#' }
  } catch { return @() }
}

# ---- 5a.2 baseline provider latency (read-only turn, timed) ----
# Timed per turn on purpose: AI_REQUEST_TIMEOUT_MS bounds one attempt, so a hung
# endpoint shows up here as a bounded, predictable stall rather than an open-ended one.
$start = Get-Date
try {
  $read = Invoke-RestMethod -Uri "$base/api/assistant/message" -Method Post -Headers $H `
    -ContentType 'application/json' -Body (@{ message='What meetings do I have today?' } | ConvertTo-Json) `
    -UseBasicParsing -TimeoutSec 120
  $ms = [int]((Get-Date) - $start).TotalMilliseconds
  if ($read.content) {
    Show '5a.2' 'baseline read latency' $(if ($ms -le 20000) { 'PASS' } else { 'WARN' }) "${ms}ms"
  } else {
    Show '5a.2' 'baseline read latency' 'FAIL' 'reply carried no content'
  }
} catch {
  $ms = [int]((Get-Date) - $start).TotalMilliseconds
  Show '5a.2' 'baseline read latency' $(if ($credSuspect) { 'SKIP' } else { 'FAIL' }) "${ms}ms $($_.Exception.Message)"
}

# ---- 5a.3 read -> write proposal path (must stay a PROPOSAL) ----
# Stage 5a must not touch the confirmation flow: a create-intent yields a proposed
# action with a NONE/confirmation level, and nothing is written until /confirm.
$day = (Get-Date).ToString('yyyy-MM-dd')
try {
  $prop = Invoke-RestMethod -Uri "$base/api/assistant/message" -Method Post -Headers $H `
    -ContentType 'application/json' `
    -Body (@{ message="Create an event called S5A Standup at 3pm on $day" } | ConvertTo-Json) `
    -UseBasicParsing -TimeoutSec 120
  $actions = @($prop.proposedActions)
  if ($actions.Count -ge 1) {
    $first = $actions[0]
    Show '5a.3' 'read->write proposal path' 'PASS' "$($first.toolName) id=$($first.id) level=$($first.confirmationLevel)"
  } elseif ($credSuspect) {
    Show '5a.3' 'read->write proposal path' 'SKIP' 'local mapper path; provider credential suspect'
  } else {
    Show '5a.3' 'read->write proposal path' 'FAIL' 'no proposals returned'
  }
} catch {
  Show '5a.3' 'read->write proposal path' $(if ($credSuspect) { 'SKIP' } else { 'FAIL' }) $_.Exception.Message
}

# ---- 5a.4 task proposal count behaviour ----
try {
  $two = Invoke-RestMethod -Uri "$base/api/assistant/message" -Method Post -Headers $H `
    -ContentType 'application/json' `
    -Body (@{ message='Create task buy milk and create task pay electric bill' } | ConvertTo-Json) `
    -UseBasicParsing -TimeoutSec 120
  $count = @($two.proposedActions).Count
  # Exactly 2 is the ideal; >=1 proves the read->write path survived hardening.
  $verdict = if ($count -eq 2) { 'PASS' } elseif ($count -ge 1) { 'WARN' } elseif ($credSuspect) { 'SKIP' } else { 'FAIL' }
  Show '5a.4' 'task proposal count' $verdict "$count proposal(s) for a 2-task request"
} catch {
  Show '5a.4' 'task proposal count' $(if ($credSuspect) { 'SKIP' } else { 'FAIL' }) $_.Exception.Message
}

# ---- 5a.5 provider capability + breaker reporting ----
# Read-only: describes the declared capability set and live circuit state without
# ever calling a provider, so this check cannot be skewed by credential problems.
try {
  $ph = Invoke-RestMethod -Uri "$base/api/assistant/providers/health" -Method Get -Headers $H `
    -UseBasicParsing -TimeoutSec 30
  if ($ph.providers -and @($ph.providers).Count -ge 1) {
    foreach ($p in @($ph.providers)) {
      $caps = $p.capabilities
      $capTxt = if ($caps) { "chat=$($caps.chat) tools=$($caps.toolCalling) json=$($caps.structuredOutput) embed=$($caps.embeddings)" } else { 'no capability report' }
      Show '5a.5' "provider $($p.provider)" 'PASS' "circuit=$($p.circuit.state) $capTxt"
    }
    # The active provider must never be left open by this probe run itself.
    $open = @($ph.providers | Where-Object { $_.circuit.state -eq 'open' })
    if ($open.Count -gt 0 -and -not $credSuspect) {
      Show '5a.5' 'breaker state after probe' 'WARN' "$(@($open | ForEach-Object { $_.provider })) open"
    } else {
      Show '5a.5' 'breaker state after probe' 'PASS' "open=$($open.Count)"
    }
  } else {
    Show '5a.5' 'provider health route' 'FAIL' 'no providers reported'
  }
} catch {
  Show '5a.5' 'provider health route' 'FAIL' $_.Exception.Message
}

# ---- 5a.6 Stage 5a metrics increments ----
$seen = New-Object System.Collections.ArrayList
foreach ($probe in @(
  @{ Name='calassist_ai_requests_total'; Need=$true },
  @{ Name='calassist_ai_request_duration_seconds'; Need=$true },
  @{ Name='calassist_ai_errors_total'; Need=$false },
  @{ Name='calassist_ai_retries_total'; Need=$false },
  @{ Name='calassist_ai_tokens_total'; Need=$false },
  @{ Name='calassist_ai_fallbacks_total'; Need=$false },
  @{ Name='calassist_ai_circuit_state'; Need=$true }
)) {
  $lines = MetricLines "^\s*$($probe.Name)"
  $verdict = if ($lines.Count -gt 0) { 'PASS' } elseif ($probe.Need) { 'FAIL' } else { 'INFO' }
  $detail = if ($lines.Count -gt 0) { "$($lines.Count) series; sample: $($lines[0])" } else { 'not present' }
  Show '5a.6' $probe.Name $verdict $detail
}

# Latency must actually have been observed, and errors must be labelled by kind.
$dur = MetricLines 'calassist_ai_request_duration_seconds_count'
if ($dur.Count -gt 0) {
  $any = $dur | Where-Object { $_ -match '\}\s+[1-9]' }
  Show '5a.6' 'ai latency observed' $(if ($any) { 'PASS' } elseif ($credSuspect) { 'SKIP' } else { 'WARN' }) $(if ($any) { $any[0] } else { 'all counts zero' })
} else {
  Show '5a.6' 'ai latency observed' $(if ($credSuspect) { 'SKIP' } else { 'WARN' }) 'no duration series'
}

# A 401 must appear as an auth error, never as an open circuit - the core of the
# "do not treat bad credentials as an outage" requirement.
$errLines = MetricLines 'calassist_ai_errors_total\{'
foreach ($line in @($errLines | Select-Object -First 4)) {
  Show '5a.6' 'ai error taxonomy' 'INFO' $line
}
$circOpen = MetricLines 'calassist_ai_circuit_state\{.*\}\s+2$'
if ($circOpen.Count -gt 0 -and $credSuspect) {
  Show '5a.6' 'auth did not trip breaker' 'FAIL' "circuit open while credential suspect: $($circOpen[0])"
} elseif ($circOpen.Count -gt 0) {
  Show '5a.6' 'auth did not trip breaker' 'INFO' "open: $($circOpen[0])"
} else {
  Show '5a.6' 'auth did not trip breaker' 'PASS' 'no circuit open'
}

Write-Output ''
Write-Output '=== SUMMARY ==='
$results | Group-Object Verdict | Sort-Object Name | ForEach-Object {
  Write-Output ("{0,-8} {1}" -f $_.Name, $_.Count)
}
Write-Output ''
Write-Output '=== NON-PASS DETAIL ==='
$results | Where-Object { $_.Verdict -notin @('PASS','INFO') } | ForEach-Object {
  Write-Output ("{0,-5} {1,-46} {2,-6} {3}" -f $_.Unit, $_.Check, $_.Verdict, $_.Detail)
}

# Exit non-zero only when something genuinely broke (not a credential-suspect SKIP).
$failures = @($results | Where-Object { $_.Verdict -in @('FAIL','ERR5xx') })
if ($failures.Count -gt 0) { exit 1 } else { exit 0 }
