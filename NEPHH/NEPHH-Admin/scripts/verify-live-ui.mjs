import { chromium } from 'playwright'
import assert from 'node:assert/strict'

// Isolated API fixtures: this regression never writes to the business database.
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
let value = 24, requests = 0, failNodes = false
const node = () => ({ id: 1, code: 'LIVE-01', location: '实时验证节点', area_id: 1, area_name: 'A区', enabled: true, maintenance: false, report_seconds: 30, last_seen: new Date().toISOString(), metrics: 'temperature,humidity', active_alarms: 0, latest: [{metric:'temperature',metric_value:value,unit:'°C'}, {metric:'humidity',metric_value:60,unit:'%RH'}] })
await page.addInitScript(() => sessionStorage.setItem('nephh-access-token', 'isolated-test'))
await page.route('**/api/**', async route => {
 const path = new URL(route.request().url()).pathname.replace('/api/business', '')
 let data = []
 if (path === '/api/auth/me') data = { subject:'1', username:'admin' }
 if (path === '/identity') data = { id:1, username:'admin', role:'ADMIN' }
 if (path === '/profile') data = {username:'admin',displayName:'admin',idleMinutes:30,preferences:{}}
 if (path === '/areas') data = [{id:1,name:'A区'}]
 if (path === '/nodes') {requests++;if(failNodes)return route.fulfill({status:503,json:{code:503,message:'测试连接中断'}});data=[node()]}
 if (path.startsWith('/statistics')) data = {}
 await route.fulfill({json:{code:0,message:'success',data}})
})
await page.route('**/hardware-bridge/**', route => route.fulfill({json:{application:'nephh-usb-bridge',fresh:false}}))
try {
 await page.goto(process.env.UI_BASE || 'http://127.0.0.1:5175/nodes')
 const row=page.getByRole('row').filter({hasText:'LIVE-01'})
 await row.waitFor()
 value=31.7
 await page.waitForFunction(() => document.querySelector('tbody')?.textContent?.includes('31.7'), null, {timeout:7000})
 assert.ok(requests>=2)
 await row.getByRole('button',{name:'查看'}).click()
 value=32.8
 await page.waitForFunction(() => document.querySelector('.d-node-metrics')?.textContent?.includes('32.8'), null, {timeout:7000})
 await page.getByRole('button',{name:'设备配置'}).click()
 await page.getByLabel('位置',{exact:true}).fill('尚未保存的位置')
 value=33.9
 await page.waitForFunction(() => document.querySelector('tbody')?.textContent?.includes('33.9'), null, {timeout:7000})
 assert.equal(await page.getByLabel('位置',{exact:true}).inputValue(),'尚未保存的位置')
 await page.locator('.form-layer').getByRole('button',{name:'关闭',exact:true}).click()
 await page.getByRole('button',{name:'关闭节点详情'}).click()
 failNodes=true
 await page.getByText('实时更新中断：测试连接中断').waitFor({timeout:7000})
 failNodes=false;value=34.6
 await page.waitForFunction(() => document.querySelector('tbody')?.textContent?.includes('34.6'), null, {timeout:7000})
 assert.equal(await page.getByText('实时更新中断：测试连接中断').count(),0)
 // A committed hardware frame should trigger a request without reloading the page.
 const nextRequest=page.waitForRequest(r=>r.url().endsWith('/api/business/nodes'))
 await page.evaluate(()=>window.dispatchEvent(new Event('nephh:telemetry-saved')))
 await nextRequest
 const panel=page.locator('.hardware-live'), title=page.locator('.hardware-title')
 const before=await panel.boundingBox(), handle=await title.boundingBox()
 await page.mouse.move(handle.x+100,handle.y+15)
 await page.mouse.down();await page.mouse.move(handle.x-180,handle.y-200,{steps:12});await page.mouse.up()
 const after=await panel.boundingBox()
 assert.ok(after.x<before.x-100 && after.y<before.y-100,'Panel must move when dragged')
 assert.ok(await page.locator('.hardware-body').isVisible(),'Dragging must not collapse the panel')
 await page.setViewportSize({width:600,height:700})
 await page.waitForTimeout(150)
 const resized=await panel.boundingBox()
 assert.ok(resized.x>=0 && resized.y>=0 && resized.x+resized.width<=601,'Panel remains inside resized viewport')
 await title.click()
 assert.equal(await page.locator('.hardware-body').count(),0,'Click still collapses panel')
 assert.deepEqual(errors,[])
 console.log('PASS: automatic node/list/detail refresh, preserved edits, disconnect recovery, hardware commit event, draggable panel, resize bounds, click collapse; no page errors')
} finally {await browser.close()}
