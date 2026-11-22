import { synchronizeHardwareSession } from './hardware-collection'

export const tokenKey = 'nephh-access-token'
export const sessionChangedEvent = 'nephh:session-changed'

/** Same-window storage writes do not emit the browser's native storage event. */
function notifySessionChanged(): void {
 if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function' || typeof Event !== 'function') return
 try { window.dispatchEvent(new Event(sessionChangedEvent)) } catch { /* Session reset must not depend on UI event delivery. */ }
}

/** Stop collection before clearing authentication so an in-flight callback cannot send the next report. */
export function clearSession(): void {
 synchronizeHardwareSession('')
 try { sessionStorage.removeItem('nephh-demo'); sessionStorage.removeItem(tokenKey); sessionStorage.removeItem('nephh-session') }
 finally { notifySessionChanged() }
}

/** Publish a newly authenticated token and invalidate all prior collection state immediately. */
export function setSessionToken(token: string): void {
 if (typeof token !== 'string' || !token.trim()) throw new Error('后端未返回有效登录凭证')
 try { sessionStorage.removeItem('nephh-demo'); sessionStorage.setItem(tokenKey, token) }
 catch (error) { synchronizeHardwareSession(''); notifySessionChanged(); throw error }
 synchronizeHardwareSession(token)
 notifySessionChanged()
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
 const token = sessionStorage.getItem(tokenKey)
 const response = await fetch(`/api${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
 let result
 try { result = await response.json() }
 catch { throw new Error(response.status === 403 ? '当前访问地址未获后端允许，请检查跨域地址配置' : '服务返回异常，请确认后端已启动') }
 if (!response.ok || result.code !== 0) { if (response.status === 401) clearSession(); throw new Error(result.message || '请求失败') }
 return result.data as T
}
export async function currentUser() { return api<{ subject: string; username: string }>('/auth/me') }
