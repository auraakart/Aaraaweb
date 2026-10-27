import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import { AuthStateStore } from './auth-state.store';

// Dedicated ephemeral test Redis only; never use a deployment REDIS_URL.
const url = process.env.AUTH_TEST_REDIS_URL;
const describeRedis = url ? describe : describe.skip;

describeRedis('atomic OTP verification against Redis', () => {
  const prefix = `test:otp:${randomUUID()}:`;
  const client = createClient({ url, socket: { connectTimeout: 1_000, reconnectStrategy: false } });
  client.on('error', () => undefined);
  const stores = [new AuthStateStore(), new AuthStateStore()];
  const keys: string[] = [];
  const phone = '+919876543210';

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', url!);
    await client.connect();
  });
  afterAll(async () => {
    stores.forEach(store => store.onModuleDestroy());
    if (client.isReady) {
      for (const key of keys) await client.del(key);
      await client.quit();
    } else if (client.isOpen) client.destroy();
    vi.unstubAllEnvs();
  });

  async function challenge(name: string, attempts = 0) {
    const key = prefix + name;
    keys.push(key);
    await stores[0].setJson(key, { phone, code: '123456', attempts }, 60);
    return key;
  }

  it('allows only one success across independent API store connections', async () => {
    const key = await challenge('success');
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      stores[index % 2].verifyOtpChallenge(key, '123456', 5)));
    expect(results.filter(Boolean)).toEqual([phone]);
    expect(await client.exists(key)).toBe(0);
  });

  it('charges every parallel incorrect attempt and cannot resurrect exhausted state', async () => {
    const key = await challenge('wrong');
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      stores[index % 2].verifyOtpChallenge(key, '000000', 5)));
    expect(results.every(result => result === null)).toBe(true);
    expect(await client.exists(key)).toBe(0);
    expect(await stores[0].verifyOtpChallenge(key, '123456', 5)).toBeNull();
  });

  it('preserves expiry and allows the last valid attempt', async () => {
    const key = await challenge('expiry');
    await client.pExpire(key, 2_000);
    const before = await client.pTTL(key);
    expect(await stores[0].verifyOtpChallenge(key, '000000', 5)).toBeNull();
    const after = await client.pTTL(key);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
    const stored = JSON.parse((await client.get(key))!);
    expect(stored.attempts).toBe(1);
    const last = await challenge('last', 4);
    expect(await stores[1].verifyOtpChallenge(last, '123456', 5)).toBe(phone);
    expect(await stores[0].verifyOtpChallenge(last, '123456', 5)).toBeNull();
  });

  it('cannot restore state when correct and incorrect checks race', async () => {
    const key = await challenge('mixed');
    const results = await Promise.all(Array.from({ length: 30 }, (_, index) =>
      stores[index % 2].verifyOtpChallenge(key, index % 3 === 0 ? '123456' : '000000', 5)));
    expect(results.filter(Boolean).length).toBeLessThanOrEqual(1);
    expect(await client.exists(key)).toBe(0);
  });

  it('rejects an expired or malformed challenge', async () => {
    const key = await challenge('expired');
    await client.pExpireAt(key, Date.now() - 1);
    expect(await stores[0].verifyOtpChallenge(key, '123456', 5)).toBeNull();
    for (const attempts of [-1, 0.5, 5]) {
      const invalid = await challenge(`invalid-${attempts}`, attempts);
      expect(await stores[0].verifyOtpChallenge(invalid, '123456', 5)).toBeNull();
      expect(await client.exists(invalid)).toBe(0);
    }
  });
});
