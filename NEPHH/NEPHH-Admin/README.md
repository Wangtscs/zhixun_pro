# 智巡管廊管理端

Vue 3、TypeScript、Vite。依据 Figma 文件 OoFTKpYDkOjLVy9dZ8qPPi 的41个参考状态重建，表格、图表、抽屉和表单均为可交互组件。

## 启动

先启动 ../NEPHH-backend，然后运行 npm install、npm run dev。默认访问 http://localhost:5173；前端将 /api 转发至 http://localhost:8080。可通过环境变量 BACKEND_URL 指定其他后端地址。

账号登录使用真实后端、MySQL和BCrypt密码校验。首次管理员由后端配置创建，已有账号不会被启动过程覆盖。数据库密码不是网页登录密码。

登录页的“一键进入演示环境”使用独立内存数据，演示操作不写入真实数据库，刷新后重置。角色菜单只调整当前视图，不增加服务器权限。

## 页面

- 总览：区域指标、管廊节点、实时告警和四态工单看板。
- 节点：区段、状态、搜索、排序、分页、指标曲线、区域阈值。
- 工单：筛选、批量选择、1～2人派发、截止时间、处置流程和事件时间线。
- 审计：操作人、动作、日期筛选和变更对照。
- 个人设置：资料、头像、修改本人密码、通知偏好、会话超时及设备下线。二次验证服务尚未接入，界面明确禁用。
- 报表：真实统计、近12周完成情况、风险排行及CSV导出。
- 用户菜单的“系统设置”保留用户权限、巡检计划、手册、区域、告警规则和模拟控制台等入口。

真实环境每15秒刷新数据；只有模拟控制台主动开启模拟时才生成模拟读数。抢单模式开关不会修改设备数据。

## 验证与参考

npm run build 同时执行TypeScript检查和生产构建。后端测试见后端README。

还原记录见 ../docs/figma-redesign-progress.md。原始Figma为整页图片，缺少字体及组件属性，因此以1440×900的布局、颜色、尺寸和状态对照为依据；参考图片不作为运行页面背景。真实数据、权限、数量与时间以接口为准。

## 当前浏览器验证脚本

使用满足锁文件全部工具要求的 Node.js 版本；本轮验证使用24.22.3。先执行 `npm ci`、`npm run build`，再启动专用Vite端口：

```powershell
$env:BACKEND_URL='http://127.0.0.1:18081'
npm run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

另开终端运行脚本。所有脚本支持 `--help`，浏览器默认可见Edge；可通过 `BROWSER_CHANNEL` 指定已安装的Playwright浏览器通道，通过 `UI_ARTIFACT_DIR` 指定截图输出目录。

纯演示冒烟不需要后台和账号，脚本拦截业务API与真实硬件访问：

```powershell
$env:UI_BASE='http://127.0.0.1:5174'
node smoke.mjs
```

真实接口页面和工单流程必须使用独立local/H2测试服务。仅当后端显式开启 `app.verification-mode=true`、实际启用local且使用H2时，健康接口才返回 `data.isolatedVerification=true`。脚本同时检查API地址和Vite代理对应的健康接口，不接受未配置标记的服务。仅允许专用loopback端口，不接受8080、5173或远程主机。

```powershell
$env:UI_BASE='http://127.0.0.1:5174'
$env:API_BASE='http://127.0.0.1:18081/api'
$env:ADMIN_USERNAME='<隔离环境管理员>'
$env:ADMIN_PASSWORD='<隔离环境密码>'
node scripts/verify-ui.mjs

$env:ALLOW_ISOLATED_WRITES='1'
node scripts/verify-workflow-ui.mjs
```

`verify-ui.mjs`验证真实登录、11个页面、节点详情及窄窗口截图；除登录会话外，不写业务数据。`verify-workflow-ui.mjs`创建唯一测试账号和工单，通过真实界面派发、接单、开始、上传图片、提交结果、管理复核，再由巡检员刷新核对；无论成功失败，均尝试关闭未结束测试工单并停用账号。测试记录只允许留在专用隔离库。不要将真实密码写入脚本或文档。

登录页现在隐藏硬件面板，浮层层级低于表单和抽屉。业务页展开的面板仍可能覆盖主内容，因此登录和刷新后的脚本会执行用户可操作的“收起”再继续业务流程，不使用强制点击、脚本隐藏或CSS绕过。独立调试入口和业务页覆盖的完整改造属于T14；本轮仅修复回归所需前置问题。

`node scripts/verify-live-ui.mjs`使用完全隔离的接口样本验证列表/详情自动刷新、编辑保留、断线恢复和采集面板拖拽。仅需UI_BASE；它不代表真实设备接入或真实业务API验收。

`node scripts/verify-dispatch-ui.mjs`复用同样的隔离写入开关与管理员环境变量。它创建11名合法候选及外区/禁用对照账号，通过真实派单界面搜索第11名并派发，再回读确认执行人；finally停用所有测试账号并取消测试工单。
