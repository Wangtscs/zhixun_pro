import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shouldAlertNotification } from '../src/notification-policy.ts'

const high = { object_type: 'ALARM', object_id: '1' }
const medium = { object_type: 'ALARM', object_id: 2 }
const alarms = [{ id: 1, severity: 'HIGH' }, { id: 2, severity: 'MEDIUM' }]
const quiet = { quietStart: '22:00', quietEnd: '07:00' }
const at = (hour, minute = 0) => new Date(2026, 10, 9, hour, minute)

test('overnight quiet hours allow high risk and suppress lower risk', () => {
  for (const date of [at(22), at(23, 59), at(0), at(6, 59)]) {
    assert.equal(shouldAlertNotification(high, alarms, quiet, date), true)
    assert.equal(shouldAlertNotification(medium, alarms, quiet, date), false)
  }
})
test('quiet period excludes its end boundary', () => {
  assert.equal(shouldAlertNotification(medium, alarms, quiet, at(21, 59)), true)
  assert.equal(shouldAlertNotification(medium, alarms, quiet, at(7)), true)
})
test('same-day quiet hours and equal start/end are supported', () => {
  const day = { quietStart: '12:00', quietEnd: '14:00' }
  assert.equal(shouldAlertNotification(medium, alarms, day, at(12)), false)
  assert.equal(shouldAlertNotification(medium, alarms, day, at(14)), true)
  assert.equal(shouldAlertNotification(medium, alarms, { quietStart: '12:00', quietEnd: '12:00' }, at(12)), true)
})
test('critical-only preference applies outside quiet hours too', () => {
  assert.equal(shouldAlertNotification(medium, alarms, { ...quiet, criticalOnly: true }, at(10)), false)
  assert.equal(shouldAlertNotification(high, alarms, { ...quiet, criticalOnly: true }, at(10)), true)
})
test('missing alarms and general notices never bypass quiet hours', () => {
  assert.equal(shouldAlertNotification({ object_type: 'ORDER', object_id: 1 }, alarms, quiet, at(23)), false)
  assert.equal(shouldAlertNotification({ object_type: 'ALARM', object_id: 99 }, alarms, quiet, at(23)), false)
  assert.equal(shouldAlertNotification({ object_type: 'ALARM' }, [{ severity: 'HIGH' }], quiet, at(23)), false)
})
