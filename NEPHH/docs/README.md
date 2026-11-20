# 智巡·管廊文档入口

新加入的开发者或AI从这里开始。本文档目录同时包含产品规划、当前功能、接口契约和历史过程记录，几类内容不能混为完成状态。

## 推荐阅读顺序

1. **[项目背景与产品规划](project-context.md)**：由用户提供的8页企划书提炼；了解目标用户、场景、四层架构、双Agent岗位、原稿约束与未决策项。
2. **[当前软件交付说明](current-delivery.md)**：了解当前实际软件能力、演示方式、未接入项和最近测试记录。
3. **[鸿蒙App后端对接文档](鸿蒙App后端对接文档.md)**：开发原生App时的连接、鉴权、权限、字段、状态机和上传说明。
4. **[接口索引CSV](backend-api-index.csv)**：68个控制器端点，便于筛选查找；接口发生变化后应重新核对。
5. **[硬件与Agent接入预留契约](integration-contracts.md)**：准备接入真实平台、设备或Agent时阅读。
   华为IoTDA主动读取设备影子另见 **[接入配置与同步接口](huawei-iot-integration.md)**，默认关闭，尚未真实平台联调。
   实际部署时按 **[后续接入操作手册](华为IoTDA后续接入操作手册.md)** 逐步执行；可转交[文档压缩包](huawei-iot-handoff.zip)。
6. 启动与配置：[后端README](../NEPHH-backend/README.md)、[网页端README](../NEPHH-Admin/README.md)。

## 当前阶段速记

- 产品愿景：OpenHarmony原生巡检应用＋感知节点＋环境预警/应急抢修两个Agent。
- 当前仓库：Vue 3/TypeScript网页端、Spring Boot后端、MySQL/Flyway；已有人工业务流程。
- 尚未完成：原生鸿蒙App、华为IoT/MQTT、实体硬件、软总线、NFC、离线RDB、Agent/RAG及真实设备联调。
- 真实服务器角色：ADMIN、MANAGER、INSPECTOR；运维主管/只读菜单不代表新增服务器角色。
- 演示数据和模拟上报不代表真实采集，企划成本/提前预警/24小时运行等目标不代表实测结果。

## 怎样判断文档与代码的关系

| 问题 | 应查资料 |
| --- | --- |
| 为什么做、未来想做什么 | project-context.md，含原PDF页码 |
| 当前交付了什么 | current-delivery.md；再看当前源码与测试 |
| App实际该发什么请求 | 鸿蒙App后端对接文档、控制器、权限服务与数据库迁移 |
| 设备/AI未来怎么复用业务 | integration-contracts.md |
| 页面设计与验收到哪一步 | figma-completion-audit.md及状态索引 |

涉及当前运行行为时，最新源码和实际验证优先于文档摘要；涉及产品目标时，保留原稿版本与后续用户决策的差别。发现冲突应注明，不要静默把“规划”改成“完成”，也不要为匹配企划书放宽当前权限。

## 历史与设计过程记录

- [实施与验收记录](implementation-progress.md)：早期软件闭环验证，含当时版本与环境；其中V6等记录是历史快照，当前迁移已到V9。
- [设计还原过程](figma-redesign-progress.md)：历次样式修改与验证范围。
- [设计完成度审查](figma-completion-audit.md)：原始素材/截图等限制，不能据构建通过宣称像素级一致。
- [41状态索引](figma-state-audit.json)：参考图和历史证据路径，pending不代表视觉验收通过。
- [布局记录](figma-layout-notes.md)：阶段性布局信息，使用前需与当前样式核对。

原始PDF位于提供者电脑桌面，未复制为仓库依赖。project-context.md已保留来源、版本、页码、指纹和主要信息，后续AI无需依赖本机桌面路径即可理解项目。
