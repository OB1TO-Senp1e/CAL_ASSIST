# Percent-encode unsafe characters inside the password segment of DATABASE_URL / DIRECT_URL.
$ErrorActionPreference = 'Stop'
$path = Join-Path $PSScriptRoot '..\.env'
$lines = Get-Content $path
$changed = $false
$safe = [regex]'[A-Za-z0-9\-._~%]'
$out = New-Object System.Collections.Generic.List[string]
foreach ($l in $lines) {
    if ($l -match '^\s*(DATABASE_URL|DIRECT_URL)\s*=\s*(.*?)\s*$') {
        $name = $Matches[1]
        $url = $Matches[2].Trim([char]34)
        $m = [regex]::Match($url, '^(postgres(?:ql)?://[^:]+:)(.*)(@.+)$')
        if ($m.Success) {
            $pw = $m.Groups[2].Value
            $enc = New-Object System.Text.StringBuilder
            $nchanged = 0
            foreach ($ch in $pw.ToCharArray()) {
                if ($safe.IsMatch([string]$ch)) { [void]$enc.Append($ch) }
                else { [void]$enc.Append([string]([char]37) + ([int][char]$ch).ToString('X2')); $nchanged++ }
            }
            if ($nchanged -gt 0) {
                $script:changed = $true
                $url = $m.Groups[1].Value + $enc.ToString() + $m.Groups[3].Value
                Write-Output ($name + ': encoded ' + $nchanged + ' special chars in password')
            } else {
                Write-Output ($name + ': already URL-safe')
            }
        }
        $out.Add($name + '=' + [string][char]34 + $url + [string][char]34)
    } else {
        $out.Add($l)
    }
}
if ($changed) {
    Set-Content -Path $path -Value $out -Encoding UTF8
    Write-Output 'env file rewritten'
}
Write-Output '=== verify (creds masked) ==='
$masker = { param($mm) $mm.Groups[1].Value + ':***@' }
Get-Content $path | Select-String -Pattern '^(DATABASE_URL|DIRECT_URL)=' | ForEach-Object {
    [regex]::Replace($_.Line, '(postgres(?:ql)?://[^:]+)[^@]*@', $masker)
}
