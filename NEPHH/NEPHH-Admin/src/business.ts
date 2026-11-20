import { tokenKey, clearSession } from './auth'
export type Row = Record<string, any>
export async function request<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
 if(sessionStorage.getItem('nephh-demo'))return (await import('./demo')).demoRequest(path,method,body) as Promise<T>
 const headers: Record<string, string> = { Authorization: `Bearer ${sessionStorage.getItem(tokenKey) || ''}` }
 if (!(body instanceof FormData)) headers['Content-Type'] = 'application/json'
 const response = await fetch('/api/business' + path, { method, headers, cache: 'no-store', signal: AbortSignal.timeout(10000), ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }) })
 let result: any
 try { result = await response.json() } catch { throw new Error('服务返回异常，请检查后端连接') }
 if (!response.ok || result.code !== 0) {
  if (response.status === 401) { clearSession(); window.location.assign('/login') }
  throw new Error(result.message || '请求失败')
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
