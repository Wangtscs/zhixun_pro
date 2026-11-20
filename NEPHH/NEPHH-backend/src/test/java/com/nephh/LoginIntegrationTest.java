package com.nephh;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@org.springframework.test.context.TestExecutionListeners(listeners=org.springframework.test.context.support.DependencyInjectionTestExecutionListener.class,mergeMode=org.springframework.test.context.TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(properties={"spring.config.import=","spring.profiles.active=local","spring.datasource.url=jdbc:h2:mem:login;MODE=MySQL;DB_CLOSE_DELAY=-1;DATABASE_TO_LOWER=TRUE","ADMIN_USERNAME=login-admin","ADMIN_PASSWORD=test-password-123"}) @AutoConfigureMockMvc
class LoginIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
 @Test void successfulLogin() throws Exception {
  var result=mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"login-admin\",\"password\":\"test-password-123\"}")).andExpect(status().isOk()).andReturn();
  String token=json.readTree(result.getResponse().getContentAsString()).path("data").path("accessToken").asText();
  mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token)).andExpect(status().isOk()).andExpect(jsonPath("$.data.username").value("login-admin"));
 }
 @Test void emptyCredentialsRejected() throws Exception { mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"\",\"password\":\"\"}")).andExpect(status().isBadRequest()); }
 @Test void wrongCredentialsRejected() throws Exception { mvc.perform(post("/api/auth/login").contentType("application/json").content("{\"username\":\"missing\",\"password\":\"wrong\"}")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.message").value("账号或密码错误")); }
}
