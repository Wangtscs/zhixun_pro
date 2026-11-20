package com.nephh.iot;

import com.nephh.business.AccessService;
import com.nephh.common.ApiResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController @RequestMapping("/api/business")
public class HuaweiIotController {
 private final AccessService access;private final HuaweiIotService service;private final HuaweiIotProperties config;
 public HuaweiIotController(AccessService access,HuaweiIotService service,HuaweiIotProperties config){this.access=access;this.service=service;this.config=config;}
 @GetMapping("/integrations/huawei-iot/status") public ApiResponse<?> status(@AuthenticationPrincipal Jwt jwt){
  access.manager(access.actor(jwt));
  return ApiResponse.ok(Map.of("enabled",config.isEnabled(),"connectionConfigured",HuaweiRestShadowClient.configured(config),"mappingConfigured",config.getMappings()!=null&&!config.getMappings().isEmpty(),"mode","DEVICE_SHADOW_PULL"));
 }
 @PostMapping("/nodes/{id}/huawei-iot/sync") public ApiResponse<?> sync(@AuthenticationPrincipal Jwt jwt,@PathVariable long id){return ApiResponse.ok(service.sync(access.actor(jwt),id));}
}
