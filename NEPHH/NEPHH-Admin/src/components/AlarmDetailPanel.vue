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
      <header><h2>告警 #{{ alarmId }}</h2><button aria-label="关闭告警详情" @click="emit('close')">关闭</button></header>
      <div class="alarm-detail__body">
        <p v-if="loading" role="status">正在读取告警及关联记录…</p>
        <p v-if="error" role="alert" class="alarm-detail__error">{{ stale ? '刷新失败，以下为历史快照：' : '' }}{{ error }} <button :disabled="loading" @click="load">重试</button></p>
        <template v-if="detail">
          <section class="alarm-detail__object">
            <h3>{{ detail.node.code }} <span>{{ detail.node.location }}</span></h3>
            <dl class="alarm-detail__states">
              <div><dt>等级</dt><dd>{{ severityName[detail.alarm.severity] || detail.alarm.severity }}</dd></div>
              <div><dt>告警状态</dt><dd>{{ detail.state.recovered ? '已恢复' : '未恢复' }}</dd></div>
              <div><dt>人工确认</dt><dd>{{ detail.state.acknowledged ? '已确认' : '未确认' }}</dd></div>
            </dl>
            <p class="alarm-detail__note">人工确认、指标恢复与工单完成分别记录。</p>
          </section>
          <section class="alarm-detail__section">
            <h3>触发依据</h3><p class="alarm-detail__reason">{{ detail.alarm.reason || '未提供触发原因' }}</p>
            <dl class="alarm-detail__facts">
              <div><dt>触发时间</dt><dd>{{ time(detail.alarm.triggered_at) }}</dd></div>
              <div><dt>人工确认时间</dt><dd>{{ time(detail.alarm.acknowledged_at) }}</dd></div>
              <div><dt>恢复时间</dt><dd>{{ time(detail.alarm.recovered_at) }}</dd></div>
            </dl>
          </section>
          <TelemetryStatusPanel :node="detail.node" :now-ms="props.nowMs" />
          <section class="alarm-detail__section">
            <div class="alarm-detail__section-heading"><h3>关联工单</h3><span class="alarm-detail__note">当前账号可见</span></div>
            <ul v-if="detail.relatedOrders.items.length" class="alarm-detail__orders"><li v-for="order in detail.relatedOrders.items" :key="order.id"><button @click="emit('openOrder', Number(order.id))"><span class="alarm-detail__order-id">#{{ order.id }}</span><span>{{ order.title }}</span><span class="alarm-detail__order-status">{{ statusName[order.status] || order.status }}</span></button></li></ul>
            <p v-else>暂无可见关联工单。</p><p v-if="detail.relatedOrders.hasMore" role="status" class="alarm-detail__note">仅展示最近 {{ detail.relatedOrders.limit }} 条，仍有更多记录。</p>
          </section>
          <section class="alarm-detail__section">
            <p v-if="detail.ruleAccess !== 'AVAILABLE'" class="alarm-detail__access" role="status">{{ detail.ruleExplanation }}</p>
            <details class="alarm-detail__more">
              <summary>当前规则与说明</summary>
              <p v-if="detail.ruleAccess === 'AVAILABLE'" class="alarm-detail__note">{{ detail.ruleExplanation }}</p>
              <dl v-if="detail.currentRule" class="alarm-detail__facts">
                <div><dt>监测指标</dt><dd>{{ metricName[detail.currentRule.metric] || detail.currentRule.metric }}</dd></div>
                <div><dt>当前阈值</dt><dd>{{ detail.currentRule.threshold_value }} {{ ruleUnit(detail.currentRule.metric) }}</dd></div>
                <div><dt>持续时间</dt><dd>{{ detail.currentRule.duration_seconds }} 秒</dd></div>
                <div><dt>规则状态</dt><dd>{{ detail.currentRule.enabled ? '已启用' : '已停用' }}</dd></div>
              </dl>
              <p class="alarm-detail__note">当前配置不是触发时规则快照；触发依据以上方持久化的原因为准。时间均为上海时间。</p>
            </details>
          </section>
        </template>
      </div>
      <footer><button :disabled="loading" @click="load">刷新关联记录</button><button v-if="canCreate && detail" :disabled="loading || stale" class="primary" @click="createOrder">创建关联工单</button></footer>
    </section>
  </div>
</template>

<style scoped>
.alarm-detail-overlay{position:fixed;inset:0;background:#0009;z-index:80;display:flex;justify-content:flex-end}
.alarm-detail{width:min(760px,100vw);height:100%;display:flex;flex-direction:column;background:var(--ops-surface,var(--panel));color:var(--ops-text,var(--text));border-left:1px solid var(--ops-line,var(--line));outline:none}
.alarm-detail>header,.alarm-detail>footer{padding:16px 24px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-bottom:1px solid var(--ops-line,var(--line))}
.alarm-detail>footer{border-top:1px solid var(--ops-line,var(--line));border-bottom:0}
.alarm-detail h2{font-size:20px;line-height:1.4;margin:0;font-weight:600}.alarm-detail h3{font-size:16px;line-height:1.5;margin:0 0 12px;font-weight:600}
.alarm-detail__body{padding:24px;overflow:auto;min-height:0;flex:1;font-size:14px;line-height:1.6}.alarm-detail__body p{overflow-wrap:anywhere;margin:10px 0}
.alarm-detail__object h3{font-size:20px;margin-bottom:16px}.alarm-detail__object h3>span{display:block;font-size:14px;font-weight:400;color:var(--ops-muted,var(--muted));margin-top:4px}
.alarm-detail dl{margin:0}.alarm-detail dt{color:var(--ops-muted,var(--muted));font-size:12px;font-weight:400}.alarm-detail dd{margin:0;font-variant-numeric:tabular-nums}
.alarm-detail__states{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.alarm-detail__states dd{margin-top:4px;font-weight:500}
.alarm-detail__section{margin-top:24px;padding-top:20px;border-top:1px solid var(--ops-line,var(--line))}.alarm-detail__section-heading{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.alarm-detail__facts>div{display:grid;grid-template-columns:112px minmax(0,1fr);align-items:baseline;gap:16px;padding:7px 0}.alarm-detail__facts dd{overflow-wrap:anywhere}
.alarm-detail__note,.alarm-detail__order-id,.alarm-detail__order-status{font-size:12px;color:var(--ops-muted,var(--muted))}.alarm-detail__reason{font-size:14px}
.alarm-detail__orders{padding:0;list-style:none;margin:0}.alarm-detail__orders li{border-bottom:1px solid var(--ops-line,var(--line))}.alarm-detail__orders li:last-child{border-bottom:0}
.alarm-detail__orders button{display:grid;grid-template-columns:64px minmax(0,1fr) auto;align-items:baseline;gap:12px;width:100%;text-align:left;overflow-wrap:anywhere;background:transparent;border:0;border-radius:2px;padding:12px 0;font-size:14px}
.alarm-detail__orders button:hover{background:var(--ops-raised,var(--panel))}.alarm-detail__order-id{font-variant-numeric:tabular-nums}.alarm-detail__order-status{white-space:nowrap}
.alarm-detail button{min-height:36px;padding:8px 12px;font-size:14px;border-radius:3px}.alarm-detail :is(button,summary):focus-visible{outline:3px solid var(--ops-accent,var(--teal));outline-offset:2px}
.alarm-detail__more summary{cursor:pointer;font-size:14px;padding:4px 0;min-height:36px;line-height:28px}.alarm-detail__more[open] summary{margin-bottom:8px}
.alarm-detail__access{font-size:14px;color:var(--ops-warning,var(--ops-text,var(--text)))}.alarm-detail__error{padding:12px;border-left:3px solid var(--ops-danger);background:var(--ops-danger-bg);color:var(--ops-danger)}
@media(max-width:600px){.alarm-detail__body{padding:16px}.alarm-detail>header,.alarm-detail>footer{padding:12px 16px}.alarm-detail__states{gap:8px}.alarm-detail__facts>div{grid-template-columns:96px minmax(0,1fr);gap:12px}.alarm-detail__orders button{grid-template-columns:48px minmax(0,1fr);gap:4px 8px}.alarm-detail__order-status{grid-column:2}}
</style>
