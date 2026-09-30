$ErrorActionPreference='Continue'; $ProgressPreference='SilentlyContinue'
$base='http://localhost:3000'
$H=$null
$results = New-Object System.Collections.ArrayList
function Show($unit,$label,$verdict,$detail){ [void]$results.Add([pscustomobject]@{Unit=$unit;Route=$label;Verdict=$verdict;Detail=$detail}) }
function Hit($unit,$label,$method,$url,$body,$expect=@()){
  try{
    if($null -ne $body){ $r=Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -ContentType 'application/json' -Body ($body|ConvertTo-Json -Depth 10 -Compress) -UseBasicParsing -TimeoutSec 60 }
    else{ $r=Invoke-WebRequest -Uri "$base$url" -Method $method -Headers $H -UseBasicParsing -TimeoutSec 60 }
    Show $unit $label 'PASS' "$($r.StatusCode)"
    try{ return ($r.Content|ConvertFrom-Json) }catch{ return $null }
  }catch{ Show $unit $label 'ERR' $_.Exception.Message; return $null }
}
$em="dbg_$(Get-Random)@example.com"; $pw='Passw0rd!23'
Invoke-RestMethod -Uri "$base/auth/register" -Method Post -ContentType 'application/json' -Body (@{email=$em;password=$pw;name='DBG'}|ConvertTo-Json) | Out-Null
$t=(Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json' -Body (@{email=$em;password=$pw}|ConvertTo-Json)).access_token
$H=@{Authorization="Bearer $t"}
for($i=1;$i -le 5;$i++){
  $s=(Get-Date).AddDays(-1).AddDays(-$i); $e=$s.AddMinutes(45)
  $null=Hit '3g' "seed $i" Post '/api/time-blocks' @{title="MB$i";startDate=$s.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ');endDate=$e.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ');blockType='FOCUS';status='MISSED'}
}
$reality=Hit '3g' 'check' Get '/api/reality/check' $null
Write-Output "realityType=$(if($null -eq $reality){'NULL'}else{$reality.GetType().Name})"
Write-Output "realityIsArray=$($reality -is [array]) realityCount=$($reality.Count)"
$devRaw = $reality.deviations
Write-Output "devRawType=$(if($null -eq $devRaw){'NULL'}else{$devRaw.GetType().Name}) devRawCount=$($devRaw.Count)"
$devs = @($devRaw)
Write-Output "devsCount=[$($devs.Count)] len=$($devs.Length) firstId=[$($devs[0].id)]"
