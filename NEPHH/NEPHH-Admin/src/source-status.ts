/** Source labels describe the sample, not the node's configured platform. */
export type SourceKind = 'measurement' | 'simulation' | 'platform' | 'unknown'

export interface SourceStatus {
  kind: SourceKind
  label: string
  raw: string
}

export interface TelemetrySample {
  metric_value?: unknown
  collected_at?: unknown
  received_at?: unknown
  source?: unknown
}

export type SampleState = 'missing' | 'invalid' | 'time-unknown' | 'future' | 'stale' | 'fresh'

export interface SampleStatus {
  state: SampleState
  label: string
  value: number | null
  collectedAtMs: number | null
  receivedAtMs: number | null
  ageMs: number | null
  source: SourceStatus
}

const knownSources: Record<string, { kind: SourceKind; label: string }> = {
  SIMULATOR: { kind: 'simulation', label: '平台模拟' },
  ESP32_CH4_DEMO_USB: { kind: 'simulation', label: '设备模拟甲烷（USB）' },
  ESP32_CH4_DEMO_WIFI: { kind: 'simulation', label: '设备模拟甲烷（Wi-Fi）' },
  ESP32_DHT11_USB: { kind: 'measurement', label: '温湿度实测（USB采集桥）' },
  ESP32_DHT11_WIFI: { kind: 'measurement', label: '温湿度实测（Wi-Fi采集桥）' },
  HUAWEI_IOT: { kind: 'platform', label: '华为IoT上报（实测性质待确认）' }
}

/** Unknown future source names must not silently become certified measurements. */
export function classifySource(source: unknown): SourceStatus {
  const raw = typeof source === 'string' ? source.trim() : ''
  const known = Object.prototype.hasOwnProperty.call(knownSources, raw) ? knownSources[raw] : undefined
  return known ? { ...known, raw } : { kind: 'unknown', label: '来源待确认', raw }
}

/** API times require an explicit timezone; ambiguous browser-local dates stay unknown. */
export function parseTelemetryTime(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const time = value.trim()
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.exec(time)
  if (!match) return null
  const month = Number(match[2]), day = Number(match[3])
  const monthEnd = new Date(0)
  monthEnd.setUTCFullYear(Number(match[1]), month, 0)
  if (month < 1 || month > 12 || day < 1 || day > monthEnd.getUTCDate()) return null
  const parsed = Date.parse(time)
  return Number.isFinite(parsed) ? parsed : null
}

/** Invalid/missing configuration uses the existing 30-second reporting default. */
export function reportTimeoutMs(reportSeconds: unknown): number {
  const seconds = typeof reportSeconds === 'number' ? reportSeconds : Number(reportSeconds)
  return Number.isFinite(seconds) && seconds >= 5 && seconds <= 86400 ? seconds * 3000 : 90000
}

/** Refresh/receive time never replaces collection time when deciding freshness. */
export function assessSample(
  sample: TelemetrySample | null | undefined,
  reportSeconds: unknown,
  nowMs: number = Date.now()
): SampleStatus {
  const result: SampleStatus = {
    state: 'missing', label: '暂无读数', value: null,
    collectedAtMs: parseTelemetryTime(sample?.collected_at),
    receivedAtMs: parseTelemetryTime(sample?.received_at),
    ageMs: null, source: classifySource(sample?.source)
  }
  if (!sample || sample.metric_value === null || sample.metric_value === undefined) return result
  if (typeof sample.metric_value !== 'number' || !Number.isFinite(sample.metric_value)) {
    return { ...result, state: 'invalid', label: '读数无效' }
  }
  result.value = sample.metric_value
  if (result.collectedAtMs === null || !Number.isFinite(nowMs)) {
    return { ...result, state: 'time-unknown', label: '采样时间待确认' }
  }
  const ageMs = nowMs - result.collectedAtMs
  result.ageMs = ageMs
  // The ingestion contract allows device clock skew of at most 60 seconds.
  if (ageMs < -60000) return { ...result, state: 'future', label: '采样时钟异常' }
  if (ageMs > reportTimeoutMs(reportSeconds)) return { ...result, state: 'stale', label: '历史读数（已过期）' }
  return { ...result, state: 'fresh', label: '最新采样' }
}
