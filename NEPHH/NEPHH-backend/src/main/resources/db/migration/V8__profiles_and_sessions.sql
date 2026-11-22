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
