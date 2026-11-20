# T14 独立硬件控制台准备

状态：独立模块和轻量行为测试已完成，尚未由主代理集成；内置浏览器交互验收待办，不标记T14完成。没有访问真实硬件，没有启动浏览器或虚拟机，没有修改App、Workspace、auth或旧HardwareLive。

## 新模块

- `HardwareConsole.vue`：普通内嵌面板，使用visible属性显示，不使用浮层或固定定位。必须常驻挂载，不应随路由v-if销毁。
- `hardware-collection.ts`：共享状态和会话版本控制；只允许真实管理员/值班长开启，演示和巡检员拒绝；桥接报文区分实测温湿度与模拟甲烷。
- 上传函数注入API、是否继续及会话是否仍相同，停止后不发送下一份POST；已尝试报文继续在原会话下回读。
- 全部回读才表示整帧确认；部分确认、未确认和账号变化分别处理。POST响应丢失时也只能依靠精确历史证据确认，不自动重发。

## 主代理接入点

1. 常驻挂载控制台，传入是否位于simulator路由的visible值。visible=false且未持续上报时不启动网络轮询；active=true时跨页继续，不能卸载组件来切页面。
2. 顶栏读取`hardwareCollection.state`的active、busy、nodeCode、notice、phase；停止按钮调用`stopHardwareCollection()`，进入控制台通过既有路由导航。
3. 登录凭据写入完成后调用`synchronizeHardwareSession(accessToken)`；退出/清会话后调用`synchronizeHardwareSession('')`。这使共享顶部状态立即停止并清除旧结果。
4. 同窗口登录/清会话后同时派发不带敏感detail的`nephh:session-changed`事件，使常驻控制台立即清理身份/节点/预览缓存。同窗口sessionStorage变化不会触发普通storage事件，不能只依赖storage监听。
5. 控制台监听上述自定义事件、storage事件以及/login路由，且每次POST之前与回调之后都再检查真实sessionStorage和会话版本。旧账号响应不写入新账号状态。
6. 原HardwareLive只在主代理完成接入后替换，避免两个实例同时轮询或上报。此准备阶段没有修改原组件。

## 行为测试

Node24.22.3执行`node --test tests/hardware-collection.test.mjs`：8项通过。

- 采集桥来源/帧号/时间校验，实测温湿度和设备模拟甲烷分离，过期帧失效。
- 第一份POST执行中停止：不发第二份POST，但回读首份并明确1/2部分完成。
- 第二份POST失败：仍核对已提交首份，不宣称整帧完成。
- 历史回读失败或来源不匹配：不报告入库成功。
- POST应答丢失：只有精确messageId、指标、数值、来源和采样秒匹配才确认。
- 演示、无会话和非管理员/值班长不能开始上报。
- 账号变化后不续写，旧请求完成不能污染新账号目标、状态或结果。
- 顶栏等外部stop调用结束连续上报，退出清除旧结果和接收节点。

另用Vue SFC编译器在Node中检查script/template语法通过；这不是生产构建、完整类型检查或界面验收。没有并行运行全量build/typecheck。

## 待验收

主代理集成后，检查无浮层遮挡、路由切换保持挂载、隐藏且idle没有网络请求、active跨页持续且顶栏可停止、停止中途回读、真实manager区域权限、模拟/实测标记、断网、退出与切账号。只使用Codex内置浏览器；用户当前要求不切回预览，故这些项目保持待办。

## 主代理集成记录

已替换App旧HardwareLive，不再普通页面展示可拖动采集大面板。导航为管理配置下的设备接入与联调；常驻HardwareConsole仅真实登录simulator显示，普通页idle不轮询，active跨页继续并显示节点/停止摘要。摘要只在active/busy出现。App默认只读，Workspace发出视图事件；切只读立即停止后续POST，退出或切账号立即停止并清旧缓存。平台模拟单独标注，离开本页停止，循环每份POST前检查停止状态。

24项定向行为测试、类型检查及构建通过。没有连接硬件，未启动采集桥、浏览器或鸿蒙虚拟机；页面布局/状态摘要遮挡、跨页持续与停止的真实交互和设备报文联调待验收。模拟上报不替代实物验收。
