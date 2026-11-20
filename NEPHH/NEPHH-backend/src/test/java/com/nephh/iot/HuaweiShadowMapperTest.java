package com.nephh.iot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class HuaweiShadowMapperTest {
 private final ObjectMapper json=new ObjectMapper();
 private HuaweiIotProperties config(){
  var p=new HuaweiIotProperties();
  var mapping=new HuaweiIotProperties.Mapping();mapping.setServiceId("environment");mapping.setPropertyName("gas");mapping.setUnit("%LEL");
  p.getMappings().put("methane",mapping);return p;
 }
 private com.fasterxml.jackson.databind.JsonNode shadow(String reported,String desired)throws Exception{
  return json.readTree("{\"device_id\":\"device-1\",\"shadow\":[{\"service_id\":\"environment\",\"version\":1,\"reported\":{\"properties\":"+reported+",\"event_time\":\"20260101T010203Z\"},\"desired\":{\"properties\":"+desired+"}}]}");
 }
 @Test void usesReportedTimeAndValuesAndIgnoresDesiredVersion()throws Exception{
  var mapper=new HuaweiShadowMapper(config());var one=shadow("{\"gas\":\"12.5\"}","{\"gas\":99}");
  var result=mapper.map("device-1",Set.of("methane"),one);assertEquals(1,result.size());
  assertEquals(12.5,result.get(0).values().get("methane"));assertEquals(Instant.parse("2026-01-01T01:02:03Z"),result.get(0).collectedAt());
  var two=shadow("{\"gas\":12.5}","{\"gas\":88}");((com.fasterxml.jackson.databind.node.ObjectNode)two.path("shadow").get(0)).put("version",5);
  assertEquals(result.get(0).messageId(),mapper.map("device-1",Set.of("methane"),two).get(0).messageId());
 }
 @Test void rejectsMissingTimeWrongDeviceAndMalformedValue()throws Exception{
  var mapper=new HuaweiShadowMapper(config());
  for(String value:List.of("null","true","\"NaN\"","101","{}")){
   var payload=shadow("{\"gas\":"+value+"}","{}");assertThrows(ResponseStatusException.class,()->mapper.map("device-1",Set.of("methane"),payload));
  }
  var payload=shadow("{\"gas\":12}","{}");assertThrows(ResponseStatusException.class,()->mapper.map("other",Set.of("methane"),payload));
  ((com.fasterxml.jackson.databind.node.ObjectNode)payload.path("shadow").get(0).path("reported")).remove("event_time");
  assertThrows(ResponseStatusException.class,()->mapper.map("device-1",Set.of("methane"),payload));
 }
 @Test void requiresExplicitCompatibleUnitsAndUsableMapping()throws Exception{
  var p=config();p.getMappings().get("methane").setUnit("ppm");
  var payload=shadow("{\"gas\":12}","{}");assertThrows(ResponseStatusException.class,()->new HuaweiShadowMapper(p).map("device-1",Set.of("methane"),payload));
  assertThrows(ResponseStatusException.class,()->new HuaweiShadowMapper(config()).map("device-1",Set.of("humidity"),payload));
 }
 @Test void supportsSeparateServiceTimestampsWithoutMergingSamples()throws Exception{
  var p=config();var m=new HuaweiIotProperties.Mapping();m.setServiceId("climate");m.setPropertyName("temp");m.setUnit("°C");p.getMappings().put("temperature",m);
  var payload=(com.fasterxml.jackson.databind.node.ObjectNode)shadow("{\"gas\":12}","{}");
  ((com.fasterxml.jackson.databind.node.ArrayNode)payload.path("shadow")).add(json.readTree("{\"service_id\":\"climate\",\"reported\":{\"properties\":{\"temp\":25},\"event_time\":\"20260101T010204Z\"}}"));
  var samples=new HuaweiShadowMapper(p).map("device-1",Set.of("methane","temperature"),payload);
  assertEquals(2,samples.size());assertNotEquals(samples.get(0).collectedAt(),samples.get(1).collectedAt());
 }
}
