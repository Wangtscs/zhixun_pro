package com.nephh.business;

import com.nephh.common.ApiResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Reads a stable alarm ID independently of the capped recent-alarm list. */
@RestController
@RequestMapping("/api/business/alarms")
public class AlarmDetailController {
  private final AlarmDetailService details;

  public AlarmDetailController(AlarmDetailService details) {
    this.details = details;
  }

  /** Exposes only alarm, node, rule and order data readable by the authenticated actor. */
  @GetMapping("/{id}")
  public ApiResponse<AlarmDetailService.AlarmDetailResponse> read(
      @AuthenticationPrincipal Jwt jwt, @PathVariable long id) {
    return ApiResponse.ok(details.read(jwt, id));
  }
}
