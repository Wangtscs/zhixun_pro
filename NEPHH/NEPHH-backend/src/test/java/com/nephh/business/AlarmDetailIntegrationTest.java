package com.nephh.business;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.TestExecutionListeners;
import org.springframework.test.context.support.DependencyInjectionTestExecutionListener;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@TestExecutionListeners(listeners=DependencyInjectionTestExecutionListener.class,
    mergeMode=TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(properties={"spring.config.import=","spring.profiles.active=local",
    "spring.datasource.url=jdbc:h2:mem:alarm_detail;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "ADMIN_USERNAME=","ADMIN_PASSWORD="})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class AlarmDetailIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired AccessService access;
  @Autowired PasswordEncoder passwords;
  @Autowired ObjectMapper json;
  private final Map<String,String> tokens = new HashMap<>();
  private long historical, crossArea, recovered, open, noRule, ownOrder, participantOrder, unrelatedOrder, crossOrder;

  @BeforeAll void fixtures() throws Exception {
    long admin=user("alarm-admin","ADMIN",List.of());
    user("alarm-manager","MANAGER",List.of(1));
    long worker=user("alarm-worker","INSPECTOR",List.of(1));
    long other=user("alarm-other","INSPECTOR",List.of(1));
    user("alarm-empty","INSPECTOR",List.of());
    historical=alarm(1,"methane","ACKNOWLEDGED",false);
    db.update("update alarm set reason='历史触发阈值35，当前规则可能已改变',triggered_at=? where id=?",
        Timestamp.from(Instant.now().minusSeconds(90L*86400)),historical);
    crossArea=alarm(4,"methane","OPEN",false);
    recovered=alarm(1,"methane","ACKNOWLEDGED",true);
    open=alarm(1,"methane","OPEN",false);
    noRule=alarm(1,"offline","OPEN",false);
    for(int i=0;i<505;i++) alarm(1,"methane","OPEN",true);
    db.update("insert into alarm_rule(area_id,metric,threshold_value,duration_seconds,severity,enabled) values(1,'methane',50,5,'HIGH',true)");
    Timestamp sampled=Timestamp.from(Instant.now().minusSeconds(30));
    db.update("insert into telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source) values(1,'detail-temp-old','temperature',22,'°C',?,'SIMULATOR')",sampled);
    db.update("insert into telemetry(node_id,message_id,metric,metric_value,unit,collected_at,source) values(1,'detail-temp-new','temperature',23,'°C',?,'SIMULATOR')",sampled);
    for(int i=0;i<103;i++) unrelatedOrder=order(1,historical,"other-linked-"+i,other,admin);
    ownOrder=order(1,historical,"own-linked",worker,admin);
    participantOrder=order(1,historical,"participant-linked",other,admin);
    db.update("insert into order_participant(order_id,user_id) values(?,?)",participantOrder,worker);
    // Even an inconsistent legacy association cannot bypass an order's own area boundary.
    crossOrder=order(4,historical,"cross-area-linked",worker,admin);
    order(1,null,"own-linked",worker,admin);
  }

  private long user(String name,String role,List<Integer> areas) throws Exception {
    long id=access.insert("insert into sys_user(username,password_hash,role_code,enabled) values(?,?,?,true)",
        name,passwords.encode("AlarmDetailTest123"),role);
    for(int area:areas) db.update("insert into user_area(user_id,area_id) values(?,?)",id,area);
    String response=mvc.perform(post("/api/auth/login").contentType("application/json")
        .content(json.writeValueAsString(Map.of("username",name,"password","AlarmDetailTest123"))))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    tokens.put(name,json.readTree(response).path("data").path("accessToken").asText());
    return id;
  }

  private long alarm(long node,String metric,String state,boolean isRecovered) {
    Timestamp now=Timestamp.from(Instant.now());
    return access.insert("insert into alarm(node_id,metric,severity,reason,status,acknowledged_at,recovered_at) values(?,?,'HIGH','fixture',?,?,?)",
        node,metric,state,"ACKNOWLEDGED".equals(state)?now:null,isRecovered?now:null);
  }

  private long order(long node,Long alarm,String title,long assignee,long creator) {
    return access.insert("insert into work_order(node_id,alarm_id,title,status,assignee_id,creator_id) values(?,?,?,'ASSIGNED',?,?)",
        node,alarm,title,assignee,creator);
  }

  private JsonNode detail(String user,long id) throws Exception {
    String response=mvc.perform(get("/api/business/alarms/"+id).header("Authorization","Bearer "+tokens.get(user)))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    return json.readTree(response).path("data");
  }

  @Test void stableIdReadsAlarmOutsideLegacyRecentFiveHundred() throws Exception {
    var list=json.readTree(mvc.perform(get("/api/business/alarms").header("Authorization","Bearer "+tokens.get("alarm-manager")))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
    assertEquals(500,list.size());
    for(var row:list) assertNotEquals(historical,row.path("id").asLong());
    var detail=detail("alarm-manager",historical);
    assertEquals(historical,detail.path("alarm").path("id").asLong());
    assertEquals("历史触发阈值35，当前规则可能已改变",detail.path("alarm").path("reason").asText());
  }

  @Test void currentRuleIsExplicitlyNotTriggerSnapshotAndLatestSamplesAreStoredValues() throws Exception {
    var detail=detail("alarm-manager",historical);
    assertEquals("AVAILABLE",detail.path("ruleAccess").asText());
    assertEquals("CURRENT_CONFIGURATION_NOT_TRIGGER_SNAPSHOT",detail.path("ruleContext").asText());
    assertEquals(50,detail.path("currentRule").path("threshold_value").asDouble());
    assertTrue(detail.path("ruleExplanation").asText().contains("不是告警触发时"));
    assertEquals(1,detail.path("node").path("id").asLong());
    assertEquals(1,detail.path("node").path("latest").size());
    var reading=detail.path("node").path("latest").get(0);
    assertEquals(23,reading.path("metric_value").asDouble());
    assertEquals("SIMULATOR",reading.path("source").asText());
    assertEquals("detail-temp-new",reading.path("message_id").asText());
  }

  @Test void acknowledgmentAndRecoveryAreIndependent() throws Exception {
    var ack=detail("alarm-manager",historical).path("state");
    assertTrue(ack.path("active").asBoolean());
    assertTrue(ack.path("acknowledged").asBoolean());
    assertFalse(ack.path("recovered").asBoolean());
    var done=detail("alarm-manager",recovered).path("state");
    assertFalse(done.path("active").asBoolean());
    assertTrue(done.path("acknowledged").asBoolean());
    assertTrue(done.path("recovered").asBoolean());
    var pending=detail("alarm-manager",open).path("state");
    assertTrue(pending.path("active").asBoolean());
    assertFalse(pending.path("acknowledged").asBoolean());
  }

  @Test void inspectorCannotReadRulesOrOtherPeoplesOrders() throws Exception {
    var detail=detail("alarm-worker",historical);
    assertTrue(detail.path("currentRule").isNull());
    assertEquals("RESTRICTED",detail.path("ruleAccess").asText());
    assertTrue(detail.path("ruleExplanation").asText().contains("不能读取"));
    assertFalse(detail.toString().contains("threshold_value"));
    var orders=detail.path("relatedOrders");
    assertEquals(2,orders.path("items").size());
    assertFalse(orders.path("hasMore").asBoolean());
    assertEquals(participantOrder,orders.path("items").get(0).path("id").asLong());
    assertEquals(ownOrder,orders.path("items").get(1).path("id").asLong());
    for(var order:orders.path("items")) {
      mvc.perform(get("/api/business/orders/"+order.path("id").asLong()).header("Authorization","Bearer "+tokens.get("alarm-worker")))
          .andExpect(status().isOk());
    }
    mvc.perform(get("/api/business/orders/"+unrelatedOrder).header("Authorization","Bearer "+tokens.get("alarm-worker")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/business/orders/"+crossOrder).header("Authorization","Bearer "+tokens.get("alarm-worker")))
        .andExpect(status().isForbidden());
  }

  @Test void linkedOrderLimitIsExplicitAndManagerScopeMatchesDetailAccess() throws Exception {
    var related=detail("alarm-manager",historical).path("relatedOrders");
    assertEquals(100,related.path("limit").asInt());
    assertEquals(100,related.path("items").size());
    assertTrue(related.path("hasMore").asBoolean());
    long previous=Long.MAX_VALUE;
    for(var row:related.path("items")) {
      assertEquals(1,row.path("area_id").asLong());
      assertEquals(historical,row.path("alarm_id").asLong());
      assertTrue(row.path("id").asLong()<previous);
      previous=row.path("id").asLong();
    }
    for(int index:List.of(0,99)) {
      long id=related.path("items").get(index).path("id").asLong();
      mvc.perform(get("/api/business/orders/"+id).header("Authorization","Bearer "+tokens.get("alarm-manager")))
          .andExpect(status().isOk());
    }
    var admin=detail("alarm-admin",historical).path("relatedOrders");
    assertEquals(crossOrder,admin.path("items").get(0).path("id").asLong());
    mvc.perform(get("/api/business/orders/"+crossOrder).header("Authorization","Bearer "+tokens.get("alarm-admin")))
        .andExpect(status().isOk());
  }

  @Test void missingRuleHasReadableExplanationWithoutInventedSnapshot() throws Exception {
    var detail=detail("alarm-manager",noRule);
    assertTrue(detail.path("currentRule").isNull());
    assertEquals("NOT_CONFIGURED",detail.path("ruleAccess").asText());
    assertTrue(detail.path("ruleExplanation").asText().contains("未配置"));
    assertEquals(0,detail.path("relatedOrders").path("items").size());
    assertFalse(detail.path("relatedOrders").path("hasMore").asBoolean());
  }

  @Test void crossAreaEmptyAuthorizationMissingIdAndAnonymousAreRejected() throws Exception {
    for(String user:List.of("alarm-manager","alarm-worker")) {
      mvc.perform(get("/api/business/alarms/"+crossArea).header("Authorization","Bearer "+tokens.get(user)))
          .andExpect(status().isForbidden());
    }
    mvc.perform(get("/api/business/alarms/"+historical).header("Authorization","Bearer "+tokens.get("alarm-empty")))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/business/alarms/9999999").header("Authorization","Bearer "+tokens.get("alarm-admin")))
        .andExpect(status().isNotFound());
    mvc.perform(get("/api/business/alarms/0").header("Authorization","Bearer "+tokens.get("alarm-admin")))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/business/alarms/"+historical)).andExpect(status().isUnauthorized());
    assertEquals(crossArea,detail("alarm-admin",crossArea).path("alarm").path("id").asLong());
  }
}
