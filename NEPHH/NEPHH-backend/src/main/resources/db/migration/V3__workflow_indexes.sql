ALTER TABLE notification ADD COLUMN dedupe_key VARCHAR(150) NULL UNIQUE;
ALTER TABLE work_order ADD COLUMN source VARCHAR(30) NOT NULL DEFAULT 'MANUAL';
ALTER TABLE work_order ADD COLUMN analysis_id BIGINT NULL;
CREATE INDEX idx_alarm_node_metric ON alarm(node_id,metric,recovered_at);
CREATE INDEX idx_order_assignee_status ON work_order(assignee_id,status);
CREATE INDEX idx_notification_user_read ON notification(user_id,is_read);
