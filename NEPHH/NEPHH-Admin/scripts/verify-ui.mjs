import assert from 'node:assert/strict'
import { join } from 'node:path'
import { configuration, verifyIsolation, openBrowser, isolateHardware, loginPage } from './ui-verification.mjs'

const config = configuration({ authenticated: true })
if (config) {
  await verifyIsolation(config)
  const browser = await openBrowser(config)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], writes = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => {
    const url = new URL(request.url())
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method()) && url.pathname !== '/api/auth/login') writes.push(url.pathname)
  })
  await isolateHardware(page)
  try {
    await loginPage(page, config)
    await page.screenshot({ path: join(config.output, 'authenticated-overview.png'), fullPage: true })
    const pages = [['nodes', '节点管理'], ['alarms', '告警中心'], ['orders', '工单管理'], ['patrol', '巡检计划'], ['handbooks', '处置手册'], ['notifications', '消息通知'], ['statistics', '报表'], ['users', '用户权限'], ['audit', '审计日志'], ['settings', '个人设置']]
    for (const [route, title] of pages) {
      await page.goto(config.ui + '/' + route)
      await page.getByRole('heading', { name: title, exact: true, level: 1 }).waitFor()
      await page.locator('.work-sidebar:not([inert])').waitFor()
    }
    await page.locator('.work-sidebar').getByRole('button', { name: '节点管理', exact: true }).click()
    const view = page.getByRole('row').filter({ has: page.getByRole('button', { name: '查看', exact: true }) }).first()
    await view.getByRole('button', { name: '查看', exact: true }).click()
    await page.getByRole('button', { name: '关闭节点详情', exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭节点详情', exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(config.output, 'authenticated-narrow.png'), fullPage: true })
    assert.deepEqual(writes, [], 'Read-only page verification must not write business data')
    assert.deepEqual(errors, [], 'Pages must not throw browser errors')
    console.log(JSON.stringify({ passed: true, pages: pages.length + 1, nodeDetailOpened: true, businessWrites: writes.length, pageErrors: errors.length }))
  } catch (error) {
    await page.screenshot({ path: join(config.output, 'authenticated-failure.png'), fullPage: true })
    throw error
  } finally { await browser.close() }
}
