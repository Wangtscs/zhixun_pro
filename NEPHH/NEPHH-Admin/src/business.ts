import { tokenKey, clearSession } from './auth'
export type Row = Record<string, any>
/** Exposes status and uncertain write outcomes without treating a lost response as a safe retry. */
export class BusinessRequestError extends Error {
 readonly status: number
 readonly code: unknown
 readonly outcomeUnknown: boolean
 constructor(message: string, status: number, code?: unknown, outcomeUnknown = false) {
  super(message)
  this.name = 'BusinessRequestError'
  this.status = status
  this.code = code
  this.outcomeUnknown = outcomeUnknown
 }
}
export async function request<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
 if(sessionStorage.getItem('nephh-demo'))return (await import('./demo')).demoRequest(path,method,body) as Promise<T>
 const headers: Record<string, string> = { Authorization: `Bearer ${sessionStorage.getItem(tokenKey) || ''}` }
 if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json'
 const write = !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())
 const payload = body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }
 const signal = AbortSignal.timeout(10000)
 let response: Response
 try {
  response = await fetch('/api/business' + path, { method, headers, cache: 'no-store', signal, ...payload })
 } catch (error) {
  const timedOut = signal.aborted || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name))
  const reason = timedOut ? '请求超时' : '网络请求中断'
  throw new BusinessRequestError(write
   ? reason + '，提交结果未知，请刷新并核对业务状态；确认前不要重复提交'
   : reason + '，请检查网络后重试', 0, undefined, write)
 }
 // Authentication rejection must revoke the session even when a proxy returns a non-JSON body.
 if (response.status === 401) { clearSession(); window.location.assign('/login') }
 const rejected = response.status >= 400 && response.status < 500
 const failure = (message: string, code?: unknown, malformed = false): BusinessRequestError => {
  const unknown = write && !rejected && (malformed || response.status >= 500 || (typeof code === 'number' && code >= 500))
  const text = unknown ? '服务未确认提交结果，提交结果未知，请刷新并核对业务状态；确认前不要重复提交' : message
  return new BusinessRequestError(text, response.status, code, unknown)
 }
 let result: any
 try { result = await response.json() } catch {
  throw failure(response.status === 401 ? '登录已失效，请重新登录'
   : rejected ? `服务明确拒绝请求（HTTP ${response.status}），请核对权限和输入`
    : '服务返回异常，请检查后端连接', undefined, true)
 }
 if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.code !== 'number' || !Number.isFinite(result.code)) {
  throw failure(response.status === 401 ? '登录已失效，请重新登录'
   : rejected ? `服务明确拒绝请求（HTTP ${response.status}），请核对权限和输入`
    : '服务返回异常，请检查后端连接', undefined, true)
 }
 if (!response.ok || result.code !== 0) {
  throw failure(typeof result.message === 'string' && result.message ? result.message : '请求失败', result.code)
 }
 return result.data as T
}
export async function attachment(id: number, patrol=false) {
 const r = await fetch(`/api/business/${patrol?'patrol/':''}attachments/${id}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem(tokenKey)}` } })
 if (!r.ok) throw new Error('无法读取附件')
 const url = URL.createObjectURL(await r.blob()); window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export const roleName: Row = { ADMIN: '管理员', MANAGER: '值班长', INSPECTOR: '巡检员' }
export const statusName: Row = { DRAFT: '待派发', ASSIGNED: '待接单', ACCEPTED: '已接单', PROCESSING: '处理中', REVIEW: '待复核', COMPLETED: '已完成', CANCELLED: '已取消', OPEN: '未确认', ACKNOWLEDGED: '已确认', PENDING: '待执行' }
export const metricName: Row = { methane: '甲烷', temperature: '温度', humidity: '湿度', infrared: '红外温度', offline: '通信离线' }
export const severityName: Row = { HIGH: '高', MEDIUM: '中', LOW: '低' }
