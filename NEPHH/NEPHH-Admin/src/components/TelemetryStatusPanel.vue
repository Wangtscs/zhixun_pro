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

const props = defineProps<{ node: TelemetryNode; nowMs: number }>()
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
  <section class="telemetry-status" :aria-labelledby="titleId">
    <header class="telemetry-status__header">
      <div>
        <h3 :id="titleId">逐项读数、来源与时效</h3>
        <p>时间均为上海时间。页面刷新不改变采样时间；历史值不代表当前现场状态。</p>
      </div>
    </header>
    <div v-if="rows.length" class="telemetry-status__scroll" tabindex="0" role="region" aria-label="各指标来源和时间，可横向滚动">
      <table>
        <thead><tr><th scope="col">指标与读数</th><th scope="col">来源性质</th><th scope="col">业务采集时间 / 时间品质</th><th scope="col">服务器接收时间</th><th scope="col">采样时效</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.metric">
            <th scope="row">
              <span class="telemetry-status__name">{{ row.name }}</span>
              <span class="telemetry-status__value">{{ row.status.value === null ? '—' : row.status.value }}<small v-if="row.status.value !== null">{{ row.unit }}</small></span>
              <small v-if="row.status.state === 'stale'" class="telemetry-status__note">历史值，已过期</small>
              <small v-else-if="row.status.value === null" class="telemetry-status__note">{{ row.status.label }}</small>
            </th>
            <td>
              <span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.source.kind">{{ row.status.source.label }}</span>
              <code class="telemetry-status__raw">{{ row.status.source.raw || 'source 未提供' }}</code>
            </td>
            <td>
              <time v-if="row.status.collectedAtMs !== null">{{ formatTime(row.status.collectedAtMs) }}</time>
              <span v-else>未提供或无法确认</span>
              <small class="telemetry-status__note">{{ row.receiverClock ? '采集桥接收时间；非设备已校时采样时间' : '业务报文采集时间；设备校时品质待确认' }}</small>
            </td>
            <td><time v-if="row.status.receivedAtMs !== null">{{ formatTime(row.status.receivedAtMs) }}</time><span v-else>未提供或无法确认</span><small class="telemetry-status__note">用于识别接收延迟，不续期旧采样</small></td>
            <td><span class="telemetry-status__badge" :class="'telemetry-status__badge--' + row.status.state">{{ row.status.label }}</span><small class="telemetry-status__note">{{ sampleAge(row.status.ageMs) }}</small></td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="telemetry-status__empty">未声明监测指标，且暂无读数。不能据此判断设备正常。</p>
    <p class="telemetry-status__footnote">模拟与实测可同时存在于同一节点。平台名称不证明实测性质；未知来源保持待确认。</p>
  </section>
</template>

<style scoped>
.telemetry-status {
  margin: 20px 0;
  color: var(--ops-text, var(--text, #cbd2da));
  font-size: 14px;
  line-height: 1.5;
}
.telemetry-status__header { margin-bottom: 12px; }
.telemetry-status__header h3 { margin: 0 0 8px; font-size: 16px; line-height: 1.5; }
.telemetry-status__header p,
.telemetry-status__footnote { margin: 0; font-size: 12px; line-height: 1.6; color: var(--ops-muted, var(--muted, #a7b9c6)); }
.telemetry-status__scroll { overflow-x: auto; border: 1px solid var(--ops-line, var(--line, #3a4d5a)); border-radius: 8px; }
.telemetry-status__scroll:focus-visible { outline: 3px solid var(--ops-accent, var(--teal, #58e1d3)); outline-offset: 3px; }
.telemetry-status table { width: 100%; min-width: 860px; border-collapse: collapse; background: var(--ops-surface, var(--panel, #16212a)); }
.telemetry-status th,
.telemetry-status td { text-align: left; padding: 12px; border-bottom: 1px solid var(--ops-line, var(--line, #3a4d5a)); vertical-align: top; font-size: 12px; line-height: 1.6; }
.telemetry-status thead th { font-weight: 500; color: var(--ops-muted, var(--muted, #a7b9c6)); background: var(--ops-raised, var(--panel, #1d2c37)); }
.telemetry-status tbody th { min-width: 130px; font-weight: 400; }
.telemetry-status tr:last-child > :is(th, td) { border-bottom: 0; }
.telemetry-status__name { display: block; margin-bottom: 4px; font-size: 14px; font-weight: 500; }
.telemetry-status__value { display: inline-block; font: 20px/1.5 "Cascadia Code", Consolas, monospace; font-variant-numeric: tabular-nums; }
.telemetry-status__value small { font: 12px/1.5 "Microsoft YaHei UI", sans-serif; margin-left: 6px; color: var(--ops-muted, var(--muted, #a7b9c6)); }
.telemetry-status__badge { display: inline-block; padding: 3px 6px; border: 1px solid var(--ops-line, var(--line, #3a4d5a)); border-radius: 5px; font-size: 12px; line-height: 1.5; color: inherit; }
.telemetry-status__badge--simulation,
.telemetry-status__badge--stale { color: var(--ops-warning, #f2c77e); background: var(--ops-warning-bg, #403423); border-color: currentColor; }
.telemetry-status__badge--invalid,
.telemetry-status__badge--future { color: var(--ops-danger, #ff9da4); background: var(--ops-danger-bg, #43272f); border-color: currentColor; }
.telemetry-status__badge--measurement { color: var(--ops-accent, var(--teal, #58e1d3)); background: var(--ops-accent-bg, #163e40); border-color: currentColor; }
.telemetry-status__note,
.telemetry-status__raw { display: block; margin-top: 7px; font-size: 12px; line-height: 1.6; color: var(--ops-muted, var(--muted, #a7b9c6)); }
.telemetry-status__raw { overflow-wrap: anywhere; max-width: 240px; font-family: "Cascadia Code", Consolas, monospace; }
.telemetry-status time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.telemetry-status__footnote { margin-top: 10px; }
.telemetry-status__empty { padding: 16px; margin: 0; border: 1px dashed var(--ops-line, var(--line, #3a4d5a)); color: var(--ops-muted, var(--muted, #a7b9c6)); }
@media (max-width: 600px) { .telemetry-status { margin: 16px 0; } }
</style>
