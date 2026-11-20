import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'
import { weeklyReportPoints } from '../src/weekly-report.ts'

test('uses each provided rate independently and keeps an actual zero', () => {
  const weeks = weeklyReportPoints([{ label: 'W1', planned: 0, completed: 0 }, { label: 'W2', planned: 40, completed: 7 }])
  assert.deepEqual(weeks, [{ label: 'W1', planned: 0, completed: 0 }, { label: 'W2', planned: 40, completed: 7 }])
})

test('a numeric legacy array never invents a completed series or zero-filled planned rates', () => {
  const weeks = weeklyReportPoints([42, 55])
  assert.ok(weeks.every(week => week.planned === null && week.completed === null))
  assert.ok(weeks.every(week => week.label.includes('未提供')))
})

test('partial, nonfinite, out-of-range or string rates remain unknown rather than clamped', () => {
  const weeks = weeklyReportPoints([
    { label: 'W1', planned: 30 }, { label: 'W2', planned: Infinity, completed: NaN },
    { label: 'W3', planned: -1, completed: 101 }, { label: 'W4', planned: '20', completed: null }
  ])
  assert.equal(weeks[0].planned, 30)
  assert.equal(weeks[0].completed, null)
  assert.ok(weeks.slice(1).every(week => week.planned === null && week.completed === null))
})

test('preserves supplied week labels and never manufactures twelve missing weeks', () => {
  assert.deepEqual(weeklyReportPoints(undefined), [])
  assert.deepEqual(weeklyReportPoints([]), [])
  const weeks = weeklyReportPoints([{ label: '  服务端第3周  ', planned: 50, completed: 45 }])
  assert.equal(weeks.length, 1)
  assert.equal(weeks[0].label, '服务端第3周')
})

test('demo explicitly supplies fictional object-shaped rates without production renderer inference', async () => {
  const server = await createServer({ configFile: false, root: process.cwd(), cacheDir: 'node_modules/.cache/weekly-report-tests', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  try {
    const { demoRequest } = await server.ssrLoadModule('/src/demo.ts')
    const stats = await demoRequest('/statistics')
    assert.equal(stats.demo, true)
    assert.equal(stats.weekly.length, 12)
    assert.ok(stats.weekly.every(week => typeof week === 'object' && week.label.includes('演示') && typeof week.planned === 'number' && typeof week.completed === 'number'))
    assert.equal(stats.weekly[0].completed, 20)
    assert.notEqual(stats.weekly[0].completed, stats.weekly[0].planned - 13)
    assert.deepEqual(weeklyReportPoints(stats.weekly), stats.weekly)
  } finally { await server.close() }
})
