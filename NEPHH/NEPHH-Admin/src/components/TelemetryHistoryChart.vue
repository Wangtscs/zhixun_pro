<script setup lang="ts">
import { computed, useId } from 'vue'
import { buildHistorySeries, historyPosition, type HistorySeries, type HistoryPoint } from '../history-series'

const props = defineProps<{
  rows: unknown[]
  metrics: string[]
  rules: Record<string, unknown>
  reportSeconds: number
}>()
const headingId = useId()
const series = computed(() => buildHistorySeries(props.rows, props.metrics, props.rules, props.reportSeconds))
const left = 86, top = 20, width = 628, height = 176
const timeLabel = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})
const fullTimeLabel = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})
const numbers = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 })

function formatValue(value: number): string {
  return (value !== 0 && Math.abs(value) < 0.01) || Math.abs(value) >= 1e7 ? value.toExponential(2) : numbers.format(value)
}
function windowLabel(item: HistorySeries): string {
  return item.from === null || item.to === null ? '暂无可确认的采集时间'
    : `${fullTimeLabel.format(item.from)} 至 ${fullTimeLabel.format(item.to)}`
}
function x(item: HistorySeries, time: number): number {
  return left + historyPosition(time, item.from!, item.to!) * width
}
function y(item: HistorySeries, value: number): number {
  return top + (1 - historyPosition(value, item.minimum!, item.maximum!)) * height
}
function points(item: HistorySeries, segment: HistoryPoint[]): string {
  return segment.map(point => `${x(item, point.time).toFixed(2)},${y(item, point.value).toFixed(2)}`).join(' ')
}
function ticks(item: HistorySeries): { value: number; position: number }[] {
  if (item.minimum === null || item.maximum === null) return []
  // Weighted endpoints avoid overflow when the range spans very large finite values.
  return [0, 0.25, 0.5, 0.75, 1].map(position => ({
    value: item.minimum! * (1 - position) + item.maximum! * position,
    position: top + (1 - position) * height
  }))
}
function timeTicks(item: HistorySeries): { value: number; position: number; anchor: string }[] {
  if (item.from === null || item.to === null) return []
  if (item.from === item.to) return [{ value: item.from, position: left + width / 2, anchor: 'middle' }]
  return [0, 0.5, 1].map(position => ({
    value: item.from! + (item.to! - item.from!) * position,
    position: left + width * position,
    anchor: position === 0 ? 'start' : position === 1 ? 'end' : 'middle'
  }))
}
function markers(segment: HistoryPoint[]): HistoryPoint[] {
  return segment.length <= 80 ? segment : [segment[0]!, segment.at(-1)!]
}
</script>

<template>
  <section class="history-charts" :aria-labelledby="headingId">
    <header class="history-charts__header"><h3 :id="headingId">按实际采集时间查看历史</h3><p>各指标独立量纲。缺值或超过三个上报周期时断线；时间均为上海时间。</p></header>
    <p v-if="rows.length >= 5000" class="history-charts__warning" role="status">已返回 {{ rows.length }} 条记录，可能达到接口5000条上限。当前窗口可能不完整，请缩小时间范围后核对。</p>
    <p v-if="!series.length" class="history-charts__empty">尚未选择监测指标。</p>
    <article v-for="(item, index) in series" :key="item.metric" class="history-charts__metric">
      <header><h4 :id="`${headingId}-${index}`">{{ item.name }}<span>单位：{{ item.unit || '待确认' }}</span></h4><p>{{ windowLabel(item) }}</p></header>
      <div class="history-charts__sources" aria-label="样本来源"><span v-for="source in item.sources" :key="source.raw" :class="'history-charts__source--'+source.kind" :title="source.raw || 'source 未提供'">{{ source.label }}<code>{{ source.raw || '来源字段缺失' }}</code></span><span v-if="!item.sources.length">暂无可确认来源的有效数值样本</span></div>
      <p v-if="item.warning" class="history-charts__warning" role="status">{{ item.warning }}。请核对原始记录，不自动换算或拼接不同单位。</p>
      <div v-else-if="item.points.length" class="history-charts__scroll" tabindex="0" role="region" :aria-label="`${item.name}历史曲线，可横向滚动`">
        <svg viewBox="0 0 760 246" role="img" :aria-labelledby="`${headingId}-${index}`">
          <title>{{ item.name }}，{{ item.points.length }}个有效采样点，按真实采集时间间隔绘制</title>
          <g class="history-charts__grid"><line v-for="tick in ticks(item)" :key="tick.position" :x1="left" :x2="left+width" :y1="tick.position" :y2="tick.position" /></g>
          <g class="history-charts__axis"><text v-for="tick in ticks(item)" :key="tick.position" :x="left-12" :y="tick.position+4" text-anchor="end">{{ formatValue(tick.value) }}</text><text v-for="tick in timeTicks(item)" :key="tick.position" :x="tick.position" y="222" :text-anchor="tick.anchor">{{ timeLabel.format(tick.value) }}</text></g>
          <g v-if="item.threshold !== null" class="history-charts__threshold"><line :x1="left" :x2="left+width" :y1="y(item,item.threshold)" :y2="y(item,item.threshold)" /><title>当前配置阈值 {{ item.threshold }} {{ item.unit }}，不是历史规则快照</title></g>
          <g v-for="(segment, segmentIndex) in item.segments" :key="segmentIndex" class="history-charts__curve"><polyline v-if="segment.length>1" :points="points(item,segment)" /><circle v-for="point in markers(segment)" :key="point.time" :cx="x(item,point.time)" :cy="y(item,point.value)" :r="segment.length===1?3.5:2.5"><title>{{ fullTimeLabel.format(point.time) }} · {{ point.value }} {{ item.unit }} · {{ point.source.label }} · {{ point.source.raw || '来源字段缺失' }}</title></circle></g>
          <text :x="left+width" y="242" text-anchor="end" class="history-charts__axis-label">实际采集时间 · 上海时区</text>
        </svg>
      </div>
      <p v-else class="history-charts__empty">当前窗口暂无可绘制的有效采样。未用零值、接收时间或页面刷新时间补齐。</p>
      <div class="history-charts__notes"><p><span v-if="item.threshold !== null" class="history-charts__threshold-key">当前配置阈值 {{ item.threshold }} {{ item.unit }}。</span>{{ item.thresholdNote }}。</p><p v-if="item.missingCount || item.invalidCount || item.unknownTimeCount || item.duplicateCount">缺值 {{ item.missingCount }} 项，非法数值 {{ item.invalidCount }} 项，时间未知 {{ item.unknownTimeCount }} 项；同指标同时间重复 {{ item.duplicateCount }} 项，优先最大有效记录ID，无有效ID时保留输入顺序最后记录。</p><p v-if="item.sources.some(source=>/^(ESP32_DHT11|ESP32_CH4_DEMO)_(USB|WIFI)$/.test(source.raw))">采集桥样本的业务采集时间来自电脑接收时钟，不代表设备已经校时。</p><p v-if="item.points.length">{{ item.points.length }} 个有效采样点，分为 {{ item.segments.length }} 段。来源标签说明上报性质，不证明现场安全或设备已校时。</p></div>
    </article>
  </section>
</template>

<style scoped>
.history-charts{margin:20px 0;color:var(--ops-text,var(--text,#cbd2da));font-size:14px;line-height:1.6}.history-charts__header h3{font-size:16px;margin:0 0 8px}.history-charts__header p,.history-charts__metric>header>p{margin:0;color:var(--ops-muted,var(--muted,#a7b9c6));font-size:12px;line-height:1.7}.history-charts__metric{margin-top:18px;padding:16px;border:1px solid var(--ops-line,var(--line,#3a4d5a));border-radius:8px;background:var(--ops-surface,var(--panel,#16212a))}.history-charts__metric h4{margin:0 0 7px;font-size:14px;line-height:1.6;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}.history-charts__metric h4>span{font-size:12px;color:var(--ops-muted,var(--muted,#a7b9c6));font-weight:400}.history-charts__sources{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.history-charts__sources>span{border:1px solid var(--ops-line,var(--line,#3a4d5a));border-radius:5px;padding:5px 8px;font-size:12px;line-height:1.6}.history-charts__sources code{display:block;font:12px/1.6 "Cascadia Code",Consolas,monospace;overflow-wrap:anywhere}.history-charts__source--simulation{color:var(--ops-warning,#f2c77e);background:var(--ops-warning-bg,#403423)}.history-charts__source--measurement{color:var(--ops-accent,var(--teal,#58e1d3));background:var(--ops-accent-bg,#163e40)}.history-charts__source--platform,.history-charts__source--unknown{color:var(--ops-muted,var(--muted,#a7b9c6))}.history-charts__scroll{overflow-x:auto;min-width:0;margin-top:14px;border:1px solid var(--ops-line,var(--line,#3a4d5a));border-radius:6px}.history-charts__scroll:focus-visible{outline:3px solid var(--ops-accent,var(--teal,#58e1d3));outline-offset:3px}.history-charts svg{display:block;width:100%;min-width:760px;height:auto;max-height:none}.history-charts__grid line{stroke:var(--ops-line,var(--line,#3a4d5a));stroke-width:1}.history-charts__axis text,.history-charts__axis-label{fill:var(--ops-muted,var(--muted,#a7b9c6));font:12px/1.5 "Cascadia Code",Consolas,monospace}.history-charts__curve polyline{fill:none;stroke:var(--ops-accent,var(--teal,#58e1d3));stroke-width:2}.history-charts__curve circle{fill:var(--ops-accent,var(--teal,#58e1d3));stroke:var(--ops-surface,var(--panel,#16212a));stroke-width:1}.history-charts__threshold line{stroke:var(--ops-warning,#f2c77e);stroke-width:1.5;stroke-dasharray:7 5}.history-charts__threshold-key{color:var(--ops-warning,#f2c77e)}.history-charts__notes{font-size:12px;line-height:1.7;color:var(--ops-muted,var(--muted,#a7b9c6));margin-top:12px}.history-charts__notes p{margin:5px 0}.history-charts__warning{font-size:12px;line-height:1.7;padding:12px;border:1px solid var(--ops-warning,#f2c77e);border-radius:6px;background:var(--ops-warning-bg,#403423);color:var(--ops-warning,#f2c77e);margin:12px 0}.history-charts__empty{padding:20px 12px;margin:12px 0;border:1px dashed var(--ops-line,var(--line,#3a4d5a));border-radius:6px;color:var(--ops-muted,var(--muted,#a7b9c6));font-size:12px;line-height:1.7}@media(max-width:600px){.history-charts__metric{padding:12px}.history-charts__metric h4{display:block}.history-charts__metric h4>span{display:block;margin-top:4px}}
</style>
