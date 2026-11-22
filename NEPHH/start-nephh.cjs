// 智巡·管廊本地快速启动器。仅启动现有程序，不修改业务数据或数据库配置。
// 默认打开浏览器；传入 --no-browser 可只检查并启动服务。
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

const root = __dirname;
const admin = path.join(root, 'NEPHH-Admin');
const backend = path.join(root, 'NEPHH-backend');
const runtime = path.join(root, '.nephh-runtime');
const libraries = path.join(runtime, 'lib');
const pageUrl = 'http://127.0.0.1:5173/login';
const backendUrl = 'http://127.0.0.1:8080';
const noBrowser = process.argv.includes('--no-browser');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// 原生 HTTP 直接访问本机，不经过电脑上的代理软件。
function get(url, timeout = 2500) {
  return new Promise(resolve => {
    const req = http.get(url, { agent: false }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('error', () => resolve(null));
    });
    req.setTimeout(timeout, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function listening(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1500, () => finish(true));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

function isBackend(response) {
  if (!response || response.status !== 200) return false;
  try {
    const data = JSON.parse(response.body);
    return data.code === 0 && data.data?.application === 'nephh-backend' && data.data?.status === 'UP';
  } catch { return false; }
}

function isFrontend(response) {
  return response?.status === 200 && response.body.includes('智巡 · 管廊管理平台');
}

function requireFile(file, hint) {
  if (!fs.existsSync(file)) throw new Error(`${hint}\n缺少文件：${file}`);
}

function findJava() {
  const candidates = [
    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'java.exe'),
    'C:\\ti\\ccs2050\\ccs\\eclipse\\jre\\bin\\java.exe',
    'C:\\PyCharm\\PyCharm 2026.2.3\\jbr\\bin\\java.exe',
  ].filter(Boolean);
  const found = spawnSync('where.exe', ['java.exe'], { encoding: 'utf8', windowsHide: true });
  if (found.status === 0) candidates.push(...found.stdout.trim().split(/\r?\n/));
  for (const candidate of [...new Set(candidates)]) {
    if (!fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8', windowsHide: true });
    const version = `${probe.stdout || ''}\n${probe.stderr || ''}`.match(/version\s+"(\d+)/);
    if (probe.status !== 0 || !version || Number(version[1]) < 17) continue;
    // 某些 IDE 自带的是裁剪版 JRE，版本足够但缺少 Spring Boot 需要的标准模块。
    const modules = spawnSync(candidate, ['--list-modules'], { encoding: 'utf8', windowsHide: true });
    const required = ['java.instrument', 'java.management', 'java.naming', 'java.sql', 'jdk.unsupported'];
    const available = new Set((modules.stdout || '').split(/\r?\n/).map(line => line.split('@')[0]));
    if (modules.status === 0 && required.every(name => available.has(name))) return candidate;
  }
  throw new Error('未找到 Java 17 或更高版本。请安装 JDK 或设置 JAVA_HOME 后重试。');
}

// JAR 的业务代码较旧，只提取其第三方依赖；业务代码使用项目自带的 target/classes。
function prepareLibraries(jar) {
  requireFile(jar, '缺少后端依赖包，需先由软件同学构建后端。');
  fs.mkdirSync(libraries, { recursive: true });
  const stat = fs.statSync(jar);
  const signature = `${stat.size}:${stat.mtimeMs}`;
  const marker = path.join(runtime, 'libraries.json');
  try {
    const saved = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (saved.signature === signature && saved.files?.length > 0 &&
        saved.files.every(name => path.basename(name) === name && fs.existsSync(path.join(libraries, name)))) return;
  } catch { /* 首次运行或缓存缺失时重新提取。 */ }

  console.log('正在准备后端运行依赖（首次启动需要几秒）……');
  // 路径通过独立环境变量传递，避免空格、中文或特殊字符被当成命令执行。
  const extraction = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    '$zip = [System.IO.Compression.ZipFile]::OpenRead($env:NEPHH_JAR_PATH)',
    'try {',
    '  $count = 0',
    '  foreach ($entry in $zip.Entries) {',
    "    if ($entry.FullName -match '^BOOT-INF/lib/[^/\\\\]+\\.jar$') {",
    '      $destination = Join-Path $env:NEPHH_LIB_DIR ([System.IO.Path]::GetFileName($entry.FullName))',
    '      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)',
    '      $count++',
    '    }',
    '  }',
    "  if ($count -eq 0) { throw 'No dependency JARs found.' }",
    '  Write-Output $count',
    '} finally { $zip.Dispose() }',
  ].join('\n');
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', extraction], {
    windowsHide: true, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, NEPHH_JAR_PATH: jar, NEPHH_LIB_DIR: libraries },
  });
  if (result.error || result.status !== 0) {
    fs.writeFileSync(path.join(runtime, 'dependencies-error.log'), `${result.error || ''}\n${result.stderr || ''}`, 'utf8');
    throw new Error(`后端依赖准备失败。日志：${path.join(runtime, 'dependencies-error.log')}`);
  }
  const files = fs.readdirSync(libraries).filter(name => name.endsWith('.jar'));
  fs.writeFileSync(marker, JSON.stringify({ signature, files }, null, 2), 'utf8');
}

// 服务使用隐藏窗口独立运行，关闭启动窗口后仍可访问网页。
async function background(name, executable, args, cwd, extraEnv = {}) {
  const stdout = fs.openSync(path.join(runtime, `${name}.stdout.log`), 'a');
  const stderr = fs.openSync(path.join(runtime, `${name}.stderr.log`), 'a');
  const child = spawn(executable, args, {
    cwd, env: { ...process.env, ...extraEnv },
    detached: true, windowsHide: true, stdio: ['ignore', stdout, stderr],
  });
  try {
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    fs.writeFileSync(path.join(runtime, `${name}.pid`), String(child.pid), 'utf8');
    child.unref();
    return child;
  } finally {
    fs.closeSync(stdout);
    fs.closeSync(stderr);
  }
}

async function awaitReady(url, predicate, name, child, timeout = 75000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) throw new Error(`${name}已退出。日志目录：${runtime}`);
    if (predicate(await get(url))) return;
    await wait(1000);
  }
  throw new Error(`${name}未能在规定时间内启动。日志目录：${runtime}`);
}

async function main() {
  console.log('智巡·管廊 —— 本地快速启动');
  console.log(`项目目录：${root}`);
  fs.mkdirSync(runtime, { recursive: true });
  const lock = path.join(runtime, 'launch.lock');
  let lockOwned = false;
  try {
    // 防止连续双击同时启动两套进程；只回收已退出启动器留下的锁文件。
    try {
      const prior = Number(fs.readFileSync(lock, 'utf8'));
      if (Number.isInteger(prior) && prior > 0) {
        let running = false;
        try { process.kill(prior, 0); running = true; } catch { /* 启动器已退出。 */ }
        if (running) throw new Error('另一个启动窗口正在处理，请稍候再试。');
      }
      fs.unlinkSync(lock);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
    lockOwned = true;

    const health = await get(`${backendUrl}/api/health`);
    if (isBackend(health)) {
      console.log('后端已运行，直接复用。');
    } else {
      if (await listening(8080)) throw new Error('8080 端口已被其他程序占用或后端尚未就绪，请检查后再启动。');
      const mainClass = path.join(backend, 'target', 'classes', 'com', 'nephh', 'NephhApplication.class');
      requireFile(mainClass, '缺少后端编译文件，需先由软件同学构建后端。');
      const java = findJava();
      prepareLibraries(path.join(backend, 'target', 'nephh-backend-0.0.1-SNAPSHOT.jar'));
      console.log('正在启动后端，沿用项目现有数据库配置……');
      const classpath = [path.join(backend, 'src', 'main', 'resources'), path.join(backend, 'target', 'classes'), path.join(libraries, '*')].join(path.delimiter);
      const child = await background('backend', java, ['-Dfile.encoding=UTF-8', '-cp', classpath, 'com.nephh.NephhApplication', '--server.address=127.0.0.1', '--server.port=8080'], backend);
      await awaitReady(`${backendUrl}/api/health`, isBackend, '后端', child);
      console.log('后端已就绪。');
    }

    const home = await get(pageUrl);
    if (isFrontend(home)) {
      console.log('网页已运行，直接复用。');
    } else {
      if (await listening(5173)) throw new Error('5173 端口已被其他网页服务占用，请检查后再启动。');
      const vite = path.join(admin, 'node_modules', 'vite', 'bin', 'vite.js');
      requireFile(vite, '前端依赖不完整，请在 NEPHH-Admin 目录运行 npm ci 后重试。');
      console.log('正在启动网页……');
      const child = await background('frontend', process.execPath, [vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort'], admin, { BACKEND_URL: backendUrl });
      await awaitReady(pageUrl, isFrontend, '网页', child, 30000);
    }

    await awaitReady('http://127.0.0.1:5173/api/health', isBackend, '网页到后端的连接', null, 15000);
    // 实机联调组件为可选项；没有开发板时仍然可以正常启动整个网页。
    const bridgeFile = path.join(root, 'tools', 'hardware-bridge.cjs');
    if (fs.existsSync(bridgeFile)) {
      try {
        const isBridge = response => {
          try { return response?.status === 200 && JSON.parse(response.body).application === 'nephh-usb-bridge'; }
          catch { return false; }
        };
        if (!isBridge(await get('http://127.0.0.1:8787/health'))) {
          if (await listening(8787)) throw new Error('8787 端口被其他程序占用');
          const bridge = await background('hardware-bridge', process.execPath, [bridgeFile], root);
          await awaitReady('http://127.0.0.1:8787/health', isBridge, 'USB 采集桥', bridge, 10000);
        }
        console.log('USB 采集桥已就绪，连接状态见网页右下角。');
      } catch (error) { console.log(`USB 采集桥提示：${error.message}（不影响网页使用）`); }
    }
    console.log(`启动成功：${pageUrl}`);
    console.log(`服务日志：${runtime}`);
    if (!noBrowser) {
      const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', pageUrl], { detached: true, windowsHide: true, stdio: 'ignore' });
      browser.once('error', () => console.log(`浏览器未能自动打开，请手动访问：${pageUrl}`));
      browser.unref();
    }
  } finally {
    if (lockOwned) fs.unlinkSync(lock);
  }
}

main().catch(error => {
  console.error(`\n启动未完成：${error.message}`);
  console.error(`可在以下目录查看错误日志：${runtime}`);
  process.exitCode = 1;
});
