// 本机 USB 串口采集桥：ESP32 -> 127.0.0.1:8787 -> 网页联调组件。
// 只读串口，不发送演示命令；业务上报仍由网页使用原有登录权限完成。
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const { SerialFrames, businessReport, methaneReport } = require('./serial-frame.cjs');
const {WifiFrames}=require('./wifi-frame.cjs');

const portIndex = process.argv.indexOf('--port');
const requestedPort = portIndex < 0 ? '' : process.argv[portIndex + 1];
if (portIndex >= 0 && !/^COM\d+$/.test(requestedPort || '')) throw new Error('串口参数必须为 COM 后接数字。');
let serialPort = requestedPort || 'auto';
const runtime = path.join(__dirname, '..', '.nephh-runtime');
fs.mkdirSync(runtime, { recursive: true });
const parser = new SerialFrames();
const configFile=path.join(runtime,'hardware-source.json');
const sourceConfig=fs.existsSync(configFile)?JSON.parse(fs.readFileSync(configFile,'utf8').replace(/^\uFEFF/,'')):{};
const urlIndex=process.argv.indexOf('--url');
const wifiUrl=urlIndex>=0?process.argv[urlIndex+1]:sourceConfig.deviceUrl;
const transport=wifiUrl?'WIFI_HTTP':'USB_SERIAL';
let wifiEndpoint;
if(wifiUrl){const u=new URL(wifiUrl);if(u.protocol!=='http:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw new Error('设备地址须为无凭据的局域网HTTP根地址');wifiEndpoint=new URL('/api/v1/telemetry',u).href;}
const wifiParser=new WifiFrames(sourceConfig.deviceId||'ZX-S3-01');
let latest = null, serialState = 'opening', error = '', serialChild, retryTimer, closing = false;

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  // 仅提供本机只读状态，不增加未鉴权的业务写入入口。
  if (req.method !== 'GET') { res.writeHead(405); res.end(JSON.stringify({ error: '仅支持读取' })); return; }
  if (req.url !== '/api/latest' && req.url !== '/health') { res.writeHead(404); res.end('{}'); return; }
  const ageMs = latest ? Date.now() - Date.parse(latest.receivedAt) : null;
  const fresh = serialState === 'connected' && ageMs !== null && ageMs <= 6500;
  res.end(JSON.stringify({ application: 'nephh-usb-bridge', serialPort, serialState, transport, endpoint: wifiUrl || null, fresh, ageMs, error,
    latest, report: fresh && latest ? businessReport(latest) : null, methaneReport: fresh && latest ? methaneReport(latest) : null }));
});
server.on('error', problem => { console.error(`采集桥未启动：${problem.message}`); process.exitCode = 1; });
server.listen(8787, '127.0.0.1', () => {
  fs.writeFileSync(path.join(runtime, 'hardware-bridge.pid'), String(process.pid));
  console.log(`采集桥已启动：http://127.0.0.1:8787，来源 ${wifiUrl || serialPort}`);
  if(wifiUrl) pollWifi(); else startReader();
});

async function pollWifi(){
 if(closing)return;
 try{
  const response=await fetch(wifiEndpoint,{signal:AbortSignal.timeout(2500),cache:'no-store',redirect:'error'});
  if(!response.ok)throw new Error(`设备HTTP ${response.status}`);
  const text=await response.text();if(text.length>16000)throw new Error('设备报文过大');
  const frame=wifiParser.push(JSON.parse(text));
  if(frame){latest=frame;fs.writeFileSync(path.join(runtime,'hardware-latest.json'),JSON.stringify(frame,null,2));}
  serialState='connected';error='';
 }catch(problem){latest=null;serialState='unavailable';error=`Wi-Fi采集失败：${problem.message}`;}
 if(!closing)retryTimer=setTimeout(pollWifi,1500);
}

function startReader() {
  if (closing) return;
  serialState = 'opening';
  // 标准库 System.IO.Ports，不需要安装 Python/串口 npm 依赖，也不更改执行策略。
  const script = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($null -eq ('System.IO.Ports.SerialPort' -as [type])) { Add-Type -AssemblyName System.IO.Ports }
$selectedPort = $env:NEPHH_SERIAL_PORT
if ([string]::IsNullOrEmpty($selectedPort)) {
  $candidates = @(Get-CimInstance Win32_PnPEntity -Filter "Name LIKE '%(COM%'" | Where-Object { $_.PNPDeviceID -like 'USB\\VID_1A86&PID_7523*' -and $_.Name -match '\\(COM[0-9]+\\)' })
  if ($candidates.Count -eq 0) { throw '未检测到 CH340 采集设备，请检查 USB 连接。' }
  if ($candidates.Count -ne 1) { throw '检测到多块 CH340 设备，请使用 --port 指定采集串口。' }
  $selectedPort = [regex]::Match($candidates[0].Name, 'COM[0-9]+').Value
}
[Console]::WriteLine('@@SERIAL_PORT:' + $selectedPort)
$deviceSerial = [System.IO.Ports.SerialPort]::new($selectedPort, 115200)
$deviceSerial.Encoding = [System.Text.Encoding]::UTF8
$deviceSerial.DtrEnable = $false
$deviceSerial.RtsEnable = $false
$deviceSerial.ReadTimeout = 500
try {
  $deviceSerial.Open()
  [Console]::WriteLine('@@SERIAL_CONNECTED')
  while ($true) {
    try { [Console]::WriteLine($deviceSerial.ReadLine().Trim()) }
    catch [System.TimeoutException] { continue }
  }
} finally {
  if ($deviceSerial.IsOpen) { $deviceSerial.Close() }
  $deviceSerial.Dispose()
}
`;
  serialChild = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEPHH_SERIAL_PORT: requestedPort },
  });
  serialChild.stdout.setEncoding('utf8');
  serialChild.stderr.setEncoding('utf8');
  createInterface({ input: serialChild.stdout }).on('line', line => {
    if (/^@@SERIAL_PORT:COM\d+$/.test(line)) { serialPort = line.slice('@@SERIAL_PORT:'.length); return; }
    if (line === '@@SERIAL_CONNECTED') { latest = null; parser.pending = null; serialState = 'connected'; error = ''; return; }
    const frame = parser.push(line.trim());
    if (!frame) return;
    latest = frame;
    fs.writeFileSync(path.join(runtime, 'hardware-latest.json'), JSON.stringify(frame, null, 2));
    console.log(`第${frame.sequence}帧 温度=${frame.temperature.value ?? '不可用'}℃ 湿度=${frame.humidity.value ?? '不可用'}% 甲烷模拟=${frame.methane.value ?? '不可用'}%LEL`);
  });
  serialChild.stderr.on('data', text => { console.error(text.trim()); });
  const unavailable = message => { serialState = 'unavailable'; error = message; console.error(message); };
  serialChild.on('error', problem => unavailable(problem.message));
  serialChild.on('exit', code => {
    unavailable(`串口采集已停止（退出码 ${code}），请检查连接及串口占用，4秒后重试。`);
    if (!closing) retryTimer = setTimeout(startReader, 4000);
  });
}
function close() { closing = true; clearTimeout(retryTimer); if (serialChild) serialChild.kill(); server.close(); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
