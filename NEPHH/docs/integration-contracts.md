# 硬件与 Agent 接入预留契约

当前系统为软件业务版。没有连接华为IoT、MQTT设备、分布式软总线或大模型；页面明确显示模拟数据。

补充：已新增华为IoTDA设备影子主动读取适配层与JWT管理接口，默认关闭；可复用本节统一入库服务。配置、属性/单位映射、时间与去重语义见[huawei-iot-integration.md](huawei-iot-integration.md)。适配层存在不等于已连接真实平台；MQTT/推送和Agent仍未接入。

## 硬件数据

业务节点 `monitoring_node` 的 code是内部编号；external_id为外部设备编号；platform为平台来源；owner_id为业务负责人；metrics为已配置指标。area/section/corridor保存业务位置，x/y仅为页面布局。

统一内部入口：`TelemetryService.ingest(nodeId,messageId,source,collectedAt,values)`。当前管理员/值班长可调用 `POST /api/business/nodes/{id}/telemetry` 联调，必须有该节点区域权限。

```json
{
  "messageId": "unique-device-message-id",
  "source": "SIMULATOR",
  "collectedAt": "2026-11-08T12:00:00Z",
  "values": {"methane": 12.0, "temperature": 25.0, "humidity": 60.0, "infrared": 27.0}
}
```

指标单位固定：methane=%LEL，temperature/infrared=摄氏度，humidity=%RH。未来适配器必须在调用入口前完成单位转换，不得直接将ppm当作%LEL。重复的节点+消息编号+指标不会再次入库；未配置指标、非有限数值、非法百分比或未来时间会被拒绝。

后续华为IoT适配器负责平台凭据、消息验证、外部设备映射、属性名和单位转换、重试；复用现有数据服务与告警，不修改前端数据查询格式。当前API是后台账号接口，不应把管理员JWT烧录到硬件。真实设备需另建服务身份/回调认证。

## Agent 分析

`analysis_result` 预留 provider、status、node_id、alarm_id、evidence、suggestions、created_at。当前无分析结果写入，也不提供虚构AI解释。

未来分析适配器输入：节点最新数据、历史窗口、活动告警、规则配置；输出：风险解释、证据、建议及来源。预计越阈时间允许为空，不应强制生成。

现有业务能力可复用：
- 查最新数据：GET `/api/business/nodes`
- 查历史：GET `/api/business/nodes/{id}/history`
- 创建待派发工单：POST `/api/business/orders`
- 派单：POST `/api/business/orders/{id}/assign`（要求管理权限）

`work_order.source/analysis_id`预留来源和分析关联；未来适配器应创建DRAFT草稿并由人确认。服务身份必须遵守区域授权与审计，不能绕过业务服务直接写库。断电、撤离等动作未实现远程控制，后续也不得由模型输出直接执行。

## 巡检点识别

当前手动选点。NFC/二维码/自动发现以后将外部标签映射到nodeId，再使用现有节点与巡检任务接口。工单照片、检查记录与识别硬件无关，可直接复用。
