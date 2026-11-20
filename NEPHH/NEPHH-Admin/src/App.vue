<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Workspace from './components/Workspace.vue'
import HardwareConsole from './components/HardwareConsole.vue'
import Icon from './components/Icon.vue'
import BrandMark from './components/BrandMark.vue'
import { api, tokenKey, clearSession, setSessionToken, sessionChangedEvent } from './auth'
import { hardwareCollection, stopHardwareCollection } from './hardware-collection'
import './style.css'
import './design.css'
import './light-theme.css'
import './operations-theme.css'
const route=useRoute(),router=useRouter()
const account=ref(localStorage.getItem('nephh-remembered-account')||''),password=ref(''),remember=ref(true),showPassword=ref(false),loginError=ref(''),loading=ref(false),toast=ref('')
const sessionToken=ref(''),sessionDemo=ref(false),readonlyView=ref(true),collection=hardwareCollection.state
function synchronizeAppSession():void {
 sessionToken.value=sessionStorage.getItem(tokenKey)||''
 sessionDemo.value=!!sessionStorage.getItem('nephh-demo')
 if(!sessionToken.value||sessionDemo.value||route.path==='/login')readonlyView.value=true
}
const authenticated=computed(()=>!!sessionToken.value&&!sessionDemo.value&&route.path!=='/login')
const hardwareConsoleVisible=computed(()=>authenticated.value&&route.path==='/simulator')
const showCollectionSummary=computed(()=>authenticated.value&&(collection.active||collection.busy))
watch(readonlyView,value=>{if(value)hardwareCollection.stop('已切换只读视图，上报已停止')},{flush:'sync'})
function updateViewRole(value:string):void {readonlyView.value=!['manager','inspector','supervisor'].includes(value)}
watch(()=>route.path,synchronizeAppSession,{immediate:true})
onMounted(()=>{synchronizeAppSession();window.addEventListener(sessionChangedEvent,synchronizeAppSession);window.addEventListener('storage',synchronizeAppSession)})
onBeforeUnmount(()=>{window.removeEventListener(sessionChangedEvent,synchronizeAppSession);window.removeEventListener('storage',synchronizeAppSession)})
watch(()=>route.path,path=>{if(path==='/login'){loginError.value='';password.value='';showPassword.value=false}})
const pending=computed(()=>loading.value||(import.meta.env.DEV&&route.query.state==='loading'))
function notify(message:string){toast.value=message;setTimeout(()=>toast.value='',3200)}
async function login(){
 if(pending.value)return
 loginError.value=''
 if(!account.value.trim()||!password.value){loginError.value='请输入账号和密码';return}
 loading.value=true
 try{sessionStorage.removeItem('nephh-demo');const result=await api<{accessToken:string}>('/auth/login',{username:account.value.trim(),password:password.value});setSessionToken(result.accessToken);if(remember.value)localStorage.setItem('nephh-remembered-account',account.value.trim());else localStorage.removeItem('nephh-remembered-account');password.value='';await router.push('/overview')}
 catch(error){loginError.value=error instanceof Error?error.message:'登录失败，请稍后重试'}
 finally{loading.value=false}
}
function enterDemo(){clearSession();sessionStorage.setItem('nephh-demo','1');synchronizeAppSession();router.push('/overview')}
async function openHardwareConsole():Promise<void> {try{await router.push('/simulator');await nextTick();document.getElementById('hardware-console-region')?.scrollIntoView({behavior:'smooth',block:'start'})}catch{notify('无法打开硬件控制台，请确认登录状态')}}
</script>
<template>
<div v-if="route.path==='/login'" class="login-page design-login">
 <section class="login-art"><div class="brand"><BrandMark boxed/><div><h1>智巡 · 管廊</h1><p>城市地下综合管廊 AI 巡检管理平台</p></div></div><div class="login-blueprint" aria-hidden="true"><div class="blueprint-halo"></div><div v-for="i in 4" :key="i" class="blueprint-floor" :style="{'--floor':i}"><i v-for="j in 5" :key="j" :style="{'--beam':j}"></i></div><div class="blueprint-wall left"></div><div class="blueprint-wall right"></div></div><small>version v2.6.0</small></section>
 <section class="login-side"><form class="login-form" @submit.prevent="login"><span class="eyebrow">WELCOME BACK</span><h2>管理员登录</h2><p>请使用企业账号登录</p><label>账号<div class="login-input"><Icon name="user"/><input v-model="account" autocomplete="username" placeholder="工号或邮箱" :aria-invalid="!!loginError"/></div></label><label>密码<div class="login-input"><Icon name="orders"/><input v-model="password" :type="showPassword?'text':'password'" autocomplete="current-password" placeholder="请输入登录密码" :aria-invalid="!!loginError"/><button type="button" :aria-label="showPassword?'隐藏密码':'显示密码'" @click="showPassword=!showPassword"><Icon :name="showPassword?'eye-off':'eye'"/></button></div></label><div class="between"><label class="inline"><input v-model="remember" type="checkbox"/>记住账号</label><button type="button" class="text-button" @click="notify('请联系管理员重置密码')">忘记密码</button></div><p v-if="loginError" class="login-error" role="alert"><Icon name="warning"/>{{loginError}}</p><button class="primary wide login-submit" :disabled="pending"><span v-if="pending" class="spinner"></span>{{pending?'登录中…':'登录'}}</button><div class="divider">或</div><button type="button" class="wide login-demo" :disabled="pending" @click="enterDemo"><Icon name="sparkles"/>预览平台</button><small>预览模式不写入业务数据库，设备上报请先登录</small></form><footer>用户协议 <span>·</span> 隐私政策</footer></section>
</div>
<Workspace v-else @view-role-change="updateViewRole"><template #hardware-status><aside v-if="showCollectionSummary" class="hardware-collection-summary" aria-label="硬件上报状态"><div role="status"><strong>{{collection.active?'持续上报中':'已停止续发，正在核对'}}</strong><span>接收节点：{{collection.nodeCode||'#'+collection.nodeId}}</span></div><div><button type="button" :disabled="!collection.active" @click="stopHardwareCollection">{{collection.active?'停止上报':'已停止续发'}}</button><button type="button" @click="openHardwareConsole">进入控制台</button></div></aside></template></Workspace>
<div id="hardware-console-region" class="hardware-console-host" :hidden="!hardwareConsoleVisible"><HardwareConsole :visible="hardwareConsoleVisible" :readonly="readonlyView"/></div>

<div v-if="toast" class="toast">{{toast}}</div>
</template>

<style scoped>
.hardware-console-host:not([hidden]){margin:0 24px 100px 216px;width:calc(100% - 240px);scroll-margin-top:90px}
.design-app.nav-collapsed~.hardware-console-host:not([hidden]){margin-left:96px;width:calc(100% - 120px)}
@media(max-width:900px){.hardware-console-host:not([hidden]){margin-left:96px;width:calc(100% - 120px)}}
@media(max-width:600px){.hardware-console-host:not([hidden]),.design-app.nav-collapsed~.hardware-console-host:not([hidden]){margin-left:84px;margin-right:12px;width:calc(100% - 96px)}}

.hardware-collection-summary{position:static;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;width:100%;max-width:100%;margin:0 0 16px;padding:12px 16px;border:1px solid var(--ops-accent,#58e1d3);border-radius:8px;background:var(--ops-surface,#16212a);color:var(--ops-text,#e0eaf0);box-shadow:0 8px 28px #0004;font-size:14px;line-height:1.6}
.hardware-collection-summary>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.hardware-collection-summary>div+div{margin-top:0}.hardware-collection-summary span{font-size:12px;color:var(--ops-muted,#a7b9c6)}.hardware-collection-summary button{min-height:36px;padding:6px 12px;font:inherit;background:var(--ops-raised,#1d2c37);color:inherit;border:1px solid var(--ops-line,#3a4d5a);border-radius:6px}.hardware-collection-summary button:focus-visible{outline:3px solid var(--ops-accent,#58e1d3);outline-offset:3px}.hardware-collection-summary button:disabled{opacity:.6;cursor:not-allowed}
</style>
