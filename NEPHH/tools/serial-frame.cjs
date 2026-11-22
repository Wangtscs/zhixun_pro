'use strict';

// 兼容当前固件的简洁中文串口，不修改固件、引脚或演示模式。
// 接收时间是电脑时间，不能冒充设备已完成 UTC 校时。
const { randomUUID } = require('node:crypto');

class SerialFrames {
  constructor() {
    this.session = randomUUID();
    this.sequence = 0;
    this.pending = null;
  }

  push(line, receivedAt = new Date().toISOString()) {
    // 一帧由连续的温湿度行和甲烷/MQ-4行组成，防止跨帧拼接旧值。
    const climate = line.match(/^温度[：:]\s*(-?\d+(?:\.\d+)?)\s*℃\s+湿度[：:]\s*(\d+(?:\.\d+)?)\s*%\s*$/);
    if (climate || /^(温湿度模块|温湿度读取|温湿度读数)/.test(line)) {
      const temperature = climate ? Number(climate[1]) : null;
      const humidity = climate ? Number(climate[2]) : null;
      const valid = climate !== null && temperature >= 0 && temperature <= 50 && humidity >= 0 && humidity <= 100;
      this.pending = {
        deviceId: 'ZX-S3-01', messageId: `usb-${this.session}-${++this.sequence}`,
        sequence: this.sequence, receivedAt, timeQuality: 'receiver_timestamp',
        transport: 'USB_SERIAL', firmware: 'serial_version_unknown',
        temperature: { value: valid ? temperature : null, unit: '°C', source: 'measurement', quality: valid ? 'valid' : 'unavailable' },
        humidity: { value: valid ? humidity : null, unit: '%RH', source: 'measurement', quality: valid ? 'valid' : 'unavailable' },
        methane: { value: null, unit: '%LEL', source: 'unconfigured', quality: 'unavailable' },
        mq4: { value: null, unit: 'V', source: 'measurement', quality: 'not_in_serial_frame' },
      };
      return null;
    }
    if (/^(ESP-ROM:|rst:|智巡采集节点已启动)/.test(line)) { this.pending = null; return null; }
    if (!this.pending) return null;
    const methane = line.match(/^甲烷\(模拟\)[：:]\s*(\d+(?:\.\d+)?)\s*(%LEL|ppm)[，,]\s*状态[：:]\s*(.+)$/);
    const gasFault = /^甲烷\(模拟\)[：:]传感器故障演示/.test(line);
    const voltage = line.match(/^MQ-4输出[：:]\s*(\d+(?:\.\d+)?)\s*V/);
    const mq4Status = /^(MQ-4电压采集|MQ-4采集|MQ-4输出超出)/.test(line);
    if (!methane && !gasFault && !voltage && !mq4Status) return null;
    const frame = this.pending;
    this.pending = null;
    if (Date.parse(receivedAt) - Date.parse(frame.receivedAt) > 1500) return null;
    if (methane || gasFault) {
      // 旧固件输入仅在此换算；所有下游输出统一%LEL。
      const value = methane ? Number(methane[1]) / (methane[2] === 'ppm' ? 500 : 1) : null;
      const valid = value !== null && value >= 0 && value <= 100;
      frame.methane = { value: valid ? value : null, unit: '%LEL', source: 'simulation', quality: valid ? 'valid' : 'sensor_fault', alarm: methane?.[3] || '不可用' };
    } else {
      const value = voltage ? Number(voltage[1]) : null;
      frame.mq4 = { value: value !== null && value <= 5.5 ? value : null, unit: 'V', source: 'measurement', quality: voltage && value <= 5.5 ? 'uncalibrated' : 'unavailable' };
    }
    return frame;
  }
}

function businessReport(frame) {
  if (frame.temperature.quality !== 'valid' || frame.humidity.quality !== 'valid') return null;
  // 实测温湿度与甲烷模拟分开上报，防止来源混淆。
  return { messageId: frame.messageId, source: frame.transport === 'WIFI_HTTP' ? 'ESP32_DHT11_WIFI' : 'ESP32_DHT11_USB', collectedAt: frame.receivedAt,
    values: { temperature: frame.temperature.value, humidity: frame.humidity.value } };
}

function methaneReport(frame) {
  const c=frame?.methane;
  if(!c||c.quality!=='valid'||c.source!=='simulation'||c.unit!=='%LEL'||typeof c.value!=='number'||!Number.isFinite(c.value)||c.value<0||c.value>100)return null;
  return {messageId:frame.messageId+'-ch4',source:frame.transport==='WIFI_HTTP'?'ESP32_CH4_DEMO_WIFI':'ESP32_CH4_DEMO_USB',collectedAt:frame.receivedAt,values:{methane:c.value}};
}
module.exports = { SerialFrames, businessReport, methaneReport };
