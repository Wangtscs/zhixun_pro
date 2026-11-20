# 智巡管廊 · 鸿蒙 App 后端对接文档

版本：当前代码交接版，2026-11-09。依据 `NEPHH-backend/src/main/java/com/nephh` 控制器、权限服务与数据库迁移整理。

本文描述已经存在的 HTTP 接口；不是未来接口设计。示例 ID、账号、时间与数据仅说明格式，联调时应替换成实际值。本项目不包含鸿蒙 App 工程，下面的 ArkTS 示例未在 DevEco Studio 编译。

配套文件：[完整接口索引CSV](backend-api-index.csv)（68个控制器端点，可用Excel筛选）；[当前功能说明](current-delivery.md)；[硬件与Agent接入边界](integration-contracts.md)。健康检查之外的框架管理端点不计入该66项。

## 1. 交接范围与建议顺序

后端为 Java 17+/Spring Boot/MySQL，App 直接调用 REST API，不连接数据库，也不依赖 Vue 前端。默认后端端口 **8080**。前端5173/5174端口属于网页开发服务，不能当作 App 的后端地址。

建议先实现巡检员端：登录 → 我的工单 → 工单详情 → 接单 → 开始处理 → 上传照片 → 提交复核；再实现巡检任务、节点、通知和个人设置。值班长派单与复核、管理员人员管理可在第二阶段增加。

现有网页“一键进入演示环境”是网页内存模拟，不存在对应的后端演示登录接口。App 联调需要真实后端账号；管理员应先创建巡检员并分配区域。

### 1.1 地址约定

```text
SERVER_ORIGIN = http://<后端电脑局域网IPv4>:8080
BASE_URL      = SERVER_ORIGIN + /api
业务接口前缀   = /api/business
登录接口       = /api/auth/login
```

| 场景 | 地址填写 |
| --- | --- |
| 电脑自身测试 | `http://127.0.0.1:8080/api` |
| 同一局域网的真机 | `http://电脑局域网IP:8080/api` |
| 模拟器 | 使用该模拟器实际可达的宿主机地址；不要默认照搬Android模拟器的固定地址 |
| 部署后 | 后端负责人提供的HTTPS域名，加`/api` |

手机上的localhost/127.0.0.1指向手机自己。电脑和手机需能相互访问，电脑防火墙应允许测试网络访问后端端口；本文不替开发者修改防火墙。原生HTTP调用通常不带浏览器Origin，不需要复用Vite代理。若使用WebView并携带Origin，需由后端配置准确的`CORS_ALLOWED_ORIGINS`，不能靠修改JSON解析解决CORS拒绝。

### 1.2 启动后端

1. IDEA以Maven项目打开`NEPHH-backend`，使用JDK 17或21。
2. 本机有`.local-database.yml`时会读取该私有配置；交给其他人时使用`.local-database.example.yml`重新填写，勿将自己的数据库密码或JWT密钥放入App。
3. MySQL配置变量为`DB_URL`、`DB_USERNAME`、`DB_PASSWORD`，启用mysql环境时还需`JWT_SECRET`（至少32字节）；端口可用`SERVER_PORT`调整。具体以项目配置和后端README为准。
4. 数据库先建空库，Flyway自动执行V1～V9迁移；不要再手工重复执行建表SQL。
5. 运行`com.nephh.NephhApplication`。无本地MySQL配置时默认local环境使用H2内存库，重启会丢失数据。
6. 初始管理员可通过`ADMIN_USERNAME`、`ADMIN_PASSWORD`配置，仅在用户名不存在时创建；已有用户不会被覆盖。不要假定交接机器有固定默认账号。

首次联通先调用`GET /api/health`，不需要登录：

```json
{"code":0,"message":"success","data":{"status":"UP","application":"nephh-backend"}}
```

该接口说明应用能够响应，不等于全部业务或外部硬件可用。Swagger在开发环境的入口为`/swagger-ui.html`，OpenAPI JSON为`/v3/api-docs`；动态Map请求的字段说明仍以本文和源码为准。

## 2. 通用协议与网络层

### 2.1 请求和响应

JSON请求发送`Content-Type: application/json`，受保护接口另加：

```http
Authorization: Bearer <accessToken>
Accept: application/json
```

通常响应包为：

```json
{"code":0,"message":"success","data":null}
```

成功条件为**HTTP 2xx且code=0**。`data`可为对象、数组或null。错误示例：

```json
{"code":403,"message":"没有操作权限","data":null}
```

图片下载返回二进制而非该包。CORS拒绝、代理错误等也可能返回文本/HTML；先检查状态码和Content-Type，再决定是否解析JSON。

| HTTP状态 | App处理 |
| --- | --- |
| 400 | 参数、格式或状态流转不合法，显示message并允许修正 |
| 401 | 登录失败、令牌过期、会话撤销或账号禁用；清理登录状态并回登录页 |
| 403 | 无角色、区域或执行人权限；提示无权限，不反复重新登录 |
| 404 | 接口/记录/文件不存在，返回列表并刷新 |
| 409 | 数据重复或有关联记录，提示后端message |
| 413 | 请求附件超过全局限制；业务5MB校验也可能返回400 |
| 500 | 服务内部异常，记录接口与时间供后端排查，不自动重复提交业务 |

### 2.2 字段、时间和列表

- 写入JSON大多为驼峰，例如`nodeId`、`assigneeId`；JDBC列表/详情大多为下划线，例如`node_id`、`due_at`。`/profile`与`/sessions`等是专门组装的驼峰对象。请在App数据层做映射，不要全局机械转换。
- `id`是数据库数字标识。节点显示用`code`；工单接口原始结果通常只有`id`，没有网页演示中的`number`字段。网页格式化工单编号的逻辑不是后端接口，不应把示例`WO-250514-029`作为请求ID。
- 请求中的Instant时间发送ISO 8601，例如`2030-01-01T10:00:00Z`或`2030-01-01T18:00:00+08:00`。派单期限必须在未来。URL查询里的`+`应编码为`%2B`，也可统一使用Z时间。
- 返回时间按实际JSON解析为时间对象；不要依赖网页中文显示字符串。空的`last_seen`、`due_at`、`recovered_at`、`checked_at`有业务含义。
- Boolean使用JSON的true/false，不能发送字符串`"true"`。
- 当前列表不是服务端分页接口，没有统一`page/size/total`返回结构。工单/告警最近500条，巡检任务300条、通知200条、审计1000条；App可在已返回集合内筛选，但不能称为全库检索。
- 当前没有WebSocket/SSE实时订阅接口。可以前台按约15秒刷新，离开页面/进入后台时停止无意义轮询。

### 2.3 登录、当前身份和退出

**POST `/auth/login`**（本节起相对BASE_URL）

```json
{"username":"由管理员分配的账号","password":"该账号的密码"}
```

```json
{"code":0,"message":"success","data":{"accessToken":"<JWT>","tokenType":"Bearer","expiresIn":3600,"username":"worker01"}}
```

用户名必填、最多64字符；登录密码必填、最多128字符。App用用户输入登录，不内置真实管理员密码。

登录后调用：

| 接口 | data与用途 |
| --- | --- |
| GET `/auth/me` | `{subject:"用户ID字符串", username:"账号"}`；不含角色 |
| GET `/business/identity` | `{id,username,role,areas:[{area_id:1}]}`；角色与区域以此接口为准 |
| GET `/business/profile` | 个人资料及`sessionId`，见第8节 |

JWT有效期3600秒，**没有refreshToken接口**。服务器还检查会话是否撤销、账号是否启用、距离上次鉴权请求是否超过idleMinutes（15/30/60分钟）。持续轮询会更新服务器会话活跃时间；若产品需要按“用户无操作”退出，App需另外记录交互时间，后台不持续保活。

本地退出时清理token及敏感缓存。若需同时使当前会话失效，先取profile.sessionId，调用`POST /business/sessions/{sessionId}/revoke`，然后清理本地；下次使用该token会收到401。当前没有`/auth/logout`接口。

## 3. 角色和权限

| 标记 | 含义 |
| --- | --- |
| ALL | 已登录账号；仍受区域、资源归属校验 |
| M | ADMIN或MANAGER；MANAGER仅限已授权区域 |
| A | 仅ADMIN |
| OWNER | 该工单负责人或参与人；巡检点提交/上传则必须是任务指定执行人 |

ADMIN=管理员，MANAGER=值班长，INSPECTOR=巡检员。巡检员只能看到分配给本人或本人参与的工单、本人巡检任务；不是该区域任何工单都能处理。客户端隐藏按钮只是界面处理，服务器会再次检查权限。

新增用户后必须配置区域。没有区域的巡检员可能登录成功但列表为空。网页中的“只读/角色切换”仅为视图逻辑，没有对应的后端切换身份接口。

## 4. 区域、节点和监测

| 方法与路径（相对`/api/business`） | 权限 | 参数/主要返回 |
| --- | --- | --- |
| GET `/corridors` | ALL | 数组：id、name、description |
| GET `/areas` | ALL | 数组：id、name、description、corridor_id |
| GET `/sections?areaId=1` | ALL | 指定授权区域的区段数组 |
| GET `/nodes` | ALL | 授权范围内节点数组，包含latest、active_alarms |
| GET `/nodes/{id}/history` | ALL | hours默认24，1～720；metric可选；from/to可选ISO时间；最多30天/5000条 |
| GET `/alarms` | ALL | 授权范围内最近500条告警 |
| GET `/rules?areaId=1` | M | 区域告警规则数组 |
| POST `/rules` | M | 保存一项区域+指标规则，见下例 |
| POST `/alarms/{id}/acknowledge` | M | `{"note":"已联系现场人员"}`，note必填、最多1000字符 |

节点主要字段：`id, code, area_id, area_name, section_id, location, owner_id, metrics, enabled, maintenance, report_seconds, external_id, platform, x_position, y_position, last_seen, active_alarms, latest`。`metrics`为逗号分隔字符串。**没有GET `/nodes/{id}`独立详情接口**，App从列表保存节点数据，再按ID查询历史/关联告警。

`latest`为数组，每项含`id,node_id,message_id,metric,metric_value,unit,collected_at,received_at,source`。指标可能缺失；不能把缺失值强制显示为0。

| metric | 含义 | 单位 |
| --- | --- | --- |
| methane | 甲烷 | %LEL |
| temperature | 环境温度 | °C |
| humidity | 湿度 | %RH |
| infrared | 红外温度 | °C |

`metric_value`为数值。历史数据按采集时间倒序返回，画折线图前按时间升序处理。返回字段中没有保证存在网页演示用的`health`健康度，应自行明确展示算法；不要把演示数据字段当成真实API字段。

节点状态在App侧可按现有网页口径推导：未启用→停用；maintenance→维护；last_seen空→无数据；距离last_seen超过report_seconds×3→离线；其余有active_alarms→告警，否则正常。active_alarms表示尚未恢复的告警数量，不等同于未确认数量。

告警字段：`id,node_id,code,area_id,metric,severity,reason,status,triggered_at,recovered_at,acknowledged_by,acknowledged_at,note`。severity为LOW/MEDIUM/HIGH，status为OPEN或ACKNOWLEDGED；**是否恢复请检查recovered_at**，不要等待不存在的RECOVERED状态。

规则请求（驼峰）：

```json
{"areaId":1,"metric":"methane","threshold":35,"durationSeconds":0,"severity":"HIGH","enabled":true}
```

`durationSeconds`为0～86400秒，threshold需为有限数值。规则返回字段为`threshold_value`、`duration_seconds`等下划线形式。规则按**区域+指标**保存，不是独立的每节点阈值；修改后会影响该区域相关节点。

## 5. 工单：App第一阶段核心

| 方法与路径（相对`/api/business`） | 权限 | 说明 |
| --- | --- | --- |
| GET `/orders` | ALL | 按账号范围返回最近500单 |
| GET `/orders/{id}` | ALL | 校验区域和工单归属；返回详情、参与人、事件和附件 |
| POST `/orders` | ALL | 创建DRAFT工单，返回`{id}` |
| POST `/orders/{id}/assign` | M | 单单派发/改派，1～2名执行人 |
| POST `/orders/batch-assign` | M | 增加orderIds数组，最多100条；事务内执行，失败整体回滚 |
| POST `/orders/{id}/schedule` | M | 更新优先级/截止时间/备注 |
| POST `/orders/{id}/action` | 见下表 | 接单、开始、提交、复核、退回、取消 |
| POST `/orders/{id}/attachments` | OWNER | 已接单或处理中上传照片 |
| GET `/attachments/{attachmentId}` | 工单可读者 | 携token获取图片二进制 |

工单基础字段：`id,node_id,node_code,area_id,alarm_id,title,priority,status,assignee_id,assignee_name,creator_id,due_at,description,result_text,readings,created_at,updated_at`。扩展字段如`source/analysis_id`可为空。

**列表中的assignee_name通常只是主执行人账号。详情另外返回participant_ids数组，且会拼接参与人名称。双人协作的显示和操作资格应以详情为准。**

详情扩展：

- `participant_ids`：数字数组。
- `events`：`id,order_id,actor_id,action,note,created_at,username`，按事件ID正序；例如CREATE、ASSIGN、ACCEPT、START、SUBMIT、APPROVE、REJECT、CANCEL、UPDATE_SCHEDULE。
- `attachments`：`id,original_name,content_type,created_at`，需再调用下载接口。

### 5.1 创建、派单与改期请求

创建工单：nodeId/title必填，title最多200字符；priority默认MEDIUM，alarmId可省略但提供时必须与节点匹配。

```json
{"nodeId":1,"title":"检查节点异常","priority":"HIGH","description":"复核现场读数并拍照","alarmId":1}
```

单人或双人派单：

```json
{"assigneeId":2,"participantIds":[2,3],"priority":"HIGH","dueAt":"2030-01-01T10:00:00Z","note":"两人协同检查现场"}
```

assigneeId、priority、note必填；note最多2000字符。participantIds省略时按assigneeId单人派发，提供时必须1～2个去重后的ID且包含assigneeId；所有执行人必须是启用且授权该区域的INSPECTOR。dueAt可空，但非空时必须是未来。REVIEW/COMPLETED/CANCELLED不能派发；其他允许状态的改派会重置为ASSIGNED。

批量派单使用相同请求体，额外增加`"orderIds":[1,2]`。不要误把参与人数组当成工单数组。

改期请求：`{"priority":"MEDIUM","dueAt":"2030-01-01T10:00:00Z","note":"调整期限"}`。priority/note必填；dueAt省略或null会清空期限，而非保留原值。已完成/已取消不能调整。

### 5.2 状态与动作

```text
DRAFT →（管理派单）ASSIGNED → accept → ACCEPTED → start → PROCESSING
PROCESSING → submit → REVIEW → approve → COMPLETED
REVIEW → reject → PROCESSING
未结束工单 →（管理cancel）CANCELLED
```

双人处理共享同一个工单状态，不存在每位参与人分别签收/分别完成的状态；任一有资格的参与人操作后，其他人应刷新详情。

| action请求值（小写） | 当前状态 | 权限 | 额外字段 |
| --- | --- | --- | --- |
| accept | ASSIGNED | OWNER | note可选 |
| start | ACCEPTED | OWNER | note可选 |
| submit | PROCESSING | OWNER | result必填≤4000；readings可选字符串≤2000；note可选≤2000 |
| approve | REVIEW | M | 不能复核自己作为主执行人的工单；note可选 |
| reject | REVIEW | M | note必填，说明退回原因 |
| cancel | 非COMPLETED/CANCELLED | M | note必填，说明取消原因 |

```json
{"action":"submit","result":"现场读数已恢复，设备运行正常","readings":"甲烷12%LEL；温度25°C","note":"照片已上传"}
```

状态不符通常返回400，执行人/区域不符返回403。按钮点击后禁用重复提交；网络超时先查询详情，确认服务端状态后再决定下一步，不盲目重试创建/派单/提交。

### 5.3 图片上传与下载

上传均为`multipart/form-data`，文件字段名称必须为 **file**，一次一个文件。JSON里的文件路径、Base64或数组均不能代替multipart。需带Authorization；Content-Type的boundary由上传库生成。

| 用途 | 上传路径 | 图片类型与时机 |
| --- | --- | --- |
| 工单照片 | `/business/orders/{id}/attachments` | JPEG/PNG/WebP；1字节～5MB；OWNER且状态ACCEPTED/PROCESSING |
| 巡检照片 | `/business/patrol/results/{resultId}/attachments` | JPEG/PNG；1字节～5MB；任务指定执行人，点位尚未提交 |
| 头像 | `/business/profile/avatar` | JPEG/PNG；1字节～5MB；本人 |

后端检查文件类型与文件头，不接受改扩展名伪装的文件。成功通常data=null，上传后刷新详情取得附件ID。**先上传照片，再提交工单/巡检点结果**，否则新状态可能不再允许上传。

下载：工单`GET /business/attachments/{id}`，巡检`GET /business/patrol/attachments/{id}`，头像`GET /business/profile/avatar`。返回Content-Type与二进制；头像尚无文件时可404。App需带token下载到缓存或内存后显示，不能把无鉴权的普通图片URL当作公开地址。

## 6. 巡检任务

| 方法与路径（相对`/api/business/patrol`） | 权限 | 说明/请求 |
| --- | --- | --- |
| GET `/plans` | M | 计划数组 |
| POST `/plans` | M | 创建计划，返回{id}，见下例 |
| POST `/plans/{id}/enabled` | M | `{"enabled":false}`启停计划 |
| POST `/plans/{id}/generate` | M | 为启用计划生成任务，返回任务{id} |
| GET `/runs` | ALL | 任务列表；巡检员仅自己的任务 |
| GET `/runs/{id}` | ALL | 任务详情，带points数组及每点附件 |
| POST `/results/{resultId}` | 任务指定执行人 | 提交单个点位结果 |

```json
{"name":"A区日常巡检","areaId":1,"assigneeId":2,"periodHours":24,"points":[{"nodeId":1,"checkItems":"检查读数、设备外观和环境"}]}
```

周期1～8760小时，至少一个点位，节点必须同区域，执行人是该区域启用巡检员。计划后台约30秒检查一次到期任务；不是App必须自己定时生成。

run主要字段：`id,plan_id,assignee_id,status,created_at,completed_at`，列表增加`name,area_id,assignee_name`；详情增加`name,area_id,points`。状态为PENDING/PROCESSING/COMPLETED。

point主要字段：`id,run_id,node_id,code,location,check_items,result_text,abnormal,checked_at,order_id,attachments`。**提交结果和上传照片使用point.id（patrol_result ID），不是node_id或run.id。**

```json
{"result":"检查完成，设备与环境正常","abnormal":false}
```

result必填≤4000字符。abnormal=true会创建一张MEDIUM优先级DRAFT工单，刷新任务详情从order_id读取。每点只可提交一次；全部点已提交后任务自动COMPLETED，否则PROCESSING。管理员/值班长能查看任务，不代表能替执行人提交结果。

## 7. 通知、手册、审计与报表

| 方法与路径（相对`/api/business`） | 权限 | 参数/返回 |
| --- | --- | --- |
| GET `/notifications` | ALL | 本人最近200条通知 |
| POST `/notifications/{id}/read` | ALL | 标为已读，无需JSON体，只更新本人的通知 |
| GET `/handbooks` | ALL | 全部手册 |
| GET `/audit` | M | 管理员全部、值班长本人及授权区域，最多1000条 |
| GET `/statistics` | M | areaId/from/to可选 |
| GET `/reports?type=orders` | M | type=orders或alarms，areaId/from/to可选；返回JSON行数组，不是CSV文件流 |

通知字段：`id,user_id,title,content,object_type,object_id,is_read,created_at`；object_type常见ORDER、PATROL。App根据类型打开相应详情。没有推送订阅/已读全部/删除接口；网页声音与桌面通知属于网页行为，App系统通知需客户端另外实现。

手册字段：`id,title,category,steps,review_points,reference_source,updated_at`，steps为文本而非步骤对象数组。

审计字段：`id,actor_id,actor_name,action,object_type,object_id,before_value,after_value,area_id,created_at`。before_value/after_value可能是Java Map.toString或普通文本，**不保证是JSON**。当前没有独立审计详情接口、来源IP字段或防篡改校验结果。

统计默认最近30天，允许1秒～366天；from/to按工单创建时间/告警触发时间等相应口径筛选。data主要字段：

| 字段 | 形态/口径 |
| --- | --- |
| orders | `[{status,total}]` |
| alarms | `[{severity,total}]` |
| overdue | 未结束且期限已过的工单数 |
| averageResponseSeconds | 创建至ACCEPT事件的平均秒数；无数据可为null |
| coverage | `{total,checked}`，巡检点记录数量及已检查数量 |
| repeatNodes | `[{code,total}]`，重复告警点位 |
| alarmRecovery | `{total,recovered}` |
| monthlyAlarms | 当前上海时区自然月告警数，不受from/to完全同义约束 |
| weekly | 12项`{label,planned,completed}`，百分数0～100；以to所在周向前推12周，非当前from窗口 |
| from/to | 本次查询采用的边界 |

周趋势以启用节点数作分母计算去重计划/已查节点比例，不是工单完成率。报表超过10000条会返回400要求缩小范围；CSV需要App自己序列化或分享保存。

## 8. 个人资料、密码与设备会话

| 方法与路径（相对`/api/business`） | 权限 | 说明 |
| --- | --- | --- |
| GET `/profile` | ALL | 当前个人资料，见下例 |
| PUT `/profile` | ALL | 保存个人资料，建议读取后完整提交可写字段 |
| POST `/profile/password` | ALL | currentPassword/newPassword |
| GET `/sessions` | ALL | 当前账号有效且未撤销的会话数组 |
| POST `/sessions/revoke-others` | ALL | 撤销其他设备，无需JSON体 |
| POST `/sessions/{id}/revoke` | ALL | 撤销本人指定会话；id是字符串UUID |

profile返回示例：

```json
{"id":2,"username":"worker01","displayName":"巡检员甲","role":"INSPECTOR","phone":"","email":"","areaId":1,"idleMinutes":30,"avatar":false,"sessionId":"<UUID>","preferences":{"sound":true,"desktop":false,"criticalOnly":false,"quietStart":"22:00","quietEnd":"07:00"}}
```

以上是data内容。PUT时提交`displayName,phone,email,areaId,idleMinutes,preferences`；displayName必填≤100字符，phone≤32，email≤200且非空时校验格式；areaId可null，非空需有区域权限；idleMinutes仅15/30/60。没有PATCH接口，省略字段可能清空或恢复默认，不能当作局部更新。

密码请求：

```json
{"currentPassword":"旧密码","newPassword":"NewPassword123"}
```

新密码至少8字符、包含字母数字、UTF-8不超过72字节；成功保留当前会话并撤销其他会话。管理员创建账号/重置密码使用第9节规则，至少12字符，**与本人改密规则不同**。确认密码只需在App本地校验，无需提交confirmPassword。

sessions项为`{id,browser,platform,ip,location,lastSeen,current}`。现有User-Agent识别未专门适配HarmonyOS，可能显示“其他设备/浏览器”，location目前为空；不要据此认为登录失败。该接口只列未撤销、未过JWT到期时间的会话，不保证逐项已按无操作超时过滤。

preferences保存为配置，声音、免打扰和客户端系统提醒需App自行执行；当前没有二次验证、短信验证、手机号验证码换绑接口。

## 9. 管理员/值班长扩展接口

巡检员App不必第一阶段实现以下写入界面，但管理端App可复用。

| 方法与路径（相对`/api/business`） | 权限 | 请求字段（!必填） |
| --- | --- | --- |
| GET `/users` | M | 返回id,username,display_name,role_code,enabled,created_at,areas（数字数组） |
| POST `/users` | A | username!≤64、password!至少12字符且text校验≤72字符、role!、displayName可选；返回{id} |
| PUT `/users/{id}` | A | role!、enabled、displayName、areas数字数组；省略areas会清空授权 |
| POST `/users/{id}/password` | A | password!，同创建密码规则 |
| POST `/corridors` | A | name!≤100、description；返回{id} |
| PUT `/corridors/{id}` | A | name!、description |
| DELETE `/corridors/{id}` | A | 有关联数据时可能409 |
| POST `/areas` | A | name!≤100、description、corridorId（默认1）；data=null |
| PUT `/areas/{id}` | A | name!、description、corridorId（省略保留原管廊） |
| DELETE `/areas/{id}` | A | 有关联数据时可能409 |
| POST `/sections` | M | areaId!、name!≤100；data=null |
| PUT `/sections/{id}` | M | name!≤100 |
| DELETE `/sections/{id}` | M | 区域校验；有关联数据时可能409 |
| POST `/nodes` | M | areaId!、code!≤64、location!≤200、externalId、platform；返回{id} |
| PUT `/nodes/{id}` | M | location!、reportSeconds!（5～86400）、enabled、maintenance、x/y（0～100）、externalId、platform、sectionId、ownerId、metrics逗号分隔字符串 |
| DELETE `/nodes/{id}` | M | 物理删除，有关联记录可能409；停用优先用PUT enabled=false |
| POST `/handbooks` | M | title!≤200、category!≤100、steps!≤10000、reviewPoints、source |
| PUT `/handbooks/{id}` | M | 同上 |
| DELETE `/handbooks/{id}` | M | 删除手册 |

用户role仅ADMIN/MANAGER/INSPECTOR。不能禁用自己或移除自己管理员身份，至少保留一个启用管理员。创建用户后再PUT授权areas；否则非管理员可能无业务访问范围。

节点PUT应从已读节点组装完整请求：省略enabled/maintenance会按false写入，ownerId/sectionId可被清空；metrics为配置指标字符串，platform只是来源标记，不会自动连接华为IoT。

## 10. 数据上报与模拟：供联调，不是设备认证

| 方法与路径（相对`/api/business`） | 权限 | 请求 |
| --- | --- | --- |
| POST `/nodes/{id}/telemetry` | M | messageId/source/collectedAt/values |
| POST `/nodes/{id}/simulate` | M | `{"scenario":"normal"}`；normal/gas/heat/offline |

```json
{"messageId":"unique-test-message-001","source":"SIMULATOR","collectedAt":"2026-11-09T08:00:00Z","values":{"methane":12,"temperature":25,"humidity":60,"infrared":27}}
```

上报成功data为`{inserted:...}`；重复节点+消息ID+指标去重。采集时间、指标和数值须通过服务校验；不要提交未来采集时间。旧采样可能入历史但不逆转当前告警。该接口使用管理账号鉴权，不适合把管理员token放入真实设备固件。

华为IoT/MQTT接入、设备凭据、Agent分析、预测、远程设备控制均尚未实现；App应明确显示当前数据来源，不将模拟记录包装为真实采集。更详细的未来接入边界见`integration-contracts.md`。

### 10.1 华为IoTDA设备影子同步预留

新增管理接口：`GET /business/integrations/huawei-iot/status`查看开关与配置标志，`POST /business/nodes/{id}/huawei-iot/sync`主动同步单个节点，无请求体。仅ADMIN/MANAGER可调用，并检查节点区域；默认关闭返回503。配置与完整响应见[huawei-iot-integration.md](huawei-iot-integration.md)。

节点需绑定platform=HUAWEI_IOT、externalId为实际云设备ID（支持128字符）。华为IAM Token仅由后端保管，App仍使用本项目JWT；云端鉴权失败返回502，不应让App退出登录。当前无定时拉取、Token自动续期或真实华为联调证据。

## 11. 鸿蒙网络调用起步示例

适用于采用Network Kit的ArkTS项目。先在模块`module.json5`的`module.requestPermissions`中声明网络权限：

```json
{"requestPermissions":[{"name":"ohos.permission.INTERNET"}]}
```

该片段需合并到现有module对象，不是替换整个module.json5。HTTP/HTTPS策略与API版本有关，应按目标SDK检查官方说明；开发期局域网可用性需真机验证，正式部署使用HTTPS。

```typescript
import { http } from '@kit.NetworkKit';

interface LoginPayload { username: string; password: string; }
interface LoginData {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  username: string;
}
interface LoginEnvelope { code: number; message: string; data: LoginData | null; }

export async function login(baseUrl: string, payload: LoginPayload): Promise<LoginData> {
  const request = http.createHttp();
  try {
    const response = await request.request(`${baseUrl}/auth/login`, {
      method: http.RequestMethod.POST,
      header: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      extraData: JSON.stringify(payload),
      expectDataType: http.HttpDataType.STRING,
      connectTimeout: 10000,
      readTimeout: 15000
    });
    if (typeof response.result !== 'string') {
      throw new Error('响应类型异常');
    }
    let body: LoginEnvelope;
    try {
      body = JSON.parse(response.result) as LoginEnvelope;
    } catch {
      throw new Error(`服务器未返回JSON，HTTP ${response.responseCode}`);
    }
    if (response.responseCode < 200 || response.responseCode >= 300 || body.code !== 0 || body.data === null) {
      throw new Error(body.message || `登录失败，HTTP ${response.responseCode}`);
    }
    return body.data;
  } finally {
    request.destroy();
  }
}
```

业务请求复用同样流程，增加`Authorization: Bearer ${token}`；统一处理401。不要在日志中输出密码、完整token或上传文件内容。token存储由App使用目标SDK支持的安全机制实现，本文不提供未经验证的持久化代码。

参考：[华为HTTP请求指南](https://developer.huawei.com/consumer/cn/doc/HarmonyOS-Guides/http-request/)、[HTTP API参考](https://developer.huawei.com/consumer/en/doc/harmonyos-references/js-apis-http/)。示例按当前官方Network Kit导入与request接口编写；项目选定SDK后仍需DevEco编译和真机测试。

## 12. 联调验收清单与常见问题

- [ ] 真机能请求health；baseUrl不是手机localhost，也不是Vite端口。
- [ ] 登录成功后保存token，identity能返回预期role与区域。
- [ ] 巡检员能看到自己的工单；没有区域时能提示联系管理员。
- [ ] 工单按accept/start/上传/submit顺序操作，管理账号可approve/reject。
- [ ] 双人派单后任一参与人能读详情并处理，另一端能刷新共享状态。
- [ ] 巡检任务使用resultId上传和提交；提交后不再显示重复提交入口。
- [ ] 图片下载带token，超5MB及类型错误有提示。
- [ ] 过期或撤销的会话返回401后清理状态，不形成无限重试。
- [ ] 弱网下不会因自动重试重复创建工单、提交巡检点。
- [ ] 无数据、空列表、无期限、无头像、null统计值均有正常空状态。
- [ ] App后台停止轮询；日期跨时区显示与期限判断正确。

| 现象 | 优先检查 |
| --- | --- |
| 手机连接失败 | IP、端口、网络互通、后端是否启动、监听与防火墙、目标SDK网络策略 |
| 登录成功但列表空 | 当前账号区域授权、工单是否分给该账号、是否用了H2空库 |
| 403 | 当前角色、节点区域、是否本人任务/参与工单；不能靠客户端改role解决 |
| Unexpected token / JSON解析失败 | 先读HTTP状态与Content-Type，可能拿到CORS文本、代理错误或图片 |
| 上传失败 | multipart字段必须file、文件头/MIME、5MB限制、业务状态与执行人资格 |
| 接单/提交返回400 | 查询最新详情；可能已被另一参与人操作，或顺序不正确 |
| 改资料后原值丢失 | 当前PUT不是PATCH，是否漏传了完整可写字段 |

后端源码与配置为最终依据。当前已有14项后端测试及5项网页通知规则测试通过的收尾记录；本文新增后未修改后端行为，不等同于已完成鸿蒙SDK编译、手机网络或全量多端联调。

本次文档检查：已从全部控制器注解提取68个端点生成索引，15个JSON代码块均通过语法解析。未因文档变更重复运行后端测试。
