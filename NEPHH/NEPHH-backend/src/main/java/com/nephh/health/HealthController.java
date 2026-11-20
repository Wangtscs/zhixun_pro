package com.nephh.health;
import com.nephh.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.security.SecurityRequirements;
import java.util.Map;
@RestController
@RequestMapping("/api")
public class HealthController {
 @GetMapping("/health") @SecurityRequirements
 public ApiResponse<Map<String,String>> health() { return ApiResponse.ok(Map.of("status","UP","application","nephh-backend")); }
}
