package com.nephh.iot;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.*;
import org.springframework.web.server.ResponseStatusException;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;

@Component
public class HuaweiRestShadowClient implements HuaweiShadowClient {
 private final HuaweiIotProperties config;
 private final RestClient client;
 @Autowired public HuaweiRestShadowClient(HuaweiIotProperties config){this(config,createClient());}
 HuaweiRestShadowClient(HuaweiIotProperties config,RestClient client){this.config=config;this.client=client;}
 private static RestClient createClient(){
  var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
  var factory=new JdkClientHttpRequestFactory(http);factory.setReadTimeout(Duration.ofSeconds(10));
  return RestClient.builder().requestFactory(factory).build();
 }
 public static boolean configured(HuaweiIotProperties config){
  try{validate(config);return true;}catch(ResponseStatusException e){return false;}
 }
 private static void validate(HuaweiIotProperties config){
  try{
   var uri=URI.create(config.getEndpoint());
   if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||uri.getUserInfo()!=null||uri.getQuery()!=null||uri.getFragment()!=null||!(uri.getPath().isEmpty()||uri.getPath().equals("/")))throw new IllegalArgumentException();
   if(!config.getProjectId().matches("[a-zA-Z0-9_-]{1,128}")||config.getAuthToken().isBlank()||config.getAuthToken().contains("\r")||config.getAuthToken().contains("\n")||config.getInstanceId().contains("\r")||config.getInstanceId().contains("\n"))throw new IllegalArgumentException();
  }catch(RuntimeException e){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"华为IoT平台地址、项目ID或鉴权配置未完成");}
 }
 @Override public JsonNode fetch(String deviceId){
  if(!config.isEnabled())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"华为IoT接入尚未启用");
  validate(config);
  if(deviceId==null||!deviceId.matches("[a-zA-Z0-9_-]{1,128}"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"华为设备ID格式不正确");
  String base=config.getEndpoint().replaceAll("/+$","");
  var uri=org.springframework.web.util.UriComponentsBuilder.fromUriString(base).path("/v5/iot/{project}/devices/{device}/shadow").buildAndExpand(config.getProjectId(),deviceId).encode().toUri();
  try{
   var request=client.get().uri(uri).header("X-Auth-Token",config.getAuthToken()).accept(org.springframework.http.MediaType.APPLICATION_JSON);
   if(!config.getInstanceId().isBlank())request.header("Instance-Id",config.getInstanceId());
   return request.retrieve().body(JsonNode.class);
  }catch(RestClientResponseException e){
   if(e.getStatusCode().value()==401||e.getStatusCode().value()==403)throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"华为IoT鉴权失败，请检查后端Token及平台权限");
   throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"华为IoT设备影子查询失败");
  }catch(RestClientException e){throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"华为IoT连接或响应解析失败，请检查后端平台配置与网络");}
 }
}
