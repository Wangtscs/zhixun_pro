<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { tokenKey } from '../auth'
import { request, type Row } from '../business'
import { hardwareCollection, hardwareReports, isHardwareFrameFresh } from '../hardware-collection'
import { classifySource } from '../source-status'

const props = withDefaults(defineProps<{ visible?: boolean; readonly?: boolean }>(), { visible: false, readonly: false })
const route = useRoute()
const collection = hardwareCollection.state
const bridge = ref<Row | null>(null), nodes = ref<Row[]>([]), identity = ref<Row | null>(null)
const target = ref(''), failure = ref(''), polling = ref(false), starting = ref(false), nowMs = ref(Date.now())
const sessionKey = ref(''), isDemo = ref(false), loadedSession = ref('')
const frame = computed(() => bridge.value?.latest)
const fresh = computed(() => isHardwareFrameFresh(bridge.value, nowMs.value))
const demo = computed(() => isDemo.value)
const canManage = computed(() => !props.readonly && !!sessionKey.value && loadedSession.value === sessionKey.value && ['ADMIN', 'MANAGER'].includes(identity.value?.role))
let timer: ReturnType<typeof setInterval> | undefined, mounted = false, observedSession = '', sent = ''

function readSession(): string { return sessionStorage.getItem('nephh-demo') ? '' : sessionStorage.getItem(tokenKey) || '' }
function current(owner: string, version: number): boolean { return mounted && readSession() === owner && hardwareCollection.isCurrent(owner, version) }
function syncSession(): void {
  const session = readSession()
  sessionKey.value = session; isDemo.value = !!sessionStorage.getItem('nephh-demo')
  hardwareCollection.synchronizeSession(session)
  if (observedSession !== session) {
    observedSession = session
    loadedSession.value = ''; nodes.value = []; identity.value = null; target.value = ''; bridge.value = null; sent = ''; failure.value = ''
  }
}

function display(channel: Row | undefined): string {
  return fresh.value && channel?.quality === 'valid' && typeof channel.value === 'number' && Number.isFinite(channel.value) ? String(channel.value) : '—'
}

function reportsForNode(node: Row): ReturnType<typeof hardwareReports> {
  const reports = hardwareReports(bridge.value)
  const configured = String(node.metrics || '').split(',')
  if (!node.enabled || !reports.length || !reports.every(report => Object.keys(report.values).every(metric => configured.includes(metric)))) {
    throw new Error('节点未启用或未配置全部上报指标，请核对接收节点')
  }
  return reports
}

async function tick(): Promise<void> {
  syncSession(); nowMs.value = Date.now()
  if (props.readonly && collection.active) hardwareCollection.stop('只读视图不可上报，已停止连续写入')
  if (!mounted || polling.value || (!props.visible && !collection.active)) return
  const owner = readSession(), version = hardwareCollection.version()
  polling.value = true
  try {
    const response = await fetch('/hardware-bridge/api/latest', { cache: 'no-store', signal: AbortSignal.timeout(2500) })
    if (!response.ok) throw new Error('采集桥尚未启动或连接失败')
    const snapshot = await response.json()
    if (!current(owner, version)) return
    if (snapshot?.application !== 'nephh-usb-bridge') throw new Error('采集桥响应不正确')
    bridge.value = snapshot; failure.value = ''; nowMs.value = Date.now()
    if (owner && loadedSession.value !== owner) {
      const [who, available] = await Promise.all([request<Row>('/identity'), request<Row[]>('/nodes')])
      if (!current(owner, version)) return
      identity.value = who; nodes.value = available; loadedSession.value = owner
    }
    if (!collection.active) return
    if (props.readonly) { hardwareCollection.stop('只读视图不可上报，已停止连续写入'); return }
    if (!fresh.value) { hardwareCollection.stop('采集帧已过期或不可用，上报已停止'); return }
    const node = nodes.value.find(row => row.id === collection.nodeId)
    if (!node) throw new Error('接收节点已不可访问，上报已停止')
    const frameKey = collection.nodeId + '|' + String(snapshot.latest?.messageId || '')
    if (frameKey === sent) return
    const result = await hardwareCollection.send(reportsForNode(node), {
      api: (path, method, body) => request(path, method, body), getSession: readSession
    })
    if (!current(owner, version) || result.status === 'abandoned') return
    if (result.status === 'verified') sent = frameKey
    if (result.verified > 0) window.dispatchEvent(new Event('nephh:telemetry-saved'))
  } catch (error) {
    if (!current(owner, version)) return
    bridge.value = null
    failure.value = error instanceof Error ? error.message : '采集或业务服务连接异常'
    hardwareCollection.stop('连接或报文异常，上报已停止')
  } finally { polling.value = false }
}

async function start(): Promise<void> {
  if (props.readonly) { hardwareCollection.stop('只读视图不可上报，已停止连续写入'); failure.value = '当前为只读视图，不能开始上报'; return }
  if (starting.value || polling.value || !fresh.value) return
  syncSession()
  const owner = readSession(), version = hardwareCollection.version()
  const node = nodes.value.find(row => String(row.id) === target.value)
  if (!owner || !node) { failure.value = '请使用真实业务账号登录并选择接收节点'; return }
  starting.value = true; failure.value = ''
  try {
    // Re-read current server identity immediately before enabling writes.
    const who = await request<Row>('/identity')
    if (!current(owner, version)) return
    if (props.readonly) { hardwareCollection.stop('只读视图不可上报，已停止连续写入'); failure.value = '当前为只读视图，不能开始上报'; return }
    identity.value = who
    reportsForNode(node)
    hardwareCollection.start({ session: owner, role: who.role, demo: !!sessionStorage.getItem('nephh-demo'), nodeId: Number(node.id), nodeCode: String(node.code) })
    sent = ''
    void tick()
  } catch (error) {
    if (current(owner, version)) failure.value = error instanceof Error ? error.message : '无法开始上报'
  } finally { starting.value = false }
}

function updatePolling(): void {
  if (timer) { clearInterval(timer); timer = undefined }
  if (mounted && (props.visible || collection.active)) {
    void tick()
    timer = setInterval(() => { void tick() }, 1500)
  }
}

watch([() => props.visible, () => collection.active], updatePolling)
watch(() => props.readonly, value => { if (value) hardwareCollection.stop('已切换只读视图，上报已停止') }, { immediate: true, flush: 'sync' })
watch(() => route.path, path => { syncSession(); if (path === '/login') hardwareCollection.stop('已退出业务页面，上报已停止') })
onMounted(() => {
  mounted = true; syncSession()
  window.addEventListener('nephh:session-changed', syncSession)
  window.addEventListener('storage', syncSession)
  updatePolling()
})
onUnmounted(() => {
  mounted = false
  if (timer) clearInterval(timer)
  window.removeEventListener('nephh:session-changed', syncSession)
  window.removeEventListener('storage', syncSession)
  hardwareCollection.stop('控制台已卸载，上报已停止')
})
</script>

<template>
  <section v-show="visible" class="hardware-console work-panel" aria-label="硬件采集与上报控制台">
    <header>
      <div><h2>硬件采集与上报</h2><p>在此核对来源、接收节点和回读结果。开始后跨页继续，可随时从顶部停止。</p></div>
      <button type="button" :disabled="polling" @click="tick">{{ polling ? '正在读取' : '刷新采集预览' }}</button>
    </header>
    <p class="hardware-console__state" role="status">{{ collection.active ? '持续上报中' : collection.busy ? '已停止续发，正在核对已发送请求' : '未持续上报' }} · {{ fresh ? '采集帧有效' : '无有效新帧' }}</p>
    <p v-if="readonly">当前为只读视图，持续上报已停止，不能开始上报。</p>
    <p v-else-if="demo">独立演示模式只预览，不向真实业务API写入。请退出预览并使用管理员或值班长账号登录后上报。</p>
    <p v-else-if="!canManage">仅真实管理员或值班长可开始上报；服务器继续校验节点区域和权限。</p>
    <p>{{ bridge?.transport === 'WIFI_HTTP' ? 'Wi-Fi HTTP采集桥' : 'USB/串口采集桥' }} · {{ frame?.receivedAt || '尚无接收时间' }}<span v-if="frame"> · 第 {{ frame.sequence }} 帧</span></p>
    <div class="hardware-console__values">
      <article><h3>温度</h3><b>{{ display(frame?.temperature) }} <small>℃</small></b><span>{{ classifySource(bridge?.report?.source).label }}</span></article>
      <article><h3>湿度</h3><b>{{ display(frame?.humidity) }} <small>%RH</small></b><span>{{ classifySource(bridge?.report?.source).label }}</span></article>
      <article><h3>甲烷</h3><b>{{ display(frame?.methane) }} <small>{{ frame?.methane?.unit || '%LEL' }}</small></b><span>{{ classifySource(bridge?.methaneReport?.source).label }}</span><small>当前设备甲烷为模拟值，不是实测气体浓度。</small></article>
    </div>
    <p>业务采集时间取采集桥接收时间，时间品质为receiver_timestamp，不代表设备已经完成UTC校时。实测温湿度与模拟甲烷分开报文、分开标明来源。</p>
    <p v-if="frame?.motor_voltage">电气预览：电压 {{ display(frame.motor_voltage) }} V；电流 {{ display(frame.motor_current) }} A；功率 {{ display(frame.motor_power) }} W。{{ frame.motor_voltage.quality }}；这些电气通道仅预览。</p>
    <label class="hardware-console__target">接收节点<select v-model="target" :disabled="collection.active || collection.busy || starting || !canManage"><option value="">请选择已有授权节点</option><option v-for="node in nodes" :key="node.id" :value="String(node.id)" :disabled="!node.enabled">{{ node.code }} · {{ node.location }}</option></select></label>
    <div class="hardware-console__actions">
      <button v-if="!collection.active" class="primary" type="button" :disabled="!canManage || !target || !fresh || polling || starting || collection.busy" @click="start">{{ starting ? '校验身份中' : '开始上报到后端' }}</button>
      <button v-else type="button" @click="hardwareCollection.stop()">停止上报</button>
      <span>{{ collection.nodeCode ? '接收节点：' + collection.nodeCode + '。' : '' }}{{ collection.notice }}</span>
    </div>
    <p v-if="collection.result?.status === 'verified'" class="hardware-console__verified">本帧全部 {{ collection.result.verified }} 份报文已通过历史回读核对。</p>
    <p v-else-if="collection.result?.status === 'partial'" class="hardware-console__partial">仅 {{ collection.result.verified }}/{{ collection.result.planned }} 份已回读核对，未宣称整帧完成。连续上报已停止。</p>
    <p v-if="failure || collection.error || bridge?.error" class="hardware-console__error" role="alert">{{ failure || collection.error || bridge?.error }}</p>
  </section>
</template>

<style scoped>
.hardware-console{position:static;width:100%;max-width:100%;overflow:hidden;color:var(--ops-text,#e0eaf0);background:var(--ops-surface,#16212a);font-size:14px;line-height:1.6}
.hardware-console>header,.hardware-console__actions{display:flex;gap:16px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.hardware-console h2{margin:0;font-size:18px}.hardware-console h3{font-size:14px;margin:0 0 6px}.hardware-console p{margin:12px 0;overflow-wrap:anywhere}
.hardware-console small,.hardware-console article>span{font-size:12px;color:var(--ops-muted,#a7b9c6)}
.hardware-console__values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.hardware-console article{padding:16px;border:1px solid var(--ops-line,#3a4d5a);border-radius:8px;background:var(--ops-raised,#1d2c37)}
.hardware-console article>b{display:block;font-size:24px;font-variant-numeric:tabular-nums}.hardware-console article>span,.hardware-console article>small{display:block}
.hardware-console__target{display:flex;align-items:center;flex-wrap:wrap;gap:12px}.hardware-console select{min-height:40px;max-width:100%;flex:1;min-width:180px;padding:8px;color:inherit;background:var(--ops-raised,#1d2c37);border:1px solid var(--ops-line,#3a4d5a)}
.hardware-console__actions{justify-content:flex-start;margin-top:16px}.hardware-console button{min-height:40px;padding:8px 12px;font-size:14px}.hardware-console button:disabled{opacity:.6;cursor:not-allowed}
.hardware-console__state,.hardware-console__verified{color:var(--ops-accent,#58e1d3)}.hardware-console__partial{color:var(--ops-warning,#f2c77e)}.hardware-console__error{color:var(--ops-danger,#ff9da4)}
.hardware-console :is(button,select):focus-visible{outline:3px solid var(--ops-accent,#58e1d3);outline-offset:3px}
@media(max-width:600px){.hardware-console__values{grid-template-columns:1fr}.hardware-console__target{align-items:stretch;flex-direction:column}}
</style>
