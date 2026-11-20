<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { tokenKey } from '../auth'
import { request, statusName } from '../business'

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
const headingId = useId()
const emit = defineEmits<{
  openOrder: [id: number]; openPatrol: [id: number]; openNode: [id: number]; space: []
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
function itemId(item: Item): number | null { return positiveId(selected.value === 'urgentAlarms' ? item.node_id : item.id) }
function openItem(item: Item): void {
  const id = itemId(item)
  if (id === null) return
  if (selected.value === 'urgentAlarms') emit('openNode', id)
  else if (selected.value === 'patrol') emit('openPatrol', id)
  else emit('openOrder', id)
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
  if (identityKey !== nextIdentity) { response.value = null; identityKey = nextIdentity }
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
    stale.value = false
  } catch (failure) {
    if (disposed || currentRevision !== revision || requestedScope !== scopeKey.value ||
        token !== (sessionStorage.getItem(tokenKey) || '') || isDemo !== Boolean(sessionStorage.getItem('nephh-demo'))) return
    const status = failure instanceof Error && 'status' in failure ? Number(failure.status) : 0
    const denied = status === 401 || status === 403
    errorKind.value = denied ? 'unauthorized' : 'error'
    if (denied) { response.value = null; stale.value = false }
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
  selected.value = key
  offset.value = 0
  void load()
}
function nextPage(): void { if (!loading.value && queuePage.value?.hasMore) { offset.value += limit; void load() } }
function previousPage(): void { if (!loading.value && offset.value > 0) { offset.value = Math.max(0, offset.value - limit); void load() } }
watch(()=>props.refreshKey,()=>{if(!loading.value)void load()})
function resumeVisible(): void { if (!document.hidden && !loading.value) void load() }

watch(scopeKey, () => {
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
})
onBeforeUnmount(() => {
  disposed = true
  revision++
  clearInterval(timer)
  document.removeEventListener('visibilitychange', resumeVisible)
})
</script>

<template>
  <section class="workbench" :aria-labelledby="headingId" :aria-busy="loading">
    <header class="workbench__header"><div><p class="workbench__eyebrow">下一步工作</p><h2 :id="headingId">{{ role === 'INSPECTOR' ? '我的任务工作台' : '区域任务工作台' }}</h2><p class="workbench__meta">{{ scopeDescription }}<span v-if="readonly"> · 只读查看</span></p></div><div class="workbench__actions"><button type="button" @click="emit('space')">空间定位</button><button type="button" :disabled="loading || !role" @click="load">{{ loading ? '读取中…' : '刷新待办' }}</button></div></header>
    <p v-if="demo" class="workbench__demo"><strong>独立演示数据</strong> · 当前数字与队列仅来自内存样本，不代表真实设备或业务记录。</p>
    <p class="workbench__explanation">数量由同一服务器范围计算，不受旧列表条数上限影响。队列可能重叠，不相加作为总待办。</p>
    <div v-if="role" class="workbench__cards"><button v-for="key in allowedQueues" :key="key" type="button" :class="{ selected: selected === key, urgent: key === 'urgentAlarms', warning: key === 'overdue' }" :aria-pressed="selected === key" @click="selectQueue(key)"><span>{{ labels[key] }}</span><strong>{{ response ? response.counts[key] : '—' }}</strong><small>{{ descriptions[key] }}</small></button></div>
    <p v-if="error" class="workbench__error" role="status"><strong>{{ errorKind === 'unauthorized' ? '访问受限' : stale ? '刷新失败，快照已过期' : '暂时无法读取待办' }}</strong>：{{ error }}<a v-if="error.includes('重新登录')" href="/login">重新登录</a></p>
    <p v-if="response" class="workbench__snapshot" :class="{ stale }">{{ stale ? '历史快照，非当前实时状态' : '服务器快照' }}：{{ formatTime(response.serverTime) }}（上海时间）。{{ loading ? '正在读取，请勿将旧快照视作新结果。' : '每15秒刷新；跨页期间业务记录可能变化。' }}</p>
    <div class="workbench__queue">
      <header><h3>{{ labels[selected] }}</h3><span v-if="queuePage">共 {{ queuePage.total }} 项</span><span v-else>{{ loading ? '正在读取队列…' : '尚无已确认的队列结果' }}</span></header>
      <p v-if="!role" class="workbench__empty">正在确认账号角色与业务范围。</p>
      <p v-else-if="errorKind === 'unauthorized'" class="workbench__empty">已清除当前范围的旧数据。请确认账号、区域授权和登录状态。</p>
      <p v-else-if="loading && !queuePage" class="workbench__empty" role="status">正在读取服务器待办，请稍候。</p>
      <p v-else-if="!response && error" class="workbench__empty">当前没有可用快照。可点击“刷新待办”重试，不将错误显示为零任务。</p>
      <p v-else-if="response && !response.scope.areaIds.length" class="workbench__empty">当前账号尚无授权业务区域，请联系管理员分配区域。</p>
      <p v-else-if="queuePage && !queuePage.items.length" class="workbench__empty">{{ queuePage.total === 0 ? '当前范围暂无此类待办。' : '此页已无记录，业务状态可能变化；请返回上一页或刷新。' }}</p>
      <ul v-else-if="queuePage" class="workbench__items"><li v-for="item in queuePage.items" :key="String(item.id)"><button type="button" :disabled="itemId(item) === null" @click="openItem(item)"><div><p class="workbench__item-meta"><span>#{{ item.id }}</span><span>{{ selected === 'patrol' ? text(item.assignee_name, '执行人未提供') : text(item.node_code || item.code, '节点未提供') }}</span><span>区域 #{{ item.area_id }}</span></p><h4>{{ itemTitle(item) }}</h4><p class="workbench__item-meta"><span>{{ selected === 'urgentAlarms' ? '触发于 '+formatTime(item.triggered_at) : selected === 'patrol' ? '创建于 '+formatTime(item.created_at) : '截止 '+formatTime(item.due_at) }}</span><span v-if="selected !== 'urgentAlarms' && selected !== 'patrol'">{{ text(item.assignee_name, '未派发') }}</span></p></div><span class="workbench__status">{{ selected === 'urgentAlarms' ? '未恢复 · 查看节点' : String(statusName[String(item.status)] || item.status || '查看详情') }}</span></button></li></ul>
      <footer class="workbench__pagination"><span v-if="queuePage">第 {{ Math.floor(queuePage.offset / limit) + 1 }} 页 · 本页 {{ queuePage.items.length }} 项 / 共 {{ queuePage.total }} 项</span><span v-else>每页20项 · 计数以服务器为准</span><div><button type="button" :disabled="loading || offset === 0 || errorKind === 'unauthorized'" @click="previousPage">上一页</button><button type="button" :disabled="loading || !queuePage?.hasMore || errorKind === 'unauthorized'" @click="nextPage">下一页</button></div></footer>
    </div>
  </section>
</template>

<style scoped>
.workbench{margin-bottom:24px;color:var(--ops-text,var(--text));font-size:14px;line-height:1.5}.workbench__header{display:flex;align-items:start;justify-content:space-between;gap:16px;margin-bottom:16px}.workbench__header h2{margin:0;font-size:22px;line-height:1.5}.workbench__eyebrow{font-size:12px;color:var(--ops-accent,var(--teal));margin:0 0 5px}.workbench__meta,.workbench__explanation,.workbench__snapshot{font-size:12px;line-height:1.7;color:var(--ops-muted,var(--muted));margin:7px 0 14px}.workbench__actions{display:flex;gap:8px;flex-wrap:wrap}.workbench button{font:inherit}.workbench__actions button,.workbench__pagination button{min-height:38px;padding:8px 12px;font-size:12px;border:1px solid var(--ops-line,var(--line));border-radius:7px;background:var(--ops-raised,var(--panel));color:inherit}.workbench button:focus-visible,.workbench a:focus-visible{outline:3px solid var(--ops-accent,var(--teal));outline-offset:3px}.workbench button:disabled{opacity:.6;cursor:not-allowed}.workbench__demo{padding:12px 16px;border:1px solid var(--ops-warning,#f2c77e);background:var(--ops-warning-bg,#403423);color:var(--ops-warning,#f2c77e);font-size:12px;border-radius:7px}.workbench__cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:16px 0}.workbench__cards button{text-align:left;min-height:136px;border:1px solid var(--ops-line,var(--line));border-radius:9px;padding:16px;background:var(--ops-surface,var(--panel));color:inherit}.workbench__cards button:hover,.workbench__cards button.selected{border-color:var(--ops-accent,var(--teal))}.workbench__cards button.selected{box-shadow:inset 0 3px var(--ops-accent,var(--teal))}.workbench__cards strong{display:block;font:30px/1.5 "Cascadia Code",Consolas,monospace;font-variant-numeric:tabular-nums;margin:5px 0}.workbench__cards small{display:block;color:var(--ops-muted,var(--muted));font-size:12px;line-height:1.6}.workbench__cards .urgent>span{color:var(--ops-danger,#ff9da4)}.workbench__cards .warning>span{color:var(--ops-warning,#f2c77e)}.workbench__error{padding:12px 16px;border:1px solid var(--ops-danger,#ff9da4);background:var(--ops-danger-bg,#43272f);color:var(--ops-danger,#ff9da4);border-radius:7px}.workbench__error a{color:inherit;text-decoration:underline;margin-left:12px}.workbench__snapshot.stale{color:var(--ops-warning,#f2c77e)}.workbench__queue{border:1px solid var(--ops-line,var(--line));border-radius:9px;background:var(--ops-surface,var(--panel));overflow:hidden}.workbench__queue>header{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--ops-line,var(--line))}.workbench__queue h3{font-size:18px;margin:0}.workbench__queue>header>span{font-size:12px;color:var(--ops-muted,var(--muted))}.workbench__items{list-style:none;margin:0;padding:0}.workbench__items li+li{border-top:1px solid var(--ops-line,var(--line))}.workbench__items button{width:100%;border:0;border-radius:0;background:transparent;color:inherit;display:flex;justify-content:space-between;text-align:left;align-items:center;gap:16px;padding:16px 20px;cursor:pointer}.workbench__items button:hover{background:var(--ops-raised,var(--panel))}.workbench__items h4{font-size:14px;line-height:1.6;font-weight:600;margin:6px 0}.workbench__item-meta{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--ops-muted,var(--muted));margin:0;line-height:1.7}.workbench__status{font-size:12px;white-space:nowrap;border:1px solid var(--ops-line,var(--line));padding:5px 8px;border-radius:6px}.workbench__empty{padding:32px 20px;margin:0;text-align:center;color:var(--ops-muted,var(--muted));font-size:14px;line-height:1.7}.workbench__pagination{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-top:1px solid var(--ops-line,var(--line));gap:12px;flex-wrap:wrap}.workbench__pagination>span{font-size:12px;color:var(--ops-muted,var(--muted))}.workbench__pagination>div{display:flex;gap:8px}@media(max-width:600px){.workbench__header{flex-direction:column}.workbench__cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.workbench__cards button{padding:12px;min-height:130px}.workbench__items button{padding:14px 12px;flex-wrap:wrap}.workbench__queue>header,.workbench__pagination{padding:14px 12px}.workbench__status{white-space:normal}}
</style>
