import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHardwareCollection, hardwareReports, isHardwareFrameFresh, uploadHardwareReports } from '../src/hardware-collection.ts'

const collectedAt = '2026-11-20T01:00:00Z'
const reports = () => [
  { messageId: 'frame-1', source: 'ESP32_DHT11_WIFI', collectedAt, values: { temperature: 0, humidity: 60 } },
  { messageId: 'frame-1-ch4', source: 'ESP32_CH4_DEMO_WIFI', collectedAt, values: { methane: 20 } }
]
const rows = report => Object.entries(report.values).map(([metric, metric_value]) => ({ message_id: report.messageId, source: report.source, collected_at: report.collectedAt, metric, metric_value }))
const context = overrides => ({ session: 'test-session-a', role: 'MANAGER', demo: false, nodeId: 1, nodeCode: 'TEST-01', ...overrides })

test('only explicit fresh bridge reports keep measured climate separate from simulated methane', () => {
  const [report, methaneReport] = reports()
  const snapshot = { application: 'nephh-usb-bridge', fresh: true, latest: { messageId: 'frame-1', receivedAt: collectedAt }, report, methaneReport }
  assert.equal(isHardwareFrameFresh(snapshot, Date.parse(collectedAt) + 6500), true)
  assert.equal(isHardwareFrameFresh(snapshot, Date.parse(collectedAt) + 6501), false)
  assert.equal(isHardwareFrameFresh({ ...snapshot, fresh: false }, Date.parse(collectedAt)), false)
  assert.deepEqual(hardwareReports(snapshot), reports())
  for (const patch of [{ source: 'NEW_SOURCE' }, { messageId: 'mixed-frame' }, { values: { methane: Infinity } }, { collectedAt: '2026-11-20 01:00:00' }]) {
    assert.throws(() => hardwareReports({ ...snapshot, methaneReport: { ...methaneReport, ...patch } }))
  }
})

test('stopping while first POST is in flight prevents the second POST but verifies the sent portion', async () => {
  let active = true
  const posted = [], methods = []
  const result = await uploadHardwareReports(1, reports(), {
    isActive: () => active, isCurrent: () => true,
    api: async (_path, method = 'GET', body) => {
      methods.push(method)
      if (method === 'POST') { posted.push(body); active = false; return { inserted: 2 } }
      return posted.flatMap(rows)
    }
  })
  assert.deepEqual(methods, ['POST', 'GET'])
  assert.equal(result.status, 'partial')
  assert.equal(result.attempted, 1)
  assert.equal(result.verified, 1)
  assert.equal(result.planned, 2)
})

test('a failed second report still reads back the first commit without claiming a whole frame', async () => {
  const posted = []
  const result = await uploadHardwareReports(1, reports(), {
    isActive: () => true, isCurrent: () => true,
    api: async (_path, method = 'GET', body) => {
      if (method === 'POST') {
        if (posted.length) throw new Error('second POST rejected')
        posted.push(body); return { inserted: 2 }
      }
      return posted.flatMap(rows)
    }
  })
  assert.equal(result.status, 'partial')
  assert.equal(result.attempted, 2)
  assert.equal(result.acknowledged, 1)
  assert.equal(result.verified, 1)
})

test('readback failure or mismatched provenance never reports successful ingestion', async () => {
  for (const fail of [true, false]) {
    const result = await uploadHardwareReports(1, reports().slice(0, 1), {
      isActive: () => true, isCurrent: () => true,
      api: async (_path, method = 'GET') => {
        if (method === 'POST') return { inserted: 2 }
        if (fail) throw new Error('history unavailable')
        return rows({ ...reports()[0], source: 'SIMULATOR' })
      }
    })
    assert.equal(result.status, 'unverified')
    assert.equal(result.verified, 0)
  }
})

test('an uncertain POST can be confirmed only by exact historical evidence', async () => {
  const report = reports()[0]
  const result = await uploadHardwareReports(1, [report], {
    isActive: () => true, isCurrent: () => true,
    api: async (_path, method = 'GET') => {
      if (method === 'POST') throw new Error('response lost after commit')
      return rows(report)
    }
  })
  assert.equal(result.status, 'verified')
  assert.equal(result.acknowledged, 0)
  assert.equal(result.verified, 1)
  assert.equal(result.error, '')
})

test('demo and non-manager identities cannot start collection', () => {
  const collection = createHardwareCollection()
  for (const patch of [{ session: '' }, { demo: true }, { role: 'INSPECTOR' }, { role: 'readonly' }]) assert.throws(() => collection.start(context(patch)))
  assert.equal(collection.state.active, false)
})

test('session changes stop further writes and an old callback cannot publish into the new session', async () => {
  const collection = createHardwareCollection()
  let session = 'test-session-a', finishPost
  collection.start(context())
  const calls = []
  const pending = collection.send(reports(), {
    getSession: () => session,
    api: async (_path, method = 'GET') => {
      calls.push(method)
      return new Promise(resolve => { finishPost = resolve })
    }
  })
  session = 'test-session-b'
  collection.synchronizeSession(session)
  collection.start(context({ session, nodeId: 2, nodeCode: 'TEST-02' }))
  finishPost({ inserted: 2 })
  assert.equal((await pending).status, 'abandoned')
  assert.deepEqual(calls, ['POST'])
  assert.equal(collection.state.nodeId, 2)
  assert.equal(collection.state.active, true)
  assert.equal(collection.state.result, null)
  assert.equal(collection.state.error, '')
})

test('a shared external stop ends continuous writes after verification and logout clears old results', async () => {
  const collection = createHardwareCollection()
  collection.start(context())
  const posted = []
  await collection.send(reports(), {
    getSession: () => 'test-session-a',
    api: async (_path, method = 'GET', body) => {
      if (method === 'POST') { posted.push(body); collection.stop(); return { inserted: 2 } }
      return posted.flatMap(rows)
    }
  })
  assert.equal(collection.state.active, false)
  assert.equal(collection.state.busy, false)
  assert.equal(collection.state.result.status, 'partial')
  assert.match(collection.state.notice, /1\/2/)
  collection.synchronizeSession('')
  assert.equal(collection.state.result, null)
  assert.equal(collection.state.nodeId, 0)
})
