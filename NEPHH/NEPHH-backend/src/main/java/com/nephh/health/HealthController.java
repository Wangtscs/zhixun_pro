package com.nephh.health;
import com.nephh.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.Map;
@RestController
@RequestMapping("/api")
public class HealthController {
 private final DataSource dataSource;
 private final Environment environment;
 private final boolean verificationMode;

 public HealthController(DataSource dataSource,Environment environment,
   @Value("${app.verification-mode:false}") boolean verificationMode) {
  this.dataSource=dataSource;this.environment=environment;this.verificationMode=verificationMode;
 }

 @GetMapping("/health") @SecurityRequirements
 public ApiResponse<Map<String,Object>> health() {
  return ApiResponse.ok(Map.of("status","UP","application","nephh-backend",
    "isolatedVerification",isolatedVerification()));
 }

 /** Only an explicitly enabled local H2 instance may be used by mutating verification scripts. */
 private boolean isolatedVerification() {
  if(!verificationMode)return false;
  String[] profiles=environment.getActiveProfiles();
  if(profiles.length==0)profiles=environment.getDefaultProfiles();
  if(!Arrays.equals(profiles,new String[]{"local"}))return false;
  try(var connection=dataSource.getConnection()) {
   return "H2".equals(connection.getMetaData().getDatabaseProductName());
  } catch(SQLException error) {
   return false;
  }
 }
}
