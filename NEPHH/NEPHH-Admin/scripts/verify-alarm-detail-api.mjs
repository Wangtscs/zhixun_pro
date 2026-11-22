import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.argv.includes('--help')) {
  console.log('API_BASE=http://127.0.0.1:18081/api ALLOW_ISOLATED_WRITES=1 ADMIN_USERNAME=... ADMIN_PASSWORD=... node scripts/verify-alarm-detail-api.mjs\nPure HTTP only. Missing credentials may be loaded privately from VERIFICATION_CREDENTIAL_FILE or TEMP/zhixun-verification-credentials.json; requires actual isolatedVerification=true. No browser or VM dependency.')
} else {
  if (!process.env.API_BASE) throw new Error('Explicit API_BASE is required')
  const origin = new URL(process.env.API_BASE)
  if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname.replace(/\/$/, '') !== '/api' ||
      !origin.port || ['8080', '80', '443', '5173'].includes(origin.port)) throw new Error('Use a dedicated loopback API verification port')
  if (process.env.ALLOW_ISOLATED_WRITES !== '1') throw new Error('ALLOW_ISOLATED_WRITES=1 is required')
  const base = origin.toString().replace(/\/$/, '')
  const healthResponse = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(5000) })
  const health = await healthResponse.json()
  if (!healthResponse.ok || health.code !== 0 || health.data?.application !== 'nephh-backend' || health.data?.isolatedVerification !== true) {
    throw new Error('Actual API isolatedVerification=true is required before writes')
  }
  let username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    const credentials = JSON.parse(await readFile(process.env.VERIFICATION_CREDENTIAL_FILE || join(tmpdir(), 'zhixun-verification-credentials.json'), 'utf8'))
    username ||= credentials.ADMIN_USERNAME
    password ||= credentials.ADMIN_PASSWORD
  }
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) throw new Error('Explicit isolated credentials are required')
  async function send(path, token, method = 'GET', body, expectedStatus = 200) {
    const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, expectedStatus, `Unexpected HTTP status for ${method} ${path.split('?')[0]}`)
    const payload = await response.json()
    if (expectedStatus === 200) assert.equal(payload.code, 0)
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
  await api('/workbench?queue=unassigned&limit=1&offset=0')
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const users = [], orders = [], nodes = [], rules = [], cleanupErrors = []
  const evidence = { passed: false, pureHttp: true, uiVerified: false, browserStarted: false, vmStarted: false }
  async function account(label, role, areas) {
    const name = `t11-${suffix}-${label}`, secret = randomBytes(18).toString('base64url') + '7a'
    const user = await api('/users', 'POST', { username: name, password: secret, role, displayName: '隔离T11-' + label })
    users.push({ ...user, role, areas })
    await api('/users/' + user.id, 'PUT', { role, enabled: true, areas, displayName: '隔离T11-' + label })
    return { ...user, token: await login(name, secret) }
  }
  async function sample(id, methane, label) {
    return api(`/nodes/${id}/telemetry`, 'POST', { messageId: `t11-${suffix}-${label}`, source: 'SIMULATOR', collectedAt: new Date().toISOString(), values: { methane } })
  }
  async function order(node, alarm, label, primary, participants) {
    const created = await api('/orders', 'POST', { nodeId: node.id, alarmId: alarm.id, title: '隔离T11-' + suffix + '-' + label, priority: 'MEDIUM', description: '纯HTTP验证；不是现场处置' })
    orders.push(created)
    await api(`/orders/${created.id}/assign`, 'POST', { assigneeId: primary.id, participantIds: participants, priority: 'MEDIUM', note: '隔离T11关联夹具' })
    return created
  }
  try {
    const names = [`隔离T11-${suffix}-A`, `隔离T11-${suffix}-B`]
    for (const name of names) await api('/areas', 'POST', { name, description: '告警详情隔离HTTP验证' })
    const areas = await api('/areas')
    const [areaA, areaB] = names.map(name => areas.find(row => row.name === name))
    assert.ok(areaA && areaB)
    for (const [index, area] of [areaA, areaB].entries()) {
      const node = await api('/nodes', 'POST', { areaId: area.id, code: `T11-${suffix}-${index}`, location: 'HTTP验收点' })
      nodes.push(node)
      const rule = { areaId: area.id, metric: 'methane', threshold: 35, durationSeconds: 0, severity: 'HIGH', enabled: true }
      rules.push(rule)
      await api('/rules', 'POST', rule)
      await sample(node.id, 48, 'alarm-' + index)
    }
    const alarms = await api('/alarms')
    const alarmA = alarms.find(row => row.node_id === nodes[0].id && row.metric === 'methane' && !row.recovered_at)
    const alarmB = alarms.find(row => row.node_id === nodes[1].id && row.metric === 'methane' && !row.recovered_at)
    assert.ok(alarmA && alarmB)
    // Prove that the endpoint is deployed before preparing accounts and linked orders.
    assert.equal((await api('/alarms/' + alarmA.id)).alarm.id, alarmA.id)
    const manager = await account('manager', 'MANAGER', [areaA.id])
    const worker = await account('worker', 'INSPECTOR', [areaA.id])
    const other = await account('other', 'INSPECTOR', [areaA.id])
    const own = await order(nodes[0], alarmA, 'primary', worker, [worker.id])
    const shared = await order(nodes[0], alarmA, 'participant', other, [other.id, worker.id])
    const unrelated = await order(nodes[0], alarmA, 'unrelated', other, [other.id])
    const changedRule = { ...rules[0], threshold: 50 }
    await api('/rules', 'POST', changedRule)
    const managerDetail = await send('/business/alarms/' + alarmA.id, manager.token)
    assert.equal(managerDetail.ruleContext, 'CURRENT_CONFIGURATION_NOT_TRIGGER_SNAPSHOT')
    assert.equal(managerDetail.ruleAccess, 'AVAILABLE')
    assert.equal(managerDetail.currentRule.threshold_value, 50)
    assert.match(managerDetail.ruleExplanation, /不是告警触发时/)
    assert.equal(managerDetail.alarm.reason, alarmA.reason)
    assert.ok(managerDetail.alarm.reason.includes('35'))
    assert.equal(managerDetail.node.id, nodes[0].id)
    assert.equal(managerDetail.node.latest.find(row => row.metric === 'methane').source, 'SIMULATOR')
    assert.deepEqual(managerDetail.relatedOrders.items.map(row => row.id).sort((a, b) => a - b), [own.id, shared.id, unrelated.id].sort((a, b) => a - b))
    const workerDetail = await send('/business/alarms/' + alarmA.id, worker.token)
    assert.equal(workerDetail.currentRule, null)
    assert.equal(workerDetail.ruleAccess, 'RESTRICTED')
    assert.match(workerDetail.ruleExplanation, /不能读取/)
    assert.deepEqual(workerDetail.relatedOrders.items.map(row => row.id).sort((a, b) => a - b), [own.id, shared.id].sort((a, b) => a - b))
    assert.equal(workerDetail.relatedOrders.hasMore, false)
    for (const row of workerDetail.relatedOrders.items) assert.equal((await send('/business/orders/' + row.id, worker.token)).id, row.id)
    await send('/business/orders/' + unrelated.id, worker.token, 'GET', undefined, 403)
    for (const user of [manager, worker]) await send('/business/alarms/' + alarmB.id, user.token, 'GET', undefined, 403)
    await send('/business/alarms/999999999', root, 'GET', undefined, 404)
    await send('/business/alarms/0', root, 'GET', undefined, 400)
    await send('/business/alarms/' + alarmA.id, undefined, 'GET', undefined, 401)
    await api(`/alarms/${alarmA.id}/acknowledge`, 'POST', { note: '隔离T11确认不等于恢复' })
    let state = (await send('/business/alarms/' + alarmA.id, manager.token)).state
    assert.deepEqual(state, { active: true, acknowledged: true, recovered: false })
    await sample(nodes[0].id, 12, 'recovery')
    state = (await send('/business/alarms/' + alarmA.id, manager.token)).state
    assert.deepEqual(state, { active: false, acknowledged: true, recovered: true })
    Object.assign(evidence, { stableAlarmId: true, currentRuleNotSnapshot: true, persistedLatestSource: true,
      primaryAndParticipantOnly: true, rulesRestrictedForInspector: true, linkedDetailsReadable: true,
      crossAreaRejected: true, missing404: true, anonymous401: true, acknowledgementIndependentOfRecovery: true })
  } finally {
    for (const created of orders) {
      try {
        const current = await api('/orders/' + created.id)
        if (!['COMPLETED', 'CANCELLED'].includes(current.status)) await api(`/orders/${created.id}/action`, 'POST', { action: 'cancel', note: '隔离T11验证清理' })
      } catch { cleanupErrors.push('Could not close a dedicated T11 order') }
    }
    for (const [index, node] of nodes.entries()) {
      try {
        await sample(node.id, 12, 'cleanup-' + index)
        await api('/nodes/' + node.id, 'PUT', { location: '已结束的隔离T11验收点', enabled: false, maintenance: false,
          reportSeconds: 30, platform: 'SIMULATOR', metrics: 'methane,temperature,humidity,infrared', x: 50, y: 50 })
      } catch { cleanupErrors.push('Could not recover and disable a dedicated T11 node') }
    }
    for (const rule of rules) {
      try { await api('/rules', 'POST', { ...rule, enabled: false }) }
      catch { cleanupErrors.push('Could not disable a dedicated T11 rule') }
    }
    for (const user of users) {
      try { await api('/users/' + user.id, 'PUT', { role: user.role, enabled: false, areas: user.areas, displayName: '隔离T11账号（已停用）' }) }
      catch { cleanupErrors.push('Could not disable a dedicated T11 account') }
    }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
  evidence.passed = true
  evidence.cleanup = { closedOrders: orders.length, disabledUsers: users.length, disabledNodes: nodes.length, preservedOtherTaskRecords: true }
  console.log(JSON.stringify(evidence))
}
