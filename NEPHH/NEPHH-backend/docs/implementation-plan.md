# 后端基础框架实施计划
已确认方案：Java 17、Spring Boot、MySQL、MyBatis-Plus、Spring Security JWT。
1. 建立 Maven 工程和依赖，添加接口与鉴权集成测试。
2. 实现统一响应、异常处理、健康检查、JWT 验签和当前用户接口。
3. 配置 local/MySQL/prod 环境、Flyway 用户角色权限表、可选 Redis。
4. 执行测试、打包、启动检查，交付源代码与启动说明。
边界：仅搭建框架，不实现注册、密码登录、业务 CRUD 或前端联调；不创建默认管理员。
