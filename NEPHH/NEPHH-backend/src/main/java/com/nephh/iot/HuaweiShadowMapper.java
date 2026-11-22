package com.nephh.iot;

import com.fasterxml.jackson.databind.JsonNode;
import com.nephh.business.TelemetryService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.*;
import java.util.*;

@Component
public class HuaweiShadowMapper {
 private final HuaweiIotProperties config;
 private static final DateTimeFormatter CLOUD_TIME=DateTimeFormatter.ofPattern("uuuuMMdd'T'HHmmss'Z'").withResolverStyle(ResolverStyle.STRICT);
 public record Sample(String messageId,Instant collectedAt,Map<String,Double> values){}
 public HuaweiShadowMapper(HuaweiIotProperties config){this.config=config;}
 public List<Sample> map(String deviceId,Set<String> configuredMetrics,JsonNode body){
  if(body==null||!deviceId.equals(body.path("device_id").asText())||!body.path("shadow").isArray())throw invalid("设备影子结构或设备编号不匹配");
  Map<String,Map<String,HuaweiIotProperties.Mapping>> services=new TreeMap<>();
  if(config.getMappings()==null)throw invalid("缺少属性映射");
  for(var entry:config.getMappings().entrySet()){
   if(!configuredMetrics.contains(entry.getKey()))continue;
   var m=entry.getValue();String unit=TelemetryService.UNITS.get(entry.getKey());
   if(m==null||unit==null||!unit.equals(m.getUnit())||m.getServiceId()==null||m.getServiceId().isBlank()||m.getPropertyName()==null||m.getPropertyName().isBlank())throw invalid("属性映射或单位未正确配置，不执行隐式单位换算");
   services.computeIfAbsent(m.getServiceId(),key->new TreeMap<>()).put(entry.getKey(),m);
  }
  if(services.isEmpty())throw invalid("节点没有可用的华为属性映射");
  var samples=new ArrayList<Sample>();
  for(var service:services.entrySet()){
   var matches=new ArrayList<JsonNode>();for(JsonNode item:body.path("shadow"))if(service.getKey().equals(item.path("service_id").asText()))matches.add(item);
   if(matches.size()!=1)throw invalid("设备影子缺少映射服务或服务重复");
   var reported=matches.get(0).path("reported");var properties=reported.path("properties");
   if(!properties.isObject())throw invalid("缺少reported属性数据");
   Instant time=parseTime(reported.path("event_time").asText());
   if(time.isAfter(Instant.now().plusSeconds(60)))throw invalid("设备上报时间在未来");
   Map<String,Double> values=new TreeMap<>();
   for(var field:service.getValue().entrySet()){
    var value=properties.path(field.getValue().getPropertyName());double number;
    if(!value.isNumber()&&!value.isTextual())throw invalid("属性值必须是数值或数字字符串");
    try{number=Double.parseDouble(value.asText());}catch(NumberFormatException e){throw invalid("属性值无法转换为数值");}
    if(!Double.isFinite(number)||((field.getKey().equals("methane")||field.getKey().equals("humidity"))&&(number<0||number>100)))throw invalid("属性值超出支持范围");
    values.put(field.getKey(),number);
   }
   // Desired changes and shadow version changes must not make an unchanged reported sample new.
   String fingerprint=deviceId+"\n"+service.getKey()+"\n"+time+"\n"+values;
   samples.add(new Sample("huawei-"+digest(fingerprint),time,Collections.unmodifiableMap(values)));
  }
  return samples;
 }
 private Instant parseTime(String value){
  try{return LocalDateTime.parse(value,CLOUD_TIME).toInstant(ZoneOffset.UTC);}
  catch(DateTimeParseException e){try{return Instant.parse(value);}catch(DateTimeParseException ignored){throw invalid("缺少有效的reported.event_time，不使用拉取时间冒充采集时间");}}
 }
 private String digest(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(java.security.NoSuchAlgorithmException e){throw new IllegalStateException(e);}}
 private ResponseStatusException invalid(String message){return new ResponseStatusException(HttpStatus.BAD_GATEWAY,message);}
}
