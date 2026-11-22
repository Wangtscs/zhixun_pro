package com.nephh.business;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import static com.nephh.business.AccessService.*;

@Service
public class TelemetryService {
 private final JdbcTemplate db;
 public static final Map<String,String> UNITS=Map.of("methane","%LEL","temperature","°C","humidity","%RH","infrared","°C");
 public TelemetryService(JdbcTemplate db){this.db=db;}
 @Transactional public int ingest(long nodeId,String messageId,String source,Instant time,Map<String,Double> values){
  if(messageId==null||messageId.isBlank()||messageId.length()>100)bad("消息编号不合法");
  if(source==null||source.isBlank()||source.length()>30)bad("数据来源不合法");
  if(time==null||time.isAfter(Instant.now().plusSeconds(60)))bad("采集时间不能在未来");
  // The schema stores second precision. Normalize before comparison to avoid MySQL rounding a sample into the future.
  time=time.truncatedTo(java.time.temporal.ChronoUnit.SECONDS);
  var rows=db.queryForList("select * from monitoring_node where id=? for update",nodeId);if(rows.isEmpty())bad("节点不存在");var node=rows.get(0);
  if(!Boolean.TRUE.equals(node.get("enabled")))bad("节点已停用");
  if(values==null||values.isEmpty())bad("上报指标不能为空");
  var configured=Set.of(node.get("metrics").toString().split(","));for(String key:values.keySet())if(!configured.contains(key))bad("节点未配置指标："+key);
  int inserted=0;
  for(var item:values.entrySet()){
   if(!UNITS.containsKey(item.getKey())||item.getValue()==null||!Double.isFinite(item.getValue()))bad("指标或数值不合法");
   double v=item.getValue();if((item.getKey().equals("humidity")||item.getKey().equals("methane"))&&(v<0||v>100))bad("百分比应在0至100之间");
   if(db.queryForObject("select count(*) from telemetry where node_id=? and message_id=? and metric=?",Integer.class,nodeId,messageId,item.getKey())>0)continue;
   db.update("insert into telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source) values(?,?,?,?,?,?,?)",nodeId,messageId,item.getKey(),v,UNITS.get(item.getKey()),Timestamp.from(time),source);inserted++;
   // A late sample is retained for history but must not change live alarm state.
   var latest=db.queryForObject("select max(collected_at) from telemetry where node_id=? and metric=?",Timestamp.class,nodeId,item.getKey());
   if(latest!=null&&!time.isBefore(latest.toInstant())&&!Boolean.TRUE.equals(node.get("maintenance")))evaluate(nodeId,((Number)node.get("area_id")).longValue(),item.getKey(),v,time);
  }
  if(inserted>0){db.update("update monitoring_node set last_seen=? where id=? and (last_seen is null or last_seen<?)",Timestamp.from(time),nodeId,Timestamp.from(time));
   long timeout=((Number)node.get("report_seconds")).longValue()*3;
   if(!time.plusSeconds(timeout).isBefore(Instant.now()))db.update("update alarm set recovered_at=CURRENT_TIMESTAMP where node_id=? and metric='offline' and recovered_at is null",nodeId);
  }
  return inserted;
 }
 private void evaluate(long node,long area,String metric,double value,Instant time){
  var rules=db.queryForList("select * from alarm_rule where area_id=? and metric=? and enabled=true",area,metric);if(rules.isEmpty())return;var rule=rules.get(0);double threshold=((Number)rule.get("threshold_value")).doubleValue();
  if(value<=threshold){db.update("update alarm set recovered_at=CURRENT_TIMESTAMP where node_id=? and metric=? and recovered_at is null",node,metric);return;}
  int duration=((Number)rule.get("duration_seconds")).intValue();
  if(duration>0){
   Instant boundary=time.minusSeconds(duration);
   var anchor=db.queryForList("select collected_at,metric_value from telemetry where node_id=? and metric=? and collected_at<=? order by collected_at desc,id desc limit 1",node,metric,Timestamp.from(boundary));
   if(anchor.isEmpty()||((Number)anchor.get(0).get("metric_value")).doubleValue()<=threshold)return;
   var samples=db.queryForList("select collected_at,metric_value from telemetry where node_id=? and metric=? and collected_at>=? and collected_at<=? order by collected_at,id",node,metric,anchor.get(0).get("collected_at"),Timestamp.from(time));
   int reportSeconds=db.queryForObject("select report_seconds from monitoring_node where id=?",Integer.class,node);
   Instant previous=null;
   for(var sample:samples){Instant current=((Timestamp)sample.get("collected_at")).toInstant();if(((Number)sample.get("metric_value")).doubleValue()<=threshold||(previous!=null&&current.isAfter(previous.plusSeconds(reportSeconds*3L))))return;previous=current;}
  }
  open(node,metric,rule.get("severity").toString(),metric+"="+value+UNITS.get(metric)+"，超过演示阈值 "+threshold+UNITS.get(metric));
 }
 public void open(long node,String metric,String severity,String reason){
  if(db.queryForObject("select count(*) from alarm where node_id=? and metric=? and recovered_at is null",Integer.class,node,metric)>0)return;
  db.update("insert into alarm(node_id,metric,severity,reason) values(?,?,?,?)",node,metric,severity,reason);
  var alarm=db.queryForObject("select max(id) from alarm where node_id=? and metric=?",Long.class,node,metric);
  db.update("insert into notification(user_id,title,content,object_type,object_id) select distinct u.id,?,?,?,? from sys_user u left join user_area ua on ua.user_id=u.id where u.enabled=true and (u.role_code='ADMIN' or (u.role_code='MANAGER' and ua.area_id=(select area_id from monitoring_node where id=?)))","节点告警",reason,"ALARM",alarm,node);
 }
 @Transactional public void checkOffline(){
  var rows=db.queryForList("select * from monitoring_node where enabled=true and maintenance=false and last_seen is not null order by id for update");
  for(var n:rows){if(((Timestamp)n.get("last_seen")).toInstant().plusSeconds(((Number)n.get("report_seconds")).longValue()*3).isBefore(Instant.now()))open(((Number)n.get("id")).longValue(),"offline","MEDIUM","超过三个上报周期未收到新数据");}
 }
}
