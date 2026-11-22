import { test } from 'node:test'
import assert from 'node:assert/strict'
import { demoWave } from '../src/demo-wave.ts'
test('simulation changes over time and stays reproducible', () => {
  const values = Array.from({ length: 20 }, (_, i) => demoWave(12, 1, 'methane', 1700000000000 + i * 2000))
  assert.ok(new Set(values).size > 5)
  assert.equal(values[0], demoWave(12, 1, 'methane', 1700000000000))
})
test('percentage simulation stays within supported limits', () => {
  for (const base of [0, 100]) for (let i = 0; i < 100; i++) {
    const value = demoWave(base, 3, 'humidity', i * 2000)
    assert.ok(value >= 0 && value <= 100)
  }
})
