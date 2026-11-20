export const tokenKey = 'nephh-access-token'
export function clearSession() { sessionStorage.removeItem('nephh-demo'); sessionStorage.removeItem(tokenKey); sessionStorage.removeItem('nephh-session') }
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
