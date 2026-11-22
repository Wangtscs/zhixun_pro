package com.nephh.iot;

import com.fasterxml.jackson.databind.*;
import com.nephh.business.AccessService;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.*;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestExecutionListeners(listeners=DependencyInjectionTestExecutionListener.class,mergeMode=TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(properties={"spring.config.import=","spring.profiles.active=local","spring.datasource.url=jdbc:h2:mem:huawei;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","app.huawei-iot.enabled=true","app.huawei-iot.endpoint=https://iot.example","app.huawei-iot.project-id=project-1","app.huawei-iot.auth-token=test-only-secret"})
@AutoConfigureMockMvc
class HuaweiIotIntegrationTest {
 @TestConfiguration static class FakeCloud {
  @Bean @Primary StubCloud stubCloud(){return new StubCloud();}
 }
 static class StubCloud implements HuaweiShadowClient {
  JsonNode body;int calls;
  public JsonNode fetch(String deviceId){calls++;return body;}
 }
 @Autowired MockMvc mvc;@Autowired JdbcTemplate db;@Autowired AccessService access;@Autowired PasswordEncoder passwords;@Autowired ObjectMapper json;@Autowired HuaweiIotProperties config;@Autowired StubCloud cloud;
 long node;String manager,worker,outsider;String device;
 @BeforeEach void setup()throws Exception{
  var suffix=UUID.randomUUID().toString();device="dev-"+suffix;
  node=access.insert("insert into monitoring_node(code,area_id,location,external_id,platform,metrics) values(?,1,'test',?,'HUAWEI_IOT','methane,temperature,humidity')","test-"+suffix,device);
  manager=account("manager-"+suffix,"MANAGER",1);worker=account("worker-"+suffix,"INSPECTOR",1);outsider=account("other-"+suffix,"MANAGER",2);
  config.setEnabled(true);config.getMappings().clear();var mapping=new HuaweiIotProperties.Mapping();mapping.setServiceId("environment");mapping.setPropertyName("gas");mapping.setUnit("%LEL");config.getMappings().put("methane",mapping);
  cloud.calls=0;cloud.body=payload(Instant.now().minusSeconds(30),43);
  if(db.queryForObject("select count(*) from alarm_rule where area_id=1 and metric='methane'",Integer.class)==0)db.update("insert into alarm_rule(area_id,metric,threshold_value,duration_seconds,severity,enabled) values(1,'methane',35,0,'HIGH',true)");
 }
 private String account(String username,String role,long area)throws Exception{
  long id=access.insert("insert into sys_user(username,password_hash,role_code,enabled) values(?,?,?,true)",username,passwords.encode("Test12345678"),role);db.update("insert into user_area(user_id,area_id) values(?,?)",id,area);
  return json.readTree(mvc.perform(post("/api/auth/login").contentType("application/json").content(json.writeValueAsString(Map.of("username",username,"password","Test12345678")))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data").path("accessToken").asText();
 }
 private JsonNode payload(Instant time,double gas)throws Exception{
  String timestamp=DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'").withZone(ZoneOffset.UTC).format(time);
  return json.valueToTree(Map.of("device_id",device,"shadow",List.of(Map.of("service_id","environment","version",1,"reported",Map.of("properties",Map.of("gas",gas),"event_time",timestamp),"desired",Map.of("properties",Map.of("gas",99))))));
 }
 private String endpoint(){return "/api/business/nodes/"+node+"/huawei-iot/sync";}
 @Test void enabledSyncUsesExistingTelemetryAlarmsAndDeduplicates()throws Exception{
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isOk()).andExpect(jsonPath("$.data.inserted").value(1));
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isOk()).andExpect(jsonPath("$.data.inserted").value(0));
  assertEquals(1,db.queryForObject("select count(*) from telemetry where node_id=?",Integer.class,node));
  assertEquals("HUAWEI_IOT",db.queryForObject("select source from telemetry where node_id=?",String.class,node));
  assertEquals(1,db.queryForObject("select count(*) from alarm where node_id=? and metric='methane'",Integer.class,node));
  assertTrue(db.queryForObject("select count(*) from audit_log where object_id=? and action='SYNC_HUAWEI_IOT'",Integer.class,String.valueOf(node))>0);
 }
 @Test void authAndAreaAreCheckedBeforeCloudAccess()throws Exception{
  mvc.perform(post(endpoint())).andExpect(status().isUnauthorized());
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+worker)).andExpect(status().isForbidden());
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+outsider)).andExpect(status().isForbidden());assertEquals(0,cloud.calls);
 }
 @Test void disabledStatusDoesNotExposeSecretsAndDoesNotContactCloud()throws Exception{
  config.setEnabled(false);
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isServiceUnavailable());
  String response=mvc.perform(get("/api/business/integrations/huawei-iot/status").header("Authorization","Bearer "+manager)).andExpect(status().isOk()).andExpect(jsonPath("$.data.enabled").value(false)).andReturn().getResponse().getContentAsString();
  assertFalse(response.contains("test-only-secret"));assertEquals(0,cloud.calls);
 }
 @Test void invalidShadowWritesNothing()throws Exception{
  ((com.fasterxml.jackson.databind.node.ObjectNode)cloud.body.path("shadow").get(0).path("reported")).remove("event_time");
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isBadGateway());
  assertEquals(0,db.queryForObject("select count(*) from telemetry where node_id=?",Integer.class,node));
 }
 @Test void staleShadowDoesNotPretendDeviceJustReported()throws Exception{
  Instant old=Instant.now().minusSeconds(7200).truncatedTo(java.time.temporal.ChronoUnit.SECONDS);cloud.body=payload(old,12);
  db.update("insert into alarm(node_id,metric,severity,reason) values(?,'offline','MEDIUM','test')",node);
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isOk());
  assertEquals(old,db.queryForObject("select last_seen from monitoring_node where id=?",java.sql.Timestamp.class,node).toInstant());
  assertEquals(1,db.queryForObject("select count(*) from alarm where node_id=? and metric='offline' and recovered_at is null",Integer.class,node));
 }
 @Test void duplicateBindingIsRejectedWithoutWriting()throws Exception{
  db.update("insert into monitoring_node(code,area_id,location,external_id,platform) values(?,1,'test',?,'HUAWEI_IOT')","duplicate-"+UUID.randomUUID(),device);
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isBadRequest());
  assertEquals(0,db.queryForObject("select count(*) from telemetry where node_id=?",Integer.class,node));
 }
 @Test void supportsHuawei128CharacterDeviceIds()throws Exception{
  device="d".repeat(128);db.update("update monitoring_node set external_id=? where id=?",device,node);cloud.body=payload(Instant.now().minusSeconds(30),12);
  mvc.perform(post(endpoint()).header("Authorization","Bearer "+manager)).andExpect(status().isOk()).andExpect(jsonPath("$.data.inserted").value(1));
 }
}
