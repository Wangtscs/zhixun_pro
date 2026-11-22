# T11稳定告警详情API证据

状态：独立后端模块、针对性JUnit和纯HTTP验收通过。界面尚未接入或验证；不能标记T11整体交互验收完成。未启动外部浏览器、鸿蒙虚拟机或设备。

## 路径与兼容性

新增 `GET /api/business/alarms/{id}`，按持久化告警ID读取。旧告警列表、确认接口、规则接口、工单路径、鉴权与数据库结构不变。读取历史告警不再依赖最近500条列表能否包含该记录。

开发前已用GitNexus核对原告警列表及工单详情权限上下文，原告警列表方法上游影响为LOW；只新增独立控制器和服务，不修改公共鉴权方法。

## 响应契约

响应沿用 `code/message/data`，data包含：

| 字段 | 含义 |
| --- | --- |
| alarm | 原始持久化告警字段，包括id、node_id、metric、severity、reason、status、triggered_at、acknowledged_at、recovered_at及原有备注 |
| node | 关联节点原字段及latest；latest只从存储监测记录读取各指标最新采样，按collected_at、id排序，不生成缺失值 |
| state.active | recovered_at为空；人工确认不会令该值自动变false |
| state.acknowledged | 已有确认时间，或历史status为ACKNOWLEDGED |
| state.recovered | recovered_at非空；与acknowledged是两个独立维度 |
| currentRule | 管理角色可读的当前区域／指标规则；未配置或巡检员无权读取时为空 |
| ruleContext | 固定CURRENT_CONFIGURATION_NOT_TRIGGER_SNAPSHOT；不是触发时规则快照 |
| ruleAccess | AVAILABLE、NOT_CONFIGURED或RESTRICTED |
| ruleExplanation | 可读说明，明确当前配置与历史触发证据的区别，或说明当前角色无权读取规则 |
| relatedOrders.items | 使用alarm_id稳定关联且满足现有工单权限的记录摘要，不按名称、原因、时间猜测关联 |
| relatedOrders.limit | 固定100 |
| relatedOrders.hasMore | 符合权限的关联记录超过100时为true；不得把返回100条解释为关联总数 |

关联工单按ID倒序读取101条，仅返回前100条并计算hasMore。告警详情不返回关联总数，不静默宣称完整。node.latest同样是当前最新记录，不是告警触发时全部采样的历史快照；界面需要明确标注时间与来源。

## 权限

- ADMIN可查看任意存在的告警及关联工单。
- MANAGER可查看授权区域告警，规则按原管理权限读取，关联工单仍按各自节点区域授权过滤。
- INSPECTOR可查看授权区域告警，但currentRule始终为null、ruleAccess为RESTRICTED；没有通过新详情绕过旧规则接口的管理限制。
- INSPECTOR关联工单只包含本人主执行或参与且属于授权区域的工单。即使历史数据存在跨节点关联，也不能绕过工单自身区域边界。
- 无区域授权或跨区域访问403；记录不存在404；非正ID400；匿名401。
- 对已获准显示的关联ID，现有工单详情接口仍执行原鉴权；新接口不放宽详情权限。

## 针对性JUnit

仅执行 `AlarmDetailIntegrationTest`：**7项通过，0失败、0错误、0跳过**。没有重复运行全套Java测试。Maven与测试JVM均限制384MB、2 CPU。

覆盖：

1. 目标历史告警先创建，之后增加505条记录，证明旧列表500条中无目标，而按ID详情仍可读取。
2. 持久化原因中的历史阈值35与当前规则50并存；currentRule明确不是触发快照。相同采集时间以更大ID选择实际最新记录。
3. 已确认未恢复、已确认且恢复、未确认活动告警三类状态彼此独立。
4. 巡检员不返回当前规则，只返回本人主执行和参与的2个关联工单；无关同名工单不因名称相同而被关联。
5. 超过100条相关工单显式hasMore；值班长过滤跨区域异常关联，管理员按自身权限可读；返回ID可打开原详情。
6. 未配置当前规则显示空值和可读说明，不补造历史快照。
7. 跨区、空授权、不存在、非法ID与匿名边界。

## 一次低资源隔离部署

核对并仅停止此前拥有的127.0.0.1:18081 H2验收进程。使用 `mvn package -DskipTests -Dmaven.compiler.release=17` 打包一次，Maven JVM限制384MB、2 CPU，结果成功。

Java以512MB、2 CPU重启，仍为local/H2内存库、清空外部配置导入、关闭IoT、独立附件目录及显式verification-mode。实际健康接口保持isolatedVerification=true。此为隔离验收，不是生产部署或MySQL验证。

## 真实HTTP

新增 `scripts/verify-alarm-detail-api.mjs`，纯Node fetch，不导入Playwright，不依赖UI_BASE，不启动浏览器或VM。需要专用loopback API_BASE、显式ALLOW_ISOLATED_WRITES=1和真实隔离标记；凭据仅从环境或TEMP私有合成凭据文件读取，不输出秘密。

语法、帮助入口及一次真实HTTP验收全部通过：

- 在两个专用区域创建节点，以明确SIMULATOR来源上报触发告警；保存原因不因随后把当前规则35改50而变化。
- 管理者能读当前规则及3个稳定关联工单；巡检员规则为null，仅能读主执行／参与的2个工单。
- 巡检员相关ID通过现有详情读取，其他工单403；告警跨区403、不存在404、非法ID400、匿名401。
- 人工确认后仍active=true；正常采样恢复后active=false且acknowledged仍true，明确确认不等于恢复。
- finally仅关闭3条专用工单、停用3个账号，恢复并停用2个专用节点及对应规则。区域、节点和审计关系保留，不清除其他任务记录。

HTTP未重复制造500条历史或100条关联；这些边界由上述独立JUnit验证。网页详情、返回交互、切换过期响应及鸿蒙链路仍未验收。
