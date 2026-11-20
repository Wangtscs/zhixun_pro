import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allowedOrderActions, createWriteWorkflow, provesOrderWrite, restoreDraftRecords, topEscapeLayer, pendingWriteKey, savePendingOrderWrite, restorePendingOrderWrite, clearPendingOrderWrite } from '../src/write-workflow.ts'

test('confirmed write closes before a failed refresh and cannot be repeated by the same in-flight click', async () => {
  const flow = createWriteWorkflow(), events = []; let finish
  const work = { write: () => new Promise(resolve => { finish = resolve; events.push('write') }), commit: () => events.push('close'), refresh: async () => { events.push('refresh'); throw new Error('offline') } }
  const first = flow.submit(work)
  assert.equal((await flow.submit(work)).kind, 'blocked')
  finish()
  const result = await first
  assert.equal(result.kind, 'committed'); assert.ok(result.refreshError)
  assert.deepEqual(events, ['write', 'close', 'refresh'])
})

test('unknown writes stay locked until positive GET evidence, with no automatic second write', async () => {
  const flow = createWriteWorkflow(); let writes = 0, closed = 0
  const base = { commit: () => closed++, refresh: async () => {}, write: async () => { writes++; throw Object.assign(new Error('lost'), { outcomeUnknown: true }) } }
  assert.equal((await flow.submit(base)).kind, 'unknown')
  assert.equal((await flow.submit(base)).kind, 'blocked')
  assert.equal((await flow.verify({ ...base, read: async () => 'unchanged', provesCommit: () => false })).kind, 'unknown')
  assert.equal(flow.locked(), true); assert.equal(closed, 0); assert.equal(writes, 1)
  assert.equal((await flow.verify({ ...base, read: async () => 'committed', provesCommit: () => true })).kind, 'committed')
  assert.equal(closed, 1); assert.equal(writes, 1)
})

test('permission rejection preserves a retryable draft while changed sessions cannot publish old results', async () => {
  const flow = createWriteWorkflow(); let closed = 0
  const base = { commit: () => closed++, refresh: async () => {} }
  assert.equal((await flow.submit({ ...base, write: async () => { throw new Error('403') } })).kind, 'rejected')
  assert.equal(flow.locked(), false); assert.equal(closed, 0)
  let finish; const pending = flow.submit({ ...base, write: () => new Promise(resolve => { finish = resolve }) })
  flow.abandon(); finish()
  assert.equal((await pending).kind, 'abandoned'); assert.equal(closed, 0)
})

test('work order actions follow owner, manager, readonly and terminal-state boundaries', () => {
  const worker = { id: 2, role: 'INSPECTOR' }, manager = { id: 1, role: 'MANAGER' }
  for (const [status, action] of [['ASSIGNED', 'accept'], ['ACCEPTED', 'start'], ['PROCESSING', 'submit']]) assert.deepEqual(allowedOrderActions({ status, assignee_id: 2 }, worker), [action])
  assert.deepEqual(allowedOrderActions({ status: 'REVIEW', assignee_id: 2 }, manager), ['approve', 'reject', 'cancel'])
  assert.deepEqual(allowedOrderActions({ status: 'REVIEW', assignee_id: 1 }, manager), ['reject', 'cancel'])
  assert.deepEqual(allowedOrderActions({ status: 'ASSIGNED', assignee_id: 2 }, { ...worker, readonly: true }), [])
  for (const status of ['COMPLETED', 'CANCELLED']) assert.deepEqual(allowedOrderActions({ status, assignee_id: 2 }, manager), [])
})

test('action confirmation requires a new matching actor event and the submitted result', () => {
  const before = [{ id: 10, status: 'PROCESSING', events: [{ id: 5 }] }]
  const body = { action: 'submit', note: '复核', result: '完成', readings: '温度0℃' }
  const after = [{ id: 10, status: 'REVIEW', result_text: '完成', readings: '温度0℃', events: [{ id: 6, actor_id: 2, action: 'SUBMIT', note: '复核' }] }]
  assert.equal(provesOrderWrite('action', body, before, after, 2), true)
  assert.equal(provesOrderWrite('action', body, before, [{ ...after[0], events: [{ id: 5, actor_id: 2, action: 'SUBMIT', note: '复核' }] }], 2), false)
  assert.equal(provesOrderWrite('action', body, before, after, 3), false)
  assert.equal(provesOrderWrite('action', body, before, [{ ...after[0], readings: '' }], 2), false)
})

test('all batch records must confirm the same crew and new assignment event', () => {
  const body = { assigneeId: 2, participantIds: [2, 3], priority: 'HIGH', dueAt: null, note: '处理' }
  const before = [10, 11].map(id => ({ id, status: 'DRAFT', events: [] }))
  const after = [10, 11].map(id => ({ id, status: 'ASSIGNED', assignee_id: 2, participant_ids: [3, 2], priority: 'HIGH', due_at: null, events: [{ id: id + 1, actor_id: 1, action: 'ASSIGN', note: '处理' }] }))
  assert.equal(provesOrderWrite('assign', body, before, after, 1), true)
  assert.equal(provesOrderWrite('assign', body, before, after.slice(0, 1), 1), false)
  assert.equal(provesOrderWrite('assign', body, before, [{ ...after[0], status: 'DRAFT' }, after[1]], 1), false)
})

test('draft restoration uses every requested stable ID and rejects assigned or missing records', async () => {
  const requested = []
  const records = await restoreDraftRecords([700, 701], async id => { requested.push(id); return { id, status: 'DRAFT' } })
  assert.deepEqual(requested, [700, 701]); assert.equal(records.length, 2)
  await assert.rejects(() => restoreDraftRecords([700], async id => ({ id, status: 'ASSIGNED' })))
  await assert.rejects(() => restoreDraftRecords([700], async () => { throw new Error('404') }))
})

test('Escape closes only the top layer and never a saving or unknown form', () => {
  const layers = { form: true, locked: false, run: true, alarm: true, audit: true, node: true, menu: true }
  assert.equal(topEscapeLayer(layers), 'form')
  assert.equal(topEscapeLayer({ ...layers, locked: true }), null)
  assert.equal(topEscapeLayer({ ...layers, form: false }), 'run')
})

test('every main transition requires a matching fresh event and the expected target status', () => {
  for (const [action, status] of Object.entries({ accept: 'ACCEPTED', start: 'PROCESSING', submit: 'REVIEW', reject: 'PROCESSING', approve: 'COMPLETED', cancel: 'CANCELLED' })) {
    const body = { action, note: 'verified', result: 'done', readings: '0' }
    const before = [{ id: 1, events: [{ id: 5 }] }]
    const after = [{ id: 1, status, result_text: 'done', readings: '0', events: [{ id: 6, actor_id: 2, action: action.toUpperCase(), note: 'verified' }] }]
    assert.equal(provesOrderWrite('action', body, before, after, 2), true, action)
    assert.equal(provesOrderWrite('action', body, before, [{ ...after[0], status: 'DRAFT' }], 2), false, action)
  }
})

test('failed verification remains locked and never starts another write', async () => {
  const flow = createWriteWorkflow(); let writes = 0
  const work = { commit: () => assert.fail('must not commit'), refresh: async () => {}, write: async () => { writes++; throw { outcomeUnknown: true } } }
  await flow.submit(work)
  assert.equal((await flow.verify({ ...work, read: async () => { throw new Error('503') }, provesCommit: () => true })).kind, 'unknown')
  assert.equal((await flow.submit(work)).kind, 'blocked'); assert.equal(writes, 1)
})

test('unknown order evidence survives reload with only allowed fields and cannot cross identities', async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const operation = { kind: 'action', actorId: 2, session: 'never-store', body: { action: 'submit', result: 'done', readings: '0', note: 'review', password: 'never-store' }, before: [{ id: 701, title: 'server-record', events: [{ id: 9, note: 'server-record' }] }] }
  assert.equal(savePendingOrderWrite(storage, operation), true)
  assert.equal(values.get(pendingWriteKey).includes('never-store'), false)
  assert.equal(values.get(pendingWriteKey).includes('server-record'), false)
  const restored = restorePendingOrderWrite(storage, 2)
  assert.equal(restored.before[0].id, 701); assert.equal(restored.before[0].events[0].id, 9)
  const flow = createWriteWorkflow(); flow.resumeUnknown()
  assert.equal((await flow.submit({ write: async () => assert.fail('no retry'), commit: () => {}, refresh: async () => {} })).kind, 'blocked')
  assert.equal(restorePendingOrderWrite(storage, 3), null); assert.equal(values.has(pendingWriteKey), false)
  storage.setItem(pendingWriteKey, '{invalid'); assert.equal(restorePendingOrderWrite(storage, 2), null)
  savePendingOrderWrite(storage, operation); clearPendingOrderWrite(storage); assert.equal(values.size, 0)
})
