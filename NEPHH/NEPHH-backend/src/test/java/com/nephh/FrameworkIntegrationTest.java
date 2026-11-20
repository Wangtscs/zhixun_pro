package com.nephh;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.jdbc.core.JdbcTemplate;
import java.time.Instant;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
@org.springframework.test.context.TestExecutionListeners(listeners=org.springframework.test.context.support.DependencyInjectionTestExecutionListener.class,mergeMode=org.springframework.test.context.TestExecutionListeners.MergeMode.REPLACE_DEFAULTS)
@SpringBootTest(properties={"spring.config.import=","spring.profiles.active=local"})
@AutoConfigureMockMvc
class FrameworkIntegrationTest {
 @Autowired MockMvc mvc;
 @Autowired JwtEncoder encoder;
 @Autowired JdbcTemplate jdbc;
 @Test void publicHealth() throws Exception { mvc.perform(get("/api/health")).andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0)); }
 @Test void anonymousIsRejected() throws Exception { mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value(401)); }
 @Test void invalidTokenIsRejected() throws Exception { mvc.perform(get("/api/auth/me").header("Authorization","Bearer invalid")).andExpect(status().isUnauthorized()); }
 String token(Instant expires,String issuer) {
  var claims=JwtClaimsSet.builder().issuer(issuer).subject("42").issuedAt(Instant.now().minusSeconds(600)).expiresAt(expires).claim("scope","admin").build();
  return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
 }
 @Test void signedTokenIdentifiesCaller() throws Exception { mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token(Instant.now().plusSeconds(300),"nephh-backend"))).andExpect(status().isOk()).andExpect(jsonPath("$.data.subject").value("42")); }
 @Test void expiredTokenIsRejected() throws Exception { mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token(Instant.now().minusSeconds(300),"nephh-backend"))).andExpect(status().isUnauthorized()); }
 @Test void wrongIssuerIsRejected() throws Exception { mvc.perform(get("/api/auth/me").header("Authorization","Bearer "+token(Instant.now().plusSeconds(300),"other"))).andExpect(status().isUnauthorized()); }
 @Test void migrationCreatesIdentityTables() { assertEquals(0,jdbc.queryForObject("select count(*) from sys_user",Integer.class)); jdbc.queryForObject("select count(*) from sys_role_permission",Integer.class); }
 @Test void apiDocsAvailable() throws Exception { mvc.perform(get("/v3/api-docs")).andExpect(status().isOk()).andExpect(jsonPath("$.openapi").exists()); }
 @Test void allowedCorsOrigin() throws Exception { mvc.perform(options("/api/auth/me").header("Origin","http://localhost:5173").header("Access-Control-Request-Method","GET")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin","http://localhost:5173")); }
 @Test void unknownCorsOriginRejected() throws Exception { mvc.perform(options("/api/auth/me").header("Origin","https://unknown.example").header("Access-Control-Request-Method","GET")).andExpect(status().isForbidden()); }
}
