import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server, request, BusinessRequestError
const values = new Map()
const originalStorage = globalThis.sessionStorage
const originalWindow = globalThis.window
const redirects = []

before(async () => {
  globalThis.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  }
  globalThis.window = { location: { assign: path => redirects.push(path) } }
  server = await createServer({
    configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/business-request-tests',
    server: { middlewareMode: true, hmr: false }, appType: 'custom'
  })
  ;({ request, BusinessRequestError } = await server.ssrLoadModule('/src/business.ts'))
})

after(async () => {
  await server?.close()
  if (originalStorage === undefined) delete globalThis.sessionStorage
  else globalThis.sessionStorage = originalStorage
  if (originalWindow === undefined) delete globalThis.window
  else globalThis.window = originalWindow
})

test('403 retains server message, HTTP status and business code without revoking the session', async t => {
  values.clear(); redirects.length = 0
  values.set('nephh-access-token', 'test-token')
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 403, message: '当前区域未授权' }, { status: 403 }))
  await assert.rejects(request('/workbench'), error => {
    assert.ok(error instanceof Error)
    assert.ok(error instanceof BusinessRequestError)
    assert.equal(error.message, '当前区域未授权')
    assert.equal(error.status, 403)
    assert.equal(error.code, 403)
    assert.equal(error.outcomeUnknown, false)
    return true
  })
  assert.equal(values.get('nephh-access-token'), 'test-token')
  assert.deepEqual(redirects, [])
})

test('401 keeps the existing clear-session and login redirect behavior', async t => {
  values.clear(); redirects.length = 0
  values.set('nephh-access-token', 'expired-token')
  values.set('nephh-session', 'old-session')
  t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 401, message: '登录已失效' }, { status: 401 }))
  await assert.rejects(request('/workbench'), error => error.status === 401 && error.message === '登录已失效')
  assert.equal(values.has('nephh-access-token'), false)
  assert.equal(values.has('nephh-session'), false)
  assert.deepEqual(redirects, ['/login'])
})

test('success data and non-JSON failure text remain compatible with existing callers', async t => {
  values.clear(); redirects.length = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 0, data: { id: 7 } }))
  assert.deepEqual(await request('/orders/7'), { id: 7 })
  fetch.mock.mockImplementation(async () => new Response('not-json', { status: 502 }))
  await assert.rejects(request('/workbench'), error => error instanceof Error && error.status === 502 && error.message === '服务返回异常，请检查后端连接')
})

test('demo workbench filters and pages the same fictional orders without making network requests', async t => {
  values.clear(); redirects.length = 0
  values.set('nephh-demo', 'true')
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Demonstration must not call the network') })
  const before = await request('/orders')
  const all = await request('/workbench?queue=unassigned&limit=1&offset=0')
  assert.equal(all.scope.role, 'MANAGER')
  assert.equal(all.counts.unassigned, 2)
  assert.equal(all.queue.total, 2)
  assert.equal(all.queue.items.length, 1)
  assert.equal(all.queue.hasMore, true)
  const last = await request('/workbench?queue=unassigned&limit=1&offset=1')
  assert.equal(last.queue.hasMore, false)
  assert.notEqual(last.queue.items[0].id, all.queue.items[0].id)
  const scoped = await request('/workbench?queue=unassigned&areaId=1')
  assert.equal(scoped.queue.total, 1)
  assert.ok(scoped.queue.items.every(item => item.area_id === 1))
  await assert.rejects(request('/workbench?queue=assigned'), error => error.status === 403)
  await assert.rejects(request('/workbench?queue=unassigned&areaId=99'), error => error.status === 403)
  await assert.rejects(request('/workbench?limit=0'), error => error.status === 400)
  assert.deepEqual(await request('/orders'), before)
  await request('/orders/31/assign', 'POST', { assigneeId: 2, participantIds: [2] })
  assert.equal((await request('/workbench?queue=unassigned&areaId=1')).queue.total, 0)
})

test('write network failures and timeouts are unknown outcomes and never automatically retried', async t => {
  values.clear(); redirects.length = 0
  let calls = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => { calls++; throw new TypeError('Failed to fetch') })
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await assert.rejects(request('/orders/7/action', method, { action: 'submit' }), error => {
      assert.ok(error instanceof BusinessRequestError)
      assert.equal(error.status, 0)
      assert.equal(error.outcomeUnknown, true)
      assert.match(error.message, /提交结果未知/)
      assert.match(error.message, /核对/)
      return true
    })
  }
  assert.equal(calls, 4)
  fetch.mock.mockImplementation(async () => { calls++; throw new DOMException('Timed out', 'TimeoutError') })
  await assert.rejects(request('/orders/7/action', 'POST', { action: 'submit' }), error => {
    assert.equal(error.outcomeUnknown, true)
    assert.match(error.message, /超时/)
    return true
  })
  assert.equal(calls, 5)
  assert.deepEqual(redirects, [])
})

test('write 5xx JSON and unreadable success responses cannot claim a rejected or successful result', async t => {
  values.clear(); redirects.length = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 500, message: '服务异常，请重试' }, { status: 500 }))
  await assert.rejects(request('/orders/7/action', 'POST', { action: 'submit' }), error => {
    assert.equal(error.status, 500)
    assert.equal(error.code, 500)
    assert.equal(error.outcomeUnknown, true)
    assert.match(error.message, /提交结果未知/)
    assert.doesNotMatch(error.message, /请重试/)
    return true
  })
  for (const response of [new Response('not-json', { status: 200 }), new Response('gateway failure', { status: 502 }), Response.json(null), Response.json({})]) {
    fetch.mock.mockImplementation(async () => response)
    await assert.rejects(request('/orders/7/action', 'POST', { action: 'submit' }), error => {
      assert.ok(error instanceof BusinessRequestError)
      assert.equal(error.outcomeUnknown, true)
      assert.match(error.message, /提交结果未知/)
      return true
    })
  }
  fetch.mock.mockImplementation(async () => Response.json({ code: 500, message: '请重试' }))
  await assert.rejects(request('/orders/7/action', 'POST', {}), error => error.outcomeUnknown === true && error.code === 500)
})

test('ordinary write 4xx responses remain explicit refusals with status and server messages', async t => {
  values.clear(); redirects.length = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ code: 409, message: '工单状态已经变化' }, { status: 409 }))
  await assert.rejects(request('/orders/7/action', 'POST', {}), error => {
    assert.equal(error.outcomeUnknown, false)
    assert.equal(error.status, 409)
    assert.equal(error.message, '工单状态已经变化')
    return true
  })
  fetch.mock.mockImplementation(async () => new Response('forbidden', { status: 403 }))
  await assert.rejects(request('/orders/7/action', 'POST', {}), error => {
    assert.equal(error.status, 403)
    assert.equal(error.outcomeUnknown, false)
    assert.match(error.message, /拒绝/)
    return true
  })
  fetch.mock.mockImplementation(async () => Response.json({ code: 400, message: '请补充处理结果' }))
  await assert.rejects(request('/orders/7/action', 'POST', {}), error => error.outcomeUnknown === false && error.message === '请补充处理结果')
})

test('non-JSON 401 still clears authentication and redirects without losing dispatch draft', async t => {
  values.clear(); redirects.length = 0
  values.set('nephh-access-token', 'expired-token')
  values.set('nephh-session', 'old-session')
  values.set('nephh-dispatch-draft', 'retained-editable-input')
  t.mock.method(globalThis, 'fetch', async () => new Response('expired', { status: 401 }))
  await assert.rejects(request('/orders/7/action', 'POST', {}), error => {
    assert.equal(error.status, 401)
    assert.equal(error.outcomeUnknown, false)
    assert.match(error.message, /重新登录/)
    return true
  })
  assert.equal(values.has('nephh-access-token'), false)
  assert.equal(values.has('nephh-session'), false)
  assert.equal(values.get('nephh-dispatch-draft'), 'retained-editable-input')
  assert.deepEqual(redirects, ['/login'])
})

test('GET network and server failures stay ordinary read errors rather than uncertain writes', async t => {
  values.clear(); redirects.length = 0
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('offline') })
  await assert.rejects(request('/workbench'), error => {
    assert.ok(error instanceof BusinessRequestError)
    assert.equal(error.status, 0)
    assert.equal(error.outcomeUnknown, false)
    assert.doesNotMatch(error.message, /提交结果未知/)
    return true
  })
  fetch.mock.mockImplementation(async () => Response.json({ code: 503, message: '暂时不可用' }, { status: 503 }))
  await assert.rejects(request('/workbench'), error => error.status === 503 && error.outcomeUnknown === false && error.message === '暂时不可用')
})

test('successful writes preserve JSON and multipart payload behavior with exactly one request', async t => {
  values.clear(); redirects.length = 0
  values.set('nephh-access-token', 'fixture-token')
  let calls = 0
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++
    assert.equal(url, '/api/business/orders/7/action')
    assert.equal(options.method, 'POST')
    assert.equal(options.headers.Authorization, 'Bearer fixture-token')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), { action: 'submit' })
    assert.equal(options.cache, 'no-store')
    return Response.json({ code: 0, data: { saved: true } })
  })
  assert.deepEqual(await request('/orders/7/action', 'POST', { action: 'submit' }), { saved: true })
  const form = new FormData()
  form.set('note', 'fixture')
  fetch.mock.mockImplementation(async (_url, options) => {
    calls++
    assert.equal(options.body, form)
    assert.equal(options.headers['Content-Type'], undefined)
    return Response.json({ code: 0, data: null })
  })
  assert.equal(await request('/orders/7/attachments', 'POST', form), null)
  assert.equal(calls, 2)
})
