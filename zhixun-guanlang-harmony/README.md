# 智巡管廊 · 鸿蒙手机端

使用 ArkTS / ArkUI 实现 Figma「工人端口」。应用页面按登录、巡检、工单、助手、我的拆分，入口不再加载 HTML 或 React。项目结构见 [架构说明](docs/architecture.md)。

## 开发和构建

使用 DevEco Studio 打开项目根目录，SDK 为 HarmonyOS 6.0.2 / API 22。可直接编辑 `entry/src/main/ets/features` 下的原生页面并运行。应用构建不需要 npm、Vite 或网页预构建。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

脚本优先使用显式 `-DevEcoHome`，其次使用环境变量 `DEVECO_HOME` 和 DevEco 本机安装记录；也可直接传入安装目录。产物为 `entry/build/default/outputs/default/entry-default-unsigned.hap`。

公开构建配置不含签名材料。真机调试时，在本机创建被 Git 忽略的 `build-profile.local.json5`，配置自己的签名后运行 `scripts/build.ps1 -UseLocalSigning`。脚本仅在构建期间使用该配置，结束后恢复公开无签名配置；证书、私钥和本机配置不得提交。SDK 路径写在本机被忽略的 `local.properties`，或通过 DevEco Studio 配置。

## 安装和启动

在 Device Manager 启动手机模拟器，或连接开启 USB 调试的鸿蒙手机：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-phone.ps1
```

加 `-Rebuild` 会先重新编译；多设备时通过 `-Target` 指定设备。当前工程不包含签名密钥，真机运行需要在 DevEco 配置自己的调试签名。

## 启动鸿蒙专用后端

保持现有业务后端运行，在本项目根目录用 Node.js 24 启动移动服务：

```powershell
$env:MOBILE_UPSTREAM = 'http://127.0.0.1:8080'
$env:MOBILE_HOST = '0.0.0.0' # 仅在需要模拟器或同网段真机访问时设置
node backend/server.mjs
```

移动服务默认监听 `127.0.0.1:8090`，可用 `MOBILE_PORT` 修改端口。`GET /health/live` 检查进程，`GET /health/ready` 检查现有业务 API 是否可用。App 使用 `MobileSession.ets` 中配置的网关地址，验收地址为 `http://10.108.40.19:8090`。真机需要能访问该地址，部署环境使用 HTTPS 地址。使用现有业务账号登录，无需修改网页前端、业务后端或数据库。

真实账号可以在「巡检 → 巡检任务」填写点位结果；异常结果由现有业务后端创建关联工单，网页刷新即可读取同一条记录。工单仍由网页派发，鸿蒙端按权限接单、处理并提交复核。登录页的「使用演示账号进入」仍可体验原稿流程。

## DeepSeek 助手

在启动鸿蒙专用后端的 PowerShell 中配置 `DEEPSEEK_API_KEY`，然后重启 `node backend/server.mjs`。不要把 Key 写进 App 或提交到仓库。默认模型为 `deepseek-flash`，可通过 `DEEPSEEK_MODEL` 覆盖。巡检助手和 AI 报修草稿共用该接口；工单、巡检和登录仍使用现有业务后端。

## 目录

- `entry/src/main/ets`：唯一的应用页面与业务源码。
- `entry/src/main/resources`：应用资源和原稿 SVG。
- `backend`：鸿蒙专用服务，使用现有业务 API，不直接连接数据库。
- `design`：Figma ZIP、原稿和旧实现归档，仅用于对照。
- `scripts`：原生构建和设备安装。
- `tests`：原生数据模型的设备外校验，使用 Node.js 24 执行 `node --test tests/*.test.mjs`，无需安装依赖。
- `docs`：架构、实施计划和验证范围。

实际完成的验证与未完成项目见 [验证记录](docs/verification.md)。
