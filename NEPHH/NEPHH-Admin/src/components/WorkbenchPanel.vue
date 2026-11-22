<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { tokenKey, sessionChangedEvent } from '../auth'
import { request, severityName, statusName } from '../business'
import EvidencePreview from './EvidencePreview.vue'
import { workbenchPreviewTarget, type WorkbenchPreviewTarget } from '../workbench-preview'

type Item = Record<string, unknown>
type QueueKey = 'urgentAlarms' | 'unassigned' | 'review' | 'overdue' | 'patrol' | 'assigned' | 'processing'
interface WorkbenchResponse {
  scope: { role: string; areaId: number | null; areaIds: number[]; personal: boolean }
  serverTime: string
  counts: Partial<Record<QueueKey, number>>
  queue: { key: QueueKey; total: number; items: Item[]; hasMore: boolean; limit: number; offset: number }
}
class WorkbenchError extends Error {
  status: number
  constructor(message: string, status = 0) { super(message); this.status = status }
}

const props = defineProps<{ areaId: string; role: string; readonly: boolean; refreshKey?: number }>()
const headingId = useId(), previewId = useId()
const previewTarget = ref<WorkbenchPreviewTarget | null>(null), previewRefresh = ref(0)
let originButton: HTMLButtonElement | null = null
const emit = defineEmits<{
  openOrder: [id: number]; openAlarm: [id: number]; openPatrol: [id: number]; openNode: [id: number]; space: []
}>()
const managementQueues: QueueKey[] = ['urgentAlarms', 'unassigned', 'review', 'overdue', 'patrol']
const personalQueues: QueueKey[] = ['assigned', 'processing', 'overdue', 'patrol']
const labels: Record<QueueKey, string> = {
  urgentAlarms: '紧急告警', unassigned: '待派单', review: '待复核', overdue: '逾期工单',
  patrol: '巡检待办', assigned: '待接单', processing: '处理中'
}
const descriptions: Record<QueueKey, string> = {
  urgentAlarms: '高等级且尚未恢复，已确认仍保留', unassigned: '等待分配执行人的工单',
  review: '处理结果已提交，等待复核', overdue: '已过截止时间且尚未结束',
  patrol: '已生成且尚未完成的巡检任务', assigned: '等待本人接单的工单', processing: '本人已接单或正在处理的工单'
}
const role = computed(() => props.role.toUpperCase())
const allowedQueues = computed(() => role.value === 'INSPECTOR' ? personalQueues : managementQueues)
const scopeKey = computed(() => `${props.areaId}|${role.value}|${props.readonly}`)
const demo = ref(Boolean(sessionStorage.getItem('nephh-demo')))
const selected = ref<QueueKey>('unassigned')
const offset = ref(0)
const response = ref<WorkbenchResponse | null>(null)
const loading = ref(false)
const error = ref('')
const errorKind = ref<'error' | 'unauthorized' | null>(null)
const stale = ref(false)
const limit = 20
let revision = 0
let disposed = false
let timer: ReturnType<typeof setInterval> | undefined
let identityKey = ''

const queuePage = computed(() => response.value?.queue.key === selected.value && response.value.queue.offset === offset.value ? response.value.queue : null)
const scopeDescription = computed(() => response.value
  ? `${response.value.scope.personal ? '本人任务' : '授权区域任务'} · ${response.value.scope.areaIds.length}个区域`
  : role.value === 'INSPECTOR' ? '本人任务 · 等待服务器核定范围' : '等待服务器核定授权范围')
const shanghaiTime = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
})
function formatTime(value: unknown): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return '未设置或时间未知'
  return shanghaiTime.format(new Date(value))
}
function text(value: unknown, fallback = '未提供'): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}
function positiveId(value: unknown): number | null {
  const id = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}
function itemTitle(item: Item): string {
  return selected.value === 'urgentAlarms' ? text(item.reason, '紧急告警')
    : selected.value === 'patrol' ? text(item.name, '巡检任务') : text(item.title, '工单')
}
function itemId(item: Item): number | null { return positiveId(item.id) }
async function selectItem(item: Item, event: MouseEvent): Promise<void> {
  previewTarget.value = workbenchPreviewTarget(selected.value, item, props.areaId)
  originButton = event.currentTarget instanceof HTMLButtonElement ? event.currentTarget : null
  await nextTick()
  if (previewTarget.value) document.getElementById(previewId)?.focus()
}
function clearPreview(): void { previewTarget.value = null; originButton = null }
async function closePreview(): Promise<void> {
  const button = originButton
  clearPreview()
  await nextTick()
  if (button?.isConnected) button.focus()
}
function openPreview(target: WorkbenchPreviewTarget): void {
  if (stale.value || !previewTarget.value || target.kind !== previewTarget.value.kind || target.id !== previewTarget.value.id) return
  if (target.kind === 'alarm') emit('openAlarm', target.id)
  else if (target.kind === 'patrol') emit('openPatrol', target.id)
  else emit('openOrder', target.id)
}
function itemState(item: Item): string {
  if (selected.value === 'urgentAlarms') return '高等级 · 未恢复'
  return String(statusName[String(item.status)] || '状态待确认')
}
function itemPriority(item: Item): string {
  return selected.value === 'patrol' || selected.value === 'urgentAlarms' ? '' : String(severityName[String(item.priority)] || '优先级未提供')
}
function itemTime(item: Item): string {
  if (selected.value === 'urgentAlarms') return formatTime(item.triggered_at)
  if (selected.value === 'patrol') return formatTime(item.created_at)
  return item.due_at ? formatTime(item.due_at) : '未设置截止时间'
}

function validate(value: WorkbenchResponse, key: QueueKey, requestedOffset: number): WorkbenchResponse {
  if (!value || !value.scope || !Array.isArray(value.scope.areaIds) || !value.counts ||
      !value.queue || !Array.isArray(value.queue.items) || value.queue.key !== key ||
      value.queue.offset !== requestedOffset || value.queue.limit !== limit ||
      typeof value.queue.hasMore !== 'boolean' || !Number.isSafeInteger(value.queue.total) || value.queue.total < 0 ||
      !Number.isFinite(Date.parse(value.serverTime))) {
    throw new WorkbenchError('待办响应格式不完整，请刷新或联系管理员')
  }
  if (value.scope.role !== role.value) throw new WorkbenchError('账号角色已变化，请刷新页面重新确认权限', 403)
  const requestedArea = props.areaId ? Number(props.areaId) : null
  if (value.scope.areaId !== requestedArea) throw new WorkbenchError('服务器返回范围与当前区域不一致，请刷新')
  for (const queue of allowedQueues.value) {
    if (!Number.isSafeInteger(value.counts[queue]) || Number(value.counts[queue]) < 0) {
      throw new WorkbenchError('待办计数不完整，暂不能展示为零')
    }
  }
  if (value.counts[key] !== value.queue.total) throw new WorkbenchError('计数与队列口径不一致，请刷新核对')
  return value
}

async function load(): Promise<void> {
  if (disposed) return
  if (!['ADMIN', 'MANAGER', 'INSPECTOR'].includes(role.value)) {
    loading.value = false
    response.value = null
    clearPreview()
    error.value = role.value ? '当前账号角色不能访问任务工作台' : ''
    errorKind.value = role.value ? 'unauthorized' : null
    return
  }
  const currentRevision = ++revision
  const requestedScope = scopeKey.value
  const requestedKey = selected.value
  const requestedOffset = offset.value
  const isDemo = Boolean(sessionStorage.getItem('nephh-demo'))
  const token = sessionStorage.getItem(tokenKey) || ''
  const nextIdentity = `${isDemo}|${token}`
  if (identityKey !== nextIdentity) { response.value = null; clearPreview(); identityKey = nextIdentity }
  demo.value = isDemo
  loading.value = true
  error.value = ''
  errorKind.value = null
  const query = new URLSearchParams({ queue: requestedKey, limit: String(limit), offset: String(requestedOffset) })
  if (props.areaId) query.set('areaId', props.areaId)
  try {
    const data = await request<WorkbenchResponse>('/workbench?' + query)
    if (disposed || currentRevision !== revision || requestedScope !== scopeKey.value ||
        token !== (sessionStorage.getItem(tokenKey) || '') || isDemo !== Boolean(sessionStorage.getItem('nephh-demo'))) return
    response.value = validate(data, requestedKey, requestedOffset)
    if (previewTarget.value && !data.queue.items.some(item => itemId(item) === previewTarget.value?.id)) clearPreview()
    previewRefresh.value++
    stale.value = false
  } catch (failure) {
    if (disposed || currentRevision !== revision || requestedScope !== scopeKey.value ||
        token !== (sessionStorage.getItem(tokenKey) || '') || isDemo !== Boolean(sessionStorage.getItem('nephh-demo'))) return
    const status = failure instanceof Error && 'status' in failure ? Number(failure.status) : 0
    const denied = status === 401 || status === 403
    errorKind.value = denied ? 'unauthorized' : 'error'
    if (denied) { response.value = null; stale.value = false; clearPreview() }
    else stale.value = response.value !== null
    error.value = status === 401 ? '登录已失效，请重新登录后读取待办'
      : denied ? '当前账号没有此区域或队列的访问权限，请重新确认授权'
        : failure instanceof Error ? failure.message : '读取待办失败，请重试'
  } finally {
    if (!disposed && currentRevision === revision) loading.value = false
  }
}

function selectQueue(key: QueueKey): void {
  if (!allowedQueues.value.includes(key)) return
  clearPreview()
  selected.value = key
  offset.value = 0
  void load()
}
function nextPage(): void { if (!loading.value && queuePage.value?.hasMore) { clearPreview(); offset.value += limit; void load() } }
function previousPage(): void { if (!loading.value && offset.value > 0) { clearPreview(); offset.value = Math.max(0, offset.value - limit); void load() } }
watch(()=>props.refreshKey,()=>{if(!loading.value)void load()})
function resumeVisible(): void { if (!document.hidden && !loading.value) void load() }

function resetSession(): void {
  revision++; response.value = null; clearPreview(); loading.value = false; stale.value = false
  error.value = '账号会话已变化，请刷新待办确认当前范围'; errorKind.value = null
}
watch(scopeKey, () => {
  clearPreview()
  revision++
  response.value = null
  offset.value = 0
  selected.value = role.value === 'INSPECTOR' ? 'assigned' : 'unassigned'
  error.value = ''
  errorKind.value = null
  stale.value = false
  void load()
}, { immediate: true })
onMounted(() => {
  timer = setInterval(() => { if (!document.hidden && !loading.value) void load() }, 15000)
  document.addEventListener('visibilitychange', resumeVisible)
  window.addEventListener(sessionChangedEvent, resetSession)
  window.addEventListener('storage', resetSession)
})
onBeforeUnmount(() => {
  disposed = true
  revision++
  clearInterval(timer)
  document.removeEventListener('visibilitychange', resumeVisible)
  window.removeEventListener(sessionChangedEvent, resetSession)
  window.removeEventListener('storage', resetSession)
})
</script>

<template>
  <section class="workbench" :aria-labelledby="headingId" :aria-busy="loading">
    <header class="workbench__header"><div><h2 :id="headingId">{{ role === 'INSPECTOR' ? '我的待办' : '区域待办' }}</h2><p class="workbench__meta">{{scopeDescription}}<strong v-if="readonly"> · 只读查看</strong></p></div><div class="workbench__actions"><button type="button" @click="emit('space')">空间定位</button><button type="button" :disabled="loading || !role" @click="load">{{loading?'读取中…':'刷新待办'}}</button></div></header>
    <p v-if="demo" class="workbench__notice"><strong>独立演示数据</strong> · 当前数字与队列来自内存样本，不代表真实业务记录。</p>
    <nav v-if="role" class="workbench__queues" aria-label="待办队列"><button v-for="key in allowedQueues" :key="key" type="button" :class="{selected:selected===key}" :aria-pressed="selected===key" @click="selectQueue(key)">{{labels[key]}}<strong>{{response?response.counts[key]:'—'}}</strong></button></nav>
    <p v-if="error" class="workbench__error" role="alert"><strong>{{errorKind==='unauthorized'?'访问受限':stale?'刷新失败，快照已过期':'暂时无法读取待办'}}</strong>：{{error}}<a v-if="error.includes('重新登录')" href="/login">重新登录</a></p>
    <div class="workbench__scope"><span v-if="response" :class="{stale}">{{stale?'过期快照':'更新于'}} {{formatTime(response.serverTime)}}（上海时间）{{loading?' · 正在刷新':''}}</span><details><summary>范围与计数说明</summary><p>{{descriptions[selected]}}。数量由服务器按当前权限范围计算；队列可能重叠，不相加为总待办。每15秒刷新，跨页期间业务可能变化。</p></details></div>
    <div class="workbench__body" :class="{'has-preview':previewTarget}">
      <div class="workbench__queue">
        <header><h3>{{labels[selected]}}</h3><span v-if="queuePage">共 {{queuePage.total}} 项</span><span v-else>{{loading?'读取队列中…':'数量尚未确认'}}</span></header>
        <p v-if="!role" class="workbench__empty">正在确认账号角色与业务范围。</p>
        <p v-else-if="errorKind==='unauthorized'" class="workbench__empty">已清除旧数据，请确认账号与区域授权。</p>
        <p v-else-if="loading&&!queuePage" class="workbench__empty" role="status">正在读取服务器待办…</p>
        <p v-else-if="!response&&error" class="workbench__empty">当前没有可用快照，请刷新重试。读取失败不代表零任务。</p>
        <p v-else-if="response&&!response.scope.areaIds.length" class="workbench__empty">尚无授权业务区域，请联系管理员分配。</p>
        <p v-else-if="queuePage&&!queuePage.items.length" class="workbench__empty">{{queuePage.total===0?'当前范围暂无此类待办。':'此页已无记录，请返回上一页或刷新。'}}</p>
        <div v-else-if="queuePage" class="workbench__table-scroll"><table><caption class="workbench__sr">{{labels[selected]}}事项列表，选择事项读取详情预览</caption><thead><tr><th scope="col">事项</th><th scope="col">节点</th><th scope="col">优先级 / 状态</th><th scope="col">{{selected==='urgentAlarms'?'触发时间':selected==='patrol'?'创建时间':'截止时间'}}</th><th scope="col">执行人</th></tr></thead><tbody><tr v-for="item in queuePage.items" :key="String(item.id)" :class="{'is-selected':previewTarget?.id===itemId(item)}"><td><button type="button" class="workbench__record" :disabled="!workbenchPreviewTarget(selected,item,areaId)" :aria-expanded="previewTarget?.id===itemId(item)" :aria-controls="previewId" @click="selectItem(item,$event)"><span>{{itemTitle(item)}}</span><small>#{{item.id}}</small></button></td><td>{{text(item.node_code||item.code,selected==='patrol'?'点位见详情':'节点未提供')}}</td><td><span :class="{'workbench__uncertain':itemState(item)==='状态待确认'}">{{itemState(item)}}</span><small v-if="itemPriority(item)">{{itemPriority(item)}}</small></td><td>{{itemTime(item)}}</td><td>{{selected==='urgentAlarms'?'见关联工单':text(item.assignee_name,item.status==='DRAFT'?'未派发':'执行人未提供')}}</td></tr></tbody></table></div>
        <footer class="workbench__pagination"><span v-if="queuePage">第 {{Math.floor(queuePage.offset/limit)+1}} 页 · 本页 {{queuePage.items.length}} 项 / 共 {{queuePage.total}} 项</span><span v-else>每页20项</span><div><button type="button" :disabled="loading||offset===0||errorKind==='unauthorized'" @click="previousPage">上一页</button><button type="button" :disabled="loading||!queuePage?.hasMore||errorKind==='unauthorized'" @click="nextPage">下一页</button></div></footer>
      </div>
      <EvidencePreview :id="previewId" :target="previewTarget" :scope-key="scopeKey" :readonly="readonly" :refresh-key="previewRefresh" :stale="stale" @close="closePreview" @open="openPreview" />
    </div>
  </section>
</template>

<style scoped>
.workbench{margin-bottom:28px;padding:24px;background:var(--ops-surface,var(--panel));border:1px solid var(--ops-line,var(--line));border-radius:var(--ops-radius,6px);color:var(--ops-text,var(--text));font-size:14px;line-height:1.6}.workbench__header{display:flex;justify-content:space-between;gap:16px;align-items:start}.workbench h2{margin:0;font-size:20px;font-weight:600;letter-spacing:0}.workbench__meta,.workbench__scope{font-size:12px;color:var(--ops-muted,var(--muted))}.workbench__meta{margin:5px 0 18px}.workbench__actions{display:flex;gap:8px}.workbench button{font:inherit;color:inherit;cursor:pointer}.workbench__actions button,.workbench__pagination button{font-size:13px;background:transparent;border:1px solid var(--ops-line,var(--line));border-radius:4px;padding:7px 12px;min-height:36px}.workbench :is(button,a,summary):focus-visible{outline:2px solid var(--ops-accent,var(--teal));outline-offset:3px}.workbench button:disabled{opacity:.55;cursor:not-allowed}.workbench__queues{display:flex;flex-wrap:wrap;gap:2px;border-bottom:1px solid var(--ops-line,var(--line));margin-bottom:14px}.workbench__queues button{position:relative;display:inline-flex;align-items:center;gap:8px;margin-bottom:-1px;padding:10px 12px;min-height:44px;font-size:13px;color:var(--ops-muted,var(--muted));background:transparent;border:0;border-bottom:2px solid transparent;border-radius:4px 4px 0 0;transition:background-color .15s ease,border-color .15s ease,color .15s ease}.workbench__queues button:hover:not(.selected):not(:disabled){color:var(--ops-text,var(--text));background:var(--ops-hover-bg,#232e3a)}.workbench__queues button:active:not(:disabled){background:var(--ops-press-bg,#1e2935)}.workbench__queues button.selected{color:var(--ops-accent,var(--teal));background:var(--ops-accent-bg,#2a3b50);border-bottom-color:var(--ops-accent,var(--teal));font-weight:600}.workbench__queues button.selected:active:not(:disabled){background:var(--ops-accent-bg-hover,#32465e)}.workbench__queues strong{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:20px;padding:0 6px;border:1px solid transparent;border-radius:10px;background:var(--ops-raised,#1d2c37);color:var(--ops-muted,var(--muted));font-size:11px;font-weight:600;line-height:1;font-variant-numeric:tabular-nums}.workbench__queues button:hover:not(.selected):not(:disabled) strong{background:var(--ops-surface,#16212a);border-color:var(--ops-line,var(--line));color:var(--ops-text,var(--text))}.workbench__queues button.selected strong{background:var(--ops-accent,var(--teal));color:var(--ops-on-accent,#142638)}.workbench__scope{display:flex;justify-content:space-between;gap:12px;align-items:start;margin-bottom:18px}.workbench__scope details{max-width:420px}.workbench__scope summary{cursor:pointer;text-align:right}.workbench__scope p{margin:8px 0}.workbench__notice,.workbench__error{margin:0 0 14px;padding:10px 12px;background:var(--ops-warning-bg,#fbf3e4);border:1px solid var(--ops-line,var(--line));border-left:3px solid var(--ops-warning,#835200);border-radius:4px;font-size:13px;line-height:1.6}.workbench__notice strong{color:var(--ops-warning,#835200)}.workbench__error{background:var(--ops-danger-bg,#fbeef0);border-color:var(--ops-line,var(--line));border-left-color:var(--ops-danger,#ad3340)}.workbench__error a{margin-left:12px;color:inherit;text-decoration:underline}.workbench__scope .stale,.workbench__uncertain{color:var(--ops-warning,#835200);font-weight:600}.workbench__body{display:grid;grid-template-columns:minmax(0,1fr) minmax(270px,30%);gap:24px;align-items:start}.workbench__queue{min-width:0}.workbench__queue>header{display:flex;align-items:center;justify-content:space-between;margin:0 0 10px;gap:12px}.workbench h3{margin:0;font-size:16px;font-weight:600}.workbench__queue>header>span{font-size:12px;color:var(--ops-muted,var(--muted))}.workbench__table-scroll{overflow-x:auto}.workbench table{border-collapse:collapse;width:100%;min-width:720px;text-align:left;font-size:14px}.workbench th{height:40px;font-weight:500;color:var(--ops-muted,var(--muted));font-size:12px;white-space:nowrap;background:var(--ops-raised,#f4f6f8);border-bottom:1px solid var(--ops-line,var(--line));padding:8px 10px}.workbench td{border-bottom:1px solid var(--ops-line,var(--line));padding:12px 10px;vertical-align:middle;overflow-wrap:anywhere;max-width:180px}.workbench tbody tr{transition:background-color .15s ease}.workbench tbody tr:hover td{background:var(--ops-raised,#f4f6f8)}.workbench td:first-child{width:33%;padding-left:0}.workbench th:first-child{padding-left:0}.workbench td:nth-child(4){min-width:115px;font-variant-numeric:tabular-nums}.workbench td small{display:block;color:var(--ops-muted,var(--muted));font-size:12px;margin-top:3px}.workbench .workbench__record{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent;padding:0;font-size:14px;line-height:1.7}.workbench__record>span{display:block}.workbench__record:hover>span{text-decoration:underline;text-underline-offset:3px}.workbench tr.is-selected td{background:var(--ops-accent-bg,#e9f0f8)}.workbench tr.is-selected:hover td{background:var(--ops-accent-bg-hover,#dce8f5)}.workbench tr.is-selected .workbench__record>span{color:var(--ops-accent,var(--teal));font-weight:600}.workbench tr.is-selected td:first-child{box-shadow:inset 2px 0 var(--ops-accent,var(--teal));padding-left:10px}.workbench__empty{margin:0;padding:44px 16px;text-align:center;color:var(--ops-muted,var(--muted));background:var(--ops-raised,#f4f6f8);border:1px solid var(--ops-line,var(--line));border-radius:4px}.workbench__pagination{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:14px;flex-wrap:wrap}.workbench__pagination>span{font-size:12px;color:var(--ops-muted,var(--muted))}.workbench__pagination>div{display:flex;gap:8px}.workbench__sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:1100px){.workbench__body{grid-template-columns:minmax(0,1fr)}.workbench__body.has-preview>.workbench__queue{display:none}}@media(max-width:600px){.workbench{padding:16px}.workbench__header{flex-direction:column;gap:0}.workbench__actions{margin-bottom:12px}.workbench__queues{gap:0 18px}.workbench__scope{flex-direction:column}.workbench__scope summary{text-align:left}.workbench__pagination{align-items:start}}
</style>
