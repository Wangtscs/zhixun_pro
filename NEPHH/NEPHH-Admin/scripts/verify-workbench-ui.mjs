import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from '@playwright/test'
import { configuration, verifyIsolation, openBrowser, isolateHardware, loginPage, apiClient } from './ui-verification.mjs'

// Test-only credentials may be loaded from TEMP; never log or persist their values in artifacts.
if (!process.argv.includes('--help') && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
  const path = process.env.VERIFICATION_CREDENTIAL_FILE || join(tmpdir(), 'zhixun-verification-credentials.json')
  const credentials = JSON.parse(await readFile(path, 'utf8'))
  if (!process.env.ADMIN_USERNAME && typeof credentials.ADMIN_USERNAME === 'string') process.env.ADMIN_USERNAME = credentials.ADMIN_USERNAME
  if (!process.env.ADMIN_PASSWORD && typeof credentials.ADMIN_PASSWORD === 'string') process.env.ADMIN_PASSWORD = credentials.ADMIN_PASSWORD
}

const config = configuration({ authenticated: true, writes: true })
if (config) {
  await verifyIsolation(config)
  const api = await apiClient(config)
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const createdUsers = [], createdOrders = [], cleanupErrors = [], pageErrors = []
  const labels = { urgentAlarms: '紧急告警', unassigned: '待派单', review: '待复核', overdue: '逾期工单', patrol: '巡检待办', assigned: '待接单', processing: '处理中' }
  const scenarioEvidence = { realService: [], controlledRouteFixtures: [] }
  let browser, lastPage

  async function send(path, token, { expectedStatus = 200, method = 'GET', body } = {}) {
    const response = await fetch(config.api + path, { method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${method} ${path.split('?')[0]}`)
    const payload = await response.json()
    if (expectedStatus === 200) assert.equal(payload.code, 0)
    return payload.data
  }

  async function account(label, role, areas) {
    const username = `t10-${suffix}-${label}`, password = randomBytes(18).toString('base64url') + '7a'
    const user = await api('/users', 'POST', { username, password, role, displayName: `隔离T10-${label}` })
    const fixture = { id: user.id, username, password, role, areas }
    createdUsers.push(fixture)
    await api('/users/' + user.id, 'PUT', { role, enabled: true, areas, displayName: `隔离T10-${label}` })
    const session = await send('/auth/login', undefined, { method: 'POST', body: { username, password } })
    assert.ok(session?.accessToken)
    return { ...fixture, token: session.accessToken }
  }

  async function createOrder(nodeId, label) {
    const title = `隔离T10-${suffix}-${label}`
    const result = await api('/orders', 'POST', { nodeId, title, priority: 'MEDIUM', description: '隔离工作台验证；不是现场工单' })
    const order = { id: result.id, title }
    createdOrders.push(order)
    return order
  }

  const panel = page => page.locator('.workbench')
  const card = (page, key) => panel(page).locator('.workbench__cards button').filter({ hasText: new RegExp('^' + labels[key]) })

  async function selectArea(page, areaId) {
    await page.getByLabel('业务区域', { exact: true }).selectOption(String(areaId))
  }

  async function assertCounts(page, expected) {
    await expect(panel(page)).toBeVisible()
    for (const [key, total] of Object.entries(expected.counts)) {
      await expect(card(page, key).locator('strong')).toHaveText(String(total))
    }
  }

  async function assertQueue(page, expected) {
    await assertCounts(page, expected)
    await expect(panel(page).locator('.workbench__queue > header > span')).toHaveText(`共 ${expected.queue.total} 项`)
    await expect(panel(page).locator('.workbench__items > li')).toHaveCount(expected.queue.items.length)
    const actualTitles = await panel(page).locator('.workbench__items h4').allTextContents()
    const expectedTitles = expected.queue.items.map(item => item.title || item.name || item.reason)
    assert.deepEqual(actualTitles, expectedTitles)
    const next = panel(page).getByRole('button', { name: '下一页', exact: true })
    if (expected.queue.hasMore) await expect(next).toBeEnabled()
    else await expect(next).toBeDisabled()
  }

  async function userPage(user = null) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    lastPage = page
    page.on('pageerror', error => pageErrors.push(error.message))
    await isolateHardware(page)
    await loginPage(page, config, user?.username || config.username, user?.password || config.password)
    await expect(panel(page)).toBeVisible()
    return page
  }

  async function overview(page) {
    await page.goto(config.ui + '/overview')
    await expect(panel(page)).toBeVisible()
  }

  try {
    // Guard before fixture creation: do not mutate an API that has not deployed the workbench contract.
    const probe = await api('/workbench?queue=unassigned&limit=1&offset=0')
    assert.ok(probe?.scope && probe?.counts && probe?.queue, 'Deploy the workbench API before running this script')
    const areaNames = [`隔离T10-${suffix}-A`, `隔离T10-${suffix}-B`]
    for (const name of areaNames) await api('/areas', 'POST', { name, description: '工作台独立验收区域' })
    const allAreas = await api('/areas')
    const [areaA, areaB] = areaNames.map(name => allAreas.find(row => row.name === name))
    assert.ok(areaA && areaB)
    const nodeA = await api('/nodes', 'POST', { areaId: areaA.id, code: `T10-${suffix}-A`, location: '独立验收A点' })
    const nodeB = await api('/nodes', 'POST', { areaId: areaB.id, code: `T10-${suffix}-B`, location: '独立验收B点' })
    const manager = await account('manager', 'MANAGER', [areaA.id])
    const worker = await account('worker', 'INSPECTOR', [areaA.id])
    const other = await account('other', 'INSPECTOR', [areaA.id])
    const outside = await account('outside', 'INSPECTOR', [areaB.id])
    for (let index = 1; index <= 22; index++) await createOrder(nodeA.id, `A-draft-${String(index).padStart(2, '0')}`)
    for (let index = 1; index <= 2; index++) await createOrder(nodeB.id, `B-draft-${index}`)
    const own = await createOrder(nodeA.id, 'A-worker-assigned')
    const shared = await createOrder(nodeA.id, 'A-worker-participant')
    const unrelated = await createOrder(nodeA.id, 'A-other-assigned')
    const external = await createOrder(nodeB.id, 'B-outside-assigned')
    for (const [order, primary, participants] of [[own, worker, [worker.id]], [shared, other, [other.id, worker.id]], [unrelated, other, [other.id]], [external, outside, [outside.id]]]) {
      await api(`/orders/${order.id}/assign`, 'POST', { assigneeId: primary.id, participantIds: participants, priority: 'MEDIUM', note: '隔离T10队列夹具' })
    }

    browser = await openBrowser(config)
    const managerPage = await userPage(manager)
    await selectArea(managerPage, areaA.id)
    const management = await send(`/business/workbench?areaId=${areaA.id}&queue=unassigned&limit=20&offset=0`, manager.token)
    assert.equal(management.queue.total, 22)
    await assertQueue(managerPage, management)
    const firstIds = management.queue.items.map(item => item.id)
    await panel(managerPage).getByRole('button', { name: '下一页', exact: true }).click()
    const second = await send(`/business/workbench?areaId=${areaA.id}&queue=unassigned&limit=20&offset=20`, manager.token)
    await assertQueue(managerPage, second)
    assert.equal(second.queue.items.length, 2)
    assert.ok(second.queue.items.every(item => !firstIds.includes(item.id)))
    const target = second.queue.items[0]
    await panel(managerPage).locator('.workbench__items > li').filter({ hasText: target.title }).getByRole('button').click()
    await expect(managerPage.locator('.d-order-summary h2')).toHaveText(target.title)
    const detail = await send('/business/orders/' + target.id, manager.token)
    assert.equal(detail.id, target.id)
    await managerPage.screenshot({ path: join(config.output, 'workbench-real-manager-page-two-detail.png'), fullPage: true })
    await send(`/business/workbench?areaId=${areaB.id}&queue=unassigned`, manager.token, { expectedStatus: 403 })
    scenarioEvidence.realService.push('manager exact counts', 'second page stable IDs and real detail', 'manager cross-area rejection')

    const workerPage = await userPage(worker)
    await selectArea(workerPage, areaA.id)
    const personal = await send(`/business/workbench?areaId=${areaA.id}&queue=assigned&limit=20&offset=0`, worker.token)
    assert.equal(personal.scope.personal, true)
    assert.deepEqual(personal.queue.items.map(item => item.id).sort((a, b) => a - b), [own.id, shared.id].sort((a, b) => a - b))
    await assertQueue(workerPage, personal)
    await expect(card(workerPage, 'unassigned')).toHaveCount(0)
    await expect(card(workerPage, 'review')).toHaveCount(0)
    await send(`/business/workbench?areaId=${areaA.id}&queue=review`, worker.token, { expectedStatus: 403 })
    await send('/business/orders/' + unrelated.id, worker.token, { expectedStatus: 403 })
    await send('/business/orders/' + external.id, worker.token, { expectedStatus: 403 })
    for (const id of [own.id, shared.id]) await send('/business/orders/' + id, worker.token)
    scenarioEvidence.realService.push('worker primary and participant scope', 'management queues forbidden to worker', 'unrelated and cross-area detail rejection')

    const adminPage = await userPage()
    await selectArea(adminPage, areaA.id)
    await expect(card(adminPage, 'unassigned').locator('strong')).toHaveText('22')
    await selectArea(adminPage, areaB.id)
    await expect(card(adminPage, 'unassigned').locator('strong')).toHaveText('2')
    await expect(panel(adminPage).locator('.workbench__items h4')).toHaveText([
      `隔离T10-${suffix}-B-draft-1`, `隔离T10-${suffix}-B-draft-2`
    ])
    await adminPage.getByRole('button', { name: '用户菜单', exact: true }).click()
    await adminPage.getByRole('button', { name: '切换角色', exact: true }).click()
    await adminPage.locator('.d-role-list').getByRole('button', { name: '只读', exact: true }).click()
    await expect(panel(adminPage).locator('.workbench__meta')).toContainText('只读查看')
    await panel(adminPage).locator('.workbench__items > li').first().getByRole('button').click()
    await expect(adminPage.locator('.d-order-summary')).toBeVisible()
    for (const name of ['调整优先级/期限', '派发/改派', '接单', '开始处理', '提交处理结果', '复核通过', '退回重做', '取消工单']) {
      await expect(adminPage.getByRole('button', { name, exact: true })).toHaveCount(0)
    }
    scenarioEvidence.realService.push('area switch uses selected area only', 'readonly detail has no write controls')

    // The following are deliberate browser route fixtures, not failures or data from the real API.
    const fixturePage = await userPage(manager)
    await selectArea(fixturePage, areaA.id)
    await expect(card(fixturePage, 'unassigned').locator('strong')).toHaveText('22')
    const matcher = url => new URL(url).pathname === '/api/business/workbench'
    await fixturePage.route(matcher, route => route.fulfill({ status: 503, json: { code: 503, message: 'T10受控失败夹具', data: null } }))
    await panel(fixturePage).getByRole('button', { name: '刷新待办', exact: true }).click()
    await expect(panel(fixturePage).locator('.workbench__error')).toContainText('刷新失败，快照已过期')
    await expect(card(fixturePage, 'unassigned').locator('strong')).toHaveText('22')
    await expect(panel(fixturePage).locator('.workbench__snapshot')).toContainText('历史快照，非当前实时状态')
    await fixturePage.unroute(matcher)
    await panel(fixturePage).getByRole('button', { name: '刷新待办', exact: true }).click()
    await expect(panel(fixturePage).locator('.workbench__error')).toHaveCount(0)
    scenarioEvidence.controlledRouteFixtures.push('503 retains snapshot with explicit stale warning')

    await fixturePage.route(matcher, route => {
      const query = new URL(route.request().url()).searchParams
      const counts = Object.fromEntries(['urgentAlarms', 'unassigned', 'review', 'overdue', 'patrol'].map(key => [key, 0]))
      return route.fulfill({ status: 200, json: { code: 0, message: 'T10受控空队列夹具', data: {
        scope: { role: 'MANAGER', areaId: areaA.id, areaIds: [areaA.id], personal: false }, serverTime: new Date().toISOString(), counts,
        queue: { key: query.get('queue'), total: 0, items: [], hasMore: false, limit: Number(query.get('limit')), offset: Number(query.get('offset')) }
      } } })
    })
    await panel(fixturePage).getByRole('button', { name: '刷新待办', exact: true }).click()
    await expect(panel(fixturePage).locator('.workbench__empty')).toHaveText('当前范围暂无此类待办。')
    await expect(card(fixturePage, 'unassigned').locator('strong')).toHaveText('0')
    await fixturePage.unroute(matcher)
    scenarioEvidence.controlledRouteFixtures.push('explicit valid empty queue')

    await fixturePage.route(matcher, route => route.fulfill({ status: 403, json: { code: 403, message: 'T10受控授权撤销夹具', data: null } }))
    await panel(fixturePage).getByRole('button', { name: '刷新待办', exact: true }).click()
    await expect(panel(fixturePage).locator('.workbench__error')).toContainText('访问受限')
    await expect(panel(fixturePage).locator('.workbench__items > li')).toHaveCount(0)
    await expect(card(fixturePage, 'unassigned').locator('strong')).toHaveText('—')
    await fixturePage.unroute(matcher)
    scenarioEvidence.controlledRouteFixtures.push('403 clears previous scope snapshot')

    const racePage = await userPage()
    await selectArea(racePage, areaA.id)
    await expect(card(racePage, 'unassigned').locator('strong')).toHaveText('22')
    const oldSnapshot = await api(`/workbench?areaId=${areaA.id}&queue=unassigned&limit=20&offset=0`)
    let release, started
    const releaseGate = new Promise(resolve => { release = resolve })
    const startedGate = new Promise(resolve => { started = resolve })
    await racePage.route(matcher, async route => {
      if (new URL(route.request().url()).searchParams.get('areaId') !== String(areaA.id)) return route.continue()
      started()
      await releaseGate
      await route.fulfill({ status: 200, json: { code: 0, message: 'T10受控延迟旧响应夹具', data: oldSnapshot } })
    })
    await panel(racePage).getByRole('button', { name: '刷新待办', exact: true }).click()
    let startedTimeout
    try {
      await Promise.race([startedGate, new Promise((_, reject) => {
        startedTimeout = setTimeout(() => reject(new Error('Expected controlled delayed workbench request was not observed')), 5000)
      })])
    } finally { clearTimeout(startedTimeout) }
    await selectArea(racePage, areaB.id)
    await expect(card(racePage, 'unassigned').locator('strong')).toHaveText('2')
    const oldResponse = racePage.waitForResponse(response => new URL(response.url()).pathname === '/api/business/workbench' && new URL(response.url()).searchParams.get('areaId') === String(areaA.id))
    release()
    await oldResponse
    await expect(panel(racePage).locator('.workbench__items h4')).toHaveText([
      `隔离T10-${suffix}-B-draft-1`, `隔离T10-${suffix}-B-draft-2`
    ])
    await expect(card(racePage, 'unassigned').locator('strong')).toHaveText('2')
    await racePage.unroute(matcher)
    scenarioEvidence.controlledRouteFixtures.push('delayed previous-area response does not overwrite current area')
    await racePage.screenshot({ path: join(config.output, 'workbench-controlled-stale-response.png'), fullPage: true })
    assert.deepEqual(pageErrors, [])
    console.log(JSON.stringify({ passed: true, syntheticDraftsInAreaA: 22, isolatedAreas: 2, pageErrors: 0, ...scenarioEvidence }))
  } catch (error) {
    if (lastPage) await lastPage.screenshot({ path: join(config.output, 'workbench-ui-failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally {
    await browser?.close()
    for (const order of createdOrders) {
      try {
        const current = await api('/orders/' + order.id)
        if (!['COMPLETED', 'CANCELLED'].includes(current.status)) await api('/orders/' + order.id + '/action', 'POST', { action: 'cancel', note: '隔离T10工作台验证清理' })
      } catch { cleanupErrors.push('Could not close a dedicated T10 verification order') }
    }
    for (const user of createdUsers) {
      try { await api('/users/' + user.id, 'PUT', { role: user.role, enabled: false, areas: user.areas, displayName: '隔离T10账号（已停用）' }) }
      catch { cleanupErrors.push('Could not disable a dedicated T10 verification account') }
    }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
}
