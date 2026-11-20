# Refined Operations Implementation Plan

> 按executing-plans逐项实施；用户已授权在本会话直接执行，无需再次询问执行方式。

**Goal:** 将已批准的工业运维设计落到现有Vue网页，减少模板化视觉并改善任务比较和证据阅读。

**Architecture:** 沿用业务请求、授权、状态机及轮询。统一现有operations-theme，局部重排工作台、工单、告警与派单；独立只读预览通过稳定ID取证，不引入新的写入途径。

**Tech Stack:** Vue 3 / TypeScript / Vite / Node 24；现有Java接口不变。

### U00 记录设计与实施安排

文件：本目录两份文档。检查用户批准范围、Git差异、只提交文档。提交docs(web)。

### U01 统一工业作业视觉

文件：NEPHH/NEPHH-Admin/src/operations-theme.css、src/components/WorkspaceNavigation.vue、src/theme.ts。

1. 收敛既有ops令牌与组件状态，调整导航、表格、表单、状态色与焦点，保留深浅主题。
2. 修改默认主题时保留显式dark/light选择，读取失败采用可用默认值。
3. 类型检查、构建与必要主题行为检查；差异审阅，记录实际浏览器验收状态。
4. 独立提交feat(web)，不混合业务模板改动。

### U02 待办表格与只读证据预览

文件：src/components/WorkbenchPanel.vue、新预览组件/控制器及tests。

1. 紧凑队列标签、语义table、真实动态字段、分页和异常状态。
2. 稳定ID读取告警/工单/巡检详情；新请求清旧详情，隔离迟到响应/账号/区域/卸载，禁止新增写入。
3. 定向测试真实Promise延迟、权限、响应ID与账户切换；类型/构建。
4. 保持父级原emit可用，独立提交feat(web)，界面验收有据记录。

### U03 证据阅读与派单

文件：src/components/Workspace.vue、AlarmDetailPanel.vue、TelemetryStatusPanel.vue；App.vue仅同步导航尺寸关联布局。

1. 工单结果/读数/照片先于日志；依照已有orderActions展示主操作，次操作折叠。
2. 工单列表加入事项，优先级/状态分离；保留筛选、批量选择、稳定详情和权限。
3. 派单改紧凑人员行，保留原选人、草稿、期限、忙时/未知锁。
4. 告警与读数按证据重排，原始字段和普通口径按需展开；模拟/缺失/过期/失权不隐藏。
5. SFC/类型/构建、网页行为回归及独立差异审阅。按实际可用环境记录交互验收。
6. 独立提交feat(web)，同步验证说明。
