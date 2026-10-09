import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createAaraagateApiClient, AaraagateApiError } from '../src/index.ts';

async function fixture(t, handler) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return createAaraagateApiClient(`http://127.0.0.1:${server.address().port}`);
}

test('deadline bounds stalled headers and subsequent requests still work', async t => {
  const request = await fixture(t, (req, res) => {
    if (req.url.endsWith('/ok')) res.end('{"ok":true}');
  });
  await assert.rejects(request('/stall', { timeoutMs: 100 }), { name: 'TimeoutError' });
  assert.deepEqual(await request('/ok'), { ok: true });
});

test('deadline covers incomplete response body', async t => {
  const request = await fixture(t, (_req, res) => { res.writeHead(200); res.write('{'); });
  await assert.rejects(request('/stall', { timeoutMs: 100 }));
});

test('caller cancellation remains authoritative', async t => {
  const request = await fixture(t, () => {});
  const controller = new AbortController();
  const pending = request('/stall', { signal: controller.signal, timeoutMs: 5000 });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('uncertain mutation is sent once with original idempotency identity', async t => {
  let calls = 0;
  let key;
  const request = await fixture(t, (req, _res) => { calls++; key = req.headers['idempotency-key']; });
  await assert.rejects(request('/payment', { method: 'POST', headers: { 'Idempotency-Key': 'same-order' }, body: '{}', timeoutMs: 100 }));
  assert.equal(calls, 1);
  assert.equal(key, 'same-order');
});

test('HTTP denial preserves structured error and does not retry', async t => {
  let calls = 0;
  const request = await fixture(t, (_req, res) => { calls++; res.writeHead(403); res.end('{"message":"Denied"}'); });
  await assert.rejects(request('/private'), error => error instanceof AaraagateApiError && error.status === 403 && error.message === 'Denied');
  assert.equal(calls, 1);
});
