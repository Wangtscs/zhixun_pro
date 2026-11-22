package com.nephh.iot;

import org.junit.jupiter.api.Test;
import org.springframework.http.*;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class HuaweiRestShadowClientTest {
 private HuaweiIotProperties config(){var p=new HuaweiIotProperties();p.setEnabled(true);p.setEndpoint("https://iot.example");p.setProjectId("project-1");p.setInstanceId("instance-1");p.setAuthToken("test-only-cloud-token");return p;}
 @Test void requestsShadowWithServerSideHeaders(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
  server.expect(requestTo("https://iot.example/v5/iot/project-1/devices/device-1/shadow")).andExpect(method(HttpMethod.GET)).andExpect(header("X-Auth-Token","test-only-cloud-token")).andExpect(header("Instance-Id","instance-1")).andRespond(withSuccess("{\"device_id\":\"device-1\",\"shadow\":[]}",MediaType.APPLICATION_JSON));
  assertEquals("device-1",new HuaweiRestShadowClient(config(),builder.build()).fetch("device-1").path("device_id").asText());server.verify();
 }
 @Test void cloudAuthFailureIs502WithoutLeakingCloudBodyOrLoggingUserOut(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();
  server.expect(anything()).andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("sensitive-cloud-detail"));
  var error=assertThrows(ResponseStatusException.class,()->new HuaweiRestShadowClient(config(),builder.build()).fetch("device-1"));
  assertEquals(502,error.getStatusCode().value());assertFalse(error.getReason().contains("sensitive-cloud-detail"));server.verify();
 }
 @Test void disabledOrInvalidConfigurationNeverMakesARequest(){
  var builder=RestClient.builder();var server=MockRestServiceServer.bindTo(builder).build();var p=config();
  p.setEnabled(false);assertEquals(503,assertThrows(ResponseStatusException.class,()->new HuaweiRestShadowClient(p,builder.build()).fetch("device-1")).getStatusCode().value());
  p.setEnabled(true);p.setEndpoint("http://iot.example");assertFalse(HuaweiRestShadowClient.configured(p));
  assertThrows(ResponseStatusException.class,()->new HuaweiRestShadowClient(p,builder.build()).fetch("device-1"));server.verify();
 }
}
