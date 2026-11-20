import { classifySource, parseTelemetryTime, reportTimeoutMs, type SourceStatus } from './source-status.ts'

export interface HistoryPoint {
  time: number
  value: number
  source: SourceStatus
}

export interface HistorySeries {
  metric: string
  name: string
  unit: string | null
  units: string[]
  warning: string
  segments: HistoryPoint[][]
  points: HistoryPoint[]
  sources: SourceStatus[]
  from: number | null
  to: number | null
  minimum: number | null
  maximum: number | null
  threshold: number | null
  thresholdNote: string
  missingCount: number
  invalidCount: number
  unknownTimeCount: number
  duplicateCount: number
}

interface Event {
  id: bigint | null
  time: number
  value: number | null
  invalid: boolean
  unit: string | null
  source: SourceStatus
}

const names: Record<string, string> = {
  methane: '甲烷', temperature: '温度', humidity: '湿度', infrared: '红外温度'
}
const configuredUnits: Record<string, string> = {
  methane: '%LEL', temperature: '°C', humidity: '%RH', infrared: '°C'
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function ownValue(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined
}

function recordId(value: unknown): bigint | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : null
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  return BigInt(value)
}

/** Build metric-specific segments without converting units, inventing values or equalizing sample intervals. */
export function buildHistorySeries(
  rows: unknown[], metrics: string[], rules: Record<string, unknown>, reportSeconds: number
): HistorySeries[] {
  return [...new Set(metrics.filter(metric => typeof metric === 'string' && metric.trim()).map(metric => metric.trim()))].map(metric => {
    const events = new Map<number, Event>()
    let unknownTimeCount = 0, duplicateCount = 0
    for (const value of rows) {
      const row = record(value)
      if (!row || row.metric !== metric) continue
      const time = parseTelemetryTime(row.collected_at)
      if (time === null) { unknownTimeCount++; continue }
      const missing = row.metric_value === null || row.metric_value === undefined
      const valid = typeof row.metric_value === 'number' && Number.isFinite(row.metric_value)
      const id = recordId(row.id)
      const previous = events.get(time)
      if (previous) {
        duplicateCount++
        // History API order can tie on time. Match the latest API by preferring the greatest valid record ID.
        if (previous.id !== null && (id === null || id < previous.id)) continue
      }
      // Without record IDs (or with the same ID), the final input remains the explicit fallback.
      events.set(time, {
        id, time, value: valid ? row.metric_value as number : null, invalid: !missing && !valid,
        unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : null,
        source: classifySource(row.source)
      })
    }
    const ordered = [...events.values()].sort((a, b) => a.time - b.time)
    const usable = ordered.filter(event => event.value !== null)
    const units = [...new Set(usable.map(event => event.unit || '单位未提供'))]
    const unit = units.length === 1 && units[0] !== '单位未提供' ? units[0]! : null
    const warning = units.length > 1 ? `单位不一致（${units.join('、')}），未混合绘制`
      : usable.length && unit === null ? '样本单位未提供，暂不绘图' : ''
    const segments: HistoryPoint[][] = []
    let segment: HistoryPoint[] = []
    let previous: Event | undefined
    if (!warning) for (const event of ordered) {
      if (event.value === null) {
        if (segment.length) segments.push(segment)
        segment = []
        previous = undefined
        continue
      }
      if (previous && event.time - previous.time > reportTimeoutMs(reportSeconds)) {
        if (segment.length) segments.push(segment)
        segment = []
      }
      segment.push({ time: event.time, value: event.value, source: event.source })
      previous = event
    }
    if (segment.length) segments.push(segment)
    const points = segments.flat()
    const rawRule = Object.prototype.hasOwnProperty.call(rules, metric) ? record(rules[metric]) : null
    const rawThreshold = rawRule?.threshold_value ?? rawRule?.threshold
    const enabled = rawRule?.enabled === true
    const validThreshold = typeof rawThreshold === 'number' && Number.isFinite(rawThreshold)
    const canonicalUnit = ownValue(configuredUnits, metric)
    let threshold: number | null = null
    let thresholdNote = !rawRule ? '当前阈值未配置'
      : rawRule.enabled === false ? '当前规则未启用'
        : !enabled ? '当前规则启用状态待确认'
          : !validThreshold ? '当前阈值无效' : '当前配置，不代表触发时的历史阈值'
    if (enabled && validThreshold && (!unit || warning)) thresholdNote = '样本单位未确认一致，未绘制当前配置阈值'
    if (enabled && validThreshold && unit && !warning) {
      if (!canonicalUnit || canonicalUnit !== unit) thresholdNote = '当前配置单位与样本无法确认一致，未绘制阈值'
      else threshold = rawThreshold as number
    }
    const values = points.map(point => point.value)
    if (threshold !== null && values.length) values.push(threshold)
    let minimum: number | null = null, maximum: number | null = null
    if (values.length) {
      const low = Math.min(...values), high = Math.max(...values)
      const padding = high === low ? Math.max(Math.abs(low) * 0.1, 1) : (high - low) * 0.1
      minimum = Number.isFinite(low - padding) ? low - padding : low
      maximum = Number.isFinite(high + padding) ? high + padding : high
    }
    const sourceMap = new Map(usable.map(event => [event.source.raw, event.source]))
    return {
      metric, name: ownValue(names, metric) || metric, unit, units, warning, segments, points,
      sources: [...sourceMap.values()], from: ordered[0]?.time ?? null, to: ordered.at(-1)?.time ?? null,
      minimum, maximum, threshold, thresholdNote,
      missingCount: ordered.filter(event => event.value === null && !event.invalid).length,
      invalidCount: ordered.filter(event => event.invalid).length,
      unknownTimeCount, duplicateCount
    }
  })
}

/** Normalized scale preserves elapsed time and stays finite for extreme, but finite, numeric values. */
export function historyPosition(value: number, minimum: number, maximum: number): number {
  if (minimum === maximum) return 0.5
  const span = maximum - minimum
  if (Number.isFinite(span)) return (value - minimum) / span
  const scale = Math.max(Math.abs(minimum), Math.abs(maximum), 1)
  return (value / scale - minimum / scale) / (maximum / scale - minimum / scale)
}
