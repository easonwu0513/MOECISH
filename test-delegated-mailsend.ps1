# MOECISH Delegated Mail.Send Test
# OAuth2 Device Code Flow against MOECISH app (ASCII only)

$ErrorActionPreference = 'Stop'
$tenantId = "6b31b077-bf78-4fa8-bd42-7c0d7d2a3c04"
$clientId = "2e10e829-17bd-41d2-bb48-6d3c4e83aba6"
$scope = "https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access"

function Get-ErrorBody($err) {
  if ($err.ErrorDetails -and $err.ErrorDetails.Message) {
    return $err.ErrorDetails.Message
  }
  if ($err.Exception.Response) {
    try {
      $r = New-Object IO.StreamReader($err.Exception.Response.GetResponseStream())
      return $r.ReadToEnd()
    } catch { return $null }
  }
  return $err.Exception.Message
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Step 1: Request device code" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
$dcResp = Invoke-RestMethod -Method Post `
  -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/devicecode" `
  -Body @{ client_id = $clientId; scope = $scope }

Write-Host ""
Write-Host "===== ACTION REQUIRED =====" -ForegroundColor Yellow
Write-Host "URL : $($dcResp.verification_uri)" -ForegroundColor Yellow
Write-Host "Code: $($dcResp.user_code)" -ForegroundColor Yellow
Write-Host "Sign in as: moecish@m365.ntu.edu.tw" -ForegroundColor Yellow
Write-Host "===========================" -ForegroundColor Yellow
Write-Host ""

$deviceCode = $dcResp.device_code
$intVal = [int]$dcResp.interval
if ($intVal -lt 5) { $intVal = 5 }
$expiresIn = [int]$dcResp.expires_in
$elapsed = 0
$tokenResp = $null
$shouldBreak = $false

Write-Host "Step 2: Polling token endpoint every $intVal seconds (timeout $expiresIn s)..." -ForegroundColor Cyan

while ($elapsed -lt $expiresIn -and -not $shouldBreak) {
  Start-Sleep -Seconds $intVal
  $elapsed += $intVal

  $result = $null
  $caughtErr = $null
  try {
    $result = Invoke-RestMethod -Method Post `
      -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" `
      -Body @{
        grant_type = "urn:ietf:params:oauth:grant-type:device_code"
        client_id = $clientId
        device_code = $deviceCode
      } -ErrorAction Stop
  } catch {
    $caughtErr = $_
  }

  if ($result) {
    $tokenResp = $result
    Write-Host "[OK] Token received." -ForegroundColor Green
    $shouldBreak = $true
    continue
  }

  $errBody = Get-ErrorBody $caughtErr
  $errJson = $null
  try { $errJson = $errBody | ConvertFrom-Json } catch {}

  if ($errJson -and $errJson.error -eq "authorization_pending") {
    Write-Host "  ...pending ($elapsed s)" -ForegroundColor DarkGray
    continue
  }
  if ($errJson -and $errJson.error -eq "slow_down") {
    $intVal = $intVal + 5
    Write-Host "  ...slow_down, new interval $intVal s" -ForegroundColor DarkGray
    continue
  }
  if ($errJson -and $errJson.error -eq "expired_token") {
    Write-Host "[FAIL] Code expired" -ForegroundColor Red
    exit 1
  }
  if ($errJson -and $errJson.error -eq "authorization_declined") {
    Write-Host "[FAIL] User declined consent" -ForegroundColor Red
    exit 1
  }
  Write-Host "[FAIL] Poll failed. Body: $errBody" -ForegroundColor Red
  exit 1
}

if (-not $tokenResp) { Write-Host "[FAIL] Device code timeout"; exit 1 }

$token = $tokenResp.access_token

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Step 3: Decode token to inspect scopes" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
$payload = $token.Split('.')[1]
$padded = $payload + ('=' * ((4 - $payload.Length % 4) % 4))
$decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded.Replace('-','+').Replace('_','/')))
$claims = $decoded | ConvertFrom-Json
Write-Host "upn  : $($claims.upn)"
Write-Host "appid: $($claims.appid)"
Write-Host "tid  : $($claims.tid)"
Write-Host "scp  : $($claims.scp)"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Step 4: Test sendMail via /me/sendMail" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
$body = @'
{
  "message": {
    "subject": "MOECISH delegated Mail.Send test",
    "body": {"contentType":"Text","content":"Path A verified: MOECISH app + Delegated Mail.Send + self-consent works."},
    "toRecipients": [{"emailAddress":{"address":"moecish@m365.ntu.edu.tw"}}]
  }
}
'@

try {
  Invoke-RestMethod -Method Post `
    -Uri "https://graph.microsoft.com/v1.0/me/sendMail" `
    -Headers @{Authorization="Bearer $token"; "Content-Type"="application/json"} `
    -Body $body -ErrorAction Stop
  Write-Host "[OK] sendMail succeeded. Check moecish@m365.ntu.edu.tw inbox." -ForegroundColor Green
} catch {
  $sendErrBody = Get-ErrorBody $_
  Write-Host "[FAIL] sendMail error: $($_.Exception.Message)" -ForegroundColor Red
  if ($sendErrBody) { Write-Host "Body: $sendErrBody" -ForegroundColor Red }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green
