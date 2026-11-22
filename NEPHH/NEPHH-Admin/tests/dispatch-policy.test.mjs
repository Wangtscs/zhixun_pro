import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchAreaIds, eligibleDispatchWorkers, validDispatchCrew } from '../src/dispatch-policy.ts'

const worker = (id, extra = {}) => ({ id, username: 'worker-' + id, display_name: '巡检员' + id, role_code: 'INSPECTOR', enabled: true, areas: [1], ...extra })

test('search reaches authorized workers beyond the first ten without exposing other areas', () => {
  const workers = Array.from({ length: 15 }, (_, index) => worker(index + 1))
  workers.push(worker(99, { areas: [2], display_name: '外区人员' }))
  assert.equal(eligibleDispatchWorkers(workers, [1]).length, 15)
  assert.deepEqual(eligibleDispatchWorkers(workers, [1], '  WORKER-11 ').map(row => row.id), [11])
  assert.deepEqual(eligibleDispatchWorkers(workers, [1], '外区人员'), [])
})

test('disabled, non-inspector, unassigned and unknown-area candidates cannot be selected', () => {
  const workers = [worker(1), worker(2, { enabled: false }), worker(3, { role_code: 'MANAGER' }), worker(4, { areas: [] }), worker(5, { areas: undefined })]
  assert.deepEqual(eligibleDispatchWorkers(workers, [1]).map(row => row.id), [1])
  for (const areas of [[], [undefined], [null], [0], [-1], ['not-an-area']]) {
    assert.deepEqual(eligibleDispatchWorkers(workers, areas), [])
    assert.equal(validDispatchCrew(workers, areas, [1]), false)
  }
})

test('one or two eligible crew members pass, while duplicate and stale selections fail', () => {
  const workers = [worker(1), worker(2), worker(3)]
  assert.equal(validDispatchCrew(workers, [1], [1]), true)
  assert.equal(validDispatchCrew(workers, [1], [1, 2]), true)
  for (const selected of [[], [1, 1], [1, 2, 3], [1, 90]]) assert.equal(validDispatchCrew(workers, [1], selected), false)
  workers[1].enabled = false
  assert.equal(validDispatchCrew(workers, [1], [1, 2]), false)
})

test('area membership supports serialized numeric IDs and stable name ordering without changing input', () => {
  const workers = [worker(2, { display_name: 'Zed', areas: ['1', '2'] }), worker(1, { display_name: 'Amy', areas: [1] })]
  assert.deepEqual(eligibleDispatchWorkers(workers, ['1']).map(row => row.id), [1, 2])
  assert.deepEqual(workers.map(row => row.id), [2, 1])
  assert.deepEqual(eligibleDispatchWorkers(workers, [1, 2]).map(row => row.id), [2])
})

test('batch scope resolves all selected areas and only their common authorized workers', () => {
  const orders = [{ id: 10, node_id: 100, status: 'DRAFT' }, { id: 11, area_id: 2, status: 'ASSIGNED' }]
  const scope = dispatchAreaIds([10, 11], orders, [{ id: 100, area_id: 1 }])
  assert.deepEqual(scope, [1, 2])
  const workers = [worker(1), worker(2, { areas: [2] }), worker(3, { areas: [1, 2] })]
  assert.deepEqual(eligibleDispatchWorkers(workers, scope).map(row => row.id), [3])
  assert.equal(validDispatchCrew(workers, scope, [1]), false)
  assert.equal(validDispatchCrew(workers, scope, [3]), true)
})

test('no common authorization produces no candidate or valid stale selection', () => {
  const workers = [worker(1), worker(2, { areas: [2] })]
  assert.deepEqual(eligibleDispatchWorkers(workers, [1, 2]), [])
  assert.equal(validDispatchCrew(workers, [1, 2], [1, 2]), false)
  workers[0].areas = [1, 2]
  assert.equal(validDispatchCrew(workers, [1, 2], [1]), true)
  workers[0].areas = [1]
  assert.equal(validDispatchCrew(workers, [1, 2], [1]), false)
})

test('batch scope rejects missing rows, missing areas and ended or review orders', () => {
  const orders = [{ id: 10, area_id: 1, status: 'DRAFT' }]
  assert.equal(dispatchAreaIds([10, 99], orders, []), null)
  assert.equal(dispatchAreaIds([10], [{ id: 10, status: 'DRAFT' }], []), null)
  for (const status of ['REVIEW', 'COMPLETED', 'CANCELLED', 'UNKNOWN']) assert.equal(dispatchAreaIds([10], [{ id: 10, area_id: 1, status }], []), null)
  assert.equal(dispatchAreaIds([10, 10], orders, []), null)
  assert.equal(dispatchAreaIds([], orders, []), null)
})
