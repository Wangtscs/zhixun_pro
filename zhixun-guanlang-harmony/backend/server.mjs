import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const reads = /^\/api\/business\/(?:nodes|alarms|handbooks|profile|orders(?:\/[1-9]\d*)?|patrol\/runs(?:\/[1-9]\d*)?)$/;
const writes = /^\/api\/(?:auth\/login|assistant\/ask|business\/(?:orders(?:\/[1-9]\d*\/action)?|patrol\/results\/[1-9]\d*))$/;
const maxBody = 64 * 1024;

function reply(res, status, message, data = null) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ code: status === 200 ? 0 : status, message, data }));
}

async function askDeepSeek(res, body, authorization, origin, timeoutMs, key, model, send) {
  let question;
  try {
    const payload = JSON.parse(body);
    question = typeof payload?.question === 'string' ? payload.question.trim() : '';
  } catch {
    return reply(res, 400, '请求不是有效的 JSON');
  }
  if (!question || question.length > 4000) return reply(res, 400, '请输入 1 至 4000 字的问题');

  try {
    const identity = await fetch(new URL('/api/business/profile', origin), {
      headers: { Authorization: authorization }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error'
    });
    if (!identity.ok) {
      await identity.body?.cancel();
      if (identity.status === 401 || identity.status === 403) return reply(res, identity.status, '请重新登录');
      return reply(res, 502, '暂时无法验证登录状态');
    }
    if ((await identity.json())?.code !== 0) return reply(res, 401, '请重新登录');
  } catch {
    return reply(res, 502, '暂时无法验证登录状态');
  }
  if (!key) return reply(res, 503, '助手尚未配置 DeepSeek API Key');

  const signal = AbortSignal.timeout(55000);
  try {
    const response = await send('https://api.deepseek.com/chat/completions', {
      method: 'POST', signal, redirect: 'error',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, thinking: { type: 'disabled' }, max_tokens: 1024,
        messages: [
          { role: 'system', content: '你是管廊巡检助手。用简洁中文回答，区分已知信息与待核实事项，不编造监测读数或现场事实。涉及现场风险时，建议遵循现场规程并联系人工作业负责人。' },
          { role: 'user', content: question }
        ]
      })
    });
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 429) return reply(res, 429, '助手请求过于频繁，请稍后再试');
      return reply(res, 502, 'DeepSeek 请求失败，请检查服务端配置或稍后重试');
    }
    const content = (await response.json())?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) return reply(res, 502, 'DeepSeek 未返回答复');
    return reply(res, 200, 'ok', { reply: content.trim() });
  } catch {
    return reply(res, signal.aborted ? 504 : 502, signal.aborted ? '助手响应超时' : '无法获取 DeepSeek 答复');
  }
}

export function createMobileServer({ upstream, timeoutMs = 10000,
  deepseekKey = '', deepseekModel = 'deepseek-flash', deepseekFetch = fetch }) {
  const origin = new URL(upstream);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('MOBILE_UPSTREAM must be an HTTP(S) origin');
  }

  return createServer({ requestTimeout: 15000 }, async (req, res) => {
    const path = req.url;
    const method = req.method;
    if (method === 'GET' && path === '/health/live') return reply(res, 200, 'ok');
    if (method === 'GET' && path === '/health/ready') {
      try {
        const response = await fetch(new URL('/api/health', origin), {
          redirect: 'error', signal: AbortSignal.timeout(Math.min(timeoutMs, 2000))
        });
        await response.body?.cancel();
        return reply(res, response.ok ? 200 : 503, response.ok ? 'ok' : '业务服务暂不可用');
      } catch {
        return reply(res, 503, '业务服务暂不可用');
      }
    }
    if (!(method === 'GET' && reads.test(path) || method === 'POST' && writes.test(path))) {
      return reply(res, 404, '移动端接口不存在');
    }
    const login = path === '/api/auth/login';
    const authorization = req.headers.authorization;
    if (!login && !/^Bearer [^\s,]+$/i.test(authorization ?? '')) {
      return reply(res, 401, '请先登录');
    }

    let signal;
    try {
      const headers = { Accept: 'application/json' };
      if (!login) headers.Authorization = authorization;
      let body;
      if (method === 'POST') {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) {
          return reply(res, 415, '请求必须使用 JSON');
        }
        headers['Content-Type'] = 'application/json';
        const chunks = [];
        let length = 0;
        for await (const chunk of req.iterator({ destroyOnReturn: false })) {
          length += chunk.length;
          if (length > maxBody) {
            res.setHeader('Connection', 'close');
            return reply(res, 413, '请求内容过大');
          }
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
      if (path === '/api/assistant/ask') {
        return await askDeepSeek(res, body, authorization, origin, timeoutMs, deepseekKey, deepseekModel, deepseekFetch);
      }
      signal = AbortSignal.timeout(timeoutMs);
      const response = await fetch(new URL(path, origin), { method, headers, body, signal, redirect: 'manual' });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return reply(res, 502, '业务服务返回了意外的重定向');
      }
      const payload = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(payload);
    } catch {
      if (res.destroyed) return;
      if (signal?.aborted) return reply(res, 504, '业务服务响应超时，请刷新确认结果');
      return reply(res, 502, '无法连接业务服务');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const upstream = process.env.MOBILE_UPSTREAM ?? 'http://127.0.0.1:8080';
  const host = process.env.MOBILE_HOST ?? '127.0.0.1';
  const port = Number(process.env.MOBILE_PORT ?? '8090');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid MOBILE_PORT');
  createMobileServer({ upstream, deepseekKey: process.env.DEEPSEEK_API_KEY?.trim(),
    deepseekModel: process.env.DEEPSEEK_MODEL?.trim() || undefined })
    .listen(port, host, () => console.log('Harmony mobile backend listening on port ' + port));
}
