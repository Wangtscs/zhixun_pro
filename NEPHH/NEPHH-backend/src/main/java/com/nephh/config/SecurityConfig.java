package com.nephh.config;
import com.nephh.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.source.ImmutableSecret;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.web.cors.*;
import jakarta.servlet.http.HttpServletResponse;
@Configuration
@EnableMethodSecurity
public class SecurityConfig {
 @Bean SecretKeySpec jwtKey(@Value("${app.jwt.secret}") String secret) {
  byte[] bytes=secret.getBytes(StandardCharsets.UTF_8);
  if(bytes.length<32) throw new IllegalArgumentException("JWT_SECRET must contain at least 32 bytes");
  return new SecretKeySpec(bytes,"HmacSHA256");
 }
 @Bean JwtDecoder jwtDecoder(SecretKeySpec key,@Value("${app.jwt.issuer}") String issuer) {
  var decoder=NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
  OAuth2TokenValidator<Jwt> required=jwt -> jwt.getExpiresAt()!=null && jwt.getSubject()!=null && !jwt.getSubject().isBlank()
    ? OAuth2TokenValidatorResult.success() : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token"));
  decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer),required));
  return decoder;
 }
 @Bean JwtEncoder jwtEncoder(SecretKeySpec key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }
 @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }
 @Bean CorsConfigurationSource corsConfigurationSource(@Value("${app.cors.allowed-origins}") String origins) {
  var c=new CorsConfiguration();
  c.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).filter(s->!s.isEmpty()).toList());
  c.setAllowedMethods(List.of("GET","POST","PUT","PATCH","DELETE","OPTIONS"));
  c.setAllowedHeaders(List.of("Authorization","Content-Type","Accept"));
  c.setMaxAge(3600L);
  var source=new UrlBasedCorsConfigurationSource(); source.registerCorsConfiguration("/**",c); return source;
 }
 @Bean SecurityFilterChain securityFilterChain(HttpSecurity http,ObjectMapper mapper) throws Exception {
  org.springframework.security.web.AuthenticationEntryPoint unauthenticated=(req,res,e)->writeError(res,mapper,401,"请先登录",true);
  org.springframework.security.web.access.AccessDeniedHandler denied=(req,res,e)->writeError(res,mapper,403,"权限不足",false);
  return http.csrf(csrf->csrf.disable()).cors(cors->{})
   .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .requestCache(c->c.disable())
   .authorizeHttpRequests(a->a.requestMatchers("/api/auth/login","/api/health","/actuator/health","/actuator/health/**","/swagger-ui/**","/swagger-ui.html","/v3/api-docs/**").permitAll().anyRequest().authenticated())
   .exceptionHandling(e->e.authenticationEntryPoint(unauthenticated).accessDeniedHandler(denied))
   .oauth2ResourceServer(o->o.jwt(jwt->{}).authenticationEntryPoint(unauthenticated).accessDeniedHandler(denied))
   .build();
 }
 private static void writeError(HttpServletResponse res,ObjectMapper mapper,int status,String message,boolean bearer) throws java.io.IOException {
  res.setStatus(status); res.setContentType("application/json;charset=UTF-8");
  if(bearer) res.setHeader("WWW-Authenticate","Bearer");
  mapper.writeValue(res.getOutputStream(),ApiResponse.error(status,message));
 }
}
