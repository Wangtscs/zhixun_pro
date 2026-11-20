import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { configuration, verifyIsolation, openBrowser, isolateHardware, collapseHardware, loginPage, apiClient } from './ui-verification.mjs'

const config = configuration({ authenticated: true, writes: true })
if (config) {
  await verifyIsolation(config)
  const api = await apiClient(config)
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const username = 'ui-' + suffix, password = randomBytes(18).toString('base64url') + '7a'
  const displayName = '隔离UI巡检-' + suffix, title = '隔离UI工单-' + suffix
  let user, area, order, browser
  const errors = [], cleanupErrors = []
  try {
    area = (await api('/areas'))[0]
    const node = (await api('/nodes')).find(row => row.area_id === area?.id && row.enabled)
    assert.ok(area && node, 'Isolated service needs an enabled seeded node and area')
    user = await api('/users', 'POST', { username, password, role: 'INSPECTOR', displayName })
    await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled: true, areas: [area.id], displayName })
    order = await api('/orders', 'POST', { nodeId: node.id, title, priority: 'MEDIUM', description: '隔离UI验证，不是真实现场事件' })
    browser = await openBrowser(config)
    const manager = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    const worker = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const page of [manager, worker]) { page.on('pageerror', error => errors.push(error.message)); await isolateHardware(page) }
    async function openOrder(page, label) {
      await collapseHardware(page)
      await page.locator('.work-sidebar').getByRole('button', { name: label, exact: true }).click()
      await page.getByLabel('全局搜索', { exact: true }).fill(title)
      const row = page.locator('tbody tr').first()
      await row.waitFor()
      await row.getByRole('button').first().click()
      await page.getByRole('heading', { name: title, exact: true }).waitFor()
    }
    async function action(page, label) {
      await page.getByRole('button', { name: label, exact: true }).click()
      await page.locator('.form-layer').getByRole('heading', { name: '工单操作', exact: true }).waitFor()
      await page.locator('.form-layer').getByRole('button', { name: '确认保存', exact: true }).click()
      await page.locator('.form-layer').waitFor({ state: 'hidden' })
    }
    await loginPage(manager, config)
    await openOrder(manager, '工单管理')
    await manager.getByRole('button', { name: '派发/改派', exact: true }).click()
    const drawer = manager.locator('.d-assign-drawer')
    await drawer.getByRole('button').filter({ hasText: displayName }).click()
    await drawer.getByRole('button', { name: '确认派单（1人）', exact: true }).click()
    await drawer.waitFor({ state: 'hidden' })
    assert.equal((await api('/orders/' + order.id)).status, 'ASSIGNED')
    await loginPage(worker, config, username, password)
    assert.equal(await worker.getByRole('button', { name: '新建用户', exact: true }).count(), 0)
    await openOrder(worker, '我的工单')
    await action(worker, '接单')
    await action(worker, '开始处理')
    const uploaded = worker.waitForResponse(response => response.url().endsWith(`/orders/${order.id}/attachments`) && response.request().method() === 'POST')
    await worker.locator('input[type=file]').setInputFiles({ name: 'isolated-evidence.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aoyoAAAAASUVORK5CYII=', 'base64') })
    assert.ok((await uploaded).ok(), 'Evidence upload must succeed')
    await worker.getByRole('button', { name: '提交处理结果', exact: true }).click()
    await worker.getByLabel('处理结果', { exact: true }).fill('已完成隔离环境流程验证；不是实际处置记录')
    await worker.getByLabel('现场读数', { exact: true }).fill('测试输入：温度25 °C，非实测')
    await worker.locator('.form-layer').getByRole('button', { name: '确认保存', exact: true }).click()
    await worker.locator('.form-layer').waitFor({ state: 'hidden' })
    assert.equal((await api('/orders/' + order.id)).status, 'REVIEW')
    await manager.reload()
    await openOrder(manager, '工单管理')
    await action(manager, '复核通过')
    const detail = await api('/orders/' + order.id)
    assert.equal(detail.status, 'COMPLETED')
    assert.equal(detail.attachments.length, 1)
    assert.ok(detail.events.some(event => event.action === 'APPROVE'))
    await worker.reload()
    await openOrder(worker, '我的工单')
    await worker.getByText('已完成', { exact: true }).first().waitFor()
    await worker.screenshot({ path: join(config.output, 'workflow-completed.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ passed: true, orderId: order.id, assignedThroughUI: true, accepted: true, started: true, evidenceUploaded: true, submitted: true, approved: true, workerReloaded: true, pageErrors: 0 }))
  } finally {
    if (order) {
      try {
        const current = await api('/orders/' + order.id)
        if (!['COMPLETED', 'CANCELLED'].includes(current.status)) await api('/orders/' + order.id + '/action', 'POST', { action: 'cancel', note: '隔离UI验证清理' })
      } catch { cleanupErrors.push('Failed to close isolated test order') }
    }
    if (user) {
      try { await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled: false, areas: area ? [area.id] : [], displayName: '隔离UI验证账号（已停用）' }) }
      catch { cleanupErrors.push('Failed to disable isolated test account') }
    }
    await browser?.close()
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
}
