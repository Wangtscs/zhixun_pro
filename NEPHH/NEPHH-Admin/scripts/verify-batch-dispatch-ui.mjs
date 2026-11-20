import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { configuration, verifyIsolation, openBrowser, isolateHardware, collapseHardware, loginPage, apiClient } from './ui-verification.mjs'

const config = configuration({ authenticated: true, writes: true })
if (config) {
  await verifyIsolation(config)
  const api = await apiClient(config)
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const users = [], orders = [], errors = []
  let browser, page, shared, areas
  try {
    areas = (await api('/areas')).slice(0, 2)
    assert.equal(areas.length, 2, 'Batch verification needs two isolated seed areas')
    const nodes = await api('/nodes')
    const targets = areas.map(area => nodes.find(node => node.area_id === area.id && node.enabled))
    assert.ok(targets.every(Boolean), 'Both test areas need enabled nodes')
    async function updateUser(user, allowed) {
      await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled: true, areas: allowed, displayName: user.displayName })
    }
    async function createUser(label, allowed) {
      const displayName = `T05-${suffix}-${label}`
      const user = await api('/users', 'POST', { username: `t05-${suffix}-${label}`, password: randomBytes(18).toString('base64url') + '7a', role: 'INSPECTOR', displayName })
      const fixture = { ...user, displayName, allowed }
      users.push(fixture)
      await updateUser(fixture, allowed)
      return fixture
    }
    const onlyA = await createUser('only-a', [areas[0].id])
    const onlyB = await createUser('only-b', [areas[1].id])
    shared = await createUser('shared', areas.map(area => area.id))
    async function createPair(label) {
      const prefix = `隔离T05-${suffix}-${label}`
      const pair = []
      for (let index = 0; index < 2; index++) {
        const order = await api('/orders', 'POST', { nodeId: targets[index].id, title: prefix + '-' + index, priority: 'MEDIUM' })
        orders.push(order); pair.push(order)
      }
      return { prefix, pair }
    }
    const successful = await createPair('success')
    const rollback = await createPair('rollback')
    browser = await openBrowser(config)
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    page.on('pageerror', error => errors.push(error.message))
    await isolateHardware(page)
    await loginPage(page, config)
    async function openBatch(prefix) {
      await collapseHardware(page)
      await page.locator('.work-sidebar').getByRole('button', { name: '工单管理', exact: true }).click()
      await page.getByLabel('全局搜索', { exact: true }).fill(prefix)
      await page.locator('tbody tr').first().waitFor()
      assert.equal(await page.locator('tbody tr').count(), 2)
      await page.getByRole('checkbox', { name: '选择全部工单', exact: true }).check()
      await page.getByRole('button', { name: '批量指派', exact: true }).click()
      const drawer = page.locator('.d-assign-drawer')
      await drawer.getByRole('heading', { name: '批量指派 2 个工单', exact: true }).waitFor()
      return drawer
    }
    let drawer = await openBatch(successful.prefix)
    const candidates = drawer.locator('.d-person-card')
    assert.equal(await candidates.filter({ hasText: onlyA.displayName }).count(), 0)
    assert.equal(await candidates.filter({ hasText: onlyB.displayName }).count(), 0)
    await candidates.filter({ hasText: shared.displayName }).click()
    await drawer.getByRole('button', { name: '确认派单（1人）', exact: true }).click()
    await drawer.waitFor({ state: 'hidden' })
    for (const order of successful.pair) {
      const result = await api('/orders/' + order.id)
      assert.equal(result.status, 'ASSIGNED'); assert.equal(result.assignee_id, shared.id)
    }
    drawer = await openBatch(rollback.prefix)
    await drawer.locator('.d-person-card').filter({ hasText: shared.displayName }).click()
    await drawer.getByRole('textbox', { name: '派单备注', exact: true }).fill('失败后必须保留的批量备注')
    // Change real server authorization after the browser has selected the shared candidate.
    await updateUser(shared, [areas[0].id])
    const denied = page.waitForResponse(response => response.url().endsWith('/orders/batch-assign') && response.request().method() === 'POST')
    await drawer.getByRole('button', { name: '确认派单（1人）', exact: true }).click()
    assert.ok(!(await denied).ok(), 'The server must reject revoked cross-area authorization')
    await drawer.getByText('执行人未分配该区域', { exact: true }).waitFor()
    assert.equal(await drawer.locator('.d-person-chips').getByRole('button').count(), 1)
    assert.equal(await drawer.getByRole('textbox', { name: '派单备注', exact: true }).inputValue(), '失败后必须保留的批量备注')
    assert.equal(await page.locator('.d-success-toast').count(), 0, 'Failed dispatch must not report success')
    for (const order of rollback.pair) {
      const result = await api('/orders/' + order.id)
      assert.equal(result.status, 'DRAFT', 'The whole batch must roll back')
      assert.ok(result.events.every(event => event.action !== 'ASSIGN'), 'Rolled-back orders must have no dispatch event')
    }
    await updateUser(shared, areas.map(area => area.id))
    const conflictMessage = '隔离验证：工单状态已变化'
    await page.route('**/api/business/orders/batch-assign', route => route.fulfill({ status: 409, json: { code: 409, message: conflictMessage } }), { times: 1 })
    await drawer.getByRole('button', { name: '确认派单（1人）', exact: true }).click()
    await drawer.getByText(conflictMessage, { exact: true }).waitFor()
    assert.equal(await drawer.locator('.d-person-chips').getByRole('button').count(), 1)
    assert.equal(await drawer.getByRole('textbox', { name: '派单备注', exact: true }).inputValue(), '失败后必须保留的批量备注')
    assert.equal(await page.locator('.d-success-toast').count(), 0)
    await updateUser(shared, [areas[0].id])
    await page.reload()
    await page.getByRole('heading', { name: '工单管理', exact: true, level: 1 }).waitFor()
    drawer = await openBatch(rollback.prefix)
    await drawer.getByText('本批工单没有共同授权的巡检员，请按区域拆批派发。', { exact: true }).waitFor()
    assert.equal(await drawer.locator('.d-person-card').count(), 0)
    assert.equal(await drawer.getByRole('button', { name: '确认派单（0人）', exact: true }).isDisabled(), true)
    await page.screenshot({ path: join(config.output, 'batch-no-common-worker.png'), fullPage: true })
    assert.deepEqual(errors, [])
    console.log(JSON.stringify({ passed: true, twoAreaBatchAssigned: true, singleAreaWorkersExcluded: true, authorizationChangeRejected: true, atomicRollback: true, conflictRetainsDraft: true, noCommonWorkerBlocked: true, pageErrors: 0 }))
  } catch (error) {
    if (page) await page.screenshot({ path: join(config.output, 'batch-dispatch-failure.png'), fullPage: true })
    throw error
  } finally {
    const cleanup = []
    for (const order of orders) {
      try { await api('/orders/' + order.id + '/action', 'POST', { action: 'cancel', note: '隔离T05批量验证清理' }) }
      catch { cleanup.push('Could not close isolated batch order') }
    }
    for (const user of users) {
      try { await api('/users/' + user.id, 'PUT', { role: 'INSPECTOR', enabled: false, areas: user.allowed, displayName: '隔离T05验证账号（已停用）' }) }
      catch { cleanup.push('Could not disable isolated batch account') }
    }
    await browser?.close()
    if (cleanup.length) throw new Error(cleanup.join('; '))
  }
}
