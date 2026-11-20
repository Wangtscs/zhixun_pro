package com.nephh.auth;
import com.nephh.common.ApiResponse;
import com.nephh.system.mapper.SysUserMapper;
import com.nephh.system.entity.SysUser;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Map;
@RestController
@RequestMapping("/api/auth")
public class AuthController {
 private final SysUserMapper users;
 private final PasswordEncoder passwords;
 private final JwtEncoder encoder;
 private final String issuer;
 private final SessionService sessions;
 public AuthController(SysUserMapper users,PasswordEncoder passwords,JwtEncoder encoder,SessionService sessions,@Value("${app.jwt.issuer}") String issuer) {
  this.sessions=sessions;this.users=users;this.passwords=passwords;this.encoder=encoder;this.issuer=issuer;
 }
 public record LoginRequest(@NotBlank @Size(max=64) String username,@NotBlank @Size(max=128) String password) {}
 @PostMapping("/login")
 public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,jakarta.servlet.http.HttpServletRequest servletRequest) {
  var user=users.selectOne(new LambdaQueryWrapper<SysUser>().eq(SysUser::getUsername,request.username()));
  if(user==null || !Boolean.TRUE.equals(user.getEnabled()) || !passwords.matches(request.password(),user.getPasswordHash()))
   return ResponseEntity.status(401).body(ApiResponse.error(401,"账号或密码错误"));
  var now=Instant.now();String sessionId=java.util.UUID.randomUUID().toString();
  var claims=JwtClaimsSet.builder().id(sessionId).issuer(issuer).subject(user.getId().toString()).issuedAt(now).expiresAt(now.plusSeconds(3600)).claim("username",user.getUsername()).build();
  var token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
  sessions.record(sessionId,user.getId(),servletRequest.getHeader("User-Agent"),servletRequest.getRemoteAddr(),now.plusSeconds(3600));
  return ResponseEntity.ok(ApiResponse.ok(Map.of("accessToken",token,"tokenType","Bearer","expiresIn",3600,"username",user.getUsername())));
 }
 @GetMapping("/me")
 public ApiResponse<Map<String,String>> me(@AuthenticationPrincipal Jwt jwt) {
  sessions.ensureActive(jwt);
  String username=jwt.getClaimAsString("username");
  return ApiResponse.ok(Map.of("subject",jwt.getSubject(),"username",username==null?jwt.getSubject():username));
 }
}
