ALTER TABLE audit_log ADD COLUMN area_id BIGINT NULL;
CREATE INDEX idx_audit_area_time ON audit_log(area_id,created_at);
