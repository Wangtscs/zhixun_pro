package com.nephh.business;
import com.nephh.common.ApiResponse;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import java.util.*;
import static com.nephh.business.AccessService.*;

@RestController @RequestMapping("/api/business")
public class UserController {
 private final JdbcTemplate db;private final AccessService access;private final PasswordEncoder passwords;
 public UserController(JdbcTemplate db,AccessService access,PasswordEncoder passwords){this.db=db;this.access=access;this.passwords=passwords;}
 @GetMapping("/identity") public ApiResponse<?> identity(@AuthenticationPrincipal Jwt jwt){var a=access.actor(jwt);return ApiResponse.ok(Map.of("id",a.id(),"username",a.username(),"role",a.role(),"areas",db.queryForList("select area_id from user_area where user_id=?",a.id())));}
 @GetMapping("/users") public ApiResponse<?> users(@AuthenticationPrincipal Jwt jwt){var a=access.actor(jwt);access.manager(a);var rows=db.queryForList("select id,username,display_name,role_code,enabled,created_at from sys_user order by id"); for(var row:rows)row.put("areas",db.queryForList("select area_id from user_area where user_id=?",Long.class,row.get("id")));return ApiResponse.ok(rows);}
 @PostMapping("/users") @Transactional public ApiResponse<?> create(@AuthenticationPrincipal Jwt jwt,@RequestBody Map<String,Object> body){var a=access.actor(jwt);access.admin(a);String username=text(body,"username",64),password=text(body,"password",72),role=text(body,"role",20);validateRole(role);if(password.length()<12)bad("密码至少12位");if(db.queryForObject("select count(*) from sys_user where username=?",Integer.class,username)>0)bad("账号已存在");db.update("insert into sys_user(username,password_hash,enabled,role_code,display_name) values(?,?,true,?,?)",username,passwords.encode(password),role,Objects.toString(body.get("displayName"),username));var id=db.queryForObject("select id from sys_user where username=?",Long.class,username);access.audit(a,"CREATE","USER",id,null,username+":"+role);return ApiResponse.ok(Map.of("id",id));}
 @PutMapping("/users/{id}") @Transactional public ApiResponse<?> update(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Map<String,Object> body){var a=access.actor(jwt);access.admin(a);var before=access.one("select id,username,role_code,enabled from sys_user where id=?",id);String role=text(body,"role",20);validateRole(role);boolean enabled=Boolean.TRUE.equals(body.get("enabled"));if(a.id()==id&&(!enabled||!role.equals("ADMIN")))bad("不能禁用自己或移除自己的管理员身份");if(before.get("role_code").equals("ADMIN")&&(!enabled||!role.equals("ADMIN"))&&db.queryForObject("select count(*) from sys_user where role_code='ADMIN' and enabled=true",Integer.class)<=1)bad("至少保留一个启用的管理员");db.update("update sys_user set role_code=?,enabled=?,display_name=? where id=?",role,enabled,Objects.toString(body.get("displayName"),before.get("username").toString()),id);db.update("delete from user_area where user_id=?",id);if(body.get("areas") instanceof List<?> areas)for(Object area:areas){long areaId=Long.parseLong(area.toString());access.one("select id from area where id=?",areaId);db.update("insert into user_area(user_id,area_id) values(?,?)",id,areaId);}access.audit(a,"UPDATE","USER",id,before,Map.of("role",role,"enabled",enabled,"areas",Objects.toString(body.get("areas"),"[]")));return ApiResponse.ok(null);}
 @PostMapping("/users/{id}/password") public ApiResponse<?> reset(@AuthenticationPrincipal Jwt jwt,@PathVariable long id,@RequestBody Map<String,Object> body){var a=access.actor(jwt);access.admin(a);access.one("select id from sys_user where id=?",id);String password=text(body,"password",72);if(password.length()<12)bad("密码至少12位");db.update("update sys_user set password_hash=? where id=?",passwords.encode(password),id);access.audit(a,"RESET_PASSWORD","USER",id,null,"密码已重置");return ApiResponse.ok(null);}
 private void validateRole(String role){if(!Set.of("ADMIN","MANAGER","INSPECTOR").contains(role))bad("角色不合法");}
}
