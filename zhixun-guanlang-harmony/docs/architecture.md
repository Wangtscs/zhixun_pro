# 手机端项目结构

应用使用 HarmonyOS Stage、ArkTS 和 ArkUI，无 React、HTML 或 ArkWeb 运行时。

```text
AppScope/                         应用名称、图标等全局配置
entry/src/main/
  ets/
    entryability/EntryAbility.ets 窗口和应用生命周期
    pages/Index.ets               登录状态、页面跳转和底部导航
    common/                      主题、原稿图标、公共标题和按钮
    features/
      auth/                      登录与找回密码
      inspection/                巡检、节点、透视、风险和报修
      orders/                    工单列表和处置
      assistant/                 处置问答
      profile/                   我的、通知、设置和帮助
    models/                      节点和分区类型
    services/                    原稿演示数据
  resources/                     原生资源与 SVG 图标
scripts/                         原生编译、设备安装启动
tests/                           不依赖设备的数据校验
design/                          设计输入与旧实现参考，不参与打包
docs/                            架构与验证记录
```

页面读取 models/services，共用样式读取 common/Theme。Index 负责页面切换，不承载业务页面内容。主题和演示工单状态通过 AppStorage 在组件之间共享；密码不存储。当前数据源是 Figma 演示数据，接真实后台时在 services 增加接口适配。

构建入口只有 scripts/build.ps1 → Hvigor → HAP。修改 ArkTS 后可直接在 DevEco Studio 运行，不需要先构建网页。

design/reference-react 是原混合实现的维护快照；design/legacy-arkweb-bundle 是原离线页面产物。两者都不被 entry 引用。原始 ZIP 和 figma-source 继续作为设计依据保留。
