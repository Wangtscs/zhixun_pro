package com.nephh.business;

import com.nephh.common.ApiResponse;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Exact authorized work queues; legacy list endpoints remain unchanged. */
@RestController
@RequestMapping("/api/business/workbench")
public class WorkbenchController {
  private final WorkbenchService workbench;

  public WorkbenchController(WorkbenchService workbench) {
    this.workbench = workbench;
  }

  /** Read counts and a page using the same role, area and queue predicates. */
  @GetMapping
  public ApiResponse<WorkbenchService.WorkbenchResponse> read(
      @AuthenticationPrincipal Jwt jwt,
      @RequestParam(required = false) Long areaId,
      @RequestParam(required = false) String queue,
      @RequestParam(defaultValue = "20") int limit,
      @RequestParam(defaultValue = "0") int offset) {
    return ApiResponse.ok(workbench.read(jwt, areaId, queue, limit, offset));
  }
}
