'use strict';
const {randomUUID}=require('node:crypto');
class WifiFrames {
 constructor(deviceId='ZX-S3-01'){this.deviceId=deviceId;this.session=randomUUID();this.boot=null;this.sequence=-1;}
 push(d,receivedAt=new Date().toISOString()){
  if(!d||!['0.6','0.7'].includes(d.schema_version)||d.device_id!==this.deviceId||!/^[\w-]{1,32}$/.test(d.boot_id)||!Number.isSafeInteger(d.sequence)||d.sequence<0||!Number.isSafeInteger(d.sample_uptime_ms)||d.sample_uptime_ms<0||!d.channels)throw new Error('ESP32无线数据格式或设备标识不正确');
  if(this.boot===d.boot_id&&d.sequence<=this.sequence)return null;
  const channel=(name,unit,source,min,max)=>{
   const c=d.channels[name],age=d.sample_uptime_ms-c?.sample_uptime_ms;
   const valid=c&&c.quality==='valid'&&c.unit===unit&&c.source===source&&typeof c.value==='number'&&Number.isFinite(c.value)&&c.value>=min&&c.value<=max&&Number.isSafeInteger(c.sample_uptime_ms)&&age>=0&&age<=6500;
   return {value:valid?c.value:null,unit,source,quality:valid?'valid':c?.quality==='valid'?'invalid_data':c?.quality||'unavailable'};
  };
  const gas=channel('ch4','%LEL','simulation',0,100);
  gas.alarm=gas.value===null?'不可用':({normal:'正常',warning:'预警',critical:'高值告警'}[d.channels.ch4.alarm]||'未知');
  this.boot=d.boot_id;this.sequence=d.sequence;
  return {deviceId:d.device_id,messageId:`wifi-${this.session}-${d.boot_id}-${d.sequence}`,sequence:d.sequence,receivedAt,timeQuality:'receiver_timestamp',transport:'WIFI_HTTP',firmware:`schema-${d.schema_version}`,
   temperature:channel('temperature','C','measurement',0,50),humidity:channel('humidity','%RH','measurement',0,100),methane:gas,
   motor_voltage:channel('motor_voltage','V','measurement',0,36),motor_current:channel('motor_current','A','measurement',-0.8192,0.8192),motor_power:channel('motor_power','W','measurement',-30,30)};
 }
}
module.exports={WifiFrames};
