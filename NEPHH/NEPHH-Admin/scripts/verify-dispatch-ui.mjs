import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { configuration, verifyIsolation, openBrowser, isolateHardware, loginPage, apiClient } from './ui-verification.mjs'

const config = configuration({ authenticated: true, writes: true })
if (config) {
  await verifyIsolation(config)
  const api = await apiClient(config)
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const created = [], errors = []
  let browser, order, page
  try {
    const areas = await api('/areas')
    assert.ok(areas.length >= 2, 'Dispatch verification needs two isolated seed areas')
    const node = (await api('/nodes')).find(row => row.area_id === areas[0].id && row.enabled)
    assert.ok(node, 'Dispatch verification needs an enabled node')
    async function createWorker(label, areaId, enabled = true) {
      const displayName = `T04-${suffix}-${label}`
      const user = await api('/users', 'POST', { username: `t04-${suffix}-${label}`, password: randomBytes(18).toString('base64url') + '7a', role: 'INSPECTOR', displayName })
      created.push({ ...user, areaId, displayName })
      await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled, areas: [areaId], displayName })
      return { ...user, displayName }
    }
    const authorized = []
    for (let index = 1; index <= 11; index++) authorized.push(await createWorker(String(index).padStart(2, '0'), areas[0].id))
    const outside = await createWorker('outside', areas[1].id)
    const disabled = await createWorker('disabled', areas[0].id, false)
    order = await api('/orders', 'POST', { nodeId: node.id, title: '隔离T04派单-' + suffix, priority: 'MEDIUM' })
    browser = await openBrowser(config)
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.on('pageerror', error => errors.push(error.message))
    await isolateHardware(page)
    await loginPage(page, config)
    await page.locator('.work-sidebar').getByRole('button', { name: '工单管理', exact: true }).click()
    await page.getByLabel('全局搜索', { exact: true }).fill('隔离T04派单-' + suffix)
    await page.locator('tbody tr').getByRole('button', { name: '派单', exact: true }).click()
    const drawer = page.locator('.d-assign-drawer')
    const candidates = drawer.locator('.d-person-card')
    assert.ok(await candidates.count() >= 11, 'Authorized candidates must not stop after ten')
    assert.equal(await candidates.filter({ hasText: outside.displayName }).count(), 0, 'Cross-area workers must not be selectable')
    assert.equal(await candidates.filter({ hasText: disabled.displayName }).count(), 0, 'Disabled workers must not be selectable')
    const target = authorized[10]
    await drawer.getByRole('textbox', { name: '搜索巡检员', exact: true }).fill(target.displayName)
    assert.equal(await candidates.count(), 1, 'Searching a later candidate must return that eligible worker')
    await candidates.filter({ hasText: target.displayName }).click()
    await drawer.getByRole('button', { name: '确认派单（1人）', exact: true }).click()
    await drawer.waitFor({ state: 'hidden' })
    const assigned = await api('/orders/' + order.id)
    assert.equal(assigned.status, 'ASSIGNED')
    assert.equal(assigned.assignee_id, target.id)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: join(config.output, 'dispatch-eleventh-assigned.png'), fullPage: true })
    console.log(JSON.stringify({ passed: true, eligibleFixtures: authorized.length, searchedEleventh: true, crossAreaHidden: true, disabledHidden: true, assignedThroughUI: true, pageErrors: 0 }))
  } catch (error) {
    if (page) await page.screenshot({ path: join(config.output, 'dispatch-failure.png'), fullPage: true })
    throw error
  } finally {
    const cleanup = []
    if (order) {
      try { await api('/orders/' + order.id + '/action', 'POST', { action: 'cancel', note: '隔离T04验证清理' }) }
      catch { cleanup.push('Could not close isolated dispatch order') }
    }
    for (const user of created) {
      try { await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled: false, areas: [user.areaId], displayName: '隔离T04验证账号（已停用）' }) }
      catch { cleanup.push('Could not disable isolated dispatch account') }
    }
    await browser?.close()
    if (cleanup.length) throw new Error(cleanup.join('; '))
  }
}
