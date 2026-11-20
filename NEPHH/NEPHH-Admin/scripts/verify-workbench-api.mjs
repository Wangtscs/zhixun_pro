import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Pure HTTP verification: no Playwright, browser, UI server or device dependency.
if (process.argv.includes('--help')) {
  console.log('API_BASE=http://127.0.0.1:18081/api ALLOW_ISOLATED_WRITES=1 ADMIN_USERNAME=... ADMIN_PASSWORD=... node scripts/verify-workbench-api.mjs\nMissing credentials may be read privately from VERIFICATION_CREDENTIAL_FILE or TEMP/zhixun-verification-credentials.json. Requires isolatedVerification=true; never uses UI_BASE or starts a browser/VM.')
} else {
  if (!process.env.API_BASE) throw new Error('API_BASE must be explicitly configured')
  const origin = new URL(process.env.API_BASE)
  if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname.replace(/\/$/, '') !== '/api' ||
      !origin.port || ['8080', '80', '443', '5173'].includes(origin.port)) {
    throw new Error('API_BASE must use /api on a dedicated loopback verification port')
  }
  if (process.env.ALLOW_ISOLATED_WRITES !== '1') throw new Error('Refusing writes: ALLOW_ISOLATED_WRITES=1 is required')
  const apiBase = origin.toString().replace(/\/$/, '')
  const healthResponse = await fetch(apiBase + '/health', { redirect: 'error', signal: AbortSignal.timeout(5000) })
  const health = await healthResponse.json()
  if (!healthResponse.ok || health.code !== 0 || health.data?.application !== 'nephh-backend' || health.data?.isolatedVerification !== true) {
    throw new Error('Refusing writes: API must explicitly advertise isolatedVerification=true')
  }
  let username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    const credentials = JSON.parse(await readFile(process.env.VERIFICATION_CREDENTIAL_FILE || join(tmpdir(), 'zhixun-verification-credentials.json'), 'utf8'))
    username ||= credentials.ADMIN_USERNAME
    password ||= credentials.ADMIN_PASSWORD
  }
  if (typeof username !== 'string' || !username || typeof password !== 'string' || !password) {
    throw new Error('Explicit isolated administrator credentials are required')
  }
  async function send(path, token, { method = 'GET', body, expectedStatus = 200 } = {}) {
    const response = await fetch(apiBase + path, { method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${method} ${path.split('?')[0]}`)
    const result = await response.json()
    if (expectedStatus === 200) assert.equal(result.code, 0)
    return result.data
  }
  async function login(user, secret) {
    const result = await send('/auth/login', undefined, { method: 'POST', body: { username: user, password: secret } })
    assert.ok(result?.accessToken)
    return result.accessToken
  }
  const adminToken = await login(username, password)
  const api = (path, method = 'GET', body) => send('/business' + path, adminToken, { method, body })
  const identity = await api('/identity')
  assert.equal(identity.role, 'ADMIN', 'Verification fixtures require an isolated administrator')
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const createdUsers = [], createdOrders = [], cleanupErrors = []
  const evidence = { passed: false, uiVerified: false, browserStarted: false, vmStarted: false }

  async function account(label, role, areas) {
    const name = `t10-api-${suffix}-${label}`, secret = randomBytes(18).toString('base64url') + '7a'
    const result = await api('/users', 'POST', { username: name, password: secret, role, displayName: '隔离T10-' + label })
    const user = { id: result.id, role, areas }
    createdUsers.push(user)
    await api('/users/' + user.id, 'PUT', { role, enabled: true, areas, displayName: '隔离T10-' + label })
    return { ...user, token: await login(name, secret) }
  }
  async function createOrder(nodeId, label) {
    const title = `隔离T10-API-${suffix}-${label}`
    const result = await api('/orders', 'POST', { nodeId, title, priority: 'MEDIUM', description: '纯HTTP隔离验收；不是现场工单' })
    const row = { id: result.id, title }
    createdOrders.push(row)
    return row
  }
  const page = (token, areaId, queue, limit = 20, offset = 0) => send(
    '/business/workbench?' + new URLSearchParams({ ...(areaId === null ? {} : { areaId: String(areaId) }), queue, limit: String(limit), offset: String(offset) }), token)
  const action = (token, orderId, operation, extra = {}) => send(`/business/orders/${orderId}/action`, token,
    { method: 'POST', body: { action: operation, note: '隔离T10-API验证', ...extra } })

  try {
    // Validate deployment before creating any test fixture.
    const probe = await api('/workbench?queue=unassigned&limit=1&offset=0')
    assert.ok(probe?.scope && probe?.counts && probe?.queue)
    await send('/business/workbench', undefined, { expectedStatus: 401 })
    const names = [`隔离T10-API-${suffix}-A`, `隔离T10-API-${suffix}-B`]
    for (const name of names) await api('/areas', 'POST', { name, description: '纯HTTP工作台验收专用' })
    const areas = await api('/areas')
    const [areaA, areaB] = names.map(name => areas.find(row => row.name === name))
    assert.ok(areaA && areaB)
    const nodeA = await api('/nodes', 'POST', { areaId: areaA.id, code: `T10API-${suffix}-A`, location: 'HTTP验收A点' })
    const nodeB = await api('/nodes', 'POST', { areaId: areaB.id, code: `T10API-${suffix}-B`, location: 'HTTP验收B点' })
    const manager = await account('manager', 'MANAGER', [areaA.id])
    const worker = await account('worker', 'INSPECTOR', [areaA.id])
    const other = await account('other', 'INSPECTOR', [areaA.id])
    const outside = await account('outside', 'INSPECTOR', [areaB.id])
    const emptyManager = await account('empty-manager', 'MANAGER', [])
    const emptyWorker = await account('empty-worker', 'INSPECTOR', [])
    const drafts = []
    for (let index = 1; index <= 22; index++) drafts.push(await createOrder(nodeA.id, 'A-draft-' + index))
    for (let index = 1; index <= 2; index++) await createOrder(nodeB.id, 'B-draft-' + index)
    const own = await createOrder(nodeA.id, 'primary')
    const shared = await createOrder(nodeA.id, 'participant')
    const unrelated = await createOrder(nodeA.id, 'unrelated')
    const external = await createOrder(nodeB.id, 'external')
    for (const [order, primary, participants] of [[own, worker, [worker.id]], [shared, other, [other.id, worker.id]], [unrelated, other, [other.id]], [external, outside, [outside.id]]]) {
      await api(`/orders/${order.id}/assign`, 'POST', { assigneeId: primary.id, participantIds: participants, priority: 'MEDIUM', note: '隔离T10-API队列夹具' })
    }
    const first = await page(manager.token, areaA.id, 'unassigned')
    const second = await page(manager.token, areaA.id, 'unassigned', 20, 20)
    const repeated = await page(manager.token, areaA.id, 'unassigned')
    assert.equal(first.counts.unassigned, 22)
    assert.equal(first.queue.total, 22)
    assert.equal(first.queue.items.length, 20)
    assert.equal(first.queue.hasMore, true)
    assert.equal(second.queue.total, 22)
    assert.equal(second.queue.items.length, 2)
    assert.equal(second.queue.hasMore, false)
    assert.deepEqual(first.queue.items.map(row => row.id), repeated.queue.items.map(row => row.id))
    assert.deepEqual([...first.queue.items, ...second.queue.items].map(row => row.id).sort((a, b) => a - b), drafts.map(row => row.id).sort((a, b) => a - b))
    for (const row of [...first.queue.items, ...second.queue.items]) {
      const detail = await send('/business/orders/' + row.id, manager.token)
      assert.equal(detail.id, row.id)
      assert.equal(detail.area_id, areaA.id)
      assert.equal(detail.status, 'DRAFT')
    }
    assert.ok(Number.isFinite(Date.parse(first.serverTime)))
    assert.deepEqual(first.scope.areaIds, [areaA.id])
    assert.equal(first.scope.personal, false)
    assert.equal((await page(adminToken, areaB.id, 'unassigned')).queue.total, 2)
    await send(`/business/workbench?areaId=${areaB.id}&queue=unassigned`, manager.token, { expectedStatus: 403 })

    const personal = await page(worker.token, areaA.id, 'assigned')
    assert.equal(personal.scope.personal, true)
    assert.equal(personal.counts.assigned, 2)
    assert.deepEqual(personal.queue.items.map(row => row.id).sort((a, b) => a - b), [own.id, shared.id].sort((a, b) => a - b))
    assert.equal(Object.hasOwn(personal.counts, 'unassigned'), false)
    for (const row of personal.queue.items) assert.equal((await send('/business/orders/' + row.id, worker.token)).id, row.id)
    await send('/business/orders/' + unrelated.id, worker.token, { expectedStatus: 403 })
    await send('/business/orders/' + external.id, worker.token, { expectedStatus: 403 })
    await send(`/business/workbench?areaId=${areaB.id}&queue=assigned`, worker.token, { expectedStatus: 403 })
    await send('/business/workbench?queue=review', worker.token, { expectedStatus: 403 })
    await send('/business/workbench?queue=assigned', manager.token, { expectedStatus: 403 })
    for (const user of [emptyManager, emptyWorker]) {
      const result = await page(user.token, null, 'patrol')
      assert.deepEqual(result.scope.areaIds, [])
      assert.ok(Object.values(result.counts).every(value => value === 0))
      assert.deepEqual(result.queue.items, [])
      assert.equal(result.queue.hasMore, false)
    }
    for (const query of ['limit=0', 'limit=101', 'limit=-1', 'limit=invalid', 'offset=-1', 'areaId=0', 'areaId=invalid', 'queue=unknown', 'queue=' + encodeURIComponent("unassigned' OR 1=1 --")]) {
      await send('/business/workbench?' + query, adminToken, { expectedStatus: 400 })
    }

    // Read back both business status and exact queues through a complete existing workflow.
    await action(worker.token, own.id, 'accept')
    await action(worker.token, own.id, 'start')
    assert.equal((await send('/business/orders/' + own.id, worker.token)).status, 'PROCESSING')
    const started = await page(worker.token, areaA.id, 'processing')
    assert.equal(started.counts.assigned, 1)
    assert.equal(started.queue.total, 1)
    assert.equal(started.queue.items[0].id, own.id)
    await action(worker.token, own.id, 'submit', { result: '隔离验证处理结果', readings: '测试输入，不是现场读数' })
    let review = await page(manager.token, areaA.id, 'review')
    assert.equal(review.queue.total, 1)
    assert.equal(review.queue.items[0].id, own.id)
    await action(adminToken, own.id, 'reject')
    assert.equal((await send('/business/orders/' + own.id, worker.token)).status, 'PROCESSING')
    await action(worker.token, own.id, 'submit', { result: '隔离验证补充结果', readings: '测试输入，不是现场读数' })
    await action(adminToken, own.id, 'approve')
    const completed = await send('/business/orders/' + own.id, worker.token)
    assert.equal(completed.status, 'COMPLETED')
    for (const operation of ['CREATE', 'ASSIGN', 'ACCEPT', 'START', 'SUBMIT', 'REJECT', 'APPROVE']) {
      assert.ok(completed.events.some(event => event.action === operation))
    }
    review = await page(manager.token, areaA.id, 'review')
    assert.equal(review.queue.total, 0)
    assert.equal((await page(worker.token, areaA.id, 'assigned')).queue.total, 1)
    Object.assign(evidence, { exactDraftCount: 22, firstPageItems: 20, secondPageItems: 2, stableIds: true,
      detailsMatchScope: true, primaryAndParticipant: true, crossAreaRejected: true, roleQueueWhitelist: true,
      emptyAuthorization: true, invalidInputsRejected: true, workflowReadBack: true })
  } finally {
    // Close only records created by this script. Retain audit history and shared H2 fixtures.
    for (const order of createdOrders) {
      try {
        const current = await api('/orders/' + order.id)
        if (!['COMPLETED', 'CANCELLED'].includes(current.status)) await api('/orders/' + order.id + '/action', 'POST', { action: 'cancel', note: '隔离T10-API验证清理' })
        const after = await api('/orders/' + order.id)
        assert.ok(['COMPLETED', 'CANCELLED'].includes(after.status))
      } catch { cleanupErrors.push('Could not close a dedicated T10 HTTP verification order') }
    }
    for (const user of createdUsers) {
      try { await api('/users/' + user.id, 'PUT', { role: user.role, enabled: false, areas: user.areas, displayName: '隔离T10-API账号（已停用）' }) }
      catch { cleanupErrors.push('Could not disable a dedicated T10 HTTP verification account') }
    }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
  evidence.passed = true
  evidence.cleanup = { closedOrders: createdOrders.length, disabledUsers: createdUsers.length, preservedOtherTaskRecords: true }
  console.log(JSON.stringify(evidence))
}
