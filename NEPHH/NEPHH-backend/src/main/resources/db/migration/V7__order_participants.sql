CREATE TABLE order_participant (order_id BIGINT NOT NULL,user_id BIGINT NOT NULL,PRIMARY KEY(order_id,user_id),FOREIGN KEY(order_id) REFERENCES work_order(id),FOREIGN KEY(user_id) REFERENCES sys_user(id));
INSERT INTO order_participant(order_id,user_id) SELECT id,assignee_id FROM work_order WHERE assignee_id IS NOT NULL;
