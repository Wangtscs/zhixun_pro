import { clearSession, currentUser, tokenKey } from '../auth'
import { createRouter, createWebHistory } from 'vue-router'
const routes = ['login','overview','nodes','orders','audit','settings','alarms','patrol','handbooks','notifications','statistics','users','rules','areas','simulator'].map(path=>({path:'/'+path,component:{template:'<div />'}}))
const router=createRouter({scrollBehavior:(_to,_from,saved)=>saved||{top:0,left:0},history:createWebHistory(import.meta.env.BASE_URL),routes:[{path:'/',redirect:'/login'},...routes,{path:'/:pathMatch(.*)*',redirect:'/overview'}]})
router.beforeEach(async to => {
 if(sessionStorage.getItem('nephh-demo'))return to.path==='/login'?'/overview':true
 if (!sessionStorage.getItem(tokenKey)) return to.path === '/login' ? true : '/login'
 try { await currentUser(); return to.path === '/login' ? '/overview' : true }
 catch { clearSession(); return to.path === '/login' ? true : '/login' }
})
export default router
