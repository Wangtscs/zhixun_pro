param(
  [string]$DevEcoHome = '',
  [switch]$UseLocalSigning
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
if (-not $DevEcoHome) {
  $taskCandidates = @($env:DEVECO_HOME)
  $taskHomeHint = Join-Path $env:LOCALAPPDATA 'Huawei\DevEcoStudio6.0\.home'
  if (Test-Path -LiteralPath $taskHomeHint) {
    $taskCandidates += (Get-Content -LiteralPath $taskHomeHint -Raw).Trim()
  }
  $taskCandidates += 'D:\DevEco\DevEcoStudio'
  $DevEcoHome = $taskCandidates | Where-Object {
    $_ -and (Test-Path -LiteralPath (Join-Path $_ 'tools\hvigor\bin\hvigorw.bat'))
  } | Select-Object -First 1
}
if (-not $DevEcoHome) { throw 'Pass -DevEcoHome or set DEVECO_HOME to your DevEco Studio installation.' }
$taskHvigor = Join-Path $DevEcoHome 'tools\hvigor\bin\hvigorw.bat'
if (-not (Test-Path -LiteralPath $taskHvigor)) { throw "DevEco Studio not found: $DevEcoHome" }
$env:DEVECO_SDK_HOME = Join-Path $DevEcoHome 'sdk'
$env:JAVA_HOME = Join-Path $DevEcoHome 'jbr'
$env:NODE_HOME = Join-Path $DevEcoHome 'tools\node'
$taskProfile = Join-Path $taskRoot 'build-profile.json5'
$taskLocalProfile = Join-Path $taskRoot 'build-profile.local.json5'
$taskOriginalProfile = $null
if ($UseLocalSigning) {
  if (-not (Test-Path -LiteralPath $taskLocalProfile)) {
    throw 'Create an ignored build-profile.local.json5 with your own signing configuration first.'
  }
  # Restore the public unsigned profile even when signing or compilation fails.
  $taskOriginalProfile = [System.IO.File]::ReadAllBytes($taskProfile)
}
Push-Location $taskRoot
try {
  if ($UseLocalSigning) { Copy-Item -LiteralPath $taskLocalProfile -Destination $taskProfile -Force }
  & $taskHvigor --mode module -p product=default -p module=entry@default -p buildMode=debug assembleHap --no-daemon
  if ($LASTEXITCODE -ne 0) { throw 'HarmonyOS build failed' }
} finally {
  if ($null -ne $taskOriginalProfile) { [System.IO.File]::WriteAllBytes($taskProfile, $taskOriginalProfile) }
  Pop-Location
}

# Catch accidental reintroduction of the former webpage bundle.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskHap = Join-Path $taskRoot 'entry\build\default\outputs\default\entry-default-unsigned.hap'
$taskArchive = [System.IO.Compression.ZipFile]::OpenRead($taskHap)
try {
  if (-not ($taskArchive.Entries | Where-Object { $_.FullName -eq 'ets/modules.abc' -and $_.Length -gt 0 })) {
    throw 'HAP does not contain compiled ArkTS'
  }
  $taskWebEntries = @($taskArchive.Entries | Where-Object { $_.FullName -match '^resources/rawfile/.*\.(html|js|css|woff2)$' })
  if ($taskWebEntries.Count) { throw 'HAP unexpectedly contains a webpage runtime bundle' }
  Write-Output 'Native HAP verified: compiled ArkTS present; no webpage runtime bundle.'
} finally { $taskArchive.Dispose() }
