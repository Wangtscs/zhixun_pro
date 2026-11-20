# 华为IoTDA设备影子主动读取接口

当前状态：后端接入适配层已实现，默认关闭；仅以本地模拟华为响应测试，尚未连接真实华为账号/硬件。采用用户选择的“主动读取设备影子”，不包含HTTP推送、定时轮询、AK/SK签名、IAM Token自动续期或远程设备控制。

## 1. 数据路径

```text
硬件向华为IoTDA上报属性
  → IoTDA设备影子reported
  → 本后端按节点读取影子
  → 服务/属性映射和单位校验
  → TelemetryService.ingest
  → 历史读数、节点last_seen、规则告警、通知
  → 网页/鸿蒙App继续使用现有查询接口
```

设备影子表示最新上报快照，设备离线时也可能读到；不是完整历史数据流。需要每次设备上报都可靠入库时，应另行实现平台推送/队列订阅，本接口无法补回轮询之间被覆盖的采样。

## 2. 新增接口

沿用现有JWT：`Authorization: Bearer <本项目登录token>`。仅ADMIN或MANAGER可用，MANAGER仍受节点区域权限限制。App不能传任意平台地址、设备ID或云Token；这些来自后端配置与节点绑定。

### GET `/api/business/integrations/huawei-iot/status`

返回配置状态，不访问华为平台、不返回凭据：

```json
{"code":0,"message":"success","data":{"enabled":false,"connectionConfigured":false,"mappingConfigured":false,"mode":"DEVICE_SHADOW_PULL"}}
```

connectionConfigured表示地址/项目/Token基本格式齐全，不代表Token有效或云平台可达；mappingConfigured只表示映射表非空，具体服务、属性、单位和节点指标要在同步时校验。

### POST `/api/business/nodes/{id}/huawei-iot/sync`

无请求体；id为项目内部节点ID。读取华为平台并持久化数据，故使用POST。成功示例：

```json
{"code":0,"message":"success","data":{"nodeId":1,"deviceId":"实际云端设备ID","inserted":3,"samples":1,"source":"HUAWEI_IOT"}}
```

- inserted为本次新增的**指标行数**，不是新增设备数；重复读取同一采样可返回0。
- samples为映射后服务采样组数。不同服务分别保留各自的reported.event_time，不拼成一个假的统一采集时间。
- 数据写入及审计处于同一事务，任一组失败不会提交部分组。
- 成功会记录SYNC_HUAWEI_IOT审计；不会向调用者返回华为原始响应或云端鉴权信息。

| 返回状态 | 含义 |
| --- | --- |
| 401 | 本项目登录失效 |
| 403 | 非管理角色或节点区域未授权 |
| 404 | 项目节点不存在 |
| 400 | 节点未绑定、平台不是HUAWEI_IOT、节点停用、同一云设备绑定多个项目节点或绑定同步期间变化 |
| 503 | 接入未启用，或平台连接配置不完整/格式错误 |
| 502 | 华为鉴权/网络/响应错误，或者影子数据、映射、单位不符合约定 |

**华为返回401/403会被转换为本项目502**，提示后端人员检查云Token/权限；不会把平台Token过期误判为App用户退出登录。

## 3. 后端配置

复制`NEPHH-backend/.local-huawei-iot.example.yml`为同目录`.local-huawei-iot.yml`。后端从工作目录自动读取后者，私有文件已加入.gitignore。本次没有创建带真实配置的私有文件。

默认enabled=false。配置完整且准备联调后，再在私有文件改为true。不要提交云Token到Git或放进网页/鸿蒙App。

| 环境变量 | 用途 |
| --- | --- |
| HUAWEI_IOT_ENABLED | 无私有文件覆盖时的开关，默认false |
| HUAWEI_IOT_ENDPOINT | 控制台“平台接入地址”中的**应用侧HTTPS地址**，仅协议＋域名，可带端口；不能填设备侧MQTT地址或带/v5的完整API路径 |
| HUAWEI_IOT_PROJECT_ID | 该区域项目ID，不是产品ID |
| HUAWEI_IOT_INSTANCE_ID | 实例要求时配置，按平台说明设置；请求中作为Instance-Id |
| HUAWEI_IOT_AUTH_TOKEN | 华为IAM取得的有效Token，请求中作为X-Auth-Token；不是本项目JWT、设备密钥或MQTT密码 |

示例私有文件保留enabled=false，因此仅设置环境变量true不一定覆盖文件；启用时检查最终配置和status接口。端点仅支持HTTPS，客户端不跟随重定向；连接超时5秒、读取超时10秒。没有自动重试/定时任务，避免默认产生外部调用。

当前适配器使用华为文档支持的Token认证，Token由部署侧提供；过期后需要更新后端环境配置并重启服务。未实现获取IAM Token或自动续期。若后续改为AK/SK，替换HuaweiShadowClient实现即可复用映射和入库逻辑，不需要把密钥交给客户端。

## 4. 节点与属性映射

在现有节点管理中设置：

```text
platform    = HUAWEI_IOT
external_id = IoTDA设备ID（不是产品ID或设备名称）
metrics     = 项目需要接入的指标，如methane,temperature,humidity
enabled     = true
```

external_id通过既有节点POST/PUT的`externalId`字段保存。V9迁移将该列扩为128字符，网页输入限制同步调整；设备ID按平台接口规则仅接受字母、数字、下划线、连接符。同步时检测同一设备绑定多个节点并拒绝，不静默选择某个节点。

私有YAML映射示例（字段名必须替换成你实际产品模型中的服务和属性）：

```yaml
app:
  huawei-iot:
    enabled: false
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

- 映射为全局产品模型映射；本轮不提供每个节点单独物模型编辑。不同产品模型需后续扩展配置策略。
- 只处理映射中同时被节点metrics配置的指标；至少有一项可映射。
- 每项已选映射对应服务和属性必须存在，不能缺失时当0。服务重复、reported缺失、空值/布尔/对象值等均拒绝；支持JSON数值和数字字符串。
- unit是部署者确认源数据语义的声明，不是从影子自动推断的单位。仅接受methane=%LEL、humidity=%RH、temperature/infrared=°C。
- **不做ppm→%LEL、华氏→摄氏等隐式转换**。若设备原始单位不同，先完成经验证的转换适配，不能只把unit标签改成目标单位。
- 只读reported，忽略desired。使用reported.event_time（平台紧凑UTC格式或有效ISO时间），缺少/错误/明显未来时间则拒绝。
- 不用本次HTTP请求时间更新采集时间。同一设备、服务、采集时间和指标值生成稳定消息ID；改变desired/影子version不会将相同reported数据重新入库。
- 旧采样沿用现有历史和告警处理；重复拉取不会保活last_seen，过旧采样不会将离线告警假恢复。影子没有新的reported时间时节点仍可能离线，这是预期行为。

## 5. 联调步骤

1. 后端启动并自动应用V9迁移；准备有该区域权限的管理账号。
2. 配置实际应用侧HTTPS地址、项目/实例、有效IAM Token和物模型映射。
3. 给项目节点绑定HUAWEI_IOT和externalId，删除示例中不存在的指标映射或调整节点metrics。
4. 确认设备已向IoTDA上报属性，影子reported有数值和原始event_time。
5. 在后端私有配置启用并重启，查询status检查配置标志。
6. 调用POST同步接口；再调用GET `/api/business/nodes`、GET `/api/business/nodes/{id}/history`、GET `/api/business/alarms`查看结果。
7. 重复同步同一影子应inserted=0；设备产生新采样后才新增。断开设备后仅重复读影子，不应让它永远显示在线。

鸿蒙App只调用本项目接口，不拿华为Token。巡检员不能触发云同步；通常由值班长/管理员后台执行，或未来由受控后端调度任务触发。不要让每个App页面每几秒自动POST同步；读取现有数据库与调用云平台是两件不同的操作。

## 6. 验证和限制

自动测试使用H2和假的华为响应，不访问真实云：reported/desired区分、稳定去重、时间、单位/值校验、跨服务采样、JWT/角色/区域权限、禁用开关、Token不回显、旧影子离线语义、重复绑定及128字符设备ID。

本轮验证：后端Maven完整测试28项通过、0失败/错误（原有14项＋本次新增14项），H2成功执行V1～V9迁移；前端类型检查及生产构建通过。未在真实MySQL实例执行V9，也未提供/测试真实云Token，实际部署启动时仍需检查迁移记录。

HTTP适配器还用MockRestServiceServer检查实际URI与X-Auth-Token/Instance-Id头、平台401转换和配置错误不发请求。尚无真实平台凭据，因此未完成实际租户、网络、IAM权限和硬件采集联调。

源文件在`NEPHH-backend/src/main/java/com/nephh/iot/`，配置及状态接口不对外暴露Token。运行时使用现有Spring Web，不新增华为SDK依赖。

官方接口依据（2026-11-09核对）：[查询设备影子](https://support.huaweicloud.com/api-iothub/iot_06_v5_0079.html)、[认证鉴权](https://support.huaweicloud.com/api-iothub/iot_06_v5_0091.html)。实际实例权限、地址和鉴权方式需以使用的华为云租户为准。
