package com.nephh;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestExecutionListeners(listeners=DependencyInjectionTestExecutionListener.class,mergeMode=TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(properties={"spring.config.import=","spring.profiles.active=local","spring.datasource.url=jdbc:h2:mem:design;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE"})
@AutoConfigureMockMvc
class DesignInteractionsTest {
 @Autowired MockMvc mvc;@Autowired JdbcTemplate db;@Autowired PasswordEncoder passwords;@Autowired ObjectMapper json;
 String login(String username,String password)throws Exception{return json.readTree(mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsString(Map.of("username",username,"password",password)))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("accessToken").asText();}
 String body(Object value)throws Exception{return json.writeValueAsString(value);}
 long user(String name,String role){db.update("insert into sys_user(username,password_hash,enabled,role_code) values(?,?,true,?)",name,passwords.encode("Test12345678"),role);long id=db.queryForObject("select id from sys_user where username=?",Long.class,name);db.update("insert into user_area(user_id,area_id) values(?,1)",id);return id;}
 long createOrder(String token,String title)throws Exception{return json.readTree(mvc.perform(post("/api/business/orders").header("Authorization","Bearer "+token).contentType("application/json").content(body(Map.of("nodeId",1,"title",title,"priority","HIGH")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("id").asLong();}
 @Test void profilesSessionsAndTwoPersonDispatch()throws Exception{
  long admin=user("design-admin","ADMIN"),worker1=user("design-worker1","INSPECTOR"),worker2=user("design-worker2","INSPECTOR");String root=login("design-admin","Test12345678"),second=login("design-worker2","Test12345678");
  mvc.perform(put("/api/business/profile").header("Authorization","Bearer "+root).contentType("application/json").content(body(Map.of("displayName","设计验证","phone","13800000000","email","design@example.com","areaId",1,"idleMinutes",30,"preferences",Map.of("sound",true))))).andExpect(status().isOk());
  mvc.perform(get("/api/business/profile").header("Authorization","Bearer "+root)).andExpect(jsonPath("$.data.displayName").value("设计验证")).andExpect(jsonPath("$.data.preferences.sound").value(true));
  long order=createOrder(root,"双人派单");var assignment=Map.of("assigneeId",worker1,"participantIds",List.of(worker1,worker2),"priority","HIGH","note","两人共同执行");
  mvc.perform(post("/api/business/orders/"+order+"/assign").header("Authorization","Bearer "+root).contentType("application/json").content(body(assignment))).andExpect(status().isOk());
  mvc.perform(get("/api/business/orders/"+order).header("Authorization","Bearer "+second)).andExpect(status().isOk()).andExpect(jsonPath("$.data.participant_ids.length()").value(2));
  mvc.perform(post("/api/business/orders/"+order+"/action").header("Authorization","Bearer "+second).contentType("application/json").content(body(Map.of("action","accept","note","第二位工人接单")))).andExpect(status().isOk());
  assertEquals("ACCEPTED",db.queryForObject("select status from work_order where id=?",String.class,order));
  long batch=createOrder(root,"原子批量指派");var batchBody=new HashMap<String,Object>(assignment);batchBody.put("orderIds",List.of(batch,999999));
  mvc.perform(post("/api/business/orders/batch-assign").header("Authorization","Bearer "+root).contentType("application/json").content(body(batchBody))).andExpect(status().isNotFound());assertEquals("DRAFT",db.queryForObject("select status from work_order where id=?",String.class,batch));
  var session=json.readTree(mvc.perform(get("/api/business/sessions").header("Authorization","Bearer "+second)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").get(0).path("id").asText();
  mvc.perform(post("/api/business/sessions/"+session+"/revoke").header("Authorization","Bearer "+second)).andExpect(status().isOk());mvc.perform(get("/api/business/identity").header("Authorization","Bearer "+second)).andExpect(status().isUnauthorized());
  second=login("design-worker2","Test12345678");String other=login("design-worker2","Test12345678");
  mvc.perform(post("/api/business/profile/password").header("Authorization","Bearer "+second).contentType("application/json").content(body(Map.of("currentPassword","Test12345678","newPassword","Changed12345")))).andExpect(status().isOk());
  mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+other)).andExpect(status().isUnauthorized());login("design-worker2","Changed12345");
 }
}
