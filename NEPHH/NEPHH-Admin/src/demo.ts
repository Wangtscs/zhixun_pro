import { demoWave } from './demo-wave'
// A separate in-memory demonstration: never sends mutations to the real backend.
type Row=Record<string,any>
const now=()=>new Date().toISOString()
const areas=[{id:1,name:'A区',description:'北段管廊',corridor_id:1},{id:2,name:'B区',description:'中段管廊',corridor_id:1},{id:3,name:'C区',description:'南段管廊',corridor_id:1}]
const nodes:Row[]=[
 ['TN-A01',1,'北入口',96,12,25.4,63],['TN-A02',1,'1号舱',92,18,26.8,66],['TN-A03',1,'2号舱',94,16,25.6,62],['TN-A04',1,'南出口',98,9,24.1,58],
 ['TN-B01',2,'北入口',91,14,26.7,65],['TN-B02',2,'检修舱',94,8,23.9,56],['TN-B03',2,'中央舱',57,43,31.8,79],['TN-B04',2,'电力舱',89,17,27.2,64],['TN-C01',3,'北入口',96,10,24.4,61],['TN-C02',3,'综合舱',90,15,25.9,68],['TN-B05',2,'南出口',95,11,24.8,59],['TN-C03',3,'南出口',62,0,0,0]
].map((r,i)=>({id:i+1,code:r[0],area_id:r[1],area_name:areas[Number(r[1])-1]!.name,location:r[2],health:r[3],reportAgeSeconds:[0,18,32,74,8,21,0,46,14,39,74,1080][i],enabled:true,maintenance:false,report_seconds:30,metrics:'methane,temperature,humidity,infrared',external_id:'DEMO-'+r[0],platform:'SIMULATOR',x_position:15+(i%4)*23,y_position:40,last_seen:r[0]==='TN-C03'?new Date(Date.now()-1080000).toISOString():now(),active_alarms:i===6?1:0,latest:['methane','temperature','humidity','infrared'].map((metric,j)=>({id:i*4+j,metric,metric_value:j===3?Number(r[5])+2:r[j+4],unit:metric==='methane'?'%LEL':metric==='humidity'?'%RH':'°C',collected_at:now(),source:'SIMULATOR'}))}))
const demoBaselines=new Map(nodes.map(n=>[n.id,Object.fromEntries(n.latest.map((r:Row)=>[r.metric,Number(r.metric_value)]))]))
const users:Row[]=['陈默','张伟','李强','赵敏','王磊','刘洋'].map((name,i)=>({id:i+1,username:name,display_name:name,role_code:i?'INSPECTOR':'MANAGER',enabled:i!==5,areas:[1,2,3]}))
let orders:Row[]=[
 [31,3,'HIGH','DRAFT',null,0],[30,2,'HIGH','ASSIGNED',2,30],[29,2,'MEDIUM','PROCESSING',2,120],[28,9,'MEDIUM','ASSIGNED',3,-5],[24,5,'MEDIUM','PROCESSING',5,240],[18,4,'LOW','REVIEW',4,1200],[16,10,'LOW','DRAFT',null,360]
].map(r=>({id:r[0],number:'WO-250514-'+String(r[0]).padStart(3,'0'),node_id:r[1],node_code:nodes[Number(r[1])-1]!.code,title:nodes[Number(r[1])-1]!.code+' 风险处置工单',priority:r[2],status:r[3],assignee_id:r[4],assignee_name:r[4]?users[Number(r[4])-1]!.username:null,participant_ids:r[4]?[r[4]]:[],due_at:new Date(Date.now()+Number(r[5])*60000).toISOString(),created_at:new Date(Date.now()-3600000).toISOString(),description:'检查现场读数与设备状态，完成处理后上传记录。',events:[{id:1,username:'系统',action:'CREATE',note:'系统自动检测并创建工单',created_at:new Date(Date.now()-3600000).toISOString()}],attachments:[]}))
for(const order of orders){
 const reached=order.status==='REVIEW'?['ASSIGN','ACCEPT','START','SUBMIT']:order.status==='PROCESSING'?['ASSIGN','ACCEPT','START']:order.status==='ASSIGNED'?['ASSIGN']:[]
 order.events.push(...reached.map((action,i)=>({id:i+2,username:action==='ASSIGN'?'\u9648\u9ed8':order.assignee_name||'\u5de1\u68c0\u5458',action,note:({ASSIGN:'\u5df2\u6307\u6d3e\u5de1\u68c0\u4eba\u5458',ACCEPT:'\u5df2\u63a5\u6536\u5de5\u5355',START:'\u5df2\u5f00\u59cb\u73b0\u573a\u5904\u7f6e',SUBMIT:'\u5df2\u4e0a\u4f20\u5904\u7f6e\u8bb0\u5f55'} as Row)[action],created_at:new Date(Date.now()-(42-i*8)*60000).toISOString()})))
}
let alarms:Row[]=[{id:1,eventOnly:true,node_id:2,code:'TN-A02',metric:'task',severity:'MEDIUM',reason:'例行巡检任务将在30分钟后开始',status:'OPEN',triggered_at:new Date(Date.now()-300000).toISOString(),recovered_at:null},{id:2,eventOnly:true,node_id:4,code:'TN-A04',metric:'humidity',severity:'MEDIUM',reason:'湿度基线存在偏离',status:'OPEN',triggered_at:new Date(Date.now()-1080000).toISOString(),recovered_at:null},{id:3,node_id:7,code:'TN-B03',metric:'methane',severity:'HIGH',reason:'甲烷浓度超过预警阈值',status:'OPEN',triggered_at:new Date(Date.now()-180000).toISOString(),recovered_at:null}]
let audits:Row[]=Array.from({length:10},(_,i)=>({id:10-i,actor_id:1,actor_name:i===1?'系统':i===3?'张伟':'陈默',action:['ASSIGN','UPDATE_SCHEDULE','UPDATE','ACCEPT','START','ASSIGN','CREATE','ACKNOWLEDGE','UPDATE','UPDATE'][i],object_type:i===2?'RULE':'ORDER',object_id:String(i===2?'TN-A03':31-i),before_value:i===2?'40 %LEL':'未分配',after_value:i===2?'35 %LEL':'张伟 · 14:38',created_at:new Date(Date.now()-i*60000).toISOString()}))
alarms.push({id:4,node_id:12,code:'TN-C03',metric:'offline',severity:'MEDIUM',reason:'节点心跳中断，请检查网络',status:'OPEN',triggered_at:new Date(Date.now()-1080000).toISOString(),recovered_at:null},{id:5,eventOnly:true,node_id:10,code:'TN-C02',metric:'temperature',severity:'MEDIUM',reason:'综合舱温度接近预警阈值',status:'OPEN',triggered_at:new Date(Date.now()-1560000).toISOString(),recovered_at:null},{id:6,eventOnly:true,node_id:6,code:'TN-B02',metric:'maintenance',severity:'MEDIUM',reason:'检修舱温度波动，需持续关注',status:'OPEN',triggered_at:new Date(Date.now()-540000).toISOString(),recovered_at:null})
const identity={id:1,username:'陈默',displayName:'陈默',role:'MANAGER',areas:[{area_id:1},{area_id:2},{area_id:3}]}
const notices:Row[]=alarms.slice(0,2).map(a=>({id:a.id,title:a.code+' 节点动态',content:a.reason,object_type:'ALARM',object_id:a.id,is_read:false,created_at:a.triggered_at}))
const rules:Row[]=areas.flatMap(a=>[{area_id:a.id,metric:'methane',threshold_value:35,duration_seconds:0,severity:'HIGH',enabled:true},{area_id:a.id,metric:'temperature',threshold_value:32,duration_seconds:0,severity:'HIGH',enabled:true},{area_id:a.id,metric:'humidity',threshold_value:80,duration_seconds:0,severity:'MEDIUM',enabled:true}])
let profile:Row={displayName:'陈默',username:'ZX0001',role:'MANAGER',areaId:3,phone:'13800006721',email:'chenmo@zhixun.cn',preferences:{sound:true,desktop:true,criticalOnly:false,quietStart:'22:00',quietEnd:'07:00'},idleMinutes:30}
const clones=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
export async function demoRequest(path:string,method='GET',body?:any):Promise<any>{
 const url=new URL(path,'http://demo'),p=url.pathname
 if(method==='GET'){
 if(p==='/identity')return clones(identity)
 if(p==='/profile')return clones(profile)
 if(p==='/sessions')return [{id:'current',browser:'Chrome',platform:'Windows',location:'上海市',ip:'127.0.0.1',lastSeen:now(),current:true},{id:'phone',browser:'Safari',platform:'iPhone 15',location:'上海市',ip:'移动网络',lastSeen:new Date(Date.now()-7200000).toISOString(),current:false},{id:'edge',browser:'Edge',platform:'Windows',location:'上海市',ip:'172.18.2.44',lastSeen:new Date(Date.now()-86400000).toISOString(),current:false}].filter(s=>!revoked.includes(s.id))
 if(p==='/corridors')return [{id:1,name:'示范管廊'}]
 if(p==='/areas')return clones(areas)
 if(p==='/nodes'){const time=Math.floor(Date.now()/2000)*2000;for(const n of nodes){if(n.code==='TN-C03')continue;n.last_seen=new Date(time).toISOString();for(const r of n.latest){r.metric_value=demoWave(demoBaselines.get(n.id)![r.metric],n.id,r.metric,time);r.collected_at=new Date(time).toISOString()}}return clones(nodes)}
 if(p==='/users')return clones(users)
 if(p==='/orders')return clones(orders)
 if(/^\/orders\/\d+$/.test(p))return clones(orders.find(o=>o.id===Number(p.split('/')[2])))
 if(p.includes('/history')){const id=Number(p.split('/')[2]),n=nodes.find(n=>n.id===id);if(!n||n.code==='TN-C03')return [];const metric=url.searchParams.get('metric')||'all',metrics=metric==='all'?['methane','temperature','humidity']:[metric];const end=url.searchParams.get('to')?Date.parse(url.searchParams.get('to')!):Math.floor(Date.now()/2000)*2000;const start=url.searchParams.get('from')?Date.parse(url.searchParams.get('from')!):end-Number(url.searchParams.get('hours')||24)*3600000;return metrics.flatMap(key=>Array.from({length:96},(_,i)=>{const time=start+i/95*(end-start);return {id:i,metric:key,metric_value:demoWave(demoBaselines.get(id)![key]||0,id,key,time),unit:key==='methane'?'%LEL':key==='humidity'?'%RH':'°C',source:'SIMULATOR',collected_at:new Date(time).toISOString(),node_id:id}})).sort((a,b)=>b.collected_at.localeCompare(a.collected_at))}
 if(p==='/alarms')return clones(alarms)
 if(p==='/notifications')return clones(notices)
 if(p==='/rules')return clones(rules.filter(r=>r.area_id===Number(url.searchParams.get('areaId'))))
 if(p==='/audit')return clones(audits)
 if(p==='/handbooks')return []
 if(p==='/patrol/runs'||p==='/patrol/plans')return []
 if(p==='/statistics')return {orders:['DRAFT','ASSIGNED','PROCESSING','REVIEW'].map(status=>({status,total:orders.filter(o=>o.status===status).length})),alarms:[{severity:'HIGH',total:1},{severity:'MEDIUM',total:2}],overdue:1,alarmRecovery:{total:39,recovered:36},monthlyAlarms:38,averageResponseSeconds:384,overviewAverageResponseSeconds:480,coverage:{checked:121,total:125},repeatNodes:[{code:'TN-A03',total:12},{code:'TN-A02',total:8},{code:'TN-B01',total:5},{code:'TN-C02',total:3}],weekly:[42,55,48,72,64,82,77,89,69,74,92,85]}
 if(p==='/reports')return clones(url.searchParams.get('type')==='alarms'?alarms:orders)
 }
 if(p==='/orders/batch-assign'){for(const id of body.orderIds)await demoRequest('/orders/'+id+'/assign','POST',body);return null}
 if(p==='/profile'){profile={...profile,...body};return clones(profile)}
 if(p==='/sessions/revoke-others'){revoked.push('phone','edge');return null}
 if(p.startsWith('/sessions/')){revoked.push(p.split('/')[2]!);return null}
 if(p==='/profile/password')return null
 if(p==='/orders'&&method==='POST'){const id=Date.now();orders.unshift({id,number:'WO-DEMO-'+id,node_id:body.nodeId,node_code:nodes.find(n=>n.id===body.nodeId)?.code,title:body.title,priority:body.priority,status:'DRAFT',events:[],attachments:[],created_at:now()});return {id}}
 const match=p.match(/^\/orders\/(\d+)\/(assign|schedule|action)$/)
 if(match){const o=orders.find(o=>o.id===Number(match[1]))!;if(match[2]==='assign'){o.assignee_id=body.assigneeId;o.participant_ids=[...(body.participantIds||[body.assigneeId])];o.assignee_name=o.participant_ids.map((id:number)=>users.find(u=>u.id===id)?.username).join('、');o.status='ASSIGNED'}if(body.priority)o.priority=body.priority;if(body.dueAt)o.due_at=body.dueAt;if(match[2]==='action')o.status=({accept:'ACCEPTED',start:'PROCESSING',submit:'REVIEW',approve:'COMPLETED',reject:'PROCESSING',cancel:'CANCELLED'} as Row)[body.action]||o.status;o.events.push({id:Date.now(),username:'陈默',action:match[2]==='action'?body.action.toUpperCase():match[2]!.toUpperCase(),note:body.note||'',created_at:now()});return null}
 if(p==='/rules'){const r=rules.find(r=>r.area_id===Number(body.areaId)&&r.metric===body.metric);if(r)Object.assign(r,{threshold_value:body.threshold,duration_seconds:body.durationSeconds,enabled:body.enabled});return null}
 if(p.startsWith('/notifications/')){const n=notices.find(n=>n.id===Number(p.split('/')[2]));if(n)n.is_read=true;return null}
 if(p.startsWith('/alarms/')){const a=alarms.find(a=>a.id===Number(p.split('/')[2]));if(a)a.status='ACKNOWLEDGED';return null}
 throw new Error('此操作需登录账号；预览模式不能修改业务数据库')
}
const revoked:string[]=[]
