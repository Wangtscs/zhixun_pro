import { chromium } from 'playwright';
const base='http://127.0.0.1:5174',suffix=Date.now();
async function login(username,password){const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const j=await r.json();if(!r.ok)throw new Error(j.message);return j.data.accessToken}
const admin=await login('admin','123456789012');
async function api(path,method='GET',body,token=admin){const r=await fetch(base+'/api/business'+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:body===undefined?undefined:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.message);return j.data}
const area=(await api('/areas'))[0],node=(await api('/nodes')).find(n=>n.area_id===area.id);
const username='ui-'+suffix,password='Verify123456789';
const user=await api('/users','POST',{username,password,role:'INSPECTOR',displayName:'页面验证巡检员'});
await api('/users/'+user.id,'PUT',{role:'INSPECTOR',enabled:true,areas:[area.id],displayName:'页面验证巡检员'});
const order=await api('/orders','POST',{nodeId:node.id,title:'页面验证工单 '+suffix,priority:'MEDIUM'});
await api(`/orders/${order.id}/assign`,'POST',{assigneeId:user.id,priority:'MEDIUM',note:'浏览器验证'});
const browser=await chromium.launch({channel:'msedge',headless:true});
const worker=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];worker.on('pageerror',e=>errors.push(e.message));
async function uiLogin(page,name,pass){await page.goto(base+'/login');await page.getByPlaceholder('请输入用户名').fill(name);await page.getByPlaceholder('请输入登录密码').fill(pass);await page.getByRole('button',{name:'登 录',exact:true}).click();await page.locator('.work-sidebar:not([inert])').waitFor()}
async function action(page,name){await page.locator('.work-dialog.wide').getByRole('button',{name,exact:true}).click();await page.locator('.form-layer').getByRole('button',{name:'确认保存',exact:true}).click();await page.locator('.form-layer').waitFor({state:'hidden'})}
try{
 await uiLogin(worker,username,password);
 if(await worker.locator('.work-sidebar').getByRole('button',{name:'用户权限',exact:true}).count())throw new Error('Inspector sees admin controls');
 await worker.locator('.work-sidebar').getByRole('button',{name:'我的工单',exact:true}).click();
 await worker.getByRole('row').filter({hasText:'页面验证工单 '+suffix}).getByRole('button',{name:'查看',exact:true}).click();
 await action(worker,'接单');await action(worker,'开始处理');
 const uploaded=worker.waitForResponse(r=>r.url().endsWith(`/orders/${order.id}/attachments`)&&r.request().method()==='POST');
 await worker.locator('input[type=file]').setInputFiles({name:'现场照片.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aoyoAAAAASUVORK5CYII=','base64')});
 const response=await uploaded;if(!response.ok())throw new Error('Attachment upload failed');
 await worker.locator('.work-dialog.wide').getByRole('button',{name:'提交处理结果',exact:true}).click();
 await worker.getByLabel('处理结果',{exact:true}).fill('已完成现场检查，照片及读数已上传');
 await worker.getByLabel('现场读数',{exact:true}).fill('甲烷12 %LEL，温度25 °C');
 await worker.locator('.form-layer').getByRole('button',{name:'确认保存',exact:true}).click();await worker.locator('.form-layer').waitFor({state:'hidden'});
 const manager=await browser.newPage();manager.on('pageerror',e=>errors.push(e.message));await uiLogin(manager,'admin','123456789012');
 await manager.locator('.work-sidebar').getByRole('button',{name:'工单管理',exact:true}).click();
 await manager.getByRole('row').filter({hasText:'页面验证工单 '+suffix}).getByRole('button',{name:'查看',exact:true}).click();await action(manager,'复核通过');
 const detail=await api('/orders/'+order.id);if(detail.status!=='COMPLETED'||detail.attachments.length!==1)throw new Error('Final order evidence missing');
 const image=await fetch(base+`/api/business/attachments/${detail.attachments[0].id}`,{headers:{Authorization:'Bearer '+admin}});if(!image.ok||!image.headers.get('content-type')?.startsWith('image/'))throw new Error('Image download failed');
 await worker.reload();await worker.locator('.work-sidebar').waitFor();
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({passed:true,orderId:order.id,photoUploaded:true,reviewed:true,reloadPassed:true,pageErrors:0}));
}catch(e){console.log('WORKER',await worker.locator('body').innerText());throw e}finally{await api('/users/'+user.id,'PUT',{role:'INSPECTOR',enabled:false,areas:[area.id],displayName:'页面验证账号（已停用）'});await browser.close()}
