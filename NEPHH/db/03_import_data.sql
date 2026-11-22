-- Initial simulation data, import once into newly created empty tables.
USE nephh;
START TRANSACTION;
INSERT INTO corridor(name,description) VALUES ('智巡示范管廊','软件联调示范管廊，节点数据来自模拟器');
INSERT INTO area(name,description) VALUES ('A区','模拟管廊北段'),('B区','模拟管廊中段'),('C区','模拟管廊南段');
INSERT INTO monitoring_node(code,area_id,location,x_position,y_position) VALUES ('TN-A01',1,'北入口',15,30),('TN-A02',1,'1号舱',40,30),('TN-A03',1,'2号舱',65,30),('TN-B01',2,'中段入口',20,60),('TN-C01',3,'南段检修口',70,70);
INSERT INTO alarm_rule(area_id,metric,threshold_value,duration_seconds,severity,enabled)
SELECT id,'methane',35,0,'HIGH',true FROM area;
INSERT INTO alarm_rule(area_id,metric,threshold_value,duration_seconds,severity,enabled)
SELECT id,'temperature',40,0,'HIGH',true FROM area;
INSERT INTO alarm_rule(area_id,metric,threshold_value,duration_seconds,severity,enabled)
SELECT id,'humidity',80,0,'MEDIUM',true FROM area;
INSERT INTO telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source)
SELECT id,CONCAT('initial-',id),'methane',12,'%LEL',CURRENT_TIMESTAMP,'SIMULATOR' FROM monitoring_node;
INSERT INTO telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source)
SELECT id,CONCAT('initial-',id),'temperature',25,'°C',CURRENT_TIMESTAMP,'SIMULATOR' FROM monitoring_node;
INSERT INTO telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source)
SELECT id,CONCAT('initial-',id),'humidity',60,'%RH',CURRENT_TIMESTAMP,'SIMULATOR' FROM monitoring_node;
UPDATE monitoring_node SET last_seen=CURRENT_TIMESTAMP;
INSERT INTO handbook(title,category,steps,review_points,reference_source)
VALUES ('模拟环境检查说明','演示','核对节点读数、设备状态与告警记录；需要时由管理人员创建工单。','核对数据来源和采集时间，模拟数据不代表真实环境安全。','项目初始化模拟数据');
COMMIT;
