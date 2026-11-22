import { reactive } from 'vue'
import { parseTelemetryTime } from './source-status.ts'

export interface HardwareReport {
  messageId: string
  source: string
  collectedAt: string
  values: Record<string, number>
}

export interface HardwareUploadResult {
  status: 'verified' | 'partial' | 'unverified' | 'stopped' | 'abandoned'
  attempted: number
  acknowledged: number
  verified: number
  planned: number
  inserted: number
  error: string
}

type DataRow = Record<string, any>
type HardwareApi = (path: string, method?: string, body?: unknown) => Promise<unknown>

export function isHardwareFrameFresh(snapshot: DataRow | null, nowMs = Date.now()): boolean {
  const received = parseTelemetryTime(snapshot?.latest?.receivedAt)
  return snapshot?.application === 'nephh-usb-bridge' && snapshot.fresh === true && received !== null &&
    Number.isFinite(nowMs) && nowMs - received >= -60000 && nowMs - received <= 6500
}

/** Accept only the bridge's explicit measured-climate and simulated-methane report contracts. */
export function hardwareReports(snapshot: DataRow | null): HardwareReport[] {
  if (!snapshot?.latest || typeof snapshot.latest.messageId !== 'string' || !snapshot.latest.messageId.trim()) return []
  const output: HardwareReport[] = []
  for (const [candidate, methane] of [[snapshot.report, false], [snapshot.methaneReport, true]] as const) {
    if (!candidate) continue
    const expectedId = snapshot.latest.messageId + (methane ? '-ch4' : '')
    const sources = methane ? ['ESP32_CH4_DEMO_USB', 'ESP32_CH4_DEMO_WIFI'] : ['ESP32_DHT11_USB', 'ESP32_DHT11_WIFI']
    const time = parseTelemetryTime(candidate.collectedAt)
    if (candidate.messageId !== expectedId || expectedId.length > 100 || !sources.includes(candidate.source) ||
        time === null || time !== parseTelemetryTime(snapshot.latest.receivedAt) || !candidate.values || typeof candidate.values !== 'object') {
      throw new Error('采集桥报文来源、帧号或时间不一致，未发送业务数据')
    }
    const entries = Object.entries(candidate.values)
    const keys = methane ? ['methane'] : ['temperature', 'humidity']
    if (entries.length !== keys.length || entries.some(([key, value]) => !keys.includes(key) || typeof value !== 'number' || !Number.isFinite(value)) ||
        (methane && (candidate.values.methane < 0 || candidate.values.methane > 100))) {
      throw new Error('采集桥指标或读数无效，未发送业务数据')
    }
    output.push({ messageId: candidate.messageId, source: candidate.source, collectedAt: candidate.collectedAt, values: { ...candidate.values } })
  }
  return output
}

/** Stopping blocks the next POST; already attempted reports are still read back under the same session. */
export async function uploadHardwareReports(
  nodeId: number,
  reports: readonly HardwareReport[],
  dependencies: { api: HardwareApi; isActive: () => boolean; isCurrent: () => boolean }
): Promise<HardwareUploadResult> {
  const result: HardwareUploadResult = { status: 'stopped', attempted: 0, acknowledged: 0, verified: 0, planned: reports.length, inserted: 0, error: '' }
  if (!Number.isSafeInteger(nodeId) || nodeId <= 0 || !reports.length) return { ...result, status: 'unverified', error: '未配置有效节点或上报内容' }
  const attempted: HardwareReport[] = []
  for (const report of reports) {
    if (!dependencies.isCurrent()) return { ...result, status: 'abandoned' }
    if (!dependencies.isActive()) break
    attempted.push(report); result.attempted++
    try {
      const receipt = await dependencies.api(`/nodes/${nodeId}/telemetry`, 'POST', report) as DataRow | null
      result.acknowledged++
      if (typeof receipt?.inserted === 'number' && Number.isFinite(receipt.inserted)) result.inserted += receipt.inserted
    } catch (error) {
      result.error = error instanceof Error ? error.message : '上报结果未确认'
      break
    }
  }
  if (!dependencies.isCurrent()) return { ...result, status: 'abandoned' }
  if (!attempted.length) return result
  try {
    // Reports can have different collection times; read back each attempted message in its own window.
    for (const report of attempted) {
      if (!dependencies.isCurrent()) return { ...result, status: 'abandoned' }
      const collected = parseTelemetryTime(report.collectedAt)
      if (collected === null) throw new Error('无法确认业务采集时间，未宣称入库成功')
      const start = Math.floor(collected / 1000) * 1000
      const query = `?from=${encodeURIComponent(new Date(start).toISOString())}&to=${encodeURIComponent(new Date(start + 2000).toISOString())}`
      const history = await dependencies.api(`/nodes/${nodeId}/history${query}`)
      if (!dependencies.isCurrent()) return { ...result, status: 'abandoned' }
      const matched = Array.isArray(history) && Object.entries(report.values).every(([metric, value]) => history.some((row: DataRow) =>
        row.message_id === report.messageId && row.metric === metric && typeof row.metric_value === 'number' && row.metric_value === value &&
        row.source === report.source && Math.floor((parseTelemetryTime(row.collected_at) ?? NaN) / 1000) === Math.floor(collected / 1000)))
      if (matched) result.verified++
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : '回读失败'
  }
  result.status = result.verified === result.planned ? 'verified' : result.verified > 0 ? 'partial' : 'unverified'
  if (result.status === 'verified') result.error = ''
  if (result.status !== 'verified' && !result.error) result.error = result.attempted < result.planned ? '已停止，当前帧仅部分发送并核对' : '上报已有应答，但本帧尚未全部通过历史回读核对'
  return result
}

/** A factory keeps behavior tests independent; the exported singleton is shared by the console and top bar. */
export function createHardwareCollection() {
  const state = reactive({ active: false, busy: false, nodeId: 0, nodeCode: '', phase: 'idle', notice: '', error: '', result: null as HardwareUploadResult | null })
  let session = '', revision = 0
  function synchronizeSession(next: string): number {
    if (next !== session) {
      session = next; revision++
      Object.assign(state, { active: false, busy: false, nodeId: 0, nodeCode: '', phase: 'idle', notice: '账号已变化，上报已停止', error: '', result: null })
    }
    return revision
  }
  function isCurrent(expected: string, version: number): boolean { return expected === session && version === revision }
  function stop(notice = '已停止上报'): void {
    state.active = false
    state.notice = state.busy ? notice + '；已发请求仍在核对，不会发送下一份报文' : notice
    state.phase = state.busy ? 'verifying' : 'stopped'
  }
  function start(context: { session: string; role: string; demo: boolean; nodeId: number; nodeCode: string }): void {
    synchronizeSession(context.session)
    if (!context.session || context.demo || !['ADMIN', 'MANAGER'].includes(context.role)) throw new Error('仅真实业务管理员或值班长可开始上报')
    if (state.busy) throw new Error('当前请求仍在核对，请等待结果')
    if (!Number.isSafeInteger(context.nodeId) || context.nodeId <= 0) throw new Error('请选择有效接收节点')
    Object.assign(state, { active: true, nodeId: context.nodeId, nodeCode: context.nodeCode, phase: 'active', notice: '上报中，离开控制台仍将继续；可在顶部停止', error: '', result: null })
  }
  async function send(reports: readonly HardwareReport[], dependencies: { api: HardwareApi; getSession: () => string }): Promise<HardwareUploadResult> {
    const owner = session, version = revision, target = state.nodeId
    if (!state.active || state.busy) return { status: 'stopped', attempted: 0, acknowledged: 0, verified: 0, planned: reports.length, inserted: 0, error: '' }
    state.busy = true; state.phase = 'verifying'
    const current = () => isCurrent(owner, version) && dependencies.getSession() === owner
    const result = await uploadHardwareReports(target, reports, { api: dependencies.api, isActive: () => state.active, isCurrent: current })
    if (dependencies.getSession() !== session) synchronizeSession(dependencies.getSession())
    if (!current()) return { ...result, status: 'abandoned' }
    state.busy = false; state.result = result; state.error = result.error
    if (result.status !== 'verified') state.active = false
    state.phase = state.active ? 'active' : result.status === 'verified' || result.status === 'partial' ? 'stopped' : 'error'
    state.notice = result.status === 'verified' ? '本帧全部已入库并回读核对' : result.status === 'partial' ? `仅 ${result.verified}/${result.planned} 份报文已回读核对` : '本帧入库结果未全部确认，已停止连续上报'
    return result
  }
  return { state, synchronizeSession, version: () => revision, isCurrent, start, stop, send }
}

export const hardwareCollection = createHardwareCollection()
export function synchronizeHardwareSession(session: string): void { hardwareCollection.synchronizeSession(session) }
export function stopHardwareCollection(): void { hardwareCollection.stop() }
