param(
  [string]$DevEcoHome = 'D:\DevEco\DevEcoStudio',
  [string]$Target = '',
  [switch]$Rebuild
)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskHdc = Join-Path $DevEcoHome 'sdk\default\openharmony\toolchains\hdc.exe'
$taskHap = Join-Path $taskRoot 'entry\build\default\outputs\default\entry-default-unsigned.hap'
if (-not (Test-Path -LiteralPath $taskHdc)) { throw "HDC not found: $taskHdc" }
if ($Rebuild) { & (Join-Path $PSScriptRoot 'build.ps1') -DevEcoHome $DevEcoHome }
if (-not (Test-Path -LiteralPath $taskHap)) { throw 'Build the HAP first: scripts/build.ps1' }
$taskDevices = @(& $taskHdc list targets)
if ($LASTEXITCODE -ne 0) { throw 'Unable to list HarmonyOS devices' }
$taskDevices = @($taskDevices | ForEach-Object { $_.Trim() } | Where-Object { $_ -and $_ -ne '[Empty]' })
if ($taskDevices.Count -eq 0) { throw 'Start a phone emulator in DevEco Device Manager, or connect a phone with USB debugging enabled.' }
if (-not $Target) {
  if ($taskDevices.Count -ne 1) { throw "Multiple devices connected. Pass -Target with one of: $($taskDevices -join ', ')" }
  $Target = $taskDevices[0]
}
if ($Target -notin $taskDevices) { throw "Device is not connected: $Target" }
$taskInstall = @(& $taskHdc -t $Target install $taskHap)
$taskInstall | Write-Output
if ($LASTEXITCODE -ne 0 -or ($taskInstall -join "`n") -notmatch 'install bundle successfully') {
  throw 'Installation failed. Physical phones require your own debug signing configuration in DevEco Studio.'
}
$taskStart = @(& $taskHdc -t $Target shell aa start -a EntryAbility -b com.zhixun.guanlang.worker)
$taskStart | Write-Output
if ($LASTEXITCODE -ne 0 -or ($taskStart -join "`n") -notmatch 'start ability successfully') { throw 'Unable to start EntryAbility' }
Write-Output 'App started. Select the demo account on the login screen to preview the Figma flows.'
