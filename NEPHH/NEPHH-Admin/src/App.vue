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
<div v-if="route.path==='/login'" class="operations-login">
 <header class="login-brand"><BrandMark/><div><h1>智巡管廊</h1><p>管廊巡检与运维管理</p></div></header>
 <main class="login-main">
  <form class="login-form" @submit.prevent="login">
   <h2>账号登录</h2><p class="login-intro">使用管理员分配的业务账号登录。</p>
   <label for="login-account">账号</label><div class="login-input"><Icon name="user"/><input id="login-account" v-model="account" autocomplete="username" placeholder="请输入账号" :aria-invalid="!!loginError" :aria-describedby="loginError?'login-error':undefined"/></div>
   <label for="login-password">密码</label><div class="login-input"><Icon name="orders"/><input id="login-password" v-model="password" :type="showPassword?'text':'password'" autocomplete="current-password" placeholder="请输入密码" :aria-invalid="!!loginError" :aria-describedby="loginError?'login-error':undefined"/><button type="button" :aria-label="showPassword?'隐藏密码':'显示密码'" :aria-pressed="showPassword" @click="showPassword=!showPassword"><Icon :name="showPassword?'eye-off':'eye'"/></button></div>
   <div class="login-options"><label class="login-remember"><input v-model="remember" type="checkbox"/>记住账号</label><button type="button" class="login-help" @click="notify('请联系管理员重置密码')">忘记密码</button></div>
   <p v-if="loginError" id="login-error" class="login-error" role="alert"><Icon name="warning"/>{{loginError}}</p>
   <button class="login-submit" :disabled="pending"><span v-if="pending" class="spinner"></span>{{pending?'登录中…':'登录'}}</button>
   <div class="login-demo-entry"><button type="button" class="login-demo" :disabled="pending" @click="enterDemo">查看演示</button><p>演示数据独立运行，不写入业务数据库。<br/>设备采集与业务操作请先登录。</p></div>
  </form>
 </main>
 <footer class="login-footer">管理员、值班长与巡检员使用同一登录入口</footer>
</div>
<Workspace v-else @view-role-change="updateViewRole"><template #hardware-status><aside v-if="showCollectionSummary" class="hardware-collection-summary" aria-label="硬件上报状态"><div role="status"><strong>{{collection.active?'持续上报中':'已停止续发，正在核对'}}</strong><span>接收节点：{{collection.nodeCode||'#'+collection.nodeId}}</span></div><div><button type="button" :disabled="!collection.active" @click="stopHardwareCollection">{{collection.active?'停止上报':'已停止续发'}}</button><button type="button" @click="openHardwareConsole">进入控制台</button></div></aside></template></Workspace>
<div id="hardware-console-region" class="hardware-console-host" :hidden="!hardwareConsoleVisible"><HardwareConsole :visible="hardwareConsoleVisible" :readonly="readonlyView"/></div>

<div v-if="toast" class="toast">{{toast}}</div>
</template>

<style scoped>
/* Login owns complete surface/text pairs; legacy light-theme rules must not mix them. */
.operations-login{--login-bg:#f3f5f7;--login-surface:#fff;--login-text:#1e2b3b;--login-muted:#536375;--login-line:#7a8b9d;--login-soft-line:#d0d8e1;--login-accent:#234f7d;--login-accent-hover:#1b3f65;--login-accent-press:#163453;--login-accent-bg:#e9f0f8;--login-accent-bg-hover:#dce8f5;--login-accent-line:#a8bfd6;--login-on-accent:#fff;--login-error:#ae303b;--muted:var(--login-muted);--line:var(--login-soft-line);--teal:var(--login-accent);min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:48px 24px;background:var(--login-bg);color:var(--login-text);font:14px/1.6 "Nephh Sans UI","Microsoft YaHei UI","PingFang SC",sans-serif}
:global([data-theme="dark"]) .operations-login{--login-bg:#141b23;--login-surface:#1c252f;--login-text:#e6ecf2;--login-muted:#afbdcc;--login-line:#8091a3;--login-soft-line:#3b4b5d;--login-accent:#92b9eb;--login-accent-hover:#a9caf3;--login-accent-press:#7ba7de;--login-accent-bg:#2a3b50;--login-accent-bg-hover:#32465e;--login-accent-line:#5b7fa8;--login-on-accent:#142638;--login-error:#ffabad}
.operations-login .login-brand{display:flex;align-items:center;gap:12px;width:min(100%,420px);padding:0;background:none;border:0}
.operations-login .login-brand :deep(.brand-mark){color:var(--login-accent);background:none;border:0;box-shadow:none;flex:none}
.operations-login .login-brand h1{font-size:22px;line-height:1.4;font-weight:600;letter-spacing:0;margin:0;color:var(--login-text)}
.operations-login .login-brand p{font-size:12px;margin:3px 0 0;color:var(--login-muted);letter-spacing:0}
.operations-login .login-main{position:relative;width:min(100%,420px);padding:32px;background:var(--login-surface);border:1px solid var(--login-soft-line);border-radius:6px;box-shadow:0 18px 44px #1e2b3b0f}.operations-login .login-main::before{content:"";position:absolute;inset:0 0 auto;height:2px;background:var(--login-accent);border-radius:6px 6px 0 0}
.operations-login .login-form{width:100%;transform:none}
.operations-login .login-form h2{font-size:20px;font-weight:600;line-height:1.5;margin:0 0 6px;color:var(--login-text)}
.operations-login .login-intro{font-size:13px;margin:0 0 24px;color:var(--login-muted)}
.operations-login .login-form>label{display:block;font-size:13px;margin:16px 0 7px;color:var(--login-text)}
.operations-login .login-input{display:flex;align-items:center;gap:10px;width:100%;height:46px;padding:0 12px;border:1px solid var(--login-line);border-radius:4px;background:var(--login-surface);color:var(--login-text);transition:border-color .15s ease}
.operations-login .login-input>svg{width:17px;height:17px;flex:none;color:var(--login-muted)}
.operations-login .login-input input{width:100%;min-width:0;flex:1;height:44px;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none;font:inherit;color:var(--login-text)}
.operations-login .login-input input::placeholder{color:var(--login-muted)}
.operations-login .login-input input:focus{outline:none;box-shadow:none}
.operations-login .login-input:focus-within{outline:2px solid var(--login-accent);outline-offset:2px}
.operations-login .login-input:has([aria-invalid="true"]){border-color:var(--login-error)}
.operations-login .login-input button{display:flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;min-height:32px;padding:6px;border:0;border-radius:3px;background:transparent;color:var(--login-muted)}
.operations-login .login-input button svg{width:18px;height:18px}
.operations-login .login-options{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:16px 0 20px}
.operations-login .login-remember{display:flex;align-items:center;flex-direction:row;gap:8px;font-size:13px;color:var(--login-text)}
.operations-login .login-remember input{appearance:auto;width:16px;height:16px;margin:0;padding:0;accent-color:var(--login-accent)}
.operations-login .login-help{font:inherit;font-size:13px;padding:4px 0;min-height:32px;background:none;border:0;border-radius:0;color:var(--login-accent);text-decoration:underline;text-underline-offset:3px}
.operations-login .login-submit,.operations-login .login-demo{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;gap:8px;padding:10px 16px;font:inherit;font-weight:600;letter-spacing:0;border:1px solid var(--login-accent);border-radius:4px;box-shadow:none;background:var(--login-accent);color:var(--login-on-accent)}
.operations-login .login-demo{background:transparent;color:var(--login-accent);border-color:var(--login-soft-line);font-weight:400}
.operations-login .login-submit:hover:not(:disabled){background:var(--login-accent-hover);border-color:var(--login-accent-hover)}
.operations-login .login-submit:active:not(:disabled){background:var(--login-accent-press);border-color:var(--login-accent-press)}
.operations-login .login-demo:hover:not(:disabled){background:var(--login-accent-bg);border-color:var(--login-accent-line);color:var(--login-accent)}
.operations-login .login-demo:active:not(:disabled){background:var(--login-accent-bg-hover)}
.operations-login .login-submit:disabled,.operations-login .login-demo:disabled{opacity:.65;cursor:wait}
.operations-login :is(button,input[type="checkbox"]):focus-visible{outline:2px solid var(--login-accent);outline-offset:3px}
.operations-login .login-error{display:flex;align-items:flex-start;gap:8px;font-size:13px;color:var(--login-error);background:none;padding:0;border:0;margin:0 0 16px}
.operations-login .login-error svg{width:16px;height:16px;flex:none;margin-top:3px}
.operations-login .login-demo-entry{border-top:1px solid var(--login-soft-line);padding-top:20px;margin-top:24px}
.operations-login .login-demo-entry p{font-size:12px;line-height:1.7;margin:12px 0 0;color:var(--login-muted)}
.operations-login .login-footer{font-size:12px;text-align:center;color:var(--login-muted);padding:0;width:min(100%,420px)}
@media(max-width:480px){.operations-login{justify-content:flex-start;padding:32px 20px;gap:24px}.operations-login .login-main{padding:24px 20px}.operations-login .login-brand h1{font-size:21px}}

.hardware-console-host:not([hidden]){margin:0 24px 100px 216px;width:calc(100% - 240px);scroll-margin-top:90px}
.design-app.nav-collapsed~.hardware-console-host:not([hidden]){margin-left:96px;width:calc(100% - 120px)}
@media(max-width:900px){.hardware-console-host:not([hidden]){margin-left:96px;width:calc(100% - 120px)}}
@media(max-width:600px){.hardware-console-host:not([hidden]),.design-app.nav-collapsed~.hardware-console-host:not([hidden]){margin-left:84px;margin-right:12px;width:calc(100% - 96px)}}

.hardware-collection-summary{position:static;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;width:100%;max-width:100%;margin:0 0 16px;padding:12px 16px;border:1px solid var(--ops-accent,#58e1d3);border-radius:8px;background:var(--ops-surface,#16212a);color:var(--ops-text,#e0eaf0);box-shadow:0 8px 28px #0004;font-size:14px;line-height:1.6}
.hardware-collection-summary>div{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.hardware-collection-summary>div+div{margin-top:0}.hardware-collection-summary span{font-size:12px;color:var(--ops-muted,#a7b9c6)}.hardware-collection-summary button{min-height:36px;padding:6px 12px;font:inherit;background:var(--ops-raised,#1d2c37);color:inherit;border:1px solid var(--ops-line,#3a4d5a);border-radius:6px}.hardware-collection-summary button:focus-visible{outline:3px solid var(--ops-accent,#58e1d3);outline-offset:3px}.hardware-collection-summary button:disabled{opacity:.6;cursor:not-allowed}
</style>
