package com.nephh.business;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.HashMap;
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

/** Builds exact all-history queues without deriving totals from capped legacy lists. */
@Service
public class WorkbenchService {
  private static final List<String> MANAGEMENT_QUEUES =
      List.of("urgentAlarms", "unassigned", "review", "overdue", "patrol");
  private static final List<String> PERSONAL_QUEUES =
      List.of("assigned", "processing", "overdue", "patrol");
  private static final Set<String> ALL_QUEUES = Set.of(
      "urgentAlarms", "unassigned", "review", "overdue", "patrol", "assigned", "processing");

  private final NamedParameterJdbcTemplate db;
  private final AccessService access;

  public WorkbenchService(JdbcTemplate jdbc, AccessService access) {
    this.db = new NamedParameterJdbcTemplate(jdbc);
    this.access = access;
  }

  public record Scope(String role, Long areaId, List<Long> areaIds, boolean personal) {}
  public record QueuePage(String key, long total, List<Map<String, Object>> items,
      boolean hasMore, int limit, int offset) {}
  public record WorkbenchResponse(Scope scope, Instant serverTime, Map<String, Long> counts,
      QueuePage queue) {}
  private record Definition(String columns, String from, String areaColumn,
      String predicate, String orderBy, String personalPredicate) {}

  /**
   * Reads a consistent count/page snapshot. The transaction remains writable because
   * authentication refreshes the user's session activity timestamp.
   */
  @Transactional(isolation = Isolation.REPEATABLE_READ)
  public WorkbenchResponse read(Jwt jwt, Long areaId, String queue, int limit, int offset) {
    if (limit < 1 || limit > 100 || offset < 0) {
      bad("每页应为1至100条，起始位置不能为负数");
    }
    if (areaId != null && areaId <= 0) {
      bad("区域编号无效");
    }
    var actor = access.actor(jwt);
    if (!Set.of("ADMIN", "MANAGER", "INSPECTOR").contains(actor.role())) {
      deny();
    }
    if (areaId != null) {
      access.area(actor, areaId);
    }
    var allowed = actor.manager() ? MANAGEMENT_QUEUES : PERSONAL_QUEUES;
    String selected = queue == null ? (actor.manager() ? "unassigned" : "assigned") : queue;
    if (!ALL_QUEUES.contains(selected)) {
      bad("待办队列不存在");
    }
    if (!allowed.contains(selected)) {
      deny();
    }

    Instant now = Instant.now();
    var args = new HashMap<String, Object>();
    args.put("userId", actor.id());
    args.put("areaId", areaId);
    args.put("now", Timestamp.from(now));
    args.put("limit", limit);
    args.put("offset", offset);
    var scope = new Scope(actor.role(), areaId, areas(actor, areaId, args), !actor.manager());
    var counts = new LinkedHashMap<String, Long>();
    for (String key : allowed) {
      var definition = definition(key);
      String predicate = predicate(definition, actor, areaId);
      counts.put(key, db.queryForObject("select count(*)" + definition.from() + predicate, args, Long.class));
    }
    var definition = definition(selected);
    String sql = "select " + definition.columns() + definition.from()
        + predicate(definition, actor, areaId) + " order by " + definition.orderBy()
        + " limit :limit offset :offset";
    var items = db.queryForList(sql, args);
    long total = counts.get(selected);
    return new WorkbenchResponse(scope, now, counts,
        new QueuePage(selected, total, items, (long) offset + items.size() < total, limit, offset));
  }

  /** Returns the authorized area identifiers exposed in the response scope. */
  private List<Long> areas(AccessService.Actor actor, Long areaId, Map<String, Object> args) {
    if (areaId != null) {
      return db.queryForList("select id from area where id=:areaId", args, Long.class);
    }
    if (actor.role().equals("ADMIN")) {
      return db.queryForList("select id from area order by id", args, Long.class);
    }
    return db.queryForList("select area_id from user_area where user_id=:userId order by area_id", args, Long.class);
  }

  /** Shares every scope and queue constraint between the count and page queries. */
  private String predicate(Definition definition, AccessService.Actor actor, Long areaId) {
    String sql = " where " + definition.predicate();
    if (areaId != null) {
      sql += " and " + definition.areaColumn() + "=:areaId";
    } else if (!actor.role().equals("ADMIN")) {
      sql += " and exists(select 1 from user_area ua where ua.user_id=:userId and ua.area_id="
          + definition.areaColumn() + ")";
    }
    if (!actor.manager()) {
      sql += " and " + definition.personalPredicate();
    }
    return sql;
  }

  /** Only constant SQL definitions may be selected; request values never form SQL. */
  private Definition definition(String queue) {
    if (queue.equals("urgentAlarms")) {
      return new Definition("al.*,n.code,n.area_id,n.location",
          " from alarm al join monitoring_node n on n.id=al.node_id", "n.area_id",
          "al.severity='HIGH' and al.recovered_at is null", "al.triggered_at asc,al.id asc", "1=0");
    }
    if (queue.equals("patrol")) {
      return new Definition("r.*,p.name,p.area_id,u.username assignee_name",
          " from patrol_run r join patrol_plan p on p.id=r.plan_id join sys_user u on u.id=r.assignee_id",
          "p.area_id", "r.status<>'COMPLETED'", "r.created_at asc,r.id asc", "r.assignee_id=:userId");
    }
    String state = switch (queue) {
      case "unassigned" -> "o.status='DRAFT'";
      case "review" -> "o.status='REVIEW'";
      case "overdue" -> "o.status not in('COMPLETED','CANCELLED') and o.due_at<:now";
      case "assigned" -> "o.status='ASSIGNED'";
      case "processing" -> "o.status in('ACCEPTED','PROCESSING')";
      default -> throw new IllegalArgumentException("Unsupported workbench queue");
    };
    return new Definition("o.*,n.code node_code,n.area_id,u.username assignee_name",
        " from work_order o join monitoring_node n on n.id=o.node_id left join sys_user u on u.id=o.assignee_id",
        "n.area_id", state, "case when o.due_at is null then 1 else 0 end,o.due_at asc,o.id asc",
        "(o.assignee_id=:userId or exists(select 1 from order_participant op where op.order_id=o.id and op.user_id=:userId))");
  }
}
