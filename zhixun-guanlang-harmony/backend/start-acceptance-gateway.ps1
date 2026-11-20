$ErrorActionPreference = 'Stop'
$gatewayScript = Join-Path $PSScriptRoot 'server.mjs'
if (-not (Test-Path -LiteralPath $gatewayScript -PathType Leaf)) {
  throw 'Place this script in the same folder as server.mjs.'
}
$node = Get-Command node -CommandType Application | Select-Object -First 1

$env:MOBILE_UPSTREAM = 'http://127.0.0.1:5173'
$env:MOBILE_HOST = '0.0.0.0'
$env:MOBILE_PORT = '8090'

if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
  $env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
}
if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
  $secureKey = Read-Host 'DeepSeek API Key (press Enter to start without AI)' -AsSecureString
  if ($secureKey -and $secureKey.Length -gt 0) {
    $env:DEEPSEEK_API_KEY = [pscredential]::new('deepseek', $secureKey).GetNetworkCredential().Password.Trim()
    if ($env:DEEPSEEK_API_KEY) {
      [Environment]::SetEnvironmentVariable('DEEPSEEK_API_KEY', $env:DEEPSEEK_API_KEY, 'User')
    }
  }
}

if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY)) {
  Write-Warning 'DeepSeek is not configured. Login and inspection can still work.'
} else {
  Write-Host 'DeepSeek API Key is loaded.'
}
Write-Host 'Starting gateway on port 8090. Keep this window open.'
& $node.Source $gatewayScript
if ($LASTEXITCODE -ne 0) { throw "Gateway stopped with exit code $LASTEXITCODE." }
