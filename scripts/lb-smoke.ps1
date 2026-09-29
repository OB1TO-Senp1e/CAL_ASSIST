param(
  [string]$ProjectName = 'calassist-lb'
)

$ErrorActionPreference = 'Stop'

$baseUrl = if ($env:LB_BASE_URL) { $env:LB_BASE_URL.TrimEnd('/') } else {
  $port = if ($env:TRAEFIK_HTTPS_PORT) { $env:TRAEFIK_HTTPS_PORT } else { '8443' }
  "https://localhost:$port"
}
$previousCertificateValidationCallback = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
$previousSecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
if (-not ('LbSmokeTlsValidation' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;

public static class LbSmokeTlsValidation
{
    public static RemoteCertificateValidationCallback Callback
    {
        get { return Validate; }
    }

    private static bool Validate(object sender, X509Certificate certificate, X509Chain chain, SslPolicyErrors errors)
    {
        var request = sender as HttpWebRequest;
        if (request != null && string.Equals(request.RequestUri.Host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }
        return errors == SslPolicyErrors.None;
    }
}
'@
}
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = [LbSmokeTlsValidation]::Callback
$previousInstanceFlag = $env:EXPOSE_INSTANCE_ID
$previousNodeEnv = $env:NODE_ENV
$previousReplicaCount = $env:API_REPLICA_COUNT
$composeProject = @('-p', $ProjectName)
$composeNetwork = "${ProjectName}_calassist-network"
$runningBefore = @{}
$managedServices = @('postgres', 'redis', 'api', 'traefik')
$drainProbeId = $null
foreach ($service in $managedServices) {
  $runningBefore[$service] = @(& docker compose @composeProject ps --status running -q $service).Count -gt 0
}
$previousApiCount = @(& docker compose @composeProject ps --status running -q api).Count
$stoppedContainerId = $null

function Invoke-Compose {
  param([string[]]$ComposeArgs)
  & docker compose @composeProject @ComposeArgs
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($ComposeArgs -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Invoke-ApiHealth {
  $response = Invoke-WebRequest -Uri "$baseUrl/api/status" -Method Get -TimeoutSec 8 -UseBasicParsing
  if ($response.StatusCode -ne 200) {
    throw "Expected HTTP 200 from /api/status, received $($response.StatusCode)"
  }
  $instanceId = $response.Headers['X-Instance-Id']
  if (-not $instanceId) {
    throw 'X-Instance-Id is missing; verify EXPOSE_INSTANCE_ID=true in the API containers.'
  }
  return $instanceId
}

function Test-SharedOAuthSession {
  $apiContainers = @(& docker compose @composeProject ps --status running -q api)
  if ($apiContainers.Count -lt 2) {
    throw 'OAuth session check needs at least two running API replicas.'
  }
  $startCode = "(async()=>{const r=await fetch('http://127.0.0.1:3000/auth/google',{redirect:'manual'});const header=r.headers.get('set-cookie')||'';console.log(JSON.stringify({status:r.status,cookie:header.split(';')[0],httpOnly:/httponly/i.test(header),sameSite:/samesite=/i.test(header)}))})().catch(e=>{console.error(e);process.exit(1)})"
  $loginStart = (& docker exec $apiContainers[0].Trim() node -e $startCode) | ConvertFrom-Json
  if ($loginStart.status -ne 302 -or -not $loginStart.cookie -or -not $loginStart.httpOnly -or -not $loginStart.sameSite) {
    throw 'Google OAuth did not establish a redirect and a correctly flagged session cookie.'
  }

  $readCode = "(async()=>{const {createClient}=require('redis');const {RedisStore}=require('connect-redis');const client=createClient({url:process.env.REDIS_URL});await client.connect();const cookie=decodeURIComponent(process.env.LB_SESSION_COOKIE);const sid=cookie.slice(cookie.indexOf('=')+1).slice(2).split('.')[0];const store=new RedisStore({client});const session=await store.get(sid);console.log(JSON.stringify({hasOAuthState:Boolean(session&&session['oauth2:accounts.google.com']&&session['oauth2:accounts.google.com'].state)}));await client.quit()})().catch(e=>{console.error(e);process.exit(1)})"
  $sessionState = (& docker exec -e "LB_SESSION_COOKIE=$($loginStart.cookie)" $apiContainers[1].Trim() node -e $readCode) | ConvertFrom-Json
  if (-not $sessionState.hasOAuthState) {
    throw 'OAuth state written by one replica was not readable through Redis from another replica.'
  }
  Write-Output 'PASS: Google OAuth state from one replica is available to another replica through Redis.'
}

try {
  $env:NODE_ENV = 'development'
  $env:EXPOSE_INSTANCE_ID = 'true'
  $env:API_REPLICA_COUNT = '3'
  Invoke-Compose -ComposeArgs @('up', '-d', '--build', '--scale', 'api=3', 'api', 'traefik')

  $readyDeadline = (Get-Date).AddMinutes(3)
  $ready = $false
  while ((Get-Date) -lt $readyDeadline -and -not $ready) {
    $apiContainers = @(& docker compose @composeProject ps --status running -q api)
    $healthyCount = 0
    foreach ($containerId in $apiContainers) {
      if ((docker inspect $containerId.Trim() --format '{{.State.Health.Status}}') -eq 'healthy') {
        $healthyCount += 1
      }
    }
    if ($apiContainers.Count -eq 3 -and $healthyCount -eq 3) {
      try {
        [void](Invoke-ApiHealth)
        $ready = $true
      } catch {
        Start-Sleep -Seconds 3
      }
    } else {
      Start-Sleep -Seconds 3
    }
  }
  if (-not $ready) {
    throw 'All three API replicas did not become healthy and reachable within 3 minutes.'
  }
  Start-Sleep -Seconds 12

  $instanceIds = @()
  for ($index = 0; $index -lt 30; $index++) {
    $instanceIds += Invoke-ApiHealth
  }
  $distinctInstances = @($instanceIds | Sort-Object -Unique)
  if ($distinctInstances.Count -lt 2) {
    throw "Requests did not reach multiple replicas. Instance IDs: $($distinctInstances -join ', ')"
  }
  Write-Output "PASS: 30 requests reached $($distinctInstances.Count) replicas: $($distinctInstances -join ', ')"

  $apiLogs = @(& docker compose @composeProject logs --since=2m --no-color api)
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not read API request logs for the forwarded client IP check.'
  }
  if (-not ($apiLogs -match 'client=(?!::1|127\.0\.0\.1)\S+')) {
    throw 'API logs did not show the forwarded non-loopback client IP.'
  }
  Write-Output 'PASS: API request logs include the client IP forwarded by Traefik.'
  Test-SharedOAuthSession

  $apiContainers = @(& docker compose @composeProject ps --status running -q api)
  if ($apiContainers.Count -ne 3) {
    throw "Expected 3 running API containers, found $($apiContainers.Count)."
  }
  $stoppedContainerId = $apiContainers[0].Trim()

  $apiIp = (& docker inspect $stoppedContainerId --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}').Trim()
  if ($LASTEXITCODE -ne 0 -or -not $apiIp) {
    throw 'Could not determine the API replica address for the in-flight drain check.'
  }
  $drainProbeName = "$ProjectName-drain-$([guid]::NewGuid().ToString('N'))"
  $drainCode = @'
const http = require('node:http');
  const body = JSON.stringify({ probe: 'drain' });
  const request = http.request({
    host: '__API_IP__',
    port: 3000,
    path: '/api/status',
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)) }
}, response => {
  response.resume();
  response.on('end', () => {
    console.log(`HTTP ${response.statusCode}`);
    process.exit(0);
  });
});
request.on('socket', socket => socket.on('connect', () => console.log('REQUEST_STARTED')));
request.on('error', error => {
  console.error(error);
  process.exit(1);
});
request.write(body.slice(0, 5));
setTimeout(() => request.end(body.slice(5)), 5000);
'@ -replace '__API_IP__', $apiIp
  $drainProbeId = (& docker run -d --name $drainProbeName --network $composeNetwork node:20-alpine node -e $drainCode).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $drainProbeId) {
    throw 'Could not start the in-flight drain probe.'
  }
  $requestStarted = $false
  $requestDeadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $requestDeadline -and -not $requestStarted) {
    $probeLogs = @(& docker logs $drainProbeId 2>&1)
    if (($probeLogs -join "`n") -match 'REQUEST_STARTED') {
      $requestStarted = $true
    } else {
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $requestStarted) {
    throw 'The in-flight drain probe did not establish its request before timeout.'
  }
  Start-Sleep -Milliseconds 500
  $probeLogs = @(& docker logs $drainProbeId 2>&1)
  if (($probeLogs -join "`n") -match 'HTTP \d{3}') {
    throw 'The request completed before SIGTERM, so it did not exercise in-flight draining.'
  }

  & docker stop --time 10 $stoppedContainerId | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Could not stop API container $stoppedContainerId."
  }
  $probeExitCode = & docker wait $drainProbeId
  $probeWaitExitCode = $LASTEXITCODE
  $probeLogs = @(& docker logs $drainProbeId 2>&1)
  if ($probeWaitExitCode -ne 0 -or $probeExitCode -ne '0' -or -not (($probeLogs -join "`n") -match 'HTTP 200')) {
    throw "The in-flight request did not complete successfully while the API replica drained: $($probeLogs -join "`n")"
  }
  Write-Output 'PASS: An in-flight request completed while the API replica drained on SIGTERM.'

  $shutdownLogs = @(& docker logs $stoppedContainerId 2>&1)
  if ($LASTEXITCODE -ne 0 -or -not (($shutdownLogs -join "`n") -match 'Application shutdown complete')) {
    throw 'The stopped API replica did not log completion of graceful shutdown.'
  }
  Write-Output 'PASS: SIGTERM completed the Nest shutdown lifecycle.'

  Start-Sleep -Seconds 15
  for ($index = 0; $index -lt 10; $index++) {
    [void](Invoke-ApiHealth)
  }
  Write-Output 'PASS: 10 requests succeeded after one API replica was stopped.'
}
finally {
  if ($null -ne $drainProbeId) {
    & docker rm -f $drainProbeId 2>$null | Out-Null
  }

  if ($null -ne $previousInstanceFlag) {
    $env:EXPOSE_INSTANCE_ID = $previousInstanceFlag
  } else {
    Remove-Item Env:EXPOSE_INSTANCE_ID -ErrorAction SilentlyContinue
  }
  if ($null -ne $previousNodeEnv) {
    $env:NODE_ENV = $previousNodeEnv
  } else {
    Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
  }
  if ($null -ne $previousReplicaCount) {
    $env:API_REPLICA_COUNT = $previousReplicaCount
  } else {
    Remove-Item Env:API_REPLICA_COUNT -ErrorAction SilentlyContinue
  }

  foreach ($service in @('traefik', 'redis', 'postgres')) {
    if ($runningBefore[$service]) {
      if ($service -eq 'traefik' -and $previousApiCount -gt 0) {
        Invoke-Compose -ComposeArgs @('up', '-d', '--scale', "api=$previousApiCount", $service)
      } else {
        Invoke-Compose -ComposeArgs @('up', '-d', $service)
      }
    } else {
      Invoke-Compose -ComposeArgs @('stop', $service)
    }
  }

  if ($previousApiCount -gt 0) {
    Invoke-Compose -ComposeArgs @('up', '-d', '--scale', "api=$previousApiCount", 'api')
  } else {
    Invoke-Compose -ComposeArgs @('stop', 'api')
  }

  [System.Net.ServicePointManager]::ServerCertificateValidationCallback =
    $previousCertificateValidationCallback
  [System.Net.ServicePointManager]::SecurityProtocol = $previousSecurityProtocol
}
