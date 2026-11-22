import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildHistorySeries, historyPosition } from '../src/history-series.ts'

const time = seconds => new Date(Date.parse('2026-11-20T01:00:00Z') + seconds * 1000).toISOString()
const sample = (seconds, value, extra = {}) => ({
  metric: 'temperature', collected_at: time(seconds), metric_value: value, unit: '°C',
  source: 'ESP32_DHT11_WIFI', ...extra
})
const series = (rows, rules = {}) => buildHistorySeries(rows, ['temperature'], rules, 30)[0]

test('uses actual unequal sample intervals and keeps negative and greater-than-100 readings', () => {
  const result = series([sample(0, -12), sample(10, 40), sample(70, 132)])
  assert.deepEqual(result.points.map(point => point.value), [-12, 40, 132])
  assert.equal(historyPosition(result.points[1].time, result.from, result.to), 1 / 7)
  assert.ok(result.minimum < -12)
  assert.ok(result.maximum > 132)
})

test('breaks at explicit missing/invalid values and after more than three reporting periods', () => {
  const result = series([
    sample(0, 0), sample(10, null), sample(20, 3), sample(30, NaN),
    sample(40, 4), sample(130, 5), sample(221, 6)
  ])
  assert.deepEqual(result.segments.map(points => points.map(point => point.value)), [[0], [3], [4, 5], [6]])
  assert.equal(result.missingCount, 1)
  assert.equal(result.invalidCount, 1)
})

test('without record IDs deduplicates by the final input, including a final missing observation', () => {
  const result = series([sample(0, 1), sample(10, 2), sample(0, 7), sample(10, null), sample(20, 8)])
  assert.deepEqual(result.points.map(point => point.value), [7, 8])
  assert.deepEqual(result.segments.map(points => points.length), [1, 1])
  assert.equal(result.duplicateCount, 2)
})

test('uses the greatest valid record ID for duplicate sample times regardless of descending input order', () => {
  const rows = [sample(0, 9, { id: 12 }), sample(0, 4, { id: 11 })]
  assert.equal(series(rows).points[0].value, 9)
  assert.equal(series([...rows].reverse()).points[0].value, 9)
  assert.equal(series([sample(0, 9, { id: 12 }), sample(0, 4)]).points[0].value, 9)
  const missing = series([sample(0, null, { id: 13 }), ...rows])
  assert.equal(missing.points.length, 0)
  assert.equal(missing.missingCount, 1)
  const largeId = series([sample(0, 99, { id: '9007199254740993' }), sample(0, 88, { id: '9007199254740992' })])
  assert.equal(largeId.points[0].value, 99)
})

test('unknown, ambiguous or invalid collection times never become current samples', () => {
  const result = series([
    sample(0, 10), sample(10, 11, { collected_at: 'not-a-time' }),
    sample(20, 12, { collected_at: '2026-11-20 09:00:20' }),
    sample(30, 13, { collected_at: '2026-02-30T09:00:00Z' })
  ])
  assert.equal(result.unknownTimeCount, 3)
  assert.equal(result.points.length, 1)
  assert.equal(result.from, Date.parse(time(0)))
  assert.equal(result.to, result.from)
})

test('does not mix conflicting or missing units into a curve', () => {
  const conflict = series([sample(0, 20), sample(10, 68, { unit: '°F' })])
  assert.match(conflict.warning, /单位不一致/)
  assert.equal(conflict.points.length, 0)
  assert.equal(conflict.minimum, null)
  const missing = series([sample(0, 20, { unit: null })])
  assert.match(missing.warning, /单位未提供/)
  assert.equal(missing.segments.length, 0)
})

test('shows only enabled finite current thresholds and expands the range rather than clipping them', () => {
  const rows = [sample(0, 20), sample(10, 22)]
  const enabled = series(rows, { temperature: { enabled: true, threshold_value: 150 } })
  assert.equal(enabled.threshold, 150)
  assert.ok(enabled.maximum > 150)
  assert.match(enabled.thresholdNote, /当前配置/)
  assert.equal(series(rows, { temperature: { enabled: false, threshold_value: 150 } }).threshold, null)
  assert.equal(series(rows, { temperature: { enabled: true, threshold_value: Infinity } }).threshold, null)
  const mismatch = series([sample(0, 20, { unit: '°F' })], { temperature: { enabled: true, threshold_value: 50 } })
  assert.equal(mismatch.threshold, null)
  assert.match(mismatch.thresholdNote, /单位/)
})

test('keeps metrics, units and source nature distinct without guessing measurement status', () => {
  const result = buildHistorySeries([
    sample(0, 24), sample(0, 18, { metric: 'methane', unit: '%LEL', source: 'ESP32_CH4_DEMO_WIFI' }),
    sample(10, 25, { source: 'HUAWEI_IOT' }), sample(20, 26, { source: 'new-platform' })
  ], ['temperature', 'methane'], {}, 30)
  assert.equal(result[0].unit, '°C')
  assert.equal(result[1].unit, '%LEL')
  assert.deepEqual(result[0].sources.map(source => source.kind), ['measurement', 'platform', 'unknown'])
  assert.equal(result[1].sources[0].kind, 'simulation')
})

test('empty and zero-only series remain different and extreme scales stay finite', () => {
  assert.equal(series([]).points.length, 0)
  const zero = series([sample(0, 0)])
  assert.equal(zero.points[0].value, 0)
  assert.ok(zero.minimum < 0 && zero.maximum > 0)
  assert.equal(historyPosition(0, -1e308, 1e308), 0.5)
})
