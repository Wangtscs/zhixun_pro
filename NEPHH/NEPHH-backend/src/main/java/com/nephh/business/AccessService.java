package com.nephh.business;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;

@Service
public class AccessService {
 private final JdbcTemplate db;private final com.nephh.auth.SessionService sessions;
 public AccessService(JdbcTemplate db,com.nephh.auth.SessionService sessions){this.db=db;this.sessions=sessions;}
 public record Actor(long id,String username,String role) { public boolean manager(){return role.equals("ADMIN")||role.equals("MANAGER");} }
 public Actor actor(Jwt jwt){
  if(jwt==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"请先登录");
  sessions.ensureActive(jwt);
  long id;try{id=Long.parseLong(jwt.getSubject());}catch(Exception e){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号无效");}
  var rows=db.queryForList("select id,username,role_code from sys_user where id=? and enabled=true",id);
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"账号已禁用或不存在");
  var r=rows.get(0);return new Actor(id,r.get("username").toString(),r.get("role_code").toString());
 }
 public void admin(Actor a){if(!a.role().equals("ADMIN"))deny();}
 public void manager(Actor a){if(!a.manager())deny();}
 public void area(Actor a,long areaId){if(!a.role().equals("ADMIN")&&db.queryForObject("select count(*) from user_area where user_id=? and area_id=?",Integer.class,a.id(),areaId)==0)deny();}
 public Map<String,Object> node(Actor a,long id){var n=one("select * from monitoring_node where id=?",id);area(a,((Number)n.get("area_id")).longValue());return n;}
 public Map<String,Object> one(String sql,Object... args){var rows=db.queryForList(sql,args);if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"记录不存在");return rows.get(0);}
 public long insert(String sql,Object... args){
  var key=new org.springframework.jdbc.support.GeneratedKeyHolder();
  // Request only the primary key; H2 otherwise also returns timestamp defaults.
  db.update(connection->{var statement=connection.prepareStatement(sql,new String[]{"id"});for(int i=0;i<args.length;i++)statement.setObject(i+1,args[i]);return statement;},key);
  // Drivers name the single generated column differently (MySQL: GENERATED_KEY, H2: ID).
  Number id=key.getKey();if(id==null)throw new IllegalStateException("Insert did not return an id");return id.longValue();
 }
 public void audit(Actor a,String action,String type,Object id,Object before,Object after){
  Long area=null;
  if(before instanceof Map<?,?> previous && previous.get("area_id") instanceof Number value)area=value.longValue();
  String query=switch(type){case "NODE" -> "select area_id from monitoring_node where id=?";case "ORDER" -> "select n.area_id from work_order o join monitoring_node n on n.id=o.node_id where o.id=?";case "SECTION" -> "select area_id from section where id=?";case "PATROL_PLAN" -> "select area_id from patrol_plan where id=?";case "PATROL_RUN" -> "select p.area_id from patrol_run r join patrol_plan p on p.id=r.plan_id where r.id=?";case "PATROL_POINT" -> "select n.area_id from patrol_result pr join monitoring_node n on n.id=pr.node_id where pr.id=?";case "ALARM" -> "select n.area_id from alarm al join monitoring_node n on n.id=al.node_id where al.id=?";default -> null;};
  if(query!=null){var rows=db.queryForList(query,id);if(!rows.isEmpty())area=((Number)rows.get(0).get("area_id")).longValue();}
  if(type.equals("AREA"))try{area=Long.parseLong(id.toString());}catch(NumberFormatException ignored){}
  if(type.equals("RULE"))area=Long.parseLong(id.toString().split(":")[0]);
  db.update("insert into audit_log(actor_id,actor_name,action,object_type,object_id,before_value,after_value,area_id) values(?,?,?,?,?,?,?,?)",a.id(),a.username(),action,type,String.valueOf(id),before==null?null:before.toString(),after==null?null:after.toString(),area);
 }
 public void notify(long userId,String title,String content,String type,long objectId){db.update("insert into notification(user_id,title,content,object_type,object_id) values(?,?,?,?,?)",userId,title,content,type,objectId);}
 public static void deny(){throw new ResponseStatusException(HttpStatus.FORBIDDEN,"没有操作权限");}
 public static void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
 public static long number(Map<String,Object> m,String key){try{return Long.parseLong(String.valueOf(m.get(key)));}catch(Exception e){bad("缺少有效的 "+key);return 0;}}
 public static String text(Map<String,Object> m,String key,int max){String s=Objects.toString(m.get(key),"").trim();if(s.isEmpty()||s.length()>max)bad(key+"不能为空且最多 "+max+" 字");return s;}
}
