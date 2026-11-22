# 智巡管廊：华为IoTDA后续接入操作手册

整理日期：2026-11-09。适用版本：已有设备影子主动读取适配层、V9数据库迁移的后端。

本文供后续负责硬件、云平台和后端联调的人员执行。当前接口已实现，但默认关闭；真实云账号、设备和硬件链路尚未验证。**本文是操作方法，不是已完成接入的报告。**

## 1. 最终要接通的链路

```text
传感器/硬件
  → 向华为IoTDA上报设备属性
  → 平台更新设备影子reported
  → 智巡后端主动同步该节点
  → 保存监测数据并运行现有规则告警
  → 网页/鸿蒙App查询智巡后端展示数据
```

本期只支持按节点手动触发同步。没有自动轮询、平台推送或Token自动续期；App也不直接持有华为凭据。影子仅保存最新状态快照，不能补齐两次读取之间所有历史采样。

## 2. 谁负责准备什么

| 负责人 | 准备内容 | 完成标志 |
| --- | --- | --- |
| 硬件人员 | 设备接入IoTDA、正确属性及单位、正确上报时间 | 控制台reported值与采集时间会随真实上报变化 |
| 华为云负责人 | 项目/实例、应用侧地址、查询影子的IAM权限、有效Token | 能用华为官方查询接口读取该设备影子 |
| 后端人员 | 私有配置、属性映射、数据库迁移、节点绑定 | 智巡同步接口成功，数据来源HUAWEI_IOT |
| 鸿蒙/网页人员 | 调现有节点、历史、告警接口 | 页面可见真实来源与时间，不显示为模拟数据 |

设备秘钥/MQTT密码、华为IAM Token、本项目JWT是三类不同凭据。设备ID、产品ID、项目ID、实例ID也是不同字段，不要混用。

## 3. 第一步：先在华为平台验证设备属性

1. 确定使用的IoTDA区域及实例；产品、设备与后续IAM项目范围保持一致。
2. 为设备准备产品模型，记录准确的服务ID（service_id）、属性名和单位。服务/属性大小写按实际模型填写。
3. 注册并接入设备，取得实际device_id。设备名称和产品ID不能代替device_id。
4. 让设备按产品模型做**属性上报**。仅发送普通透传消息不保证更新设备影子。
5. 在设备详情/设备影子中检查reported：有真实读数、event_time有效，而且新的设备上报会更新它。
6. 不要把desired（期望值）当成传感器读数，也不要仅凭“能查到影子”判断设备当前在线。

产品模型和上报方式依据[华为设备属性上报说明](https://support.huaweicloud.com/usermanual-Iothub/iot_01_0326.html)。具体菜单随实例和控制台版本可能变化，以相应设备详情为准。

## 4. 第二步：收集平台连接信息

| 项目 | 从哪里确认 | 填入位置 |
| --- | --- | --- |
| 应用侧HTTPS地址 | IoTDA实例总览/接入信息 | HUAWEI_IOT_ENDPOINT |
| 区域项目ID | 华为云项目/API凭证信息 | HUAWEI_IOT_PROJECT_ID |
| 实例ID | 当前IoTDA实例详情，按实例要求携带 | HUAWEI_IOT_INSTANCE_ID |
| IAM用户Token | IAM获取用户Token接口的响应头 | HUAWEI_IOT_AUTH_TOKEN |
| 设备ID | 当前设备详情 | 智巡节点externalId |
| 服务/属性及源单位 | 该设备对应产品模型与实际固件 | 私有YAML中的mappings |

端点填写`https://实际应用侧域名`，可带端口；不要填MQTT地址、控制台网页地址、IAM地址，或已经包含`/v5/iot/...`的完整API路径。

### IAM Token怎么取得

1. 由云平台负责人按[华为认证鉴权文档](https://support.huaweicloud.com/api-iothub/iot_06_v5_0091.html)中的“获取用户Token”流程操作；选择正确的IAM区域端点与项目范围。
2. 确认该身份有目标实例的设备影子查询权限，不能仅有设备侧连接权限。
3. 取成功响应头中的`X-Subject-Token`值。这个值由后端请求IoTDA时放入`X-Auth-Token`。
4. 通过安全渠道交给部署负责人，不写入本操作手册、仓库、App源码或截图。
5. 记录其到期时间。当前后端不会替你申请或刷新Token，到期前重新获取、更新配置并重启后端。

本手册不提供真实账号、密码或Token。不要把华为账号密码填进本项目的auth-token配置；配置需要的是已取得的Token字符串。

建议先在受控的API工具中验证华为接口：

```http
GET https://<应用侧地址>/v5/iot/<项目ID>/devices/<设备ID>/shadow
X-Auth-Token: <IAM Token>
Instance-Id: <实例要求时填写>
```

此步骤若失败，先处理平台权限、项目/实例或设备问题，再检查智巡代码。不要把真实Token保存到共享API集合。

## 5. 第三步：配置后端，先保持关闭

从后端目录操作，复制[配置模板](../NEPHH-backend/.local-huawei-iot.example.yml)为`.local-huawei-iot.yml`。该私有文件位于**后端运行工作目录**，已被.gitignore忽略。

后端同时保留`.local-database.yml`，不需要为了IoT更换已有数据库密码。其他机器的数据库由接手者自行配置。

配置示例，所有平台值都需要替换：

```yaml
app:
  huawei-iot:
    enabled: false
    endpoint: ${HUAWEI_IOT_ENDPOINT:}
    project-id: ${HUAWEI_IOT_PROJECT_ID:}
    instance-id: ${HUAWEI_IOT_INSTANCE_ID:}
    auth-token: ${HUAWEI_IOT_AUTH_TOKEN:}
    mappings:
      methane:
        service-id: environment
        property-name: gas
        unit: "%LEL"
      temperature:
        service-id: environment
        property-name: temperature
        unit: "°C"
      humidity:
        service-id: environment
        property-name: humidity
        unit: "%RH"
```

这里的environment/gas等只是示例，不是华为固定名称。请删除实际设备没有的映射，并让项目节点metrics只包含需要采集的指标；直接复制默认四项映射可能因设备没有红外属性而失败。

向**启动后端的同一个进程环境**提供下面的变量。IDEA需要在运行配置中设置，不能只在另一个终端中设置后假定IDEA也会读取：

```text
HUAWEI_IOT_ENDPOINT=https://实际应用侧域名
HUAWEI_IOT_PROJECT_ID=实际区域项目ID
HUAWEI_IOT_INSTANCE_ID=实际所需实例ID
HUAWEI_IOT_AUTH_TOKEN=安全渠道取得的有效IAM Token
```

示例私有文件的enabled为false。准备好联调时，最后将该文件中的enabled改为true并重启；仅设置HUAWEI_IOT_ENABLED=true可能被私有文件中的false覆盖。

### 单位核对

| 项目指标 | 项目要求的实际输入单位 |
| --- | --- |
| methane | %LEL |
| temperature | °C |
| humidity | %RH |
| infrared（可选） | °C |

unit配置只是确认源数据单位，不会执行换算。若硬件上报的是ppm、原始电压或ADC数值，必须先完成有依据的转换，不能改一个标签冒充%LEL。本轮适配层没有提供这类转换算法。

## 6. 第四步：绑定项目节点

1. 用ADMIN或被授权该区域的MANAGER登录真实环境；不要进入网页的内存演示环境。
2. 在节点管理中新增或编辑实际节点。
3. 平台选择HUAWEI_IOT，外部设备编号填写IoTDA的device_id。
4. 配置正确区域、区段、监测指标、上报周期，并启用该节点。
5. 同一云设备只绑定一个项目节点；同步时发现多个绑定会拒绝。

通过既有节点接口写入时字段叫`externalId`；查询节点列表返回字段叫`external_id`。云同步URL中的id始终是本项目节点数字ID。

升级后的后端启动时会应用V9迁移，将external_id扩为128字符。部署前按实际环境做好数据库备份，启动后检查Flyway迁移记录；不要重复手工执行完整schema.sql。本次开发只验证了H2迁移，尚未在你的真实MySQL实例执行V9。

## 7. 第五步：启用并做第一次同步

在私有文件设enabled=true并重启后端，先请求：

```http
GET http://<智巡后端地址>:8080/api/business/integrations/huawei-iot/status
Authorization: Bearer <本项目管理账号JWT>
```

应看到enabled、connectionConfigured、mappingConfigured均为true。后两项只代表基本配置齐全，不等于已经连接成功。

然后请求：

```http
POST http://<智巡后端地址>:8080/api/business/nodes/<项目节点ID>/huawei-iot/sync
Authorization: Bearer <本项目管理账号JWT>
```

无请求体。成功格式示例：

```json
{"code":0,"message":"success","data":{"nodeId":1,"deviceId":"实际云设备ID","inserted":3,"samples":1,"source":"HUAWEI_IOT"}}
```

inserted是新写入指标行数，不是设备数。samples是服务采样组数，不同服务可有不同原始采集时间。

### 用PowerShell调用本项目接口

此片段仅访问智巡后端，不负责取得华为IAM Token。先替换base与nodeId，密码交互输入，命令不打印登录Token：

```powershell
$base = 'http://127.0.0.1:8080/api'
$nodeId = 1
$username = Read-Host '输入本项目管理账号'
$securePassword = Read-Host '输入本项目密码' -AsSecureString
$credential = [System.Net.NetworkCredential]::new($username, $securePassword)
$body = @{ username = $username; password = $credential.Password } | ConvertTo-Json
try {
  $login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType 'application/json;charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
  if ($login.code -ne 0) { throw '登录失败' }
  $headers = @{ Authorization = "Bearer $($login.data.accessToken)" }
  Invoke-RestMethod -Uri "$base/business/integrations/huawei-iot/status" -Headers $headers
  Invoke-RestMethod -Uri "$base/business/nodes/$nodeId/huawei-iot/sync" -Method Post -Headers $headers
} finally {
  $body = $null
  $credential = $null
  $headers = $null
  $login = $null
  if ($null -ne $securePassword) { $securePassword.Dispose() }
}
```

调用是持久化同步操作。先在测试环境运行，不要同时让大量客户端自动重复触发。

## 8. 第六步：确认数据和告警都正确

- GET `/api/business/nodes`：目标节点latest中出现source=HUAWEI_IOT，数值/单位与平台reported相同。
- GET `/api/business/nodes/{id}/history?hours=24`：能看到本次采集时间对应记录；若影子采样超过24小时需扩大范围，最多720小时。
- GET `/api/business/alarms`：只有达到已配置规则条件时才应产生告警；没有告警不一定是同步失败。
- GET `/api/business/audit`：管理权限范围内有SYNC_HUAWEI_IOT记录。
- 在平台没有新上报的情况下再次同步：通常inserted=0。
- 设备产生新采样后同步：应新增数据；不要手工改desired来代替真实上报测试。
- 停止设备上报，仅重复读旧影子：不应把旧数据当成刚采集；超过节点上报周期三倍后，现有离线检测可标离线。

数据异常时先核对平台原始reported、映射、源单位和采集时间。系统不会用拉取时间覆盖原始event_time，也不会把缺失属性补成0。

## 9. 常见故障与处理

| 现象 | 检查顺序 |
| --- | --- |
| 本项目401 | 本项目JWT是否过期；重新登录管理账号 |
| 403 | 是否ADMIN/MANAGER，节点区域是否授权；巡检员不能触发同步 |
| 503未启用/配置未完成 | 私有文件工作目录、enabled覆盖、IDEA进程环境变量、HTTPS端点格式 |
| 502鉴权失败 | IAM Token是否过期、项目/实例范围、影子查询权限；不用退出App来解决云鉴权 |
| 502缺少服务/属性 | 实际产品模型是否与mappings一致，是否保留了不存在的红外等字段 |
| 502时间不合法 | reported.event_time缺失/格式错误/在未来；检查设备时钟及平台上报 |
| 502值/单位不合法 | 是否为布尔/对象/null/非数值，甲烷或湿度是否超0～100，是否错误使用ppm |
| 400绑定错误 | 平台字段、externalId、节点启用状态、同设备重复绑定 |
| inserted=0 | 是否同一reported采样；这可能是正常去重，不应强行改消息ID绕过去重 |
| 同步成功但显示离线 | reported采集时间已过旧、设备没有继续上报、report_seconds配置不符合设备周期 |
| App拿不到同步权限 | App读节点/历史即可，云同步留给管理账号或后续受控后台调度 |

平台调用只接受HTTPS，不跟随重定向，连接超时5秒、读取超时10秒。网络失败返回502，当前没有自动重试。

## 10. 日常运维和后续扩展

Token到期前重新获取，在部署环境更新后重启；变更属性模型后同步调整mappings与节点metrics。暂停接入时将enabled改回false并重启，已有历史数据保留。

需要自动拉取时，后续应增加后端统一调度、限流、失败退避、Token续期和实例配额管理；当前尚未实现。要求保存每一次采样时应考虑推送/队列，而不是只提高App同步频率。AK/SK认证需要替换/扩展HuaweiShadowClient，不是把AK填进auth-token字段。

鸿蒙App继续使用[后端对接文档](鸿蒙App后端对接文档.md)中的节点、历史和告警接口；详细实现边界见[设备影子适配说明](huawei-iot-integration.md)。

## 11. 交接验收记录模板

| 项目 | 待填写结果 |
| --- | --- |
| 联调日期/负责人 |  |
| 后端版本/部署环境 |  |
| IoTDA区域/实例与项目已核对 | 是/否（不填写Token） |
| 产品服务/属性/实际单位 |  |
| 项目节点ID与云设备ID |  |
| 平台reported最新采集时间 |  |
| 首次同步HTTP状态/inserted |  |
| 重复同步去重 | 通过/失败 |
| 新采样入库 | 通过/失败 |
| 规则告警与离线语义 | 通过/失败 |
| Token到期/更新负责人 |  |
| 未解决问题 |  |

本手册和配套ZIP不含真实凭据、私有配置、数据库或附件，不包含可运行的后端发行包。自动测试历史不能代替上述真实平台验收。

官方参考：[设备属性上报](https://support.huaweicloud.com/usermanual-Iothub/iot_01_0326.html)、[设备影子查询](https://support.huaweicloud.com/api-iothub/iot_06_v5_0079.html)、[认证鉴权与获取Token](https://support.huaweicloud.com/api-iothub/iot_06_v5_0091.html)。
