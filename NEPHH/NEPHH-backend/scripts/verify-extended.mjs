const base=process.env.API_BASE||'http://localhost:18081/api',suffix=Date.now();
async function login(username,password){const r=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const j=await r.json();if(!r.ok)throw new Error(j.message);return j.data.accessToken}
const admin=await login('admin','123456789012');
async function api(path,method='GET',body,token=admin,expected=200){const r=await fetch(base+'/business'+path,{method,headers:{Authorization:'Bearer '+token,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const j=await r.json();if(r.status!==expected)throw new Error(`${method} ${path}: ${r.status} ${j.message}`);return j.data}
const assert=(condition,message)=>{if(!condition)throw new Error(message)};
const password='Extended123456789',workers=[];let plan;
try{
 const corridor=await api('/corridors','POST',{name:'验证管廊'+suffix,description:'自动化功能验证'});
 await api(`/corridors/${corridor.id}`,'PUT',{name:'验证管廊'+suffix,description:'已更新'});
 await api('/areas','POST',{name:'扩展验证'+suffix,corridorId:corridor.id});const area=(await api('/areas')).find(a=>a.name==='扩展验证'+suffix);
 await api(`/areas/${area.id}`,'PUT',{name:area.name,corridorId:corridor.id,description:'已更新'});
 await api('/sections','POST',{areaId:area.id,name:'检查区段'});const section=(await api('/sections?areaId='+area.id))[0];
 await api(`/sections/${section.id}`,'PUT',{name:'检查区段-更新'});
 for(const [i,role] of ['INSPECTOR','INSPECTOR','MANAGER'].entries()){
  const username=`extended-${suffix}-${i}`,u=await api('/users','POST',{username,password,role});
  await api('/users/'+u.id,'PUT',{role,enabled:true,areas:[area.id],displayName:'扩展验证'+role});workers.push({...u,username,role,token:await login(username,password)});
 }
 const [worker,outsider,manager]=workers;
 const node=await api('/nodes','POST',{code:'EXT-'+suffix,areaId:area.id,location:'检查点位',externalId:'RESERVED-'+suffix,platform:'SIMULATOR'});
 await api('/nodes/'+node.id,'PUT',{location:'更新位置',enabled:true,maintenance:false,reportSeconds:30,ownerId:worker.id,sectionId:section.id,metrics:'methane,temperature',x:30,y:40});
 await api(`/nodes/${node.id}/simulate`,'POST',{scenario:'normal'});
 const visible=await api('/nodes','GET',undefined,worker.token);assert(visible.length===1&&visible[0].owner_id===worker.id,'Node scope/owner failed');
 const other=(await api('/nodes')).find(n=>n.area_id!==area.id);if(other)await api(`/nodes/${other.id}/history`,'GET',undefined,worker.token,403);
 await api('/users','POST',{username:'forbidden',password,role:'ADMIN'},manager.token,403);
 await api(`/nodes/${node.id}/telemetry`,'POST',{messageId:'unconfigured',source:'SIMULATOR',collectedAt:new Date().toISOString(),values:{humidity:60}},admin,400);
 await api('/handbooks','POST',{title:'验证手册'+suffix,category:'检查',steps:'1.查看记录\n2.填写反馈',source:'软件验证'});
 const book=(await api('/handbooks')).find(b=>b.title==='验证手册'+suffix);await api('/handbooks/'+book.id,'PUT',{title:book.title,category:'检查',steps:'检查并记录',reviewPoints:'核对结果',source:'人工维护'});await api('/handbooks/'+book.id,'DELETE');
 const order=await api('/orders','POST',{nodeId:node.id,title:'扩展验证工单'+suffix,priority:'LOW'});
 await api(`/orders/${order.id}/assign`,'POST',{assigneeId:worker.id,priority:'LOW',note:'测试逾期提醒',dueAt:new Date(Date.now()+3000).toISOString()});
 await api(`/orders/${order.id}/schedule`,'POST',{priority:'MEDIUM',dueAt:new Date(Date.now()+3000).toISOString(),note:'调整期限但保持状态'});assert((await api('/orders/'+order.id)).status==='ASSIGNED','Schedule update reset workflow');
 await api('/orders/'+order.id,'GET',undefined,outsider.token,403);
 await api('/reports?type=orders','GET',undefined,worker.token,403);
 await api('/statistics?areaId='+other.area_id,'GET',undefined,manager.token,403);
 const report=await api('/reports?type=orders&areaId='+area.id,'GET',undefined,manager.token);assert(report.some(r=>r.id===order.id),'Scoped report missing order');
 const stats=await api('/statistics?areaId='+area.id,'GET',undefined,manager.token);assert(stats.orders.reduce((s,r)=>s+Number(r.total),0)===1,'Statistics count wrong');
 plan=await api('/patrol/plans','POST',{name:'自动计划验证'+suffix,areaId:area.id,assigneeId:worker.id,periodHours:24,points:[{nodeId:node.id,checkItems:'读取数据并拍照'}]});
 console.log('Waiting for scheduled patrol and overdue notification (maximum 45s)');let run,messages;
 const until=Date.now()+45000;while(Date.now()<until){run=(await api('/patrol/runs','GET',undefined,worker.token)).find(r=>r.plan_id===plan.id);messages=await api('/notifications','GET',undefined,worker.token);if(run&&messages.some(m=>m.title==='工单逾期'&&m.object_id===order.id))break;await new Promise(r=>setTimeout(r,1000))}
 assert(run,'Scheduled patrol did not run');assert(messages.some(m=>m.title==='工单逾期'&&m.object_id===order.id),'Overdue notification missing');
 const detail=await api('/patrol/runs/'+run.id,'GET',undefined,worker.token),point=detail.points[0];
 const data=new FormData();data.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aoyoAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'巡检照片.png');
 await api(`/patrol/results/${point.id}/attachments`,'POST',data,worker.token);
 const updated=await api('/patrol/runs/'+run.id,'GET',undefined,worker.token);assert(updated.points[0].attachments.length===1,'Patrol attachment not listed');
 const photo=await fetch(base+'/business/patrol/attachments/'+updated.points[0].attachments[0].id,{headers:{Authorization:'Bearer '+manager.token}});assert(photo.ok,'Patrol photo inaccessible');
 await api(`/patrol/results/${point.id}`,'POST',{result:'发现异常，转工单处理',abnormal:true},worker.token);
 const finished=await api('/patrol/runs/'+run.id);assert(finished.status==='COMPLETED'&&finished.points[0].order_id,'Abnormal patrol did not create order');
 const scopedAudit=await api('/audit','GET',undefined,manager.token);assert(scopedAudit.length>0&&scopedAudit.every(r=>r.area_id===area.id||r.actor_id===manager.id),'Audit area scope failed');
 const coverage=await api('/statistics?areaId='+area.id);assert(Number(coverage.coverage.checked)===1,'Patrol coverage wrong');
 await api(`/users/${worker.id}/password`,'POST',{password:'Changed123456789'});await login(worker.username,'Changed123456789');
 const unread=messages.find(m=>!m.is_read);if(unread){await api(`/notifications/${unread.id}/read`,'POST',undefined,worker.token);assert((await api('/notifications','GET',undefined,worker.token)).find(m=>m.id===unread.id).is_read,'Read state not persisted')}
 console.log(JSON.stringify({passed:true,corridors:true,nodeOwnership:true,areaPermissions:true,handbooks:true,scheduledPatrol:true,overdueNotice:true,patrolPhotos:true,abnormalToOrder:true,scopedReports:true,passwordReset:true}));
}finally{
 if(plan)await api(`/patrol/plans/${plan.id}/enabled`,'POST',{enabled:false});
 for(const u of workers)await api('/users/'+u.id,'PUT',{role:u.role,enabled:false,areas:[],displayName:'扩展验证账号（已停用）'});
}
