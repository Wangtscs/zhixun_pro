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
