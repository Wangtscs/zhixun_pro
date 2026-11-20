import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildHistorySeries, historyPosition } from '../src/history-series.ts'
import { weeklyReportPoints } from '../src/weekly-report.ts'

if (process.argv.includes('--help')) {
  console.log('API_BASE=http://127.0.0.1:18081/api ALLOW_ISOLATED_WRITES=1 ADMIN_USERNAME=... ADMIN_PASSWORD=... node --experimental-strip-types scripts/verify-history-api.mjs\nPure HTTP plus actual history-series.ts and weekly-report.ts. Missing credentials may be read privately from VERIFICATION_CREDENTIAL_FILE or TEMP/zhixun-verification-credentials.json. Requires real isolatedVerification=true; no browser/VM.')
} else {
  if (!process.env.API_BASE) throw new Error('Explicit API_BASE is required')
  const origin = new URL(process.env.API_BASE)
  if (!['http:', 'https:'].includes(origin.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
      origin.username || origin.password || origin.search || origin.hash || origin.pathname.replace(/\/$/, '') !== '/api' ||
      !origin.port || ['8080', '80', '443', '5173'].includes(origin.port)) throw new Error('Use a dedicated loopback verification API port')
  if (process.env.ALLOW_ISOLATED_WRITES !== '1') throw new Error('ALLOW_ISOLATED_WRITES=1 is required')
  const base = origin.toString().replace(/\/$/, '')
  const healthResponse = await fetch(base + '/health', { redirect: 'error', signal: AbortSignal.timeout(5000) })
  const health = await healthResponse.json()
  if (!healthResponse.ok || health.code !== 0 || health.data?.application !== 'nephh-backend' || health.data?.isolatedVerification !== true) {
    throw new Error('Refusing writes without actual isolatedVerification=true')
  }
  let username = process.env.ADMIN_USERNAME, password = process.env.ADMIN_PASSWORD
  if (!username || !password) {
    const credentials = JSON.parse(await readFile(process.env.VERIFICATION_CREDENTIAL_FILE || join(tmpdir(), 'zhixun-verification-credentials.json'), 'utf8'))
    username ||= credentials.ADMIN_USERNAME
    password ||= credentials.ADMIN_PASSWORD
  }
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) throw new Error('Explicit isolated credentials are required')
  async function send(path, token, method = 'GET', body) {
    const response = await fetch(base + path, { method, redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) })
    assert.equal(response.status, 200, `Unexpected HTTP status for ${method} ${path.split('?')[0]}`)
    const payload = await response.json()
    assert.equal(payload.code, 0)
    return payload.data
  }
  const login = await send('/auth/login', undefined, 'POST', { username, password })
  assert.ok(login?.accessToken)
  const api = (path, method = 'GET', body) => send('/business' + path, login.accessToken, method, body)
  assert.equal((await api('/identity')).role, 'ADMIN')
  const suffix = Date.now().toString(36) + randomBytes(3).toString('hex')
  const samples = {
    temperature: [-12, 40, 132, 20],
    humidity: [0, 10, 60, 100],
    methane: [0, 12, 35, 48]
  }
  const offsets = [0, 10, 70, 161]
  const startTime = Math.floor(Date.now() / 1000) * 1000 - 180000
  const expectedTimes = offsets.map(seconds => startTime + seconds * 1000)
  let node, rule
  const cleanupErrors = []
  const evidence = { passed: false, pureHttp: true, uiVerified: false, browserStarted: false, vmStarted: false }
  try {
    const name = '隔离T13-' + suffix
    await api('/areas', 'POST', { name, description: '历史图表模型纯HTTP验证' })
    const area = (await api('/areas')).find(row => row.name === name)
    assert.ok(area)
    node = await api('/nodes', 'POST', { areaId: area.id, code: 'T13-' + suffix, location: '历史时间序列隔离验收点' })
    const metadata = (await api('/nodes')).find(row => row.id === node.id)
    assert.equal(metadata.report_seconds, 30)
    rule = { areaId: area.id, metric: 'temperature', threshold: 150, durationSeconds: 0, severity: 'HIGH', enabled: true }
    await api('/rules', 'POST', rule)
    // Temperature only requires a finite number in the current API. Humidity/methane remain within 0..100.
    for (const [index, collectedAt] of expectedTimes.entries()) {
      const values = Object.fromEntries(Object.entries(samples).map(([metric, readings]) => [metric, readings[index]]))
      const receipt = await api(`/nodes/${node.id}/telemetry`, 'POST', {
        messageId: `t13-${suffix}-${index}`, source: 'SIMULATOR', collectedAt: new Date(collectedAt).toISOString(), values
      })
      assert.equal(receipt.inserted, 3)
    }
    const query = new URLSearchParams({ from: new Date(startTime - 1000).toISOString(), to: new Date(expectedTimes.at(-1) + 1000).toISOString() })
    const history = await api(`/nodes/${node.id}/history?${query}`)
    assert.equal(history.length, 12)
    const currentRules = await api('/rules?areaId=' + area.id)
    const rulesByMetric = Object.fromEntries(currentRules.map(record => [record.metric, record]))
    const series = buildHistorySeries(history, Object.keys(samples), rulesByMetric, metadata.report_seconds)
    assert.equal(series.length, 3)
    const units = { temperature: '°C', humidity: '%RH', methane: '%LEL' }
    for (const row of series) {
      assert.equal(row.warning, '')
      assert.equal(row.unit, units[row.metric])
      assert.deepEqual(row.points.map(point => point.time), expectedTimes)
      assert.deepEqual(row.points.map(point => point.value), samples[row.metric])
      assert.deepEqual(row.segments.map(segment => segment.length), [3, 1])
      assert.equal(row.missingCount, 0)
      assert.equal(row.invalidCount, 0)
      assert.equal(row.unknownTimeCount, 0)
      assert.deepEqual(row.sources.map(source => ({ raw: source.raw, kind: source.kind })), [{ raw: 'SIMULATOR', kind: 'simulation' }])
      assert.equal(historyPosition(row.points[1].time, row.from, row.to), 10 / 161)
      assert.equal(historyPosition(row.points[2].time, row.from, row.to), 70 / 161)
    }
    const temperature = series.find(row => row.metric === 'temperature')
    assert.equal(temperature.threshold, 150)
    assert.match(temperature.thresholdNote, /当前配置/)
    assert.ok(temperature.minimum < -12)
    assert.ok(temperature.maximum > 150)
    const humidity = series.find(row => row.metric === 'humidity')
    assert.equal(humidity.points[0].value, 0)
    assert.equal(humidity.threshold, null)
    const methane = series.find(row => row.metric === 'methane')
    assert.equal(methane.threshold, null)

    const statistics = await api('/statistics?areaId=' + area.id)
    assert.ok(Array.isArray(statistics.weekly))
    assert.ok(statistics.weekly.every(week => typeof week.label === 'string' && typeof week.planned === 'number' && typeof week.completed === 'number'))
    const weekly = weeklyReportPoints(statistics.weekly)
    assert.equal(weekly.length, statistics.weekly.length)
    assert.deepEqual(weekly, statistics.weekly.map(week => ({ label: week.label.trim(), planned: week.planned, completed: week.completed })))
    assert.ok(weekly.some(week => week.planned === 0 && week.completed === 0))

    await api('/rules', 'POST', { ...rule, enabled: false })
    const disabledRules = Object.fromEntries((await api('/rules?areaId=' + area.id)).map(record => [record.metric, record]))
    const disabledSeries = buildHistorySeries(history, ['temperature'], disabledRules, metadata.report_seconds)[0]
    assert.equal(disabledSeries.threshold, null)
    assert.match(disabledSeries.thresholdNote, /未启用/)
    Object.assign(evidence, { actualHistoryRows: history.length, metrics: 3, sampleOffsetsSeconds: offsets,
      rawTemperatureValues: samples.temperature, negativeAndAbove100Preserved: true, unequalTimePositionsPreserved: true,
      gapAfterThreePeriodsBrokeSegments: true, segmentLengths: [3, 1], humidityZeroPreserved: true,
      unitsAndSimulatedSourcePreserved: true, currentThreshold: 150, disabledThresholdHidden: true,
      weeklyPointsFromServer: statistics.weekly.length, weeklyExactlyMatchesResponse: true })
  } finally {
    if (rule) {
      try { await api('/rules', 'POST', { ...rule, enabled: false }) }
      catch { cleanupErrors.push('Could not disable a dedicated T13 rule') }
    }
    if (node) {
      try { await api('/nodes/' + node.id, 'PUT', { location: '已结束的隔离T13图表验收点', enabled: false, maintenance: false,
        reportSeconds: 30, platform: 'SIMULATOR', metrics: 'methane,temperature,humidity,infrared', x: 50, y: 50 }) }
      catch { cleanupErrors.push('Could not disable a dedicated T13 node') }
    }
    if (cleanupErrors.length) throw new Error(cleanupErrors.join('; '))
  }
  evidence.passed = true
  evidence.cleanup = { disabledNodes: node ? 1 : 0, disabledRules: rule ? 1 : 0, preservedOtherTaskRecords: true }
  console.log(JSON.stringify(evidence))
}
