CREATE TABLE corridor (id BIGINT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL UNIQUE, description VARCHAR(500));
INSERT INTO corridor(name,description) VALUES ('智巡示范管廊','软件联调示范管廊，节点数据来自模拟器');
ALTER TABLE area ADD COLUMN corridor_id BIGINT NOT NULL DEFAULT 1;
ALTER TABLE area ADD CONSTRAINT fk_area_corridor FOREIGN KEY(corridor_id) REFERENCES corridor(id);
ALTER TABLE monitoring_node ADD COLUMN owner_id BIGINT NULL;
ALTER TABLE monitoring_node ADD CONSTRAINT fk_node_owner FOREIGN KEY(owner_id) REFERENCES sys_user(id);
ALTER TABLE monitoring_node ADD COLUMN metrics VARCHAR(200) NOT NULL DEFAULT 'methane,temperature,humidity,infrared';
