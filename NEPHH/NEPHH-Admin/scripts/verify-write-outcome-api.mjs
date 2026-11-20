import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWriteWorkflow, provesOrderWrite } from '../src/write-workflow.ts'

if (process.argv.includes('--help')) {
  console.log('API_BASE=http://127.0.0.1:18081/api ALLOW_ISOLATED_WRITES=1 ADMIN_USERNAME=... ADMIN_PASSWORD=... node --experimental-strip-types scripts/verify-write-outcome-api.mjs\nUses the actual write-workflow.ts helper and real isolated HTTP records. A caller-generated outcomeUnknown error simulates a lost response after a successful POST; does not interrupt the server/network. No browser or VM.')
} else {
  if (!process.env.API_BASE) throw new Error('Explicit API_BASE is required')
  const origin = new URL(process.env.API_BASE)
  if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname.replace(/\/$/, '') !== '/api' ||
      !origin.port || ['8080', '80', '443', '5173'].includes(origin.port)) throw new Error('A dedicated loopback API verification port is required')
  if (process.env.ALLOW_ISOLATED_WRITES !== '1') throw new Error('ALLOW_ISOLATED_WRITES=1 is required')
  const base = origin.toString().replace(/\/$/, '')
  const healthResponse = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(5000) })
  const health = await healthResponse.json()
  if (!healthResponse.ok || health.code !== 0 || health.data?.application !== 'nephh-backend' || health.data?.isolatedVerification !== true) {
    throw new Error('Actual isolatedVerification=true is required before writes')
  }
  let username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    const credentials = JSON.parse(await readFile(process.env.VERIFICATION_CREDENTIAL_FILE || join(tmpdir(), 'zhixun-verification-credentials.json'), 'utf8'))
    username ||= credentials.ADMIN_USERNAME
    password ||= credentials.ADMIN_PASSWORD
  }
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) throw new Error('Explicit isolated administrator credentials are required')
  const operationPosts = []
  async function send(path, token, method = 'GET', body) {
    if (method === 'POST' && /\/orders\/\d+\/(assign|action)$/.test(path)) operationPosts.push({ path, note: body?.note })
    const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, 200, `Unexpected HTTP status for ${method} ${path}`)
    const payload = await response.json()
    assert.equal(payload.code, 0)
    return payload.data
  }
  async function login(name, secret) {
    const result = await send('/auth/login', undefined, 'POST', { username: name, password: secret })
    assert.ok(result?.accessToken)
    return result.accessToken
  }
  const root = await login(username, password)
  const api = (path, method = 'GET', body) => send('/business' + path, root, method, body)
  assert.equal((await api('/identity')).role, 'ADMIN')
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const users = [], orders = [], cleanupErrors = [], transitions = []
  let node
  const evidence = { passed: false, pureHttp: true, uiVerified: false, responseLossSimulatedAtCaller: true,
    realServerInterrupted: false, browserStarted: false, vmStarted: false }
  async function account(label, role, areaId) {
    const name = `t12-${suffix}-${label}`, secret = randomBytes(18).toString('base64url') + '7a'
    const result = await api('/users', 'POST', { username: name, password: secret, role, displayName: '隔离T12-' + label })
    const user = { ...result, role, areas: [areaId] }
    users.push(user)
    await api('/users/' + user.id, 'PUT', { role, enabled: true, areas: [areaId], displayName: '隔离T12-' + label })
    const token = await login(name, secret)
    assert.equal((await send('/business/identity', token)).id, user.id)
    return { ...user, token }
  }
  async function createOrder(label) {
    const order = await api('/orders', 'POST', { nodeId: node.id, title: `隔离T12-${suffix}-${label}`, priority: 'MEDIUM', description: '真实HTTP记录与前端证据判定验证，不是现场处置' })
    orders.push(order)
    return order
  }

  async function lostResponseTransition(actor, order, kind, body, targetStatus, label) {
    const flow = createWriteWorkflow()
    const before = [await send('/business/orders/' + order.id, actor.token)]
    let writes = 0, commits = 0, refreshes = 0
    const postCount = operationPosts.length
    const work = {
      current: () => true,
      commit: () => { commits++ },
      refresh: async () => { refreshes++; await send('/business/orders/' + order.id, actor.token) },
      write: async () => {
        writes++
        await send(`/business/orders/${order.id}/${kind === 'assign' ? 'assign' : 'action'}`, actor.token, 'POST', body)
        throw Object.assign(new Error('Caller deliberately discarded the successful response for verification'), { outcomeUnknown: true })
      }
    }
    assert.equal((await flow.submit(work)).kind, 'unknown', label)
    assert.equal(flow.locked(), true, label)
    assert.equal(commits, 0, label)
    assert.equal((await flow.submit(work)).kind, 'blocked', label)
    assert.equal(writes, 1, label)
    let after
    const confirmed = await flow.verify({ ...work,
      read: async () => { after = [await send('/business/orders/' + order.id, actor.token)]; return after },
      provesCommit: rows => provesOrderWrite(kind, body, before, rows, actor.id)
    })
    assert.equal(confirmed.kind, 'committed', label)
    assert.equal(flow.locked(), false, label)
    assert.equal(commits, 1, label)
    assert.equal(refreshes, 1, label)
    assert.equal(writes, 1, label)
    assert.equal(operationPosts.length - postCount, 1, label)
    assert.equal(after[0].status, targetStatus, label)
    const newEvents = after[0].events.filter(event => !before[0].events.some(previous => previous.id === event.id))
    assert.equal(newEvents.length, 1, label)
    assert.equal(newEvents[0].actor_id, actor.id, label)
    assert.equal(newEvents[0].note, body.note, label)
    assert.equal(provesOrderWrite(kind, body, before, before, actor.id), false, 'Unchanged evidence must never prove a write')
    transitions.push({ operation: label, targetStatus, realPosts: 1, newMatchingEvents: 1, verifiedByRealGet: true })
  }

  try {
    const name = `隔离T12-${suffix}`
    await api('/areas', 'POST', { name, description: '未知写入结果证据验证专用' })
    const area = (await api('/areas')).find(row => row.name === name)
    assert.ok(area)
    node = await api('/nodes', 'POST', { areaId: area.id, code: `T12-${suffix}`, location: '隔离T12证据验证点' })
    const manager = await account('manager', 'MANAGER', area.id)
    const worker = await account('worker', 'INSPECTOR', area.id)
    const order = await createOrder('workflow')
    const unchangedOrder = await createOrder('unchanged-control')

    // Negative control: an actual unchanged GET must not unlock an already-unknown operation.
    const baseline = [await send('/business/orders/' + unchangedOrder.id, manager.token)]
    const unknown = createWriteWorkflow()
    unknown.resumeUnknown()
    const unchangedBody = { assigneeId: worker.id, participantIds: [worker.id], priority: 'HIGH', dueAt: null, note: `T12-${suffix}-unchanged` }
    let negativeWrites = 0, negativeCommits = 0
    const negative = {
      current: () => true,
      write: async () => { negativeWrites++ },
      commit: () => { negativeCommits++ },
      refresh: async () => {},
      read: async () => [await send('/business/orders/' + unchangedOrder.id, manager.token)],
      provesCommit: rows => provesOrderWrite('assign', unchangedBody, baseline, rows, manager.id)
    }
    assert.equal((await unknown.verify(negative)).kind, 'unknown')
    assert.equal(unknown.locked(), true)
    assert.equal((await unknown.submit(negative)).kind, 'blocked')
    assert.equal(negativeWrites, 0)
    assert.equal(negativeCommits, 0)
    unknown.abandon()

    await lostResponseTransition(manager, order, 'assign', { assigneeId: worker.id, participantIds: [worker.id], priority: 'HIGH', dueAt: null, note: `T12-${suffix}-assign` }, 'ASSIGNED', 'assign')
    await lostResponseTransition(worker, order, 'action', { action: 'accept', note: `T12-${suffix}-accept` }, 'ACCEPTED', 'accept')
    await lostResponseTransition(worker, order, 'action', { action: 'start', note: `T12-${suffix}-start` }, 'PROCESSING', 'start')
    await lostResponseTransition(worker, order, 'action', { action: 'submit', result: '  隔离首次处理结果  ', readings: '温度0℃为测试输入，非现场实测', note: `T12-${suffix}-submit` }, 'REVIEW', 'submit')
    await lostResponseTransition(manager, order, 'action', { action: 'reject', note: `T12-${suffix}-reject` }, 'PROCESSING', 'reject')
    await lostResponseTransition(worker, order, 'action', { action: 'submit', result: '隔离补充处理结果', readings: '温度0℃为测试输入，非现场实测', note: `T12-${suffix}-resubmit` }, 'REVIEW', 'resubmit')
    await lostResponseTransition(manager, order, 'action', { action: 'approve', note: `T12-${suffix}-approve` }, 'COMPLETED', 'approve')
    assert.equal((await api('/orders/' + order.id)).status, 'COMPLETED')
    assert.equal((await api('/orders/' + unchangedOrder.id)).status, 'DRAFT')
    Object.assign(evidence, { transitions, unchangedRealGetStayedLocked: true, unchangedControlPosts: 0, automaticSecondPosts: 0 })
  } finally {
    for (const order of orders) {
      try {
        const current = await api('/orders/' + order.id)
        if (!['COMPLETED', 'CANCELLED'].includes(current.status)) await api(`/orders/${order.id}/action`, 'POST', { action: 'cancel', note: '隔离T12证据验证清理' })
      } catch { cleanupErrors.push('Could not close a dedicated T12 verification order') }
    }
    if (node) {
      try { await api('/nodes/' + node.id, 'PUT', { location: '已结束的隔离T12证据验证点', enabled: false, maintenance: false,
        reportSeconds: 30, platform: 'SIMULATOR', metrics: 'methane,temperature,humidity,infrared', x: 50, y: 50 }) }
      catch { cleanupErrors.push('Could not disable a dedicated T12 verification node') }
    }
    for (const user of users) {
      try { await api('/users/' + user.id, 'PUT', { role: user.role, enabled: false, areas: user.areas, displayName: '隔离T12账号（已停用）' }) }
      catch { cleanupErrors.push('Could not disable a dedicated T12 verification account') }
    }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
  evidence.passed = true
  evidence.cleanup = { closedOrders: orders.length, disabledUsers: users.length, disabledNodes: node ? 1 : 0, preservedOtherTaskRecords: true }
  console.log(JSON.stringify(evidence))
}
