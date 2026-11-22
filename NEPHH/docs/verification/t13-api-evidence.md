# T13历史与周报模型：真实API证据

状态：真实隔离API与当前图表数据模型对接通过；**浏览器SVG绘制、提示层、主题及实际布局未验收**。本轮不修改业务源码，不执行全构建，不启动浏览器或鸿蒙VM。

## 验证方式

新增 `scripts/verify-history-api.mjs`，以Node类型擦除直接加载当前history-series.ts的buildHistorySeries、historyPosition，以及weekly-report.ts的weeklyReportPoints。真实GET结果直接传入模型，不手动改写接口样本、不替换成路由夹具。

仅允许专用loopback API_BASE、显式ALLOW_ISOLATED_WRITES=1、健康接口实际isolatedVerification=true与合成管理员凭据。凭据从环境或TEMP私有文件读取，不打印或保存至Git。使用已有18081 H2隔离进程，未重启或影响其他任务进程。

## 合法样本与接口回读

已先核对当前监测服务校验：所有指标要求有限数值，湿度和甲烷限定0至100；温度当前没有0至100夹断或该范围校验。因此选择合法有限温度 `[-12,40,132,20]`，用来验证负值及大于100的温度不会被图表模型压回0至100。它们全部是明确SIMULATOR样本，不代表设备实测或现场温度。

创建专用区域、节点与温度当前阈值150，节点上报周期真实回读为30秒。在同一个基准采集时间之后，按 `[0,10,70,161]` 秒偏移上报：

| 指标 | 四次实际提交值 | 服务端返回单位 | 来源 |
| --- | --- | --- | --- |
| temperature | -12、40、132、20 | °C | SIMULATOR |
| humidity | 0、10、60、100 | %RH | SIMULATOR |
| methane | 0、12、35、48 | %LEL | SIMULATOR |

四次真实POST均返回inserted=3。随后按明确from/to范围GET该节点history，实际返回12条存储记录。模型读取以下内容均与服务器一致：

- 三条指标序列各4个点，采集时间逐点等于真实提交并回读的时间。
- 第二点横坐标比例为10/161，第三点为70/161；没有按样本个数等距排布。
- 最后间隔为91秒，超过三倍上报周期90秒，分为长度 `[3,1]` 的两段，不跨断档连成连续正常曲线。
- 温度点完整保留-12和132，未夹断；纵轴范围同时容纳实际样本及当前阈值150。
- 湿度0仍是有效数值，不是缺失值。各模型missingCount、invalidCount、unknownTimeCount均为0。
- 单位保持各自量纲，来源标识raw=SIMULATOR、kind=simulation，未改成实测。
- 当前温度阈值来自实际GET规则结果，threshold=150并带“当前配置”说明；不是触发时历史规则快照。
- 实际停用该规则后重新GET，再传入同一模型，阈值变为null并提示“未启用”。

未向服务器伪造其不允许的null数值、非法百分比或冲突单位。缺失、无效值与单位冲突的模型边界由已有定向单元测试覆盖，本HTTP证据不冒充这些场景已被服务端接受。

## 周报真实契约

对同一专用区域实际GET statistics，将其weekly原始数组直接传给weeklyReportPoints。

- 服务端本轮实际返回12个对象，包含label、planned、completed。
- 模型输出条数与响应完全一致，label只做去空格，两个比例字段逐项保持服务器值。
- 专用区域没有巡检计划，真实零值被保留；未从一个系列推导另一个系列，也未补造缺失周。
- 本轮出现12周是服务器提供的结果，不是模型强制生成12个点的证明。部分字段缺失、旧数字数组等情况仍以已有单元测试为边界证据。

## 执行结果与清理

执行 `node --experimental-strip-types scripts/verify-history-api.mjs`，按帮助显式设置隔离参数。语法检查、帮助入口和一次真实HTTP运行通过。

结果：actualHistoryRows=12、metrics=3、negativeAndAbove100Preserved=true、unequalTimePositionsPreserved=true、gapAfterThreePeriodsBrokeSegments=true、humidityZeroPreserved=true、currentThreshold=150、disabledThresholdHidden=true、weeklyExactlyMatchesResponse=true。

finally仅停用本脚本专用节点和规则，保留历史样本与审计关系，未清理其他任务记录。没有浏览器、虚拟机、真机或实际采集硬件验收。
