import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
let server, demoRequest
before(async()=>{server=await createServer({configFile:false,root:process.cwd(),cacheDir:'node_modules/.cache/alarm-detail-tests',server:{middlewareMode:true,hmr:false},appType:'custom'});({demoRequest}=await server.ssrLoadModule('/src/demo.ts'))})
after(async()=>{await server?.close()})
test('opening alarm details preserves acknowledgement and links only explicit alarm IDs',async()=>{
 const before=await demoRequest('/alarms')
 const detail=await demoRequest('/alarms/3')
 assert.equal(detail.alarm.id,3);assert.equal(detail.node.id,detail.alarm.node_id)
 assert.equal(detail.state.acknowledged,false);assert.equal(detail.state.active,true)
 assert.equal(detail.ruleContext,'CURRENT_CONFIGURATION_NOT_TRIGGER_SNAPSHOT')
 assert.equal(detail.currentRule.metric,'methane');assert.deepEqual(detail.relatedOrders.items,[])
 assert.deepEqual(await demoRequest('/alarms'),before)
 const created=await demoRequest('/orders','POST',{nodeId:detail.node.id,alarmId:3,title:'test',priority:'HIGH'})
 const linked=await demoRequest('/alarms/3');assert.equal(linked.relatedOrders.items[0].id,created.id)
 assert.equal((await demoRequest('/alarms/2')).relatedOrders.items.length,0)
 await assert.rejects(demoRequest('/alarms/99999'),error=>error.status===404)
})
