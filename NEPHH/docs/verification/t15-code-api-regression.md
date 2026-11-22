# T15 代码与 API 回归阶段记录

状态：代码与API阶段通过；T15整体未完成。用户要求不切回本任务、继续代码/API，不启动外部浏览器或鸿蒙虚拟机。未用静态检查替代视觉、真实交互或设备验收。

## 本轮结果

| 检查 | 实际结果 | 边界 |
| --- | --- | --- |
| 网页所有Node行为测试 | 87项通过，0失败，单并发 | 不包含浏览器DOM、焦点、视觉和真实401重登 |
| 网页类型与生产构建 | vue-tsc --build、vite build通过 | 构建不是交互验收 |
| Java全量隔离测试 | 10个测试类，54项通过，0失败/错误/跳过，21.267秒 | JDK21/release17，H2，不代表真实MySQL |
| 工单未知结果七步回归 | assign/accept/start/submit/reject/resubmit/approve各一次POST/新事件；GET确认，最终COMPLETED | 调用方模拟丢响应，不是真实断网；对照未变化GET不解锁 |
| 秒精度截止时间 | 直接使用实际orderDeadline，真实非空dueAt回读证明通过 | 真实服务为H2；MySQL秒精度来自持久化结构及固定回读测试 |
| T11告警关联/API | 7项针对性Java已纳54；真实HTTP确认、恢复、稳定关联/权限先前通过 | 本轮无后端行为修改，未重复造数 |
| T13历史/API | 实际采样、断档、负温、132℃、有效0、来源/单位/阈值、weekly逐值对接通过 | SVG实际绘制未验证 |
| 鸿蒙 | 先前API22原生构建与模型检查证据保留，本轮无原生业务代码改动 | 没有启动VM、没有设备安装/交互/双端实物联调 |

## 必须继续的验收

1. 使用本任务Codex内置预览，验证T09至T14：来源/时效、角色待办、告警返回/关联工单、草稿401重登、未知结果弹层和刷新。
2. 双主题、1440/900/390窗口、键盘/Escape/焦点、长列表滚动及图表单位/实际时间/空态。
3. 在允许的已连接硬件条件下验证控制台：隐藏idle无轮询、持续采集跨页、停止中途、部分回读、断网、退出与账号切换；模拟甲烷来源不得改为实测。
4. 鸿蒙只使用用户允许的兼容设备，验证真实登录/请求/状态回读、返回与生命周期；不自动启动模拟器。
5. 未知工单操作若已由其他人继续推进且不能满足目标状态证明，将继续锁定，需要管理员核实。没有稳定结果ID的其他表单仅保证当前页锁，跨刷新人工核实边界见T12。

## 运行与资源

- 本轮按任务独立提交和推送；没有合并main或部署生产。
- 18081仍是拥有者核验过的local/H2内存验收服务，Java上限512MB/2CPU，健康isolatedVerification=true；不连接现有MySQL。PID会变化，停机前应复核命令行与端口归属。
- 不自动打开网页。需要继续内置预览时，可在网页目录用Node24设置BACKEND_URL=http://127.0.0.1:18081，然后npm run dev -- --host 127.0.0.1 --port 5174；Vite本身不要求打开外部窗口。
- 测试账号、节点和工单仅在专用隔离环境创建并清理，不输出秘密。历史截图改动及未纳入基线的实物证据目录保持原状，不作无关清理。

## 可复核命令

网页目录：node --test --test-concurrency=1 tests/*.test.mjs；npm run type-check；npm run build-only。采用Node24.22.3、NODE_OPTIONS=--max-old-space-size=1024，顺序执行。

后端目录：mvn -Dmaven.compiler.release=17 -DargLine="-Xmx384m -XX:ActiveProcessorCount=2" -DforkCount=1 -DreuseForks=true test；MAVEN_OPTS同样限384MB/2CPU。全局Maven可能强制release8，故显式覆盖17。

纯HTTP验证入口含verify-workbench-api.mjs、verify-alarm-detail-api.mjs、verify-write-outcome-api.mjs、verify-history-api.mjs。必须显式API_BASE专用loopback端口、ALLOW_ISOLATED_WRITES=1和isolatedVerification=true；凭据从环境或私有临时文件读取，不得向真实业务库运行造数。

T16最终交付验收仍依赖上述待验证项。当前文档是阶段交接，不是完整验收或上线批准。
