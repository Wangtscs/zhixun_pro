package com.nephh.iot;

import com.nephh.business.AccessService;
import com.nephh.business.TelemetryService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
import static com.nephh.business.AccessService.*;

@Service
public class HuaweiIotService {
 private final HuaweiIotProperties config;private final HuaweiShadowClient client;private final HuaweiShadowMapper mapper;private final TelemetryService telemetry;private final JdbcTemplate db;private final AccessService access;
 public HuaweiIotService(HuaweiIotProperties config,HuaweiShadowClient client,HuaweiShadowMapper mapper,TelemetryService telemetry,JdbcTemplate db,AccessService access){this.config=config;this.client=client;this.mapper=mapper;this.telemetry=telemetry;this.db=db;this.access=access;}
 @Transactional public Map<String,Object> sync(AccessService.Actor actor,long nodeId){
  access.manager(actor);var node=access.node(actor,nodeId);
  if(!config.isEnabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"华为IoT接入尚未启用");
  if(!"HUAWEI_IOT".equals(node.get("platform")))bad("请先将节点平台设为HUAWEI_IOT");
  String device=Objects.toString(node.get("external_id"),"");
  if(!device.matches("[a-zA-Z0-9_-]{1,128}"))bad("节点尚未绑定有效的华为设备ID");
  if(!Boolean.TRUE.equals(node.get("enabled")))bad("节点已停用");
  var samples=mapper.map(device,Set.of(node.get("metrics").toString().split(",")),client.fetch(device));
  // Recheck mutable binding under lock before storing the cloud response.
  var current=access.one("select * from monitoring_node where id=? for update",nodeId);
  access.area(actor,((Number)current.get("area_id")).longValue());
  if(!device.equals(current.get("external_id"))||!"HUAWEI_IOT".equals(current.get("platform")))bad("设备绑定已变更，请重新同步");
  if(db.queryForObject("select count(*) from monitoring_node where platform='HUAWEI_IOT' and external_id=?",Integer.class,device)!=1)bad("同一华为设备绑定了多个节点，请先修正绑定");
  int inserted=0;for(var sample:samples)inserted+=telemetry.ingest(nodeId,sample.messageId(),"HUAWEI_IOT",sample.collectedAt(),sample.values());
  access.audit(actor,"SYNC_HUAWEI_IOT","NODE",nodeId,null,"写入"+inserted+"项指标，来源HUAWEI_IOT");
  return Map.of("nodeId",nodeId,"deviceId",device,"inserted",inserted,"samples",samples.size(),"source","HUAWEI_IOT");
 }
}
