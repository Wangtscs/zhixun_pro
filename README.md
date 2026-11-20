# 智巡管廊

统一源码仓库：网页管理端、Java业务后端、鸿蒙原生App、移动网关及本机硬件采集桥。

## 模块

- `NEPHH/NEPHH-Admin`：Vue网页，使用Node 24.12及以上版本和npm。
- `NEPHH/NEPHH-backend`：Java 17以上、Maven；数据库迁移随应用运行。
- `zhixun-guanlang-harmony`：HarmonyOS 6.0.2 / API 22原生工程；构建需要DevEco Studio和对应SDK。
- `zhixun-guanlang-harmony/backend`：Node移动网关，只调用Java业务API，不直连数据库。
- `NEPHH/tools`：本机硬件采集。真实上报需要登录和显式启用，模拟甲烷不能作为实测数据。

任务安排见 [网页优化任务安排](NEPHH/docs/website-optimization-task-plan.md)，开发与提交要求见 [AGENTS.md](AGENTS.md)。

## 全新环境运行

1. 网页目录执行 `npm ci`，再执行 `npm run build`。
2. 后端目录执行 `./mvnw.cmd test package`，需要可用JDK 17以上和Maven依赖网络。未提供私有配置时使用local/H2；在专用测试终端配置 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 创建初始管理员。
3. 后端目录执行 `./mvnw.cmd spring-boot:run`；网页目录执行 `npm run dev`，默认代理到本机8080。
4. 使用MySQL时复制后端 `.local-database.example.yml` 为 `.local-database.yml`，填写数据库连接和凭据。生产环境必须提供随机JWT密钥及数据库配置；公开配置不包含共享数据库密码。
5. 鸿蒙目录执行 `./scripts/build.ps1 -DevEcoHome '<本机DevEco Studio目录>'` 构建未签名HAP。设备安装和本机签名说明见该模块README。SDK路径和私钥不得提交。
6. 移动网关使用Node 24，设置 `MOBILE_UPSTREAM` 为专用业务API地址，再执行 `node backend/server.mjs`。配置DeepSeek时由服务端设置Key。

独立生产数据库、真实硬件、发布签名和设备联调需要部署者配置。设计归档、历史压缩包、已构建产物和本机运行数据不属于本仓库运行依赖。

## 验证范围

当前证据保存在 `NEPHH/docs/verification`。构建、单元测试、隔离业务闭环、模拟器和真实设备分别记录；历史记录不能替代当前版本验收。
