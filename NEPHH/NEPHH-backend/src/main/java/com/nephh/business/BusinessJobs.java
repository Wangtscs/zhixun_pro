package com.nephh.business;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.LoggerFactory;
@Configuration @EnableScheduling
public class BusinessJobs {
 private final TelemetryService telemetry;private final PatrolController patrol;private final JdbcTemplate db;
 public BusinessJobs(TelemetryService t,PatrolController p,JdbcTemplate db){this.telemetry=t;this.patrol=p;this.db=db;}
 @Scheduled(fixedDelay=30000,initialDelay=30000) public void tick(){
  try{telemetry.checkOffline();}catch(Exception e){LoggerFactory.getLogger(getClass()).warn("离线检查失败",e);}
  for(var p:db.queryForList("select id from patrol_plan where enabled=true and next_run<=CURRENT_TIMESTAMP"))try{patrol.generateDueRun(((Number)p.get("id")).longValue());}catch(Exception e){LoggerFactory.getLogger(getClass()).warn("计划生成失败",e);}
  try{
   db.update("insert into notification(user_id,title,content,object_type,object_id,dedupe_key) select distinct u.id,'工单逾期',o.title,'ORDER',o.id,concat('overdue-',o.id,'-',u.id) from work_order o join monitoring_node n on n.id=o.node_id join sys_user u on u.enabled=true left join user_area ua on ua.user_id=u.id where o.due_at<CURRENT_TIMESTAMP and o.status not in ('COMPLETED','CANCELLED') and (u.id=o.assignee_id or u.role_code='ADMIN' or (u.role_code='MANAGER' and ua.area_id=n.area_id)) and not exists(select 1 from notification nt where nt.dedupe_key=concat('overdue-',o.id,'-',u.id))");
  }catch(Exception e){LoggerFactory.getLogger(getClass()).warn("逾期通知失败",e);}
 }
}
