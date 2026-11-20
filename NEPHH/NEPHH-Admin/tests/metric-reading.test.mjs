import assert from 'node:assert/strict'
import { test } from 'node:test'
import { visibleMetric, methaneOrigin } from '../src/metric-reading.ts'

const now = Date.parse('2026-11-20T01:00:00Z')
const sample = (metric, overrides = {}) => ({ metric, metric_value: 24.3, source: 'ESP32_DHT11_WIFI', collected_at: '2026-11-20T00:59:50Z', received_at: '2026-11-20T00:59:52Z', ...overrides })
const node = (...latest) => ({ report_seconds: 30, latest })

test('finite fresh values and genuine zero stay visible for all metrics and preserve their metadata', () => {
  for (const metric of ['methane', 'temperature', 'humidity', 'infrared']) {
    const reading = sample(metric, { metric_value: 0 })
    assert.equal(visibleMetric(node(reading), metric, false, now), reading)
    assert.equal(visibleMetric(node(reading), metric, true, now), reading)
  }
})

test('simulation is visible when fresh and its methane provenance names the simulation', () => {
  for (const [source, label] of [['SIMULATOR', '平台模拟'], ['ESP32_CH4_DEMO_USB', '设备模拟甲烷（USB）'], ['ESP32_CH4_DEMO_WIFI', '设备模拟甲烷（Wi-Fi）']]) {
    const reading = sample('methane', { source })
    assert.equal(visibleMetric(node(reading), 'methane', false, now), reading)
    assert.equal(methaneOrigin(node(reading), false, now), label)
    assert.equal(methaneOrigin(node(reading), true, now), label)
  }
})

test('unknown sources never become claimed measurements or controller uploads', () => {
  for (const source of ['NEW_SENSOR', 'ESP32_CH4_DEMO_FUTURE', undefined, '__proto__']) {
    const reading = sample('methane', { source })
    assert.equal(visibleMetric(node(reading), 'methane', false, now), reading)
    assert.equal(methaneOrigin(node(reading), false, now), '来源待确认')
  }
})

test('expired, missing, ambiguous and future collection times hide every main readout, even in demo', () => {
  for (const metric of ['methane', 'temperature', 'humidity', 'infrared']) {
    for (const collected_at of ['2026-11-20T00:58:29Z', undefined, '2026-11-20 00:59:50', '2026-11-20T01:01:01Z']) {
      const reading = sample(metric, { collected_at, received_at: '2026-11-20T01:00:00Z' })
      for (const demo of [false, true]) assert.equal(visibleMetric(node(reading), metric, demo, now), null)
    }
  }
  const old = sample('methane', { source: 'SIMULATOR', collected_at: '2026-11-20T00:58:29Z' })
  assert.equal(methaneOrigin(node(old), false, now), '平台模拟', 'An expired value does not erase its known source')
})

test('missing or malformed payloads and nonfinite or string values never turn into numeric readings', () => {
  for (const metric_value of [null, undefined, NaN, Infinity, -Infinity, '0', '24.3']) {
    assert.equal(visibleMetric(node(sample('temperature', { metric_value })), 'temperature', false, now), null)
  }
  for (const latest of [undefined, {}, [null], [0], ['invalid']]) assert.equal(visibleMetric({ latest }, 'temperature', false, now), null)
  assert.equal(methaneOrigin(node(), false, now), '来源待确认')
})
