import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createWorkbenchPreviewReader, workbenchPreviewTarget, workbenchRecordId } from '../src/workbench-preview.ts'

const target = (id=1, kind='order', areaId=7) => ({id,kind,areaId})
const order = (id=1, area_id=7) => ({id,area_id,events:[]})
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b}); return {promise,resolve,reject} }

test('uses stable record IDs and rejects ambiguous IDs, queues and mismatched area',()=>{
  assert.deepEqual(workbenchPreviewTarget('urgentAlarms',{id:52,node_id:9,area_id:7},'7'),target(52,'alarm'))
  assert.equal(workbenchPreviewTarget('unknown',{id:1}),null)
  for(const id of [0,-1,1.2,'1e2',' 1','01',Number.MAX_SAFE_INTEGER+1]) assert.equal(workbenchRecordId(id),null)
  assert.equal(workbenchPreviewTarget('review',{id:1,area_id:8},'7'),null)
  assert.equal(workbenchPreviewTarget('review',{id:1,area_id:7},'bad'),null)
})
test('reads each stable existing detail path without writes',async()=>{
  const paths=[]
  const reader=createWorkbenchPreviewReader({context:()=>'',read:async path=>{paths.push(path);return path.startsWith('/alarms')?{alarm:{id:1,node_id:9},node:{id:9,area_id:7},state:{active:true,recovered:false,acknowledged:false},relatedOrders:{items:[]}}:path.startsWith('/patrol')?{id:1,area_id:7,points:[]}:order()}})
  for(const kind of ['order','alarm','patrol']) assert.equal((await reader.load(target(1,kind))).kind,'ready')
  assert.deepEqual(paths,['/orders/1','/alarms/1','/patrol/runs/1'])
})
test('refuses wrong record, wrong area and incomplete response',async()=>{
  for(const response of [order(2),order(1,8),{id:1,area_id:7},null]){
    const reader=createWorkbenchPreviewReader({context:()=>'',read:async()=>response})
    assert.equal((await reader.load(target())).kind,'failed')
  }
})
test('later selection wins over delayed successful and failed responses',async()=>{
  for(const fail of [false,true]){
    const pending=deferred()
    const reader=createWorkbenchPreviewReader({context:()=>'',read:path=>path==='/orders/1'?pending.promise:Promise.resolve(order(2))})
    const first=reader.load(target())
    assert.equal((await reader.load(target(2))).kind,'ready')
    if(fail)pending.reject(Object.assign(new Error('forbidden'),{status:403}));else pending.resolve(order())
    assert.equal((await first).kind,'discarded')
  }
})
test('account, area and readonly scope changes discard pending details',async()=>{
  for(const newContext of ['account-b|7|false','account-a|8|false','account-a|7|true']){
    let context='account-a|7|false'; const pending=deferred()
    const reader=createWorkbenchPreviewReader({context:()=>context,read:()=>pending.promise})
    const result=reader.load(target());context=newContext;pending.resolve(order())
    assert.equal((await result).kind,'discarded')
  }
})
test('explicit clearing and unmount discard pending requests and prevent disposed reads',async()=>{
  for(const action of ['invalidate','dispose']){
    const pending=deferred();let reads=0
    const reader=createWorkbenchPreviewReader({context:()=>'',read:()=>{reads++;return pending.promise}})
    const result=reader.load(target());reader[action]();pending.resolve(order())
    assert.equal((await result).kind,'discarded')
    if(action==='dispose'){assert.equal((await reader.load(target())).kind,'discarded');assert.equal(reads,1)}
  }
})
test('403 and 404 remain explicit failures with no automatic retry',async()=>{
  for(const status of [403,404]){
    let reads=0
    const reader=createWorkbenchPreviewReader({context:()=>'',read:async()=>{reads++;throw Object.assign(new Error('detail unavailable'),{status})}})
    assert.deepEqual(await reader.load(target()),{kind:'failed',message:'detail unavailable',status})
    assert.equal(reads,1)
  }
})
