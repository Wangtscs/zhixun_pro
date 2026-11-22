package com.nephh.auth;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.sql.Timestamp;

@Service
public class SessionService {
 private final JdbcTemplate db;
 public SessionService(JdbcTemplate db){this.db=db;}
 public void record(String id,long userId,String agent,String ip,Instant expiry){
  String ua=agent==null?"":agent;
  String browser=ua.contains("Edg/")?"Edge":ua.contains("Chrome/")?"Chrome":ua.contains("Firefox/")?"Firefox":ua.contains("Safari/")?"Safari":"浏览器";
  String platform=ua.contains("iPhone")?"iPhone":ua.contains("Android")?"Android":ua.contains("Windows")?"Windows":ua.contains("Mac")?"macOS":"其他设备";
  db.update("insert into login_session(id,user_id,browser,platform,ip_address,expires_at) values(?,?,?,?,?,?)",id,userId,browser,platform,ip,Timestamp.from(expiry));
 }
 public void ensureActive(Jwt jwt){
  if(jwt.getId()==null)return; // Legacy signed tokens expire naturally within one hour.
  var rows=db.queryForList("select s.*,u.idle_minutes,u.enabled from login_session s join sys_user u on u.id=s.user_id where s.id=? and s.user_id=?",jwt.getId(),Long.parseLong(jwt.getSubject()));
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"登录已失效，请重新登录");
  var s=rows.get(0);Instant last=((Timestamp)s.get("last_seen")).toInstant();
  if(Boolean.TRUE.equals(s.get("revoked"))||!Boolean.TRUE.equals(s.get("enabled"))||((Timestamp)s.get("expires_at")).toInstant().isBefore(Instant.now())||last.plusSeconds(((Number)s.get("idle_minutes")).longValue()*60).isBefore(Instant.now()))throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"会话已结束，请重新登录");
  db.update("update login_session set last_seen=CURRENT_TIMESTAMP where id=?",jwt.getId());
 }
}
