import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assessSample, classifySource, parseTelemetryTime, reportTimeoutMs } from '../src/source-status.ts'

const now = Date.parse('2026-11-20T01:00:00Z')
const sample = overrides => ({
  metric_value: 24.3, collected_at: '2026-11-20T00:59:50Z',
  received_at: '2026-11-20T00:59:52Z', source: 'ESP32_DHT11_WIFI', ...overrides
})

test('separates device-generated simulation from measurements and platform delivery', () => {
  for (const source of ['SIMULATOR', 'ESP32_CH4_DEMO_USB', 'ESP32_CH4_DEMO_WIFI']) {
    assert.equal(classifySource(source).kind, 'simulation')
    assert.match(classifySource(source).label, /模拟/)
  }
  for (const source of ['ESP32_DHT11_USB', 'ESP32_DHT11_WIFI']) {
    assert.equal(classifySource(source).kind, 'measurement')
  }
  assert.equal(classifySource('HUAWEI_IOT').kind, 'platform')
  assert.match(classifySource('HUAWEI_IOT').label, /待确认/)
})

test('new, malformed and inherited property names never become verified source classes', () => {
  for (const source of ['', null, undefined, {}, 'NEW_SENSOR', 'ESP32_CH4_DEMO_NEW', '__proto__', 'toString', 'constructor']) {
    assert.equal(classifySource(source).kind, 'unknown')
  }
  assert.equal(classifySource(' future-source ').raw, 'future-source')
})

test('requires explicit timezone and accepts UTC and offset representations of the same instant', () => {
  assert.equal(parseTelemetryTime('2026-11-20T09:00:00+08:00'), now)
  assert.equal(parseTelemetryTime('2026-11-20T01:00:00.000Z'), now)
  for (const value of ['2026-11-20', '2026-11-20 09:00:00', '2026-11-20T09:00:00', '2026-02-30T09:00:00Z', 'bad', null, 0]) {
    assert.equal(parseTelemetryTime(value), null)
  }
})

test('preserves valid zero but never turns missing or nonfinite values into measurements', () => {
  assert.equal(assessSample(sample({ metric_value: 0 }), 30, now).value, 0)
  assert.equal(assessSample(sample({ metric_value: 0 }), 30, now).state, 'fresh')
  for (const value of [null, undefined]) assert.equal(assessSample(sample({ metric_value: value }), 30, now).state, 'missing')
  for (const value of [NaN, Infinity, '0', 'not-a-number']) {
    const result = assessSample(sample({ metric_value: value }), 30, now)
    assert.equal(result.state, 'invalid')
    assert.equal(result.value, null)
  }
  assert.equal(assessSample(null, 30, now).state, 'missing')
})

test('expires after three reporting periods without replacing collection time with recent receive time', () => {
  const exact = sample({ collected_at: '2026-11-20T00:58:30Z', received_at: '2026-11-20T01:00:00Z' })
  assert.equal(assessSample(exact, 30, now).state, 'fresh')
  const expired = assessSample(exact, 30, now + 1)
  assert.equal(expired.state, 'stale')
  assert.equal(expired.value, 24.3)
  assert.equal(expired.collectedAtMs, Date.parse(exact.collected_at))
  assert.equal(expired.receivedAtMs, now)
  assert.equal(reportTimeoutMs(5), 15000)
  for (const value of [undefined, null, 0, -1, Infinity, 'bad', 86401]) assert.equal(reportTimeoutMs(value), 90000)
})

test('missing collection time and future clocks are separate from communication freshness', () => {
  assert.equal(assessSample(sample({ collected_at: null }), 30, now).state, 'time-unknown')
  assert.equal(assessSample(sample({ collected_at: '2026-11-20T01:01:00Z' }), 30, now).state, 'fresh')
  assert.equal(assessSample(sample({ collected_at: '2026-11-20T01:01:01Z' }), 30, now).state, 'future')
  assert.equal(assessSample(sample({}), 30, NaN).state, 'time-unknown')
})
