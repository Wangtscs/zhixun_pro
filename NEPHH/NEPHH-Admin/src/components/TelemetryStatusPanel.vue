<script setup lang="ts">
import { computed, useId } from 'vue'
import { assessSample, type TelemetrySample } from '../source-status'

interface MetricSample extends TelemetrySample {
  metric?: unknown
  unit?: unknown
}

interface TelemetryNode {
  metrics?: unknown
  latest?: unknown
  report_seconds?: unknown
}

const props = defineProps<{ node: TelemetryNode; nowMs: number; compact?: boolean }>()
const titleId = useId()
const names: Record<string, string> = {
  methane: '甲烷', temperature: '温度', humidity: '湿度', infrared: '红外温度'
}
const units: Record<string, string> = {
  methane: '%LEL', temperature: '°C', humidity: '%RH', infrared: '°C'
}
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})

function knownLabel(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

const rows = computed(() => {
  const latest: MetricSample[] = Array.isArray(props.node.latest)
    ? props.node.latest.filter((row): row is MetricSample => row !== null && typeof row === 'object')
    : []
  const declared = typeof props.node.metrics === 'string'
    ? props.node.metrics.split(',').map(metric => metric.trim()).filter(Boolean)
    : []
  const metrics = [...new Set(declared.length ? declared : latest
    .map(row => typeof row.metric === 'string' ? row.metric.trim() : '').filter(Boolean))]
  return metrics.map(metric => {
    const sample = latest.find(row => row.metric === metric)
    const status = assessSample(sample, props.node.report_seconds, props.nowMs)
    const unit = typeof sample?.unit === 'string' && sample.unit.trim()
      ? sample.unit.trim() : knownLabel(units, metric) || '单位未提供'
    const receiverClock = /^(?:ESP32_DHT11|ESP32_CH4_DEMO)_(?:USB|WIFI)$/.test(status.source.raw)
    return { metric, name: knownLabel(names, metric) || metric, unit, status, receiverClock }
  })
})

function formatTime(timeMs: number | null): string {
  return timeMs === null ? '未提供或无法确认' : timeFormatter.format(timeMs)
}

function sampleAge(ageMs: number | null): string {
  if (ageMs === null) return '不能判断采样时效'
  if (ageMs < 0) return `采样时钟超前 ${Math.ceil(-ageMs / 1000)} 秒`
  const seconds = Math.floor(ageMs / 1000)
  if (seconds < 60) return `距采样 ${seconds} 秒`
  if (seconds < 3600) return `距采样 ${Math.floor(seconds / 60)} 分钟`
  return `距采样 ${Math.floor(seconds / 3600)} 小时`
}
</script>

<template>
  <section class="telemetry-status" :class="{'telemetry-status--compact':compact}" :aria-labelledby="titleId">
    <header class="telemetry-status__header">
      <h3 :id="titleId">当前读数</h3>
      <p>最新可用采样，不是告警触发时快照。时间均为上海时间。</p>
    </header>
    <ul v-if="compact && rows.length" class="telemetry-status__metrics">
      <li v-for="row in rows" :key="row.metric">
        <header><h4>{{ row.name }}</h4><span class="telemetry-status__value">{{ row.status.value === null ? '—' : row.status.value }}<small v-if="row.status.value !== null">{{ row.unit }}</small></span></header>
        <dl>
          <div><dt>采样时效</dt><dd><span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.state">{{ row.status.label }}</span><small class="telemetry-status__note">{{ sampleAge(row.status.ageMs) }}</small></dd></div>
          <div><dt>来源</dt><dd><span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.source.kind">{{ row.status.source.label }}</span><small v-if="!row.status.source.raw" class="telemetry-status__note">来源字段未提供</small></dd></div>
          <div><dt>采集时间</dt><dd><time v-if="row.status.collectedAtMs !== null">{{ formatTime(row.status.collectedAtMs) }}</time><span v-else>未提供或无法确认</span><small class="telemetry-status__note">{{ row.receiverClock ? '采集桥接收时刻，设备校时未确认' : '报文采集时刻，校时品质待确认' }}</small><small v-if="row.status.receivedAtMs === null" class="telemetry-status__note">服务器接收时间未提供或无法确认</small></dd></div>
        </dl>
      </li>
    </ul>
    <div v-else-if="rows.length" class="telemetry-status__scroll" tabindex="0" role="region" aria-label="各指标来源和时间，可横向滚动">
      <table>
        <thead><tr><th scope="col">指标 / 读数</th><th scope="col">来源</th><th scope="col">采集时间</th><th scope="col">采样时效</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.metric">
            <th scope="row">
              <span class="telemetry-status__name">{{ row.name }}</span>
              <span class="telemetry-status__value">{{ row.status.value === null ? '—' : row.status.value }}<small v-if="row.status.value !== null">{{ row.unit }}</small></span>
              <small v-if="row.status.state === 'stale'" class="telemetry-status__note">历史值，已过期</small>
              <small v-else-if="row.status.value === null" class="telemetry-status__note">{{ row.status.label }}</small>
            </th>
            <td><span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.source.kind">{{ row.status.source.label }}</span><small v-if="!row.status.source.raw" class="telemetry-status__note">来源字段未提供</small></td>
            <td>
              <time v-if="row.status.collectedAtMs !== null">{{ formatTime(row.status.collectedAtMs) }}</time><span v-else>未提供或无法确认</span>
              <small class="telemetry-status__note">{{ row.receiverClock ? '采集桥接收时刻，设备校时未确认' : '报文采集时刻，校时品质待确认' }}</small>
              <small v-if="row.status.receivedAtMs === null" class="telemetry-status__note">服务器接收时间未提供或无法确认</small>
            </td>
            <td><span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.state">{{ row.status.label }}</span><small class="telemetry-status__note">{{ sampleAge(row.status.ageMs) }}</small></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="telemetry-status__empty">未声明监测指标，且暂无读数。不能据此判断设备正常。</p>
    <details v-if="rows.length" class="telemetry-status__details">
      <summary>来源字段与接收记录</summary>
      <dl>
        <div v-for="row in rows" :key="row.metric"><dt>{{ row.name }}</dt><dd><code>{{ row.status.source.raw || 'source 未提供' }}</code><span>服务器接收：{{ formatTime(row.status.receivedAtMs) }}</span></dd></div>
      </dl>
      <p>接收或页面刷新不续期旧采样。模拟与实测逐项区分；平台名称不证明实测性质。</p>
    </details>
  </section>
</template>

<style scoped>
.telemetry-status{margin:24px 0 0;padding-top:20px;border-top:1px solid var(--ops-line,var(--line));color:var(--ops-text,var(--text));font-size:14px;line-height:1.6}
.telemetry-status__header{margin-bottom:12px}.telemetry-status__header h3{margin:0 0 6px;font-size:16px;line-height:1.5;font-weight:600}.telemetry-status__header p{margin:0;font-size:12px;color:var(--ops-muted,var(--muted))}
.telemetry-status__scroll{overflow-x:auto;max-width:100%;border-top:1px solid var(--ops-line,var(--line));border-bottom:1px solid var(--ops-line,var(--line))}
.telemetry-status :is(.telemetry-status__scroll,summary):focus-visible{outline:3px solid var(--ops-accent,var(--teal));outline-offset:3px}
.telemetry-status table{width:100%;min-width:640px;border-collapse:collapse;background:transparent}.telemetry-status th,.telemetry-status td{text-align:left;padding:12px 10px;border-bottom:1px solid var(--ops-line,var(--line));vertical-align:top;font-size:14px;line-height:1.6}
.telemetry-status th:first-child,.telemetry-status td:first-child{padding-left:0}.telemetry-status th:last-child,.telemetry-status td:last-child{padding-right:0}
.telemetry-status thead th{font-size:12px;font-weight:400;color:var(--ops-muted,var(--muted));background:transparent}.telemetry-status tbody th{min-width:108px;font-weight:400}.telemetry-status tr:last-child>:is(th,td){border-bottom:0}
.telemetry-status__name{display:block;margin-bottom:4px;font-size:14px;font-weight:500}.telemetry-status__value{display:inline-block;font-size:20px;line-height:1.4;font-variant-numeric:tabular-nums;font-weight:500}.telemetry-status__value small{font-size:12px;font-weight:400;margin-left:5px;color:var(--ops-muted,var(--muted))}
.telemetry-status__badge{display:inline-block;font-size:14px;line-height:1.6;font-weight:500;color:inherit}.telemetry-status__badge--simulation,.telemetry-status__badge--stale{color:var(--ops-warning)}.telemetry-status__badge--invalid,.telemetry-status__badge--future{color:var(--ops-danger)}.telemetry-status__badge--unknown,.telemetry-status__badge--platform,.telemetry-status__badge--missing,.telemetry-status__badge--time-unknown{color:var(--ops-muted,var(--muted))}
.telemetry-status__note{display:block;margin-top:5px;font-size:12px;line-height:1.6;color:var(--ops-muted,var(--muted))}.telemetry-status time{white-space:nowrap;font-variant-numeric:tabular-nums}
.telemetry-status__details{margin-top:10px}.telemetry-status__details summary{cursor:pointer;min-height:36px;line-height:28px;padding:4px 0;font-size:12px;color:var(--ops-muted,var(--muted))}.telemetry-status__details dl{margin:8px 0}.telemetry-status__details dl>div{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;padding:8px 0;border-bottom:1px solid var(--ops-line,var(--line))}.telemetry-status__details dt{font-size:12px;color:var(--ops-muted,var(--muted))}.telemetry-status__details dd{margin:0;font-size:12px;overflow-wrap:anywhere}.telemetry-status__details code,.telemetry-status__details dd>span{display:block}.telemetry-status__details code{font:inherit}.telemetry-status__details p{font-size:12px;color:var(--ops-muted,var(--muted));margin:10px 0}
.telemetry-status__empty{padding:12px 0;margin:0;font-size:14px;color:var(--ops-muted,var(--muted))}
@media(max-width:600px){.telemetry-status{margin-top:20px;padding-top:16px}.telemetry-status__details dl>div{grid-template-columns:72px minmax(0,1fr);gap:8px}}
.telemetry-status__metrics{list-style:none;padding:0;margin:0;min-width:0}.telemetry-status__metrics>li{padding:14px 0;border-top:1px solid var(--ops-line,var(--line));min-width:0}.telemetry-status__metrics>li>header{display:flex;justify-content:space-between;align-items:baseline;gap:12px}.telemetry-status__metrics h4{margin:0;font-size:14px;font-weight:600}.telemetry-status__metrics dl{margin:10px 0 0}.telemetry-status__metrics dl>div{display:grid;grid-template-columns:64px minmax(0,1fr);gap:12px;align-items:baseline;padding:5px 0}.telemetry-status__metrics dt{font-size:12px;color:var(--ops-muted,var(--muted))}.telemetry-status__metrics dd{margin:0;overflow-wrap:anywhere;font-size:14px}.telemetry-status--compact{min-width:0}.telemetry-status--compact time{white-space:normal;overflow-wrap:anywhere}.telemetry-status--compact .telemetry-status__details dl>div{grid-template-columns:64px minmax(0,1fr);gap:12px}
</style>
