<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { clearSession, tokenKey } from '../auth'
import { request, type Row } from '../business'

const route=useRoute(), router=useRouter()
const expanded=ref(true), state=ref<Row|null>(null), failure=ref(''), nodes=ref<Row[]>([]), target=ref(''), sending=ref(false), verified=ref<Row|null>(null), authenticated=ref(false)
const frame=computed(()=>state.value?.latest), fresh=computed(()=>!!state.value?.fresh)
const panel=ref<HTMLElement|null>(null), position=ref<{x:number,y:number}|null>(null), dragging=ref(false)
const panelStyle=computed(()=>position.value?{left:`${position.value.x}px`,top:`${position.value.y}px`,right:'auto',bottom:'auto'}:{})
let drag:{id:number,x:number,y:number,left:number,top:number}|null=null, moved=false
function clampPosition(x:number,y:number){
 const rect=panel.value?.getBoundingClientRect();if(!rect)return
 position.value={x:Math.max(8,Math.min(x,window.innerWidth-rect.width-8)),y:Math.max(8,Math.min(y,window.innerHeight-rect.height-8))}
}
function keepInView(){if(position.value)clampPosition(position.value.x,position.value.y)}
function dragStart(e:PointerEvent){
 if(!e.isPrimary||e.button!==0)return
 const rect=panel.value!.getBoundingClientRect()
 drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:rect.left,top:rect.top};moved=false
 ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}
function dragMove(e:PointerEvent){
 if(!drag||drag.id!==e.pointerId)return
 const dx=e.clientX-drag.x,dy=e.clientY-drag.y
 if(!moved&&Math.hypot(dx,dy)<5)return
 moved=true;dragging.value=true;clampPosition(drag.left+dx,drag.top+dy)
}
function dragEnd(){drag=null;dragging.value=false}
function togglePanel(){if(moved){moved=false;return}expanded.value=!expanded.value}
watch(expanded,async()=>{await nextTick();keepInView()})
let resizeObserver:ResizeObserver|undefined
let timer:ReturnType<typeof setInterval>|undefined, polling=false, sent='', loadedSession='', transportFailed=false
function display(channel:any){return fresh.value&&channel?.value!==null&&channel?.value!==undefined?channel.value:'—'}
function displayMethane(){const channel=frame.value?.methane;if(!fresh.value||channel?.value==null)return '—';const value=Number(channel.value)/(channel.unit==='ppm'?500:1);return ['%LEL','ppm'].includes(channel.unit)&&Number.isFinite(value)&&value>=0&&value<=100?value.toFixed(1):'—'}
function stop(){sending.value=false}
function login(){stop();clearSession();void router.push('/login')}
function start(){failure.value='';if(!authenticated.value||!target.value||!fresh.value)return;sending.value=true}

async function poll(){
 if(polling)return
 polling=true
 let reachedBridge=false
 try{
  const response=await fetch('/hardware-bridge/api/latest',{cache:'no-store',signal:AbortSignal.timeout(2500)})
  if(!response.ok)throw new Error('采集桥尚未启动')
  state.value=await response.json()
  if(state.value?.application!=='nephh-usb-bridge')throw new Error('采集桥响应不正确')
  reachedBridge=true
  if(transportFailed){failure.value='';transportFailed=false}
  const session=!sessionStorage.getItem('nephh-demo')?sessionStorage.getItem(tokenKey)||'':''
  authenticated.value=!!session
  if(!session){sending.value=false;nodes.value=[];loadedSession=''}
  else if(session!==loadedSession){nodes.value=await request<Row[]>('/nodes');loadedSession=session}
  const reports=[state.value?.report,state.value?.methaneReport].filter(Boolean) as Row[]
  const frameId=frame.value?.messageId
  if(!sending.value||!fresh.value||!reports.length||!target.value||sent===frameId)return
  const node=nodes.value.find(n=>String(n.id)===target.value)
  const metrics=reports.flatMap(report=>Object.keys(report.values))
  if(!node?.enabled||!metrics.every(key=>String(node.metrics).split(',').includes(key)))throw new Error('所选节点未启用或未配置本次上报指标')
  let inserted=0
  for(const report of reports){const result=await request<Row>(`/nodes/${target.value}/telemetry`,'POST',report);inserted+=Number(result.inserted)||0}
  const collectedAt=reports[0]!.collectedAt
  const begin=new Date(Math.floor(Date.parse(collectedAt)/1000)*1000)
  const end=new Date(begin.getTime()+2000)
  const history=await request<Row[]>(`/nodes/${target.value}/history?from=${encodeURIComponent(begin.toISOString())}&to=${encodeURIComponent(end.toISOString())}`)
  const matched=reports.every(report=>Object.entries(report.values).every(([metric,value])=>history.some(row=>row.message_id===report.messageId&&row.metric===metric&&Number(row.metric_value)===Number(value)&&row.source===report.source)))
  if(!matched)throw new Error('上报已有应答，但本帧尚未通过业务历史回读核对')
  window.dispatchEvent(new Event('nephh:telemetry-saved'))
  sent=frameId
  verified.value={node:node.code,sequence:frame.value.sequence,receivedAt:collectedAt,temperature:frame.value.temperature.value,humidity:frame.value.humidity.value,methane:state.value.methaneReport?.values.methane,inserted}
 }catch(error){
  transportFailed=!reachedBridge
  failure.value=error instanceof Error?error.message:'联调连接异常'
  if(sending.value)sending.value=false
  if(!state.value||Date.now()-Date.parse(state.value.latest?.receivedAt||'')>6500)state.value={...state.value,fresh:false}
 }finally{polling=false}
}
onMounted(()=>{void poll();timer=setInterval(()=>{void poll()},1500);window.addEventListener('resize',keepInView);resizeObserver=new ResizeObserver(keepInView);if(panel.value)resizeObserver.observe(panel.value)})
onUnmounted(()=>{if(timer)clearInterval(timer);window.removeEventListener('resize',keepInView);resizeObserver?.disconnect()})
</script>

<template>
 <aside ref="panel" class="hardware-live" :class="{'is-dragging':dragging}" :style="panelStyle" aria-label="采集节点实时数据">
  <button class="hardware-title" title="拖动标题可移动面板，单击展开或收起" @pointerdown="dragStart" @pointermove="dragMove" @pointerup="dragEnd" @pointercancel="dragEnd" @lostpointercapture="dragEnd" @click="togglePanel" :aria-expanded="expanded"><span>采集节点实时数据</span><small>{{fresh?(state?.transport==='WIFI_HTTP'?'Wi-Fi 已连接':'USB 已连接'):'等待采集'}} · {{expanded?'收起':'展开'}}</small></button>
  <div v-if="expanded" class="hardware-body">
   <p class="hardware-status">{{state?.transport==='WIFI_HTTP'?state.endpoint:(state?.serialPort||'串口待识别')}} · {{fresh?'实时接收':'暂无新数据'}}<span v-if="frame"> · 第 {{frame.sequence}} 帧</span></p>
   <div class="hardware-values">
    <div><small>温度</small><b>{{display(frame?.temperature)}} <em>℃</em></b></div>
    <div><small>湿度</small><b>{{display(frame?.humidity)}} <em>%RH</em></b></div>
    <div><small>甲烷浓度</small><b>{{displayMethane()}} <em>%LEL</em></b></div>
   </div>
   <p v-if="fresh && frame?.motor_voltage" class="hardware-note">INA226：{{frame.motor_voltage.quality}} · 电压 {{display(frame.motor_voltage)}} V · 电流 {{display(frame.motor_current)}} A · 功率 {{display(frame.motor_power)}} W</p>
   <p v-if="fresh && frame?.methane?.alarm" class="hardware-note">甲烷状态：{{frame.methane.alarm}} · 预警 25 / 紧急 50 %LEL</p>
   <p class="hardware-note">数据来自当前 ESP32，接收时间由电脑记录。选择节点后，可将温度、湿度和甲烷浓度上报到后端。</p>
   <template v-if="authenticated">
    <label class="hardware-target">接收节点<select v-model="target" :disabled="sending"><option value="">请选择已有节点</option><option v-for="node in nodes" :key="node.id" :value="String(node.id)" :disabled="!node.enabled">{{node.code}} · {{node.location}}</option></select></label>
    <div class="hardware-actions"><button v-if="!sending" :disabled="!target||!fresh" @click="start">开始上报到后端</button><button v-else @click="stop">停止上报</button><span>{{sending?'正在持续上报':'尚未开始上报'}}</span></div>
   </template>
   <div v-else class="hardware-actions"><button @click="login" :disabled="route.path==='/login'">登录账号</button><span>登录账号后可上报设备数据</span></div>
   <p v-if="verified" class="hardware-verified">已入库并回读核对：{{verified.node}} · 第 {{verified.sequence}} 帧<br/>温度 {{verified.temperature}}℃，湿度 {{verified.humidity}}%RH<span v-if="verified.methane!==undefined">，甲烷 {{verified.methane}}%LEL</span> · {{new Date(verified.receivedAt).toLocaleTimeString('zh-CN')}}</p>
   <p v-if="failure||state?.error" role="status" class="hardware-error">{{failure||state?.error}}</p>
  </div>
 </aside>
</template>

<style scoped>
.hardware-live{max-height:calc(100dvh - 16px);overflow:auto}.hardware-title{touch-action:none;user-select:none;cursor:grab!important;position:sticky;top:0;background:#142126!important;z-index:1}.is-dragging .hardware-title{cursor:grabbing!important}
.hardware-live{position:fixed;right:20px;bottom:18px;z-index:1100;width:min(520px,calc(100vw - 32px));color:#d9eeed;background:#142126;border:1px solid #31615d;border-radius:14px;box-shadow:0 14px 55px #0008;font:14px/1.5 system-ui,sans-serif}
.hardware-title{display:flex;justify-content:space-between;gap:14px;width:100%;padding:13px 16px;color:#c8ffef;background:transparent;border:0;text-align:left;cursor:pointer}.hardware-title span{font-weight:700}.hardware-title small,.hardware-status{font-size:12px;color:#91b7b3}.hardware-body{padding:0 16px 14px}.hardware-status{margin:0 0 10px}.hardware-values{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.hardware-values>div{padding:10px;background:#1e3034;border-radius:8px}.hardware-values small{display:block;font-size:12px;color:#9db8b6}.hardware-values b{display:block;font-size:23px;white-space:nowrap}.hardware-values em{font-size:11px;font-weight:400;font-style:normal;color:#a3c3be}.hardware-note{margin:10px 0;font-size:12px;color:#a0b6b5}.hardware-target{display:flex;align-items:center;gap:10px}.hardware-target select{flex:1;min-width:0;padding:8px;color:#d9eeed;background:#1c3035;border:1px solid #3e5d5a;border-radius:6px}.hardware-actions{display:flex;align-items:center;gap:12px;margin-top:10px}.hardware-actions button{padding:8px 13px;border:1px solid #51c8ae;border-radius:7px;background:#174a43;color:#dbfff1;cursor:pointer}.hardware-actions button:disabled{opacity:.5;cursor:default}.hardware-actions span{font-size:12px;color:#9cb8b2}.hardware-verified{font-size:12px;margin:10px 0 0;color:#9de4ba}.hardware-error{font-size:12px;margin:9px 0 0;color:#ffbe9b}
@media(max-width:600px){.hardware-live{right:16px;bottom:12px}.hardware-values b{font-size:19px}}
</style>
