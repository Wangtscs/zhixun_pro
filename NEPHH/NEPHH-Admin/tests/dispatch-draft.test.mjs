import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearDispatchDraft, dispatchDraftKey, dispatchDraftTtlMs, restoreDispatchDraft, saveDispatchDraft } from '../src/dispatch-draft.ts'

function storage() {
  const rows = new Map()
  return { rows, getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, value), removeItem: key => rows.delete(key) }
}

const input = () => ({ orderIds: [10, 11], participantIds: [20], priority: 'HIGH', dueAt: '', note: '待补充现场说明' })

test('same freshly authenticated owner restores editable input without submitting or sharing references', () => {
  const target = storage(), draft = input()
  assert.equal(saveDispatchDraft(target, 7, draft, 1000), true)
  draft.orderIds.push(12)
  assert.deepEqual(restoreDispatchDraft(target, 7, 2000), input())
  const restored = restoreDispatchDraft(target, 7, 2000)
  restored.participantIds.push(21)
  assert.deepEqual(restoreDispatchDraft(target, 7, 2000), input())
  assert.equal(target.rows.size, 1)
})

test('another owner cannot recover the previous account draft and clears it safely', () => {
  const target = storage()
  saveDispatchDraft(target, 7, input(), 1000)
  assert.equal(restoreDispatchDraft(target, 8, 2000), null)
  assert.equal(target.getItem(dispatchDraftKey), null)
  assert.equal(restoreDispatchDraft(target, 7, 2000), null)
})

test('expires exactly after one hour and rejects future or extended timestamps', () => {
  const target = storage()
  saveDispatchDraft(target, 7, input(), 1000)
  assert.deepEqual(restoreDispatchDraft(target, 7, 1000 + dispatchDraftTtlMs - 1), input())
  assert.equal(restoreDispatchDraft(target, 7, 1000 + dispatchDraftTtlMs), null)
  assert.equal(target.getItem(dispatchDraftKey), null)
  saveDispatchDraft(target, 7, input(), 5000)
  assert.equal(restoreDispatchDraft(target, 7, 4999), null)
  saveDispatchDraft(target, 7, input(), 1000)
  const extended = JSON.parse(target.getItem(dispatchDraftKey))
  extended.expiresAt += 86400000
  target.setItem(dispatchDraftKey, JSON.stringify(extended))
  assert.equal(restoreDispatchDraft(target, 7, 2000), null)
})

test('allowlist strips credentials and server objects on both save and restore', () => {
  const target = storage()
  const extended = { ...input(), password: 'do-not-persist', token: 'do-not-persist',
    accessToken: 'do-not-persist', user: { id: 7, password: 'do-not-persist' }, status: 'REVIEW' }
  assert.equal(saveDispatchDraft(target, 7, extended, 1000), true)
  const saved = JSON.parse(target.getItem(dispatchDraftKey))
  assert.deepEqual(Object.keys(saved).sort(), ['draft', 'expiresAt', 'ownerId', 'savedAt', 'version'])
  assert.deepEqual(Object.keys(saved.draft).sort(), ['dueAt', 'note', 'orderIds', 'participantIds', 'priority'])
  assert.equal(target.getItem(dispatchDraftKey).includes('do-not-persist'), false)
  saved.draft.password = 'do-not-restore'
  saved.draft.user = { id: 7 }
  target.setItem(dispatchDraftKey, JSON.stringify(saved))
  assert.deepEqual(restoreDispatchDraft(target, 7, 2000), input())
})

test('malformed, oversized and unknown schema storage is cleared without throwing', () => {
  const target = storage()
  for (const raw of ['{', 'null', '[]', 'false', '"x"', ' '.repeat(17000)]) {
    target.setItem(dispatchDraftKey, raw)
    assert.equal(restoreDispatchDraft(target, 7, 2000), null)
    assert.equal(target.getItem(dispatchDraftKey), null)
  }
  saveDispatchDraft(target, 7, input(), 1000)
  const saved = JSON.parse(target.getItem(dispatchDraftKey))
  saved.version = 99
  target.setItem(dispatchDraftKey, JSON.stringify(saved))
  assert.equal(restoreDispatchDraft(target, 7, 2000), null)
})

test('invalid IDs, duplicate IDs and oversized selections fail closed on save and restore', () => {
  const target = storage()
  const invalid = [
    { orderIds: [] }, { orderIds: [10, 10] }, { orderIds: [0] }, { orderIds: [-1] },
    { orderIds: ['10'] }, { orderIds: [1.5] }, { orderIds: [Number.MAX_SAFE_INTEGER + 1] },
    { orderIds: Array.from({ length: 101 }, (_, index) => index + 1) },
    { participantIds: [20, 20] }, { participantIds: [20, 21, 22] }, { participantIds: [null] },
    { priority: 'URGENT' }, { priority: ['HIGH'] }, { priority: { toString: () => 'HIGH', token: 'x' } },
    { dueAt: 'not-a-date' }, { note: 'a'.repeat(2001) }, { note: { token: 'x' } }
  ]
  for (const mutation of invalid) {
    saveDispatchDraft(target, 7, input(), 1000)
    assert.equal(saveDispatchDraft(target, 7, { ...input(), ...mutation }, 1000), false)
    assert.equal(target.getItem(dispatchDraftKey), null)
    saveDispatchDraft(target, 7, input(), 1000)
    const saved = JSON.parse(target.getItem(dispatchDraftKey))
    saved.draft = { ...saved.draft, ...mutation }
    target.setItem(dispatchDraftKey, JSON.stringify(saved))
    assert.equal(restoreDispatchDraft(target, 7, 2000), null)
    assert.equal(target.getItem(dispatchDraftKey), null)
  }
})

test('empty crew and valid deadline can remain as unfinished input', () => {
  const target = storage()
  const unfinished = { ...input(), participantIds: [], dueAt: '2026-11-20T17:00' }
  assert.equal(saveDispatchDraft(target, 7, unfinished, 1000), true)
  assert.deepEqual(restoreDispatchDraft(target, 7, 2000), unfinished)
})

test('invalid owner or clocks clear stale drafts without treating them as authenticated', () => {
  const target = storage()
  for (const owner of [undefined, null, '7', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    saveDispatchDraft(target, 7, input(), 1000)
    assert.equal(restoreDispatchDraft(target, owner, 2000), null)
    assert.equal(target.getItem(dispatchDraftKey), null)
    assert.equal(saveDispatchDraft(target, owner, input(), 1000), false)
  }
  for (const now of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER]) {
    assert.equal(saveDispatchDraft(target, 7, input(), now), false)
    saveDispatchDraft(target, 7, input(), 1000)
    assert.equal(restoreDispatchDraft(target, 7, now), null)
  }
})

test('unavailable or throwing storage does not crash save, restore or explicit clear', () => {
  for (const target of [null, undefined, {
    getItem() { throw new Error('blocked') },
    setItem() { throw new Error('quota') },
    removeItem() { throw new Error('blocked') }
  }]) {
    assert.equal(saveDispatchDraft(target, 7, input(), 1000), false)
    assert.equal(restoreDispatchDraft(target, 7, 2000), null)
    assert.equal(clearDispatchDraft(target), false)
  }
  const target = storage()
  saveDispatchDraft(target, 7, input(), 1000)
  target.setItem = () => { throw new Error('quota') }
  assert.equal(saveDispatchDraft(target, 7, input(), 2000), false)
  assert.equal(target.getItem(dispatchDraftKey), null)
})

test('explicit clear removes only the draft and leaves authentication storage untouched', () => {
  const target = storage()
  target.setItem('nephh-access-token', 'fixture-token')
  saveDispatchDraft(target, 7, input(), 1000)
  assert.equal(clearDispatchDraft(target), true)
  assert.equal(restoreDispatchDraft(target, 7, 2000), null)
  assert.equal(target.getItem('nephh-access-token'), 'fixture-token')
})
