<script setup lang="ts">
import { computed, useId } from 'vue'
import { weeklyReportPoints } from '../weekly-report'

const props = withDefaults(defineProps<{ values?: unknown[]; demo?: boolean }>(), { demo: false })
const headingId = useId()
const weeks = computed(() => weeklyReportPoints(props.values))
const hasData = computed(() => weeks.value.some(week => week.planned !== null || week.completed !== null))
const missing = computed(() => weeks.value.reduce((count, week) => count + Number(week.planned === null) + Number(week.completed === null), 0))
const chartWidth = computed(() => Math.max(830, 100 + weeks.value.length * 66))
const percent = (value: number | null) => value === null ? '未知 / 未提供' : value.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) + '%'
const x = (index: number) => 82 + index * (chartWidth.value - 130) / Math.max(weeks.value.length - 1, 1)
</script>

<template>
  <section class="d-report-chart weekly-report" :aria-labelledby="headingId">
    <h3 :id="headingId">周度计划与已检查节点覆盖率</h3>
    <p v-if="demo" class="weekly-report__demo"><strong>演示统计</strong>：以下周数据为独立虚构样本，不代表真实巡检结果。</p>
    <p class="weekly-report__caption">分母为当前启用节点数。周标签由服务器提供，当前接口未提供实际周日期；不能把周序号当作具体日期。</p>
    <div v-if="hasData" class="weekly-report__scroll" tabindex="0" role="region" aria-label="周度节点覆盖率图，可横向滚动">
      <svg :viewBox="`0 0 ${chartWidth} 320`" role="img" :aria-labelledby="headingId" :style="{minWidth:chartWidth+'px'}">
        <title>计划节点覆盖率与已检查节点覆盖率，只显示服务器提供的有效百分比</title>
        <g class="weekly-report__grid"><line v-for="n in [0,25,50,75,100]" :key="n" x1="60" :x2="chartWidth-24" :y1="264-n*2.3" :y2="264-n*2.3" /></g>
        <g class="weekly-report__axis"><text v-for="n in [0,25,50,75,100]" :key="n" x="47" :y="268-n*2.3" text-anchor="end">{{ n }}%</text></g>
        <g v-for="(week,index) in weeks" :key="index">
          <rect v-if="week.planned !== null && week.planned !== 0" :x="x(index)-14" :y="264-week.planned*2.3" width="10" :height="week.planned*2.3" rx="2" class="weekly-report__planned"><title>{{ week.label }} · 计划节点覆盖率 {{ percent(week.planned) }}</title></rect>
          <circle v-else-if="week.planned === 0" :cx="x(index)-9" cy="264" r="3" class="weekly-report__planned"><title>{{ week.label }} · 计划节点覆盖率 0%</title></circle>
          <rect v-if="week.completed !== null && week.completed !== 0" :x="x(index)+4" :y="264-week.completed*2.3" width="10" :height="week.completed*2.3" rx="2" class="weekly-report__completed"><title>{{ week.label }} · 已检查节点覆盖率 {{ percent(week.completed) }}</title></rect>
          <circle v-else-if="week.completed === 0" :cx="x(index)+9" cy="264" r="3" class="weekly-report__completed"><title>{{ week.label }} · 已检查节点覆盖率 0%</title></circle>
          <text :x="x(index)" y="289" text-anchor="middle" class="weekly-report__week"><title>{{ week.label }}</title>{{ week.label.length>8 ? '记录'+(index+1) : week.label }}</text>
          <text v-if="week.planned === null || week.completed === null" :x="x(index)" y="308" text-anchor="middle" class="weekly-report__missing">部分缺失</text>
        </g>
      </svg>
    </div>
    <p v-else class="weekly-report__empty">暂无有效周统计。没有用零值、演示曲线或推算完成值填补。</p>
    <div class="weekly-report__legend"><span><i class="planned"></i>计划节点覆盖率</span><span><i class="completed"></i>已检查节点覆盖率</span></div>
    <p v-if="missing" class="weekly-report__caption" role="status">{{ missing }}项百分比缺失或无效，未绘制对应数据。真实0%与未知不同。</p>
    <details v-if="weeks.length" class="weekly-report__data"><summary>查看周数据与缺失项</summary><div class="weekly-report__scroll" tabindex="0" role="region" aria-label="周度统计数据表，可横向滚动"><table><thead><tr><th scope="col">服务端周标签</th><th scope="col">计划节点覆盖率</th><th scope="col">已检查节点覆盖率</th></tr></thead><tbody><tr v-for="(week,index) in weeks" :key="index"><th scope="row">{{ week.label }}</th><td>{{ percent(week.planned) }}</td><td>{{ percent(week.completed) }}</td></tr></tbody></table></div></details>
  </section>
</template>

<style scoped>
.weekly-report{padding:16px;margin-top:12px;background:var(--ops-raised,var(--panel,#16212a));border:1px solid var(--ops-line,var(--line,#3a4d5a));border-radius:8px;color:var(--ops-text,var(--text,#cbd2da));font-size:14px;line-height:1.6}.weekly-report h3{font-size:14px;line-height:1.6;margin:0 0 8px}.weekly-report__caption{font-size:12px;line-height:1.7;color:var(--ops-muted,var(--muted,#a7b9c6));margin:7px 0 12px}.weekly-report__demo{font-size:12px;padding:10px;border:1px solid var(--ops-warning,#f2c77e);background:var(--ops-warning-bg,#403423);color:var(--ops-warning,#f2c77e);border-radius:6px}.weekly-report__scroll{overflow-x:auto;min-width:0}.weekly-report__scroll:focus-visible,.weekly-report summary:focus-visible{outline:3px solid var(--ops-accent,var(--teal,#58e1d3));outline-offset:3px}.weekly-report svg{width:100%;height:auto;max-height:none;display:block}.weekly-report__grid line{stroke:var(--ops-line,var(--line,#3a4d5a));stroke-width:1}.weekly-report__axis text,.weekly-report__week,.weekly-report__missing{fill:var(--ops-muted,var(--muted,#a7b9c6));font:12px/1.5 "Cascadia Code",Consolas,monospace}.weekly-report__planned{fill:var(--ops-accent,var(--teal,#58e1d3))}.weekly-report__completed{fill:var(--ops-info,#b0ccff)}.weekly-report__legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;margin:10px 0;color:var(--ops-muted,var(--muted,#a7b9c6))}.weekly-report__legend i{display:inline-block;width:9px;height:9px;margin-right:6px}.weekly-report__legend .planned{background:var(--ops-accent,var(--teal,#58e1d3))}.weekly-report__legend .completed{background:var(--ops-info,#b0ccff)}.weekly-report__empty{padding:24px 12px;font-size:12px;color:var(--ops-muted,var(--muted,#a7b9c6));border:1px dashed var(--ops-line,var(--line,#3a4d5a));border-radius:6px}.weekly-report__data{font-size:12px;margin-top:12px}.weekly-report summary{cursor:pointer;padding:8px 0}.weekly-report table{min-width:480px;width:100%;border-collapse:collapse}.weekly-report th,.weekly-report td{padding:10px;text-align:left;font-size:12px;border-bottom:1px solid var(--ops-line,var(--line,#3a4d5a));font-weight:400}.weekly-report tbody td{font-variant-numeric:tabular-nums}@media(max-width:600px){.weekly-report{padding:12px}}
</style>
