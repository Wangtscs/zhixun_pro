# T12未知写入结果：真实API证据对接

状态：前端证据判定helper与真实隔离API对接通过；**浏览器表单、弹层、刷新及重新登录交互未验收**。本轮未修改业务源码，也未重启或中断服务。

## 方法与边界

新增纯HTTP脚本 `scripts/verify-write-outcome-api.mjs`，使用Node的TypeScript类型擦除直接加载当前 `write-workflow.ts` 中的createWriteWorkflow和provesOrderWrite，不复制或重写证据判定算法。

运行前要求专用loopback API_BASE、ALLOW_ISOLATED_WRITES=1、真实健康响应isolatedVerification=true与合成管理员凭据。凭据只从环境或TEMP私有文件读取，不打印、不写入验收文档或Git。脚本不依赖UI服务、浏览器、设备或鸿蒙VM。

本轮模拟的部分仅为**调用方丢响应**：真实POST已返回成功后，脚本主动抛出带outcomeUnknown=true的错误，令真实前端流程进入未知结果状态。没有实际断网、关闭API或修改代理；因此不能宣称真实传输丢包或浏览器超时已经被复现。

## 真实HTTP结果

脚本在现有18081隔离H2服务中创建专用区域、节点、值班长、巡检员、业务工单及未变化对照工单。每项操作前通过实际GET工单详情取得events基线，然后：

1. 执行一次真实POST，服务器正常完成写入。
2. 调用方主动丢弃成功响应，createWriteWorkflow返回unknown，保持locked，未触发commit。
3. 再次调用submit返回blocked，没有发送第二次POST。
4. 实际GET重新读取详情，将结果交给provesOrderWrite核对工单ID、目标状态、当前操作者及基线之后的新事件。派单还核对执行人与参与人、优先级、截止时间；提交核对结果文本与读数。
5. 只有正向证据匹配后，流程才返回committed、调用一次commit并刷新。每一步确认只有一次POST和一个新增匹配事件。

| 操作 | 实际目标状态 | 真实POST次数 | 新匹配事件 | 正向GET证据 |
| --- | --- | --- | --- | --- |
| assign | ASSIGNED | 1 | 1 | 通过 |
| accept | ACCEPTED | 1 | 1 | 通过 |
| start | PROCESSING | 1 | 1 | 通过 |
| submit | REVIEW | 1 | 1 | 通过，含结果trim及原始读数一致 |
| reject | PROCESSING | 1 | 1 | 通过 |
| resubmit | REVIEW | 1 | 1 | 通过，新增第二次SUBMIT事件 |
| approve | COMPLETED | 1 | 1 | 通过 |

完整工单最终通过真实API回读为COMPLETED。七个受测转换合计七次业务POST，没有自动第二次POST。

## 未变化GET负向对照

对另一条专用DRAFT工单读取真实基线，再将流程恢复为unknown状态。服务器未执行该对照派单，随后实际GET仍为相同DRAFT及events。

- provesOrderWrite返回false。
- verify保持unknown，locked仍为true。
- 再次submit返回blocked，未调用写入函数，未触发commit。
- 对照工单在清理前仍为DRAFT，业务POST为0。

这证明“GET请求成功”或“页面读到了旧记录”本身不能解锁未知结果；需要新事件及目标状态等正向证据。负向对照中unknown状态由helper显式恢复，不是实际发送失败请求，范围如实保留。

## 执行与清理

执行：`node --experimental-strip-types scripts/verify-write-outcome-api.mjs`，并按脚本帮助显式提供隔离环境参数。语法检查、帮助入口和一次真实API运行均通过。

finally仅关闭本轮2条专用工单（完成或取消）、停用2个专用账号及1个专用节点，保留审计关系，不清除其他任务记录。原API进程保持运行，未执行全构建、未启动任何浏览器或VM。

本证据不覆盖真实浏览器中的同账号草稿恢复、跨账号清除、按钮锁定、Escape关闭顺序或焦点管理；这些仍须后续实际交互验收。
