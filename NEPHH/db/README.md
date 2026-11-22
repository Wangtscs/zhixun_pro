# 数据库初始化文件

适用：MySQL 8，全新空库，结构对应后端Flyway V1～V9。脚本不会清空旧库；建表与数据导入不能重复执行，也不要用于覆盖现有业务库。

## 文件和执行顺序

1. `01_create_database.sql`：创建nephh库，utf8mb4字符集。
2. `02_create_tables.sql`：创建全部表、字段、外键及索引，包含双人派单、个人资料、登录会话和128字符华为设备ID。
3. `03_import_data.sql`：导入1个管廊、3个区域、5个模拟节点、9条规则、15条模拟读数及1条演示手册。

在Navicat/DataGrip中依次执行；也可以在MySQL客户端中执行：

```sql
SOURCE C:/Users/YuWD/Desktop/NEPHH/db/01_create_database.sql;
SOURCE C:/Users/YuWD/Desktop/NEPHH/db/02_create_tables.sql;
SOURCE C:/Users/YuWD/Desktop/NEPHH/db/03_import_data.sql;
```

路径根据实际机器调整。文件使用UTF-8，读取时选utf8mb4；账号及密码使用部署者自己的数据库凭据。DDL导入失败时不要继续导入数据：MySQL部分DDL会自动提交，应检查失败位置或重新准备空库，不能认为事务能撤销所有建表步骤。

## 与后端Flyway二选一

**方式A，推荐给应用开发：**只执行01建库，配置后端MySQL连接，再启动后端，由Flyway执行V1～V9并写入迁移自带的基础区域/节点。此方式不要再执行02和03，否则会重复建表/数据。03中的额外演示读数和手册不属于自动迁移种子。

**方式B，完整手动导入：**按01→02→03导入后，第一次启动后端时额外设置：

```text
SPRING_FLYWAY_BASELINE_ON_MIGRATE=true
SPRING_FLYWAY_BASELINE_VERSION=9
```

Flyway会将这套已手动建好的非空结构登记为V9基线，避免重复执行V1～V9。仅用于明确按本文件初始化的数据库，不能拿baseline跳过不完整旧库。首次启动成功、确认flyway_schema_history存在V9基线后移除上述临时变量，后续正常运行增量迁移。

脚本不创建/伪造flyway_schema_history，不携带其他机器的迁移校验记录。

## 登录账号和数据边界

SQL不导入真实用户、密码哈希、登录Token、华为Token或工单照片。管理员由后端启动配置创建：设置ADMIN_USERNAME和ADMIN_PASSWORD（12～72字符），不存在时创建；已有账号不会覆盖。随后在网页用户权限页面创建巡检员并分配区域。

示例读数source=SIMULATOR，仅用于展示。它们不会持续更新，超过节点上报周期后可能显示离线；需要持续数据时使用软件模拟控制台，或完成真实华为平台接入。网页登录页的独立演示环境使用另一套内存数据，不依赖这些SQL种子。

数据库名若改成其他名称，需要同步修改三个脚本中的nephh及后端DB_URL。本目录是初始化脚本，不是现有数据库的完整备份。
