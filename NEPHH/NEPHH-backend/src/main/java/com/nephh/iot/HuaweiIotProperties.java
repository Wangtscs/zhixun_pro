package com.nephh.iot;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.LinkedHashMap;
import java.util.Map;

@Getter @Setter @Component
@ConfigurationProperties(prefix="app.huawei-iot")
public class HuaweiIotProperties {
 private boolean enabled=false;
 private String endpoint="",projectId="",instanceId="",authToken="";
 private Map<String,Mapping> mappings=new LinkedHashMap<>();
 @Getter @Setter
 public static class Mapping {
  private String serviceId="",propertyName="",unit="";
 }
}
