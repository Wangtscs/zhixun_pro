package com.nephh.business;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import static com.nephh.business.AccessService.bad;
import static com.nephh.business.AccessService.deny;

/** Adds an authorized evidence view without changing legacy alarm or work-order behavior. */
@Service
public class AlarmDetailService {
  private static final int RELATED_ORDER_LIMIT = 100;
  private static final String RULE_CONTEXT = "CURRENT_CONFIGURATION_NOT_TRIGGER_SNAPSHOT";
  private final JdbcTemplate jdbc;
  private final NamedParameterJdbcTemplate db;
  private final AccessService access;

  public AlarmDetailService(JdbcTemplate jdbc, AccessService access) {
    this.jdbc = jdbc;
    this.db = new NamedParameterJdbcTemplate(jdbc);
    this.access = access;
  }

  public record AlarmState(boolean active, boolean acknowledged, boolean recovered) {}
  public record RelatedOrders(List<Map<String,Object>> items, int limit, boolean hasMore) {}
  public record AlarmDetailResponse(Map<String,Object> alarm, Map<String,Object> node,
      AlarmState state, Map<String,Object> currentRule, String ruleContext,
      String ruleAccess, String ruleExplanation, RelatedOrders relatedOrders) {}

  /**
   * Reads the persisted alarm and authorized linked records in one snapshot.
   * Authentication may refresh session activity, so the transaction is not read-only.
   */
  @Transactional(isolation = Isolation.REPEATABLE_READ)
  public AlarmDetailResponse read(Jwt jwt, long alarmId) {
    if (alarmId <= 0) {
      bad("告警编号无效");
    }
    var actor = access.actor(jwt);
    if (!Set.of("ADMIN", "MANAGER", "INSPECTOR").contains(actor.role())) {
      deny();
    }
    var alarm = access.one("select * from alarm where id=?", alarmId);
    long nodeId = ((Number)alarm.get("node_id")).longValue();
    var node = new LinkedHashMap<String,Object>(access.node(actor, nodeId));
    node.put("latest", latest(nodeId));
    boolean recovered = alarm.get("recovered_at") != null;
    boolean acknowledged = alarm.get("acknowledged_at") != null || "ACKNOWLEDGED".equals(alarm.get("status"));

    Map<String,Object> rule = null;
    String ruleAccess = "RESTRICTED";
    String explanation = "当前角色不能读取告警规则；未返回规则配置。";
    if (actor.manager()) {
      var rules = jdbc.queryForList("select * from alarm_rule where area_id=? and metric=?",
          node.get("area_id"), alarm.get("metric"));
      rule = rules.isEmpty() ? null : rules.get(0);
      ruleAccess = rule == null ? "NOT_CONFIGURED" : "AVAILABLE";
      explanation = rule == null ? "当前未配置该指标规则；无法据此还原触发时规则。"
          : "当前规则仅作配置参考，不是告警触发时的规则快照。";
    }
    return new AlarmDetailResponse(alarm, node, new AlarmState(!recovered, acknowledged, recovered),
        rule, RULE_CONTEXT, ruleAccess, explanation, relatedOrders(actor, alarmId));
  }

  /** Returns stored latest samples only; no inferred readings or invented trigger evidence. */
  private List<Map<String,Object>> latest(long nodeId) {
    var rows = new ArrayList<Map<String,Object>>();
    for (String metric : TelemetryService.UNITS.keySet()) {
      rows.addAll(jdbc.queryForList("select * from telemetry where node_id=? and metric=? order by collected_at desc,id desc limit 1",
          nodeId, metric));
    }
    return rows;
  }

  /** Uses the same area and owner/participant constraints as existing order detail access. */
  private RelatedOrders relatedOrders(AccessService.Actor actor, long alarmId) {
    String filter = " where o.alarm_id=:alarmId";
    if (!actor.role().equals("ADMIN")) {
      filter += " and exists(select 1 from user_area ua where ua.user_id=:userId and ua.area_id=n.area_id)";
    }
    if (!actor.manager()) {
      filter += " and (o.assignee_id=:userId or exists(select 1 from order_participant op where op.order_id=o.id and op.user_id=:userId))";
    }
    var rows = db.queryForList("select o.id,o.node_id,o.alarm_id,o.title,o.status,o.priority,o.assignee_id,"
        + "o.due_at,o.created_at,o.updated_at,n.code node_code,n.area_id,u.username assignee_name"
        + " from work_order o join monitoring_node n on n.id=o.node_id left join sys_user u on u.id=o.assignee_id"
        + filter + " order by o.id desc limit :limit",
        Map.of("alarmId", alarmId, "userId", actor.id(), "limit", RELATED_ORDER_LIMIT + 1));
    boolean more = rows.size() > RELATED_ORDER_LIMIT;
    return new RelatedOrders(List.copyOf(rows.subList(0, Math.min(rows.size(), RELATED_ORDER_LIMIT))),
        RELATED_ORDER_LIMIT, more);
  }
}
