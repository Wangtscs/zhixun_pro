package com.nephh.iot;
import com.fasterxml.jackson.databind.JsonNode;

/** Application-side read boundary; alternative Huawei credential providers can replace this client. */
public interface HuaweiShadowClient {
 JsonNode fetch(String deviceId);
}
