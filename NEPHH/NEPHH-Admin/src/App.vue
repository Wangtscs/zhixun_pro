<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Workspace from './components/Workspace.vue'
import HardwareLive from './components/HardwareLive.vue'
import Icon from './components/Icon.vue'
import BrandMark from './components/BrandMark.vue'
import { api, tokenKey, clearSession } from './auth'
import './style.css'
import './design.css'
import './light-theme.css'
import './operations-theme.css'
const route=useRoute(),router=useRouter()
const account=ref(localStorage.getItem('nephh-remembered-account')||''),password=ref(''),remember=ref(true),showPassword=ref(false),loginError=ref(''),loading=ref(false),toast=ref('')
watch(()=>route.path,path=>{if(path==='/login'){loginError.value='';password.value='';showPassword.value=false}})
const pending=computed(()=>loading.value||(import.meta.env.DEV&&route.query.state==='loading'))
function notify(message:string){toast.value=message;setTimeout(()=>toast.value='',3200)}
async function login(){
 if(pending.value)return
 loginError.value=''
 if(!account.value.trim()||!password.value){loginError.value='请输入账号和密码';return}
 loading.value=true
 try{sessionStorage.removeItem('nephh-demo');const result=await api<{accessToken:string}>('/auth/login',{username:account.value.trim(),password:password.value});sessionStorage.setItem(tokenKey,result.accessToken);if(remember.value)localStorage.setItem('nephh-remembered-account',account.value.trim());else localStorage.removeItem('nephh-remembered-account');password.value='';await router.push('/overview')}
 catch(error){loginError.value=error instanceof Error?error.message:'登录失败，请稍后重试'}
 finally{loading.value=false}
}
function enterDemo(){clearSession();sessionStorage.setItem('nephh-demo','1');router.push('/overview')}
</script>
<template>
<div v-if="route.path==='/login'" class="login-page design-login">
 <section class="login-art"><div class="brand"><BrandMark boxed/><div><h1>智巡 · 管廊</h1><p>城市地下综合管廊 AI 巡检管理平台</p></div></div><div class="login-blueprint" aria-hidden="true"><div class="blueprint-halo"></div><div v-for="i in 4" :key="i" class="blueprint-floor" :style="{'--floor':i}"><i v-for="j in 5" :key="j" :style="{'--beam':j}"></i></div><div class="blueprint-wall left"></div><div class="blueprint-wall right"></div></div><small>version v2.6.0</small></section>
 <section class="login-side"><form class="login-form" @submit.prevent="login"><span class="eyebrow">WELCOME BACK</span><h2>管理员登录</h2><p>请使用企业账号登录</p><label>账号<div class="login-input"><Icon name="user"/><input v-model="account" autocomplete="username" placeholder="工号或邮箱" :aria-invalid="!!loginError"/></div></label><label>密码<div class="login-input"><Icon name="orders"/><input v-model="password" :type="showPassword?'text':'password'" autocomplete="current-password" placeholder="请输入登录密码" :aria-invalid="!!loginError"/><button type="button" :aria-label="showPassword?'隐藏密码':'显示密码'" @click="showPassword=!showPassword"><Icon :name="showPassword?'eye-off':'eye'"/></button></div></label><div class="between"><label class="inline"><input v-model="remember" type="checkbox"/>记住账号</label><button type="button" class="text-button" @click="notify('请联系管理员重置密码')">忘记密码</button></div><p v-if="loginError" class="login-error" role="alert"><Icon name="warning"/>{{loginError}}</p><button class="primary wide login-submit" :disabled="pending"><span v-if="pending" class="spinner"></span>{{pending?'登录中…':'登录'}}</button><div class="divider">或</div><button type="button" class="wide login-demo" :disabled="pending" @click="enterDemo"><Icon name="sparkles"/>预览平台</button><small>预览模式不写入业务数据库，设备上报请先登录</small></form><footer>用户协议 <span>·</span> 隐私政策</footer></section>
</div>
<Workspace v-else/><HardwareLive v-show="route.path!=='/login'"/><div v-if="toast" class="toast">{{toast}}</div>
</template>
