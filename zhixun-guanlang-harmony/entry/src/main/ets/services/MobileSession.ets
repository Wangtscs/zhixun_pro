import http from '@ohos.net.http';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface LoginResponse {
  accessToken: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

export class MobileSession {
  private static readonly baseUrl: string = 'http://10.108.40.19:8090';
  private static token: string = '';

  static async login(username: string, password: string): Promise<void> {
    const credentials: LoginRequest = { username: username, password: password };
    const login = await MobileSession.request<LoginResponse>('/api/auth/login',
      http.RequestMethod.POST, JSON.stringify(credentials));
    if (!login?.accessToken) { throw new Error('后端未返回登录凭证'); }
    MobileSession.token = login.accessToken;
  }

  static active(): boolean { return MobileSession.token.length > 0; }

  static logout(): void { MobileSession.token = ''; }

  static get<T>(path: string): Promise<T> {
    return MobileSession.request<T>(path, http.RequestMethod.GET, undefined, MobileSession.token);
  }

  static post<T>(path: string, body: string, readTimeout: number = 12000): Promise<T> {
    return MobileSession.request<T>(path, http.RequestMethod.POST, body, MobileSession.token, readTimeout);
  }

  private static async request<T>(path: string, method: http.RequestMethod,
    body?: string, token?: string, readTimeout: number = 12000): Promise<T> {
    const client = http.createHttp();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) { headers['Authorization'] = 'Bearer ' + token; }
    let response: http.HttpResponse;
    try {
      response = await client.request(MobileSession.baseUrl + path, {
        method: method, header: headers, extraData: body,
        expectDataType: http.HttpDataType.STRING, connectTimeout: 8000, readTimeout: readTimeout
      });
    } catch {
      throw new Error('无法连接服务，请检查网络后重试');
    } finally {
      client.destroy();
    }
    if (response.responseCode === 401 && token) { throw new Error('登录已失效，请退出后重新登录'); }
    let payload: ApiResponse<T>;
    try {
      payload = JSON.parse(response.result as string) as ApiResponse<T>;
    } catch {
      throw new Error('后端返回了无法读取的响应（HTTP ' + response.responseCode + '）');
    }
    if (response.responseCode < 200 || response.responseCode >= 300 || payload.code !== 0) {
      throw new Error(payload.message || '请求失败（HTTP ' + response.responseCode + '）');
    }
    return payload.data;
  }
}
