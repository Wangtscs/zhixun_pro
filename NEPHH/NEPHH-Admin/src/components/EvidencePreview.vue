<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { tokenKey, sessionChangedEvent } from '../auth'
import { request, severityName, statusName, type Row } from '../business'
import { parseTelemetryTime } from '../source-status'
import TelemetryStatusPanel from './TelemetryStatusPanel.vue'
import { createWorkbenchPreviewReader, type WorkbenchPreviewTarget } from '../workbench-preview'

const props = defineProps<{
  target: WorkbenchPreviewTarget | null
  scopeKey: string
  readonly: boolean
  refreshKey: number
  stale: boolean
}>()
const emit = defineEmits<{ close: []; open: [target: WorkbenchPreviewTarget] }>()
const headingId = useId()
const data = ref<Row | null>(null), loading = ref(false), error = ref(''), errorStatus = ref(0)
let revision = 0, disposed = false
let clock: ReturnType<typeof setInterval> | undefined
let displayedIdentity = ''
const names = { order: '工单', alarm: '告警', patrol: '巡检任务' }
const kindName = computed(() => props.target ? names[props.target.kind] : '记录')
const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' })
const alarm = computed<Row | null>(() => props.target?.kind === 'alarm' ? data.value?.alarm || null : null)
const patrolPoints = computed<Row[]>(() => props.target?.kind === 'patrol' && Array.isArray(data.value?.points) ? data.value.points : [])
const observedAt = ref(Date.now())
const orderEvents = computed<Row[]>(() => props.target?.kind === 'order' && Array.isArray(data.value?.events) ? data.value.events.slice(-3).reverse() : [])
const title = computed(() => props.target?.kind === 'alarm' ? text(alarm.value?.reason, '告警原因未提供')
  : props.target?.kind === 'patrol' ? text(data.value?.name, '任务名称未提供') : text(data.value?.title, '工单名称未提供'))

function context(): string {
  try { return `${props.scopeKey}|${sessionStorage.getItem(tokenKey) || ''}|${!!sessionStorage.getItem('nephh-demo')}` }
  catch { return props.scopeKey + '|storage-unavailable' }
}
const reader = createWorkbenchPreviewReader({ read: path => request(path), context })
function text(value: unknown, fallback = '未提供'): string { return typeof value === 'string' && value.trim() ? value : fallback }
function time(value: unknown): string {
  const parsed = parseTelemetryTime(value)
  return parsed === null ? '时间未提供或无法确认' : formatter.format(new Date(parsed))
}
function state(value: unknown): string { return typeof value === 'string' && statusName[value] ? statusName[value] : '状态待确认' }
function priority(value: unknown): string { return typeof value === 'string' && severityName[value] ? severityName[value] : '优先级未提供' }

function targetIdentity(): string {
  return props.target ? `${props.target.kind}|${props.target.id}|${props.target.areaId}|${context()}` : ''
}
async function load(preserve = true): Promise<void> {
  const version = ++revision, target = props.target, identity = targetIdentity()
  reader.invalidate()
  // Keep the same record's DOM on refresh, but never carry evidence across a context change.
  if (!preserve || identity !== displayedIdentity) { data.value = null; displayedIdentity = '' }
  error.value = ''; errorStatus.value = 0; loading.value = false
  if (!target || disposed) return
  loading.value = true
  const result = await reader.load(target)
  if (disposed || version !== revision) return
  loading.value = false
  if (result.kind === 'discarded') { data.value = null; displayedIdentity = ''; return }
  if (result.kind === 'ready') { data.value = result.data; displayedIdentity = identity }
  else {
    error.value = result.message; errorStatus.value = result.status
    if ([401,403,404].includes(result.status)) { data.value = null; displayedIdentity = '' }
  }
}

function resetSession(): void {
  revision++; reader.invalidate(); data.value = null; displayedIdentity = ''; loading.value = false; error.value = ''
  emit('close')
}
function openRecord(): void {
  if (props.target && data.value && !loading.value && !error.value && !props.stale) emit('open', props.target)
}
watch([() => props.target, () => props.scopeKey], () => { void load(false) }, { immediate: true })
watch(() => props.refreshKey, () => { if (!loading.value) void load() })
onMounted(() => {
  clock = setInterval(() => { observedAt.value = Date.now() }, 1000)
  window.addEventListener(sessionChangedEvent, resetSession)
  window.addEventListener('storage', resetSession)
})
onBeforeUnmount(() => {
  disposed = true; revision++; reader.dispose(); clearInterval(clock)
  window.removeEventListener(sessionChangedEvent, resetSession)
  window.removeEventListener('storage', resetSession)
})
</script>

<template>
  <aside tabindex="-1" class="evidence-preview" :class="{ 'is-empty': !target }" :aria-labelledby="headingId" :aria-busy="loading">
    <header><div><span class="evidence-preview__reference">{{ target ? kindName+' #'+target.id : '记录预览' }}</span><h3 :id="headingId">{{ target ? '核对记录' : '选择一项待办' }}</h3></div><button v-if="target" type="button" @click="emit('close')">返回列表</button></header>
    <p v-if="!target" class="evidence-preview__empty">选择左侧事项，核对记录后进入处理。列表筛选和页码会保留。</p>
    <template v-else>
      <p v-if="loading" role="status" class="evidence-preview__empty">{{data?'正在刷新；以下为上次读取的快照，暂不能进入处理。':'正在读取'+kindName+' #'+target.id+'…'}}</p>
      <p v-if="error" class="evidence-preview__error" role="alert"><strong>{{data?'刷新失败，以下为旧快照': [401,403].includes(errorStatus) ? '当前记录无访问权限' : errorStatus===404 ? '记录已不存在' : '详情读取失败' }}</strong>：{{error}}<button type="button" :disabled="loading" @click="load()">重新读取</button></p>
      <p v-if="stale" class="evidence-preview__warning" role="status">待办刷新失败，当前范围尚未重新确认。请刷新待办后再进入处理。</p>
      <template v-if="data">
        <h4 class="evidence-preview__title">{{title}}</h4>
        <template v-if="target.kind==='order'">
          <p class="evidence-preview__state"><span :class="{'evidence-preview__unknown':state(data.status)==='状态待确认'}">{{state(data.status)}}</span> · {{priority(data.priority)}}</p>
          <dl><div><dt>节点</dt><dd>{{text(data.node_code)}}</dd></div><div><dt>执行人</dt><dd>{{text(data.assignee_name,data.status==='DRAFT'?'未派发':'执行人未提供')}}</dd></div><div><dt>截止时间</dt><dd>{{data.due_at?time(data.due_at):'未设置'}}</dd></div></dl>
          <section v-if="data.result_text"><h4>处理结果</h4><p>{{data.result_text}}</p><p v-if="data.readings" class="evidence-preview__secondary">{{data.readings}}</p></section>
          <section><h4>最近记录</h4><ol v-if="orderEvents.length" class="evidence-preview__events"><li v-for="event in orderEvents" :key="event.id"><span>{{text(event.note,text(event.action,'操作未提供'))}}</span><small>{{text(event.username)}} · {{time(event.created_at)}}</small></li></ol><p v-else class="evidence-preview__secondary">暂无可见操作记录。</p></section>
          <details v-if="data.description"><summary>工单说明</summary><p>{{data.description}}</p></details>
        </template>
        <template v-else-if="target.kind==='alarm'">
          <p class="evidence-preview__state">{{data.state.recovered?'已恢复':'未恢复'}} · {{data.state.acknowledged?'已人工确认':'未人工确认'}}</p>
          <dl><div><dt>节点</dt><dd>{{text(data.node.code)}} · {{text(data.node.location)}}</dd></div><div><dt>触发时间</dt><dd>{{time(alarm?.triggered_at)}}</dd></div><div><dt>确认时间</dt><dd>{{alarm?.acknowledged_at?time(alarm.acknowledged_at):'尚未确认'}}</dd></div><div><dt>恢复时间</dt><dd>{{alarm?.recovered_at?time(alarm.recovered_at):'尚未恢复'}}</dd></div></dl>
          <p class="evidence-preview__secondary">确认不等于恢复，恢复也不代表工单完成。</p>
          <section><h4>采样证据</h4><p class="evidence-preview__secondary">以下为当前记录，不是触发时快照。</p><TelemetryStatusPanel :node="data.node" :now-ms="observedAt" :compact="true" /></section>
          <p v-if="data.ruleAccess==='RESTRICTED'" class="evidence-preview__warning">{{text(data.ruleExplanation,'当前账号无权读取规则')}}</p>
          <details><summary>规则与关联</summary><p>{{text(data.ruleExplanation,'规则读取范围尚未确认')}}</p><p v-if="data.currentRule">当前阈值 {{data.currentRule.threshold_value}}；{{data.currentRule.enabled?'已启用':'已停用'}}。此配置不是触发时快照。</p><p>当前账号可见 {{data.relatedOrders.items.length}} 条关联工单<span v-if="data.relatedOrders.hasMore">，仍有更多记录</span>。打开详情查看。</p></details>
        </template>
        <template v-else>
          <p class="evidence-preview__state">{{state(data.status)}}</p>
          <dl><div><dt>执行人</dt><dd>{{text(data.assignee_name)}}</dd></div><div><dt>创建时间</dt><dd>{{time(data.created_at)}}</dd></div><div><dt>完成时间</dt><dd>{{data.completed_at?time(data.completed_at):'尚未完成'}}</dd></div><div><dt>检查点</dt><dd>共 {{patrolPoints.length}} 个</dd></div></dl>
          <section><h4>任务点位</h4><ol v-if="patrolPoints.length" class="evidence-preview__events"><li v-for="point in patrolPoints.slice(0,5)" :key="point.id"><span>{{text(point.code)}} · {{point.checked_at?'已提交':'待检查'}}</span><small>{{text(point.check_items,'检查项未提供')}}</small></li></ol><p v-else>当前任务没有返回点位。</p><p v-if="patrolPoints.length>5" class="evidence-preview__secondary">预览前5个点位，其余请打开任务查看。</p></section>
        </template>
        <footer><button type="button" :disabled="loading" @click="load()">刷新详情</button><button type="button" class="evidence-preview__primary" :disabled="loading||!!error||stale" @click="openRecord">{{readonly?'打开详情':'打开处理'}}</button></footer>
      </template>
    </template>
  </aside>
</template>

<style scoped>
.evidence-preview{min-width:0;padding-left:24px;border-left:1px solid var(--ops-line,var(--line));color:var(--ops-text,var(--text));font-size:14px;line-height:1.6}.evidence-preview header{display:flex;justify-content:space-between;align-items:start;gap:12px}.evidence-preview h3{font-size:16px;margin:2px 0 0;font-weight:600}.evidence-preview__reference,.evidence-preview__secondary,.evidence-preview dt,.evidence-preview small{font-size:12px;color:var(--ops-muted,var(--muted))}.evidence-preview__title{font-size:16px;line-height:1.65;margin:20px 0 8px;overflow-wrap:anywhere}.evidence-preview__state{font-size:12px;margin:0 0 18px}.evidence-preview dl{margin:0}.evidence-preview dl>div{display:grid;grid-template-columns:72px minmax(0,1fr);gap:12px;padding:6px 0}.evidence-preview dd{margin:0;overflow-wrap:anywhere}.evidence-preview section{padding-top:16px;margin-top:16px;border-top:1px solid var(--ops-line,var(--line))}.evidence-preview section h4{font-size:14px;margin:0 0 10px;font-weight:600}.evidence-preview p{overflow-wrap:anywhere}.evidence-preview__empty{margin:22px 0;color:var(--ops-muted,var(--muted))}.evidence-preview__error,.evidence-preview__warning{padding:10px 0 10px 12px;border-left:3px solid var(--ops-danger,#ad3340);font-size:13px}.evidence-preview__unknown{font-weight:600;color:var(--ops-warning,#835200)}.evidence-preview__warning{border-color:var(--ops-warning,#835200)}.evidence-preview__error button{margin:8px 0 0;display:block}.evidence-preview__events,.evidence-preview__readings{margin:0;padding:0;list-style:none}.evidence-preview__events li,.evidence-preview__readings li{padding:9px 0;border-bottom:1px solid var(--ops-line,var(--line))}.evidence-preview__events small,.evidence-preview__readings small{display:block;margin-top:3px}.evidence-preview__readings li>span{display:flex;justify-content:space-between;gap:8px}.evidence-preview details{margin-top:18px;font-size:12px}.evidence-preview summary{cursor:pointer;min-height:30px}.evidence-preview footer{display:flex;justify-content:flex-end;gap:8px;margin-top:24px;padding-top:14px;border-top:1px solid var(--ops-line,var(--line))}.evidence-preview button{font:inherit;font-size:12px;min-height:36px;padding:7px 10px;border:1px solid var(--ops-line,var(--line));border-radius:3px;background:transparent;color:inherit}.evidence-preview .evidence-preview__primary{background:var(--ops-accent,var(--teal));border-color:var(--ops-accent,var(--teal));color:var(--ops-on-accent,#fff)}.evidence-preview button:disabled{opacity:.55;cursor:not-allowed}.evidence-preview :is(button,summary):focus-visible{outline:2px solid var(--ops-accent,var(--teal));outline-offset:3px}@media(max-width:1100px){.evidence-preview{border-left:0;padding-left:0}.evidence-preview.is-empty{display:none}}
</style>
