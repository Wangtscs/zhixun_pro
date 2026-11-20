<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { request, metricName, severityName, statusName, type Row } from '../business'
import TelemetryStatusPanel from './TelemetryStatusPanel.vue'

interface AlarmDetail {
  alarm: Row; node: Row
  state: { active: boolean; acknowledged: boolean; recovered: boolean }
  currentRule: Row | null; ruleAccess: string; ruleExplanation: string
  relatedOrders: { items: Row[]; limit: number; hasMore: boolean }
}
const props = defineProps<{ alarmId: number; role: string; readonly: boolean; refreshKey?: number; nowMs: number }>()
const emit = defineEmits<{ close: []; openOrder: [id: number]; createOrder: [data: Row] }>()
const detail = ref<AlarmDetail | null>(null), loading = ref(false), error = ref(''), stale = ref(false)
const dialog = ref<HTMLElement | null>(null)
const canCreate = computed(() => !props.readonly && ['ADMIN', 'MANAGER'].includes(props.role))
let revision = 0, disposed = false, returnFocus: HTMLElement | null = null
const formatter = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' })
function ruleUnit(metric: string) { return ({methane:'%LEL',temperature:'°C',humidity:'%RH',infrared:'°C'} as Record<string,string>)[metric] || '单位未提供' }
function time(value: unknown) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? formatter.format(new Date(value)) : '未提供' }
async function load() {
  const version = ++revision, id = props.alarmId
  loading.value = true; error.value = ''
  try {
    const data = await request<AlarmDetail>('/alarms/' + id)
    if (!data?.alarm || Number(data.alarm.id) !== id || !data.node || !data.state || !Array.isArray(data.relatedOrders?.items)) throw new Error('告警详情响应不完整')
    if (!disposed && version === revision) { detail.value = data; stale.value = false }
  } catch (failure) {
    if (!disposed && version === revision) {
      const status = (failure as { status?: number }).status
      if (status === 401 || status === 403 || status === 404) detail.value = null
      stale.value = !!detail.value
      error.value = failure instanceof Error ? failure.message : '无法读取告警详情'
    }
  } finally { if (!disposed && version === revision) loading.value = false }
}
function createOrder() {
  if (!canCreate.value || !detail.value || stale.value || loading.value) return
  emit('createOrder', { nodeId: detail.value.node.id, alarmId: detail.value.alarm.id,
    title: '告警 #' + detail.value.alarm.id + ' · ' + detail.value.node.code,
    priority: detail.value.alarm.severity === 'HIGH' ? 'HIGH' : 'MEDIUM', description: detail.value.alarm.reason })
}
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length)
  const first = controls[0], last = controls.at(-1)
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
watch(() => props.alarmId, () => { detail.value = null; stale.value = false; void load() }, { immediate: true })
watch(() => props.role, () => { detail.value = null; void load() })
watch(() => props.refreshKey, () => { if (!loading.value) void load() })
onMounted(async () => { returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null; await nextTick(); dialog.value?.focus() })
onBeforeUnmount(() => { disposed = true; revision++; if (returnFocus?.isConnected) returnFocus.focus() })
</script>

<template>
  <div class="alarm-detail-overlay" @click.self="emit('close')">
    <section ref="dialog" class="alarm-detail" role="dialog" aria-modal="true" aria-label="告警与关联证据" tabindex="-1" @keydown="keys">
      <header><div><span>告警与关联证据</span><h2>告警 #{{ alarmId }}</h2></div><button aria-label="关闭告警详情" @click="emit('close')">关闭</button></header>
      <div class="alarm-detail__body">
        <p v-if="loading" role="status">正在读取告警及关联记录…</p>
        <p v-if="error" role="alert" class="alarm-detail__error">{{ stale ? '刷新失败，以下为历史快照：' : '' }}{{ error }} <button :disabled="loading" @click="load">重试</button></p>
        <template v-if="detail">
          <div class="alarm-detail__states"><span>{{ severityName[detail.alarm.severity] || detail.alarm.severity }}等级</span><span>{{ detail.state.recovered ? '已恢复' : '未恢复' }}</span><span>{{ detail.state.acknowledged ? '已人工确认' : '未人工确认' }}</span></div>
          <h3>{{ detail.node.code }} · {{ detail.node.location }}</h3><p>{{ detail.alarm.reason }}</p>
          <dl><div><dt>触发时间</dt><dd>{{ time(detail.alarm.triggered_at) }}</dd></div><div><dt>人工确认时间</dt><dd>{{ time(detail.alarm.acknowledged_at) }}</dd></div><div><dt>恢复时间</dt><dd>{{ time(detail.alarm.recovered_at) }}</dd></div></dl>
          <p class="alarm-detail__note">人工确认不代表指标恢复；告警恢复也不代表关联工单已完成。时间均为上海时间。</p>
          <section class="alarm-detail__section"><h3>当前规则</h3><p>{{ detail.ruleExplanation }}</p><p v-if="detail.currentRule">{{ metricName[detail.currentRule.metric] || detail.currentRule.metric }} · 阈值 {{ detail.currentRule.threshold_value }} {{ ruleUnit(detail.currentRule.metric) }} · 持续 {{ detail.currentRule.duration_seconds }} 秒 · {{ detail.currentRule.enabled ? '已启用' : '已停用' }}</p><p v-if="detail.currentRule" class="alarm-detail__note">这是当前配置，不是触发时规则快照；原始触发依据以上方告警原因为准。</p></section>
          <TelemetryStatusPanel :node="detail.node" :now-ms="props.nowMs" />
          <section class="alarm-detail__section"><h3>关联工单</h3><p class="alarm-detail__note">仅显示当前账号可访问、明确关联此告警的工单。</p><ul v-if="detail.relatedOrders.items.length"><li v-for="order in detail.relatedOrders.items" :key="order.id"><button @click="emit('openOrder', Number(order.id))">#{{ order.id }} · {{ order.title }} · {{ statusName[order.status] || order.status }}</button></li></ul><p v-else>暂无可见关联工单。</p><p v-if="detail.relatedOrders.hasMore" role="status">仅展示最近 {{ detail.relatedOrders.limit }} 条关联记录，仍有更多记录。</p></section>
        </template>
      </div>
      <footer><button :disabled="loading" @click="load">刷新关联记录</button><button v-if="canCreate && detail" :disabled="loading || stale" class="primary" @click="createOrder">创建关联工单</button></footer>
    </section>
  </div>
</template>

<style scoped>
.alarm-detail-overlay{position:fixed;inset:0;background:#0009;z-index:80;display:flex;justify-content:flex-end}.alarm-detail{width:min(760px,100vw);height:100%;display:flex;flex-direction:column;background:var(--ops-surface,var(--panel));color:var(--ops-text,var(--text));border-left:1px solid var(--ops-line,var(--line));outline:none}.alarm-detail>header,.alarm-detail>footer{padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--ops-line,var(--line))}.alarm-detail>footer{border-top:1px solid var(--ops-line,var(--line));border-bottom:0}.alarm-detail h2{font-size:20px;margin:4px 0}.alarm-detail h3{font-size:16px;margin:8px 0}.alarm-detail__body{padding:20px;overflow:auto;min-height:0;flex:1;font-size:14px;line-height:1.7}.alarm-detail__body p{overflow-wrap:anywhere}.alarm-detail__states{display:flex;gap:8px;flex-wrap:wrap}.alarm-detail__states span{border:1px solid var(--ops-line,var(--line));padding:4px 8px;border-radius:5px;font-size:12px}.alarm-detail__note,.alarm-detail dt,.alarm-detail>header>div>span{font-size:12px;color:var(--ops-muted,var(--muted))}.alarm-detail dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.alarm-detail dd{margin:4px 0}.alarm-detail__section{margin:20px 0;padding-top:16px;border-top:1px solid var(--ops-line,var(--line))}.alarm-detail ul{padding:0;list-style:none}.alarm-detail li{margin:8px 0}.alarm-detail li button{width:100%;text-align:left;overflow-wrap:anywhere}.alarm-detail button{min-height:36px;padding:8px 12px;font-size:12px}.alarm-detail button:focus-visible{outline:3px solid var(--ops-accent,var(--teal));outline-offset:2px}.alarm-detail__error{padding:12px;background:var(--ops-danger-bg,#43272f);color:var(--ops-danger,#ff9da4)}@media(max-width:600px){.alarm-detail__body{padding:14px}.alarm-detail>header,.alarm-detail>footer{padding:12px 14px}}
</style>
