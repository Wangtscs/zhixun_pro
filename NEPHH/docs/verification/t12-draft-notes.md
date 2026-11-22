# T12派单草稿恢复准备

状态：helper已在T12接入工作台，集成结果与验收边界见 [t12-write-workflow.md](t12-write-workflow.md)。本页保留原helper契约与准备阶段记录；401重新登录恢复流程仍未通过浏览器验收。

## 存储契约

- 模块：`dispatch-draft.ts`，不访问全局sessionStorage，存储接口作为参数传入。
- `saveDispatchDraft(storage, ownerId, draft, now?)`：成功保存返回true；不提交任何业务请求。
- `restoreDispatchDraft(storage, ownerId, now?)`：仅同一重新鉴权ownerId、合法schema和有效期内返回可编辑草稿，否则返回null并尽力清除。
- `clearDispatchDraft(storage)`：用于取消、确认提交成功、主动退出登录；只移除草稿key，不改认证状态。
- key为 `nephh-dispatch-draft`，schema版本1。保留时间固定一小时；now可注入测试。过期边界、时钟倒退、异常延长有效期均拒绝。
- ownerId必须是安全正整数，须来自登录后成功获取的服务器identity；不能从输入框用户名、旧本地session、草稿内容或前端角色菜单推断。
- 只存一个草稿。不同账号读取时清除前一账号草稿，不返回其字段。

## 字段白名单

草稿仅保留：orderIds（1至100个）、participantIds（0至2个）、priority（LOW/MEDIUM/HIGH）、dueAt（空值或可解析时间）、note（最多2000字符）。所有ID必须为安全正整数且不重复。

不存密码、Token、用户整对象、人员／工单服务器记录、权限集合或派单结果。传入对象多余字段被丢弃，恢复时也重新按白名单复制。storage外层仅包含schema版本、ownerId、保存／失效时间和草稿。

允许空participantIds，因为草稿可以尚未选人；保存成功不代表表单可提交。截止时间恢复后仍需检查是否已过期。

JSON损坏、超长数据、未知schema、非法字段和storage读写异常均不会抛出到页面。写入失败尽力删除旧草稿，避免把上一次保存误认为当前输入已经保存。获取浏览器sessionStorage属性本身也可能抛错，调用方需在try/catch中取得storage或传undefined；不能仅依赖helper捕获参数求值前的异常。

## 集成建议

1. 在派单表单打开及编辑后，将当前服务器identity.id与规范字段传给save。单单使用 `[form.id]` 作为orderIds，批量使用完整orderIds；不要把整个form或用户对象交给存储。
2. 明确提示“草稿仅保留当前标签页一小时”，写入失败时提示无法恢复，不能仍声称已保存。
3. 遇401时清认证状态并转登录，但保留尚未提交的派单草稿。不要由旧草稿ownerId自动恢复身份。
4. 重新登录并成功请求identity后，才调用restore。不同账号、无效或过期草稿返回null；不自动开启前一账号业务。
5. 同账号恢复前重新拉取每张工单详情、区域和可选人员，再调用现有dispatchAreaIds及validDispatchCrew重新校验。不能只查最近500条工单后把缺失旧工单当作已删除；也不能用缓存权限启用提交。
6. 记录不存在、状态变化、权限撤销或人员禁用时显示具体原因，保留可安全编辑的文字并禁用派单；不得自动换执行人或降低区域校验。
7. 恢复输入后仍由用户明确提交。网络超时或写入结果不确定时先拉取工单状态核对，不自动重试；保存草稿不能解决业务写入幂等问题。
8. 用户取消、确认成功、主动退出时显式clear；401清认证不等于主动退出。取消抽屉和页面离开之间应定义一致的草稿策略。

## 本轮验证

- `node --experimental-strip-types --test tests/dispatch-draft.test.mjs`：10项通过。
- 单文件严格TypeScript检查通过；使用TS6的 `--ignoreConfig`，避免其他准备中模块影响结果。
- 覆盖同账号恢复、不同账号清除、一小时边界、损坏JSON、未知schema、超长数据、字段白名单、对象伪装优先级、非法/重复/超量ID、空执行人草稿、存储拒绝/配额异常、显式清除和认证key隔离。
- 未执行浏览器401跳转、真实重新登录、恢复后重新核权或业务提交验收；页面接入后必须单独验证。
