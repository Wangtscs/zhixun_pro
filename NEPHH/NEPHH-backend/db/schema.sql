-- 完整结构参考：应用请使用Flyway迁移；仅空库可手动执行，勿与自动迁移重复。
CREATE TABLE sys_user (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 username VARCHAR(64) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE sys_role (id BIGINT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL);
CREATE TABLE sys_permission (id BIGINT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(100) NOT NULL UNIQUE, name VARCHAR(100) NOT NULL);
CREATE TABLE sys_user_role (user_id BIGINT NOT NULL, role_id BIGINT NOT NULL, PRIMARY KEY(user_id, role_id), FOREIGN KEY(user_id) REFERENCES sys_user(id), FOREIGN KEY(role_id) REFERENCES sys_role(id));
CREATE TABLE sys_role_permission (role_id BIGINT NOT NULL, permission_id BIGINT NOT NULL, PRIMARY KEY(role_id, permission_id), FOREIGN KEY(role_id) REFERENCES sys_role(id), FOREIGN KEY(permission_id) REFERENCES sys_permission(id));

ALTER TABLE sys_user ADD COLUMN display_name VARCHAR(100);
ALTER TABLE sys_user ADD COLUMN role_code VARCHAR(20) NOT NULL DEFAULT 'INSPECTOR';
UPDATE sys_user SET role_code='ADMIN' WHERE username='admin';
CREATE TABLE area (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, description VARCHAR(500));
CREATE TABLE user_area (user_id BIGINT NOT NULL, area_id BIGINT NOT NULL, PRIMARY KEY(user_id,area_id), FOREIGN KEY(user_id) REFERENCES sys_user(id), FOREIGN KEY(area_id) REFERENCES area(id));
CREATE TABLE section (id BIGINT AUTO_INCREMENT PRIMARY KEY, area_id BIGINT NOT NULL, name VARCHAR(100) NOT NULL, FOREIGN KEY(area_id) REFERENCES area(id));
CREATE TABLE monitoring_node (id BIGINT AUTO_INCREMENT PRIMARY KEY, code VARCHAR(64) NOT NULL UNIQUE, area_id BIGINT NOT NULL, section_id BIGINT, location VARCHAR(200) NOT NULL, external_id VARCHAR(128), platform VARCHAR(30) NOT NULL DEFAULT 'SIMULATOR', enabled BOOLEAN NOT NULL DEFAULT TRUE, maintenance BOOLEAN NOT NULL DEFAULT FALSE, x_position DOUBLE NOT NULL DEFAULT 50, y_position DOUBLE NOT NULL DEFAULT 50, last_seen TIMESTAMP NULL, report_seconds INT NOT NULL DEFAULT 30, FOREIGN KEY(area_id) REFERENCES area(id), FOREIGN KEY(section_id) REFERENCES section(id));
CREATE TABLE telemetry (id BIGINT AUTO_INCREMENT PRIMARY KEY, node_id BIGINT NOT NULL, message_id VARCHAR(100) NOT NULL, metric VARCHAR(30) NOT NULL, metric_value DOUBLE NOT NULL, unit VARCHAR(20) NOT NULL, collected_at TIMESTAMP NOT NULL, received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, source VARCHAR(30) NOT NULL, UNIQUE(node_id,message_id,metric), FOREIGN KEY(node_id) REFERENCES monitoring_node(id));
CREATE INDEX idx_telemetry_node_time ON telemetry(node_id,collected_at);
CREATE TABLE alarm_rule (id BIGINT AUTO_INCREMENT PRIMARY KEY, area_id BIGINT NOT NULL, metric VARCHAR(30) NOT NULL, threshold_value DOUBLE NOT NULL, duration_seconds INT NOT NULL DEFAULT 0, severity VARCHAR(20) NOT NULL DEFAULT 'HIGH', enabled BOOLEAN NOT NULL DEFAULT TRUE, UNIQUE(area_id,metric), FOREIGN KEY(area_id) REFERENCES area(id));
CREATE TABLE alarm (id BIGINT AUTO_INCREMENT PRIMARY KEY, node_id BIGINT NOT NULL, metric VARCHAR(30) NOT NULL, severity VARCHAR(20) NOT NULL, reason VARCHAR(500) NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'OPEN', triggered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, recovered_at TIMESTAMP NULL, acknowledged_by BIGINT, acknowledged_at TIMESTAMP NULL, note VARCHAR(1000), FOREIGN KEY(node_id) REFERENCES monitoring_node(id));
CREATE TABLE work_order (id BIGINT AUTO_INCREMENT PRIMARY KEY, node_id BIGINT NOT NULL, alarm_id BIGINT, title VARCHAR(200) NOT NULL, priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM', status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', assignee_id BIGINT, creator_id BIGINT NOT NULL, due_at TIMESTAMP NULL, description VARCHAR(2000), result_text VARCHAR(4000), readings VARCHAR(2000), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(node_id) REFERENCES monitoring_node(id), FOREIGN KEY(assignee_id) REFERENCES sys_user(id), FOREIGN KEY(alarm_id) REFERENCES alarm(id));
CREATE TABLE order_event (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_id BIGINT NOT NULL, actor_id BIGINT NOT NULL, action VARCHAR(30) NOT NULL, note VARCHAR(2000), created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(order_id) REFERENCES work_order(id));
CREATE TABLE attachment (id BIGINT AUTO_INCREMENT PRIMARY KEY, order_id BIGINT NOT NULL, uploader_id BIGINT NOT NULL, original_name VARCHAR(200) NOT NULL, storage_name VARCHAR(100) NOT NULL, content_type VARCHAR(100) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(order_id) REFERENCES work_order(id));
CREATE TABLE audit_log (id BIGINT AUTO_INCREMENT PRIMARY KEY, actor_id BIGINT NOT NULL, actor_name VARCHAR(64) NOT NULL, action VARCHAR(50) NOT NULL, object_type VARCHAR(50) NOT NULL, object_id VARCHAR(100), before_value TEXT, after_value TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE notification (id BIGINT AUTO_INCREMENT PRIMARY KEY, user_id BIGINT NOT NULL, title VARCHAR(200) NOT NULL, content VARCHAR(1000), object_type VARCHAR(30), object_id BIGINT, is_read BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES sys_user(id));
CREATE TABLE handbook (id BIGINT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(200) NOT NULL, category VARCHAR(100) NOT NULL, steps TEXT NOT NULL, review_points TEXT, reference_source VARCHAR(500), updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE patrol_plan (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(200) NOT NULL, area_id BIGINT NOT NULL, assignee_id BIGINT NOT NULL, period_hours INT NOT NULL DEFAULT 24, enabled BOOLEAN NOT NULL DEFAULT TRUE, next_run TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(area_id) REFERENCES area(id), FOREIGN KEY(assignee_id) REFERENCES sys_user(id));
CREATE TABLE patrol_plan_point (plan_id BIGINT NOT NULL, node_id BIGINT NOT NULL, check_items VARCHAR(2000) NOT NULL, PRIMARY KEY(plan_id,node_id), FOREIGN KEY(plan_id) REFERENCES patrol_plan(id), FOREIGN KEY(node_id) REFERENCES monitoring_node(id));
CREATE TABLE patrol_run (id BIGINT AUTO_INCREMENT PRIMARY KEY, plan_id BIGINT NOT NULL, assignee_id BIGINT NOT NULL, status VARCHAR(20) NOT NULL DEFAULT 'PENDING', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, completed_at TIMESTAMP NULL, FOREIGN KEY(plan_id) REFERENCES patrol_plan(id));
CREATE TABLE patrol_result (id BIGINT AUTO_INCREMENT PRIMARY KEY, run_id BIGINT NOT NULL, node_id BIGINT NOT NULL, check_items VARCHAR(2000) NOT NULL, result_text VARCHAR(4000), abnormal BOOLEAN NOT NULL DEFAULT FALSE, checked_at TIMESTAMP NULL, order_id BIGINT, UNIQUE(run_id,node_id), FOREIGN KEY(run_id) REFERENCES patrol_run(id), FOREIGN KEY(node_id) REFERENCES monitoring_node(id));
CREATE TABLE analysis_result (id BIGINT AUTO_INCREMENT PRIMARY KEY, node_id BIGINT NOT NULL, alarm_id BIGINT, provider VARCHAR(50) NOT NULL, status VARCHAR(20) NOT NULL, evidence TEXT, suggestions TEXT, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(node_id) REFERENCES monitoring_node(id));
INSERT INTO area(name,description) VALUES ('A区','模拟管廊北段'),('B区','模拟管廊中段'),('C区','模拟管廊南段');
INSERT INTO monitoring_node(code,area_id,location,x_position,y_position) VALUES ('TN-A01',1,'北入口',15,30),('TN-A02',1,'1号舱',40,30),('TN-A03',1,'2号舱',65,30),('TN-B01',2,'中段入口',20,60),('TN-C01',3,'南段检修口',70,70);

ALTER TABLE notification ADD COLUMN dedupe_key VARCHAR(150) NULL UNIQUE;
ALTER TABLE work_order ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE work_order ADD COLUMN analysis_id BIGINT NULL;
CREATE INDEX idx_alarm_node_metric ON alarm(node_id,metric,recovered_at);
CREATE INDEX idx_order_assignee_status ON work_order(assignee_id,status);
CREATE INDEX idx_notification_user_read ON notification(user_id,is_read);

CREATE TABLE patrol_attachment (
 id BIGINT AUTO_INCREMENT PRIMARY KEY,
 result_id BIGINT NOT NULL,
 uploader_id BIGINT NOT NULL,
 original_name VARCHAR(200) NOT NULL,
 storage_name VARCHAR(100) NOT NULL,
 content_type VARCHAR(100) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(result_id) REFERENCES patrol_result(id)
);

CREATE TABLE corridor (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, description VARCHAR(500));
INSERT INTO corridor(name,description) VALUES ('智巡示范管廊','软件联调示范管廊，节点数据来自模拟器');
ALTER TABLE area ADD COLUMN corridor_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE area ADD CONSTRAINT fk_area_corridor FOREIGN KEY(corridor_id) REFERENCES corridor(id);
ALTER TABLE monitoring_node ADD COLUMN owner_id BIGINT NULL;
ALTER TABLE monitoring_node ADD CONSTRAINT fk_node_owner FOREIGN KEY(owner_id) REFERENCES sys_user(id);
ALTER TABLE monitoring_node ADD COLUMN metrics VARCHAR(200) NOT NULL DEFAULT 'methane,temperature,humidity,infrared';

ALTER TABLE audit_log ADD COLUMN area_id BIGINT NULL;
CREATE INDEX idx_audit_area_time ON audit_log(area_id,created_at);


-- V7__order_participants.sql
CREATE TABLE order_participant (order_id BIGINT NOT NULL,user_id BIGINT NOT NULL,PRIMARY KEY(order_id,user_id),FOREIGN KEY(order_id) REFERENCES work_order(id),FOREIGN KEY(user_id) REFERENCES sys_user(id));
INSERT INTO order_participant(order_id,user_id) SELECT id,assignee_id FROM work_order WHERE assignee_id IS NOT NULL;


-- V8__profiles_and_sessions.sql
ALTER TABLE sys_user ADD COLUMN phone VARCHAR(32);
ALTER TABLE sys_user ADD COLUMN email VARCHAR(200);
ALTER TABLE sys_user ADD COLUMN preferred_area_id BIGINT NULL;
ALTER TABLE sys_user ADD COLUMN notification_preferences TEXT;
ALTER TABLE sys_user ADD COLUMN idle_minutes INT NOT NULL DEFAULT 30;
ALTER TABLE sys_user ADD COLUMN avatar_name VARCHAR(100);
ALTER TABLE sys_user ADD COLUMN avatar_type VARCHAR(40);
CREATE TABLE login_session (
 id VARCHAR(64) PRIMARY KEY,
 user_id BIGINT NOT NULL,
 browser VARCHAR(40) NOT NULL,
 platform VARCHAR(40) NOT NULL,
 ip_address VARCHAR(100),
 last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 expires_at TIMESTAMP NOT NULL,
 revoked BOOLEAN NOT NULL DEFAULT FALSE,
 FOREIGN KEY(user_id) REFERENCES sys_user(id)
);
CREATE INDEX idx_session_user ON login_session(user_id,revoked);
