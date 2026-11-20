import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createMobileServer } from '../backend/server.mjs';

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}

test('forwards only mobile operations with the original user and payload', async t => {
  const calls = [];
  const upstream = await listen(t, createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push([req.method, req.url, req.headers.authorization, body]);
    res.writeHead(req.url.endsWith('/4') ? 403 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 0, data: null }));
  }));
  const url = await listen(t, createMobileServer({ upstream }));
  const json = { 'Content-Type': 'application/json' };
  const headers = { ...json, Authorization: 'Bearer inspector' };
  const login = JSON.stringify({ username: 'worker', password: 'test' });
  const result = JSON.stringify({ result: '异常', abnormal: true });
  assert.equal((await fetch(url + '/api/auth/login', { method: 'POST', headers: json, body: login })).status, 200);
  assert.equal((await fetch(url + '/api/business/patrol/results/3', { method: 'POST', headers, body: result })).status, 200);
  assert.equal((await fetch(url + '/api/business/patrol/runs/4', { headers })).status, 403);
  assert.equal((await fetch(url + '/api/business/patrol/plans', { headers })).status, 404);
  assert.equal((await fetch(url + '/api/business/orders')).status, 401);
  assert.deepEqual(calls, [
    ['POST', '/api/auth/login', undefined, login],
    ['POST', '/api/business/patrol/results/3', 'Bearer inspector', result],
    ['GET', '/api/business/patrol/runs/4', 'Bearer inspector', '']
  ]);
});

test('times out a write without retry and separates liveness from readiness', async t => {
  let writes = 0;
  const upstream = await listen(t, createServer((req, res) => {
    if (req.method === 'POST') writes++;
    else res.writeHead(503).end();
  }));
  const url = await listen(t, createMobileServer({ upstream, timeoutMs: 300 }));
  assert.equal((await fetch(url + '/health/live')).status, 200);
  assert.equal((await fetch(url + '/health/ready')).status, 503);
  const response = await fetch(url + '/api/business/patrol/results/3', {
    method: 'POST', headers: { Authorization: 'Bearer inspector', 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(response.status, 504);
  assert.equal(writes, 1);
});

test('assistant validates the business session before calling DeepSeek with a separate key', async t => {
  let calls = 0;
  const upstream = await listen(t, createServer((req, res) => {
    assert.equal(req.url, '/api/business/profile');
    const authorized = req.headers.authorization === 'Bearer worker';
    res.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: authorized ? 0 : 401 }));
  }));
  const url = await listen(t, createMobileServer({ upstream, deepseekKey: 'test-key',
    deepseekFetch: async (endpoint, options) => {
      calls++;
      assert.equal(endpoint, 'https://api.deepseek.com/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      assert.deepEqual(JSON.parse(options.body).messages.at(-1), { role: 'user', content: '报修描述' });
      return Response.json({ choices: [{ message: { content: '请核对节点信息。' } }] });
    } }));
  const ask = (token, body) => fetch(url + '/api/assistant/ask', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body
  });
  assert.equal((await ask('invalid', '{"question":"报修描述"}')).status, 401);
  assert.equal((await ask('worker', '{"question":""}')).status, 400);
  const answer = await ask('worker', '{"question":"报修描述"}');
  assert.equal(answer.status, 200);
  assert.deepEqual((await answer.json()).data, { reply: '请核对节点信息。' });
  assert.equal(calls, 1);
});
