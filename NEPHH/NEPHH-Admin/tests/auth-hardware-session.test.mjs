import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

const originalStorage = globalThis.sessionStorage
const originalWindow = globalThis.window
const values = new Map(), events = []
let server, clearSession, setSessionToken, hardwareCollection, synchronizeHardwareSession
const reports = () => [
  { messageId: 'auth-frame', source: 'ESP32_DHT11_WIFI', collectedAt: '2026-11-20T01:00:00Z', values: { temperature: 25, humidity: 60 } },
  { messageId: 'auth-frame-ch4', source: 'ESP32_CH4_DEMO_WIFI', collectedAt: '2026-11-20T01:00:00Z', values: { methane: 20 } }
]
const start = (session = 'session-a', nodeId = 1) => hardwareCollection.start({ session, role: 'MANAGER', demo: false, nodeId, nodeCode: 'TEST-' + nodeId })

before(async () => {
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
  globalThis.window = { dispatchEvent: event => { events.push(event.type); return true } }
  server = await createServer({ configFile: false, root: process.cwd(),
    cacheDir: 'node_modules/.cache/auth-hardware-tests', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  ;({ clearSession, setSessionToken } = await server.ssrLoadModule('/src/auth.ts'))
  ;({ hardwareCollection, synchronizeHardwareSession } = await server.ssrLoadModule('/src/hardware-collection.ts'))
})

beforeEach(() => {
  values.clear(); events.length = 0
  globalThis.window = { dispatchEvent: event => { events.push(event.type); return true } }
  synchronizeHardwareSession('')
})

after(async () => {
  synchronizeHardwareSession?.('')
  await server?.close()
  if (originalStorage === undefined) delete globalThis.sessionStorage
  else globalThis.sessionStorage = originalStorage
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('clearSession stops hardware and clears its cache before authentication keys are removed', t => {
  setSessionToken('session-a'); start()
  hardwareCollection.state.result = { status: 'verified', verified: 1 }
  hardwareCollection.state.error = 'old-message'
  values.set('nephh-session', 'old-user')
  values.set('nephh-dispatch-draft', 'retained-unsubmitted-input')
  t.mock.method(globalThis.sessionStorage, 'removeItem', key => {
    assert.equal(hardwareCollection.state.active, false)
    assert.equal(hardwareCollection.state.nodeId, 0)
    assert.equal(hardwareCollection.state.result, null)
    values.delete(key)
  })
  clearSession()
  assert.equal(values.has('nephh-access-token'), false)
  assert.equal(values.has('nephh-session'), false)
  assert.equal(values.get('nephh-dispatch-draft'), 'retained-unsubmitted-input')
  assert.equal(hardwareCollection.state.error, '')
  assert.deepEqual(events, ['nephh:session-changed', 'nephh:session-changed'])
})

test('logout during an in-flight POST prevents the next report and abandons old verification callbacks', async () => {
  setSessionToken('session-a'); start()
  let finish
  const calls = []
  const pending = hardwareCollection.send(reports(), {
    getSession: () => values.get('nephh-access-token') || '',
    api: async (_path, method = 'GET') => {
      calls.push(method)
      return new Promise(resolve => { finish = resolve })
    }
  })
  assert.equal(hardwareCollection.state.busy, true)
  clearSession()
  assert.equal(hardwareCollection.state.active, false)
  assert.equal(hardwareCollection.state.busy, false)
  finish({ inserted: 2 })
  assert.equal((await pending).status, 'abandoned')
  assert.deepEqual(calls, ['POST'])
  assert.equal(hardwareCollection.state.result, null)
  assert.equal(hardwareCollection.state.nodeId, 0)
})

test('publishing another authenticated token resets old state without letting its callback overwrite the new account', async () => {
  setSessionToken('session-a'); start()
  let finish
  const calls = []
  const pending = hardwareCollection.send(reports(), {
    getSession: () => values.get('nephh-access-token') || '',
    api: async (_path, method = 'GET') => {
      calls.push(method)
      return new Promise(resolve => { finish = resolve })
    }
  })
  values.set('nephh-demo', 'true')
  setSessionToken('session-b')
  assert.equal(values.has('nephh-demo'), false)
  assert.equal(hardwareCollection.state.active, false)
  assert.equal(hardwareCollection.state.result, null)
  start('session-b', 2)
  finish({ inserted: 2 })
  assert.equal((await pending).status, 'abandoned')
  assert.deepEqual(calls, ['POST'])
  assert.equal(hardwareCollection.state.active, true)
  assert.equal(hardwareCollection.state.nodeCode, 'TEST-2')
  assert.equal(hardwareCollection.state.result, null)
})

test('session events are optional for non-DOM callers and legacy request tests', () => {
  globalThis.window = { location: { assign() {} } }
  assert.doesNotThrow(() => setSessionToken('session-a'))
  start()
  assert.doesNotThrow(() => clearSession())
  assert.equal(hardwareCollection.state.active, false)
  assert.equal(hardwareCollection.state.nodeId, 0)
})

test('failed credential storage still stops old collection and cannot publish a new authenticated session', t => {
  setSessionToken('session-a'); start()
  t.mock.method(globalThis.sessionStorage, 'setItem', () => { throw new Error('storage unavailable') })
  assert.throws(() => setSessionToken('session-b'), /storage unavailable/)
  assert.equal(hardwareCollection.state.active, false)
  assert.equal(hardwareCollection.state.nodeId, 0)
  assert.equal(hardwareCollection.state.result, null)
  assert.equal(values.get('nephh-access-token'), 'session-a')
})

test('empty login credentials are rejected without writing an invalid token', () => {
  for (const token of ['', '   ', undefined, null]) assert.throws(() => setSessionToken(token), /有效登录凭证/)
  assert.equal(values.has('nephh-access-token'), false)
})
