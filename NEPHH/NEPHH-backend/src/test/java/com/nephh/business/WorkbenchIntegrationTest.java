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
    "spring.datasource.url=jdbc:h2:mem:workbench;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE",
    "ADMIN_USERNAME=","ADMIN_PASSWORD="})
@AutoConfigureMockMvc
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WorkbenchIntegrationTest {
  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate db;
  @Autowired AccessService access;
  @Autowired PasswordEncoder passwords;
  @Autowired ObjectMapper json;
  private final Map<String,String> tokens = new HashMap<>();
  private long worker, other, crossAreaOrder, participantOrder, crossAreaRun;

  @BeforeAll void fixtures() throws Exception {
    long admin = user("wb-admin", "ADMIN", List.of());
    user("wb-manager", "MANAGER", List.of(1));
    worker = user("wb-worker", "INSPECTOR", List.of(1));
    other = user("wb-other", "INSPECTOR", List.of(1));
    user("wb-empty-manager", "MANAGER", List.of());
    user("wb-empty-worker", "INSPECTOR", List.of());
    Timestamp old = Timestamp.from(Instant.now().minusSeconds(90L*86400));
    Timestamp past = Timestamp.from(Instant.now().minusSeconds(3600));
    for (int i=0;i<525;i++) {
      db.update("insert into work_order(node_id,title,status,creator_id,created_at,due_at) values(1,?,'DRAFT',?,?,?)",
          "old-draft-"+i, admin, old, i==0?past:null);
    }
    order(4,"area-two-draft","DRAFT",null,admin,past);
    order(1,"worker-assigned","ASSIGNED",worker,admin,past);
    participantOrder=order(1,"participant-assigned","ASSIGNED",other,admin,null);
    db.update("insert into order_participant(order_id,user_id) values(?,?)",participantOrder,worker);
    order(1,"unrelated-assigned","ASSIGNED",other,admin,null);
    crossAreaOrder=order(4,"cross-area-worker","ASSIGNED",worker,admin,past);
    order(1,"accepted","ACCEPTED",worker,admin,null);
    order(1,"processing","PROCESSING",worker,admin,null);
    order(1,"review","REVIEW",worker,admin,past);
    order(1,"completed-overdue","COMPLETED",worker,admin,past);
    order(1,"cancelled-overdue","CANCELLED",worker,admin,past);

    alarm(1,"HIGH","OPEN",false);
    alarm(1,"HIGH","ACKNOWLEDGED",false);
    alarm(1,"HIGH","OPEN",true);
    alarm(1,"MEDIUM","OPEN",false);
    alarm(4,"HIGH","OPEN",false);

    long ownPlan=plan("own-plan",1,worker);
    long otherPlan=plan("other-plan",1,other);
    long crossPlan=plan("cross-plan",2,worker);
    for(int i=0;i<315;i++) {
      db.update("insert into patrol_run(plan_id,assignee_id,status,created_at) values(?,?,'PENDING',?)",ownPlan,worker,old);
    }
    db.update("insert into patrol_run(plan_id,assignee_id,status) values(?,?,'COMPLETED')",ownPlan,worker);
    db.update("insert into patrol_run(plan_id,assignee_id,status) values(?,?,'PROCESSING')",otherPlan,other);
    crossAreaRun=access.insert("insert into patrol_run(plan_id,assignee_id,status) values(?,?,'PENDING')",crossPlan,worker);
  }

  private long user(String name,String role,List<Integer> areas) throws Exception {
    long id=access.insert("insert into sys_user(username,password_hash,role_code,enabled) values(?,?,?,true)",
        name,passwords.encode("WorkbenchTest123"),role);
    for(int area:areas) db.update("insert into user_area(user_id,area_id) values(?,?)",id,area);
    String response=mvc.perform(post("/api/auth/login").contentType("application/json")
        .content(json.writeValueAsString(Map.of("username",name,"password","WorkbenchTest123"))))
        .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    tokens.put(name,json.readTree(response).path("data").path("accessToken").asText());
    return id;
  }

  private long order(long node,String title,String state,Long assignee,long creator,Timestamp due) {
    return access.insert("insert into work_order(node_id,title,status,assignee_id,creator_id,due_at) values(?,?,?,?,?,?)",
        node,title,state,assignee,creator,due);
  }

  private void alarm(long node,String severity,String state,boolean recovered) {
    db.update("insert into alarm(node_id,metric,severity,reason,status,recovered_at) values(?,'methane',?,'fixture',?,?)",
        node,severity,state,recovered?Timestamp.from(Instant.now()):null);
  }

  private long plan(String name,int area,long assignee) {
    return access.insert("insert into patrol_plan(name,area_id,assignee_id,period_hours,enabled) values(?,?,?,24,false)",
        name,area,assignee);
  }

  private JsonNode page(String name,String queue,int limit,int offset,Long area) throws Exception {
    var request=get("/api/business/workbench").header("Authorization","Bearer "+tokens.get(name))
        .param("queue",queue).param("limit",Integer.toString(limit)).param("offset",Integer.toString(offset));
    if(area!=null) request.param("areaId",area.toString());
    return json.readTree(mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).path("data");
  }

  @Test void countsIncludeOldOrdersBeyondLegacyFiveHundredLimit() throws Exception {
    var first=page("wb-manager","unassigned",100,0,null);
    var last=page("wb-manager","unassigned",100,500,null);
    assertEquals(525,first.path("counts").path("unassigned").asLong());
    assertEquals(525,first.path("queue").path("total").asLong());
    assertEquals(100,first.path("queue").path("items").size());
    assertTrue(first.path("queue").path("hasMore").asBoolean());
    assertEquals(25,last.path("queue").path("items").size());
    assertFalse(last.path("queue").path("hasMore").asBoolean());
    assertTrue(Instant.parse(first.path("serverTime").asText()).isBefore(Instant.now().plusSeconds(1)));
    assertEquals(1,first.path("scope").path("areaIds").get(0).asLong());
    assertFalse(first.path("scope").path("personal").asBoolean());
    assertNotEquals(first.path("queue").path("items").get(0).path("id").asLong(),
        last.path("queue").path("items").get(0).path("id").asLong());
  }

  @Test void patrolCountsIncludeOldRunsBeyondThreeHundredAndRespectOwnership() throws Exception {
    var manager=page("wb-manager","patrol",100,300,null);
    var workerPage=page("wb-worker","patrol",100,300,null);
    assertEquals(316,manager.path("counts").path("patrol").asLong());
    assertEquals(16,manager.path("queue").path("items").size());
    assertEquals(315,workerPage.path("counts").path("patrol").asLong());
    assertEquals(15,workerPage.path("queue").path("items").size());
    assertTrue(workerPage.path("scope").path("personal").asBoolean());
    for(var item:workerPage.path("queue").path("items")) {
      assertEquals(worker,item.path("assignee_id").asLong());
      mvc.perform(get("/api/business/patrol/runs/"+item.path("id").asLong())
          .header("Authorization","Bearer "+tokens.get("wb-worker"))).andExpect(status().isOk());
    }
    mvc.perform(get("/api/business/patrol/runs/"+crossAreaRun)
        .header("Authorization","Bearer "+tokens.get("wb-worker"))).andExpect(status().isForbidden());
  }

  @Test void personalOrdersIncludeParticipantButNeverUnrelatedOrUnauthorizedArea() throws Exception {
    var response=page("wb-worker","assigned",100,0,null);
    assertEquals(2,response.path("counts").path("assigned").asLong());
    assertEquals(2,response.path("counts").path("processing").asLong());
    assertEquals(2,response.path("counts").path("overdue").asLong());
    assertFalse(response.path("counts").has("unassigned"));
    boolean participantSeen=false;
    for(var item:response.path("queue").path("items")) {
      long id=item.path("id").asLong();participantSeen|=id==participantOrder;
      mvc.perform(get("/api/business/orders/"+id).header("Authorization","Bearer "+tokens.get("wb-worker")))
          .andExpect(status().isOk());
    }
    assertTrue(participantSeen);
    mvc.perform(get("/api/business/orders/"+crossAreaOrder).header("Authorization","Bearer "+tokens.get("wb-worker")))
        .andExpect(status().isForbidden());
  }

  @Test void managerCountsUseExactStateAndRecoveryPredicates() throws Exception {
    var response=page("wb-manager","urgentAlarms",100,0,null);
    assertEquals(2,response.path("counts").path("urgentAlarms").asLong());
    assertEquals(1,response.path("counts").path("review").asLong());
    assertEquals(3,response.path("counts").path("overdue").asLong());
    for(var item:response.path("queue").path("items")) {
      assertEquals("HIGH",item.path("severity").asText());
      assertTrue(item.path("recovered_at").isNull());
      assertEquals(1,item.path("area_id").asLong());
    }
    assertEquals(2,response.path("queue").path("items").size());
  }

  @Test void adminCanReadAllAreasOrSelectOneWhileManagerCannotCrossArea() throws Exception {
    assertEquals(526,page("wb-admin","unassigned",20,0,null).path("counts").path("unassigned").asLong());
    var selected=page("wb-admin","unassigned",20,0,2L);
    assertEquals(1,selected.path("counts").path("unassigned").asLong());
    assertEquals(2,selected.path("scope").path("areaId").asLong());
    mvc.perform(get("/api/business/workbench").param("areaId","2")
        .header("Authorization","Bearer "+tokens.get("wb-manager"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/business/workbench").param("areaId","2")
        .header("Authorization","Bearer "+tokens.get("wb-worker"))).andExpect(status().isForbidden());
  }

  @Test void emptyAuthorizationReturnsEmptyQueuesInsteadOfGlobalData() throws Exception {
    for(String name:List.of("wb-empty-manager","wb-empty-worker")) {
      var response=page(name,"patrol",20,0,null);
      assertEquals(0,response.path("scope").path("areaIds").size());
      for(var value:response.path("counts")) assertEquals(0,value.asLong());
      assertEquals(0,response.path("queue").path("items").size());
      assertFalse(response.path("queue").path("hasMore").asBoolean());
    }
  }

  @Test void paginationAndQueueInputsAreValidatedBeforeTheyCanAffectSql() throws Exception {
    String token=tokens.get("wb-admin");
    for(String limit:List.of("0","101","-1","invalid")) {
      mvc.perform(get("/api/business/workbench").param("limit",limit).header("Authorization","Bearer "+token))
          .andExpect(status().isBadRequest());
    }
    mvc.perform(get("/api/business/workbench").param("offset","-1").header("Authorization","Bearer "+token))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/business/workbench").param("areaId","0").header("Authorization","Bearer "+token))
        .andExpect(status().isBadRequest());
    mvc.perform(get("/api/business/workbench").param("queue","unassigned' OR 1=1 --").header("Authorization","Bearer "+token))
        .andExpect(status().isBadRequest());
    var beyond=page("wb-admin","unassigned",20,Integer.MAX_VALUE,null);
    assertEquals(0,beyond.path("queue").path("items").size());
    assertFalse(beyond.path("queue").path("hasMore").asBoolean());
    assertEquals(526,beyond.path("queue").path("total").asLong());
  }

  @Test void roleQueueWhitelistAndAnonymousAccessAreEnforced() throws Exception {
    mvc.perform(get("/api/business/workbench")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/business/workbench").param("queue","review")
        .header("Authorization","Bearer "+tokens.get("wb-worker"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/business/workbench").param("queue","assigned")
        .header("Authorization","Bearer "+tokens.get("wb-manager"))).andExpect(status().isForbidden());
    mvc.perform(get("/api/business/workbench").header("Authorization","Bearer "+tokens.get("wb-worker")))
        .andExpect(status().isOk()).andExpect(jsonPath("$.data.queue.key").value("assigned"));
  }
}
