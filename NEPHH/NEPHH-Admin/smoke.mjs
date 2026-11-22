import assert from 'node:assert/strict'
import { join } from 'node:path'
import { configuration, openBrowser, isolateHardware, collapseHardware } from './scripts/ui-verification.mjs'

const config = configuration()
if (config) {
  const browser = await openBrowser(config)
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = [], businessRequests = []
  page.on('pageerror', error => errors.push(error.message))
  await isolateHardware(page)
  await page.route(url => url.pathname.startsWith('/api/'), route => { businessRequests.push(route.request().url()); return route.abort('blockedbyclient') })
  try {
    await page.goto(config.ui)
    await page.getByRole('heading', { name: '管理员登录', exact: true }).waitFor()
    await collapseHardware(page)
    await page.getByRole('button', { name: '预览平台', exact: true }).click()
    await page.waitForURL('**/overview')
    await page.getByRole('heading', { name: '总览', exact: true, level: 1 }).waitFor()
    await page.screenshot({ path: join(config.output, 'demo-overview.png'), fullPage: true })
    await page.locator('.work-sidebar').getByRole('button', { name: '节点管理', exact: true }).click()
    await page.getByPlaceholder('搜索节点编号或位置', { exact: true }).fill('TN-A01')
    const row = page.getByRole('row').filter({ hasText: 'TN-A01' })
    await row.waitFor()
    assert.equal(await page.locator('tbody tr').count(), 1, 'Node search must narrow the visible rows')
    await row.getByRole('button', { name: '查看', exact: true }).click()
    await page.getByRole('heading', { name: 'TN-A01', exact: true }).waitFor()
    await page.getByRole('button', { name: '关闭节点详情', exact: true }).click()
    await page.locator('.work-sidebar').getByRole('button', { name: '工单管理', exact: true }).click()
    await page.getByRole('heading', { name: '工单管理', exact: true, level: 1 }).waitFor()
    await page.locator('.work-sidebar').getByRole('button', { name: '个人设置', exact: true }).click()
    await page.getByRole('heading', { name: '个人设置', exact: true, level: 1 }).waitFor()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: join(config.output, 'demo-narrow.png'), fullPage: true })
    assert.deepEqual(errors, [])
    assert.deepEqual(businessRequests, [], 'Demo must not depend on the business API')
    console.log(JSON.stringify({ passed: true, checks: ['demo entry', 'overview', 'node search', 'node detail', 'orders', 'settings'], businessRequests: 0, pageErrors: 0 }))
  } catch (error) {
    await page.screenshot({ path: join(config.output, 'demo-failure.png'), fullPage: true })
    throw error
  } finally { await browser.close() }
}
