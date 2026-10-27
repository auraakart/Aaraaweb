import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from 'redis';
import { AuthStateStore } from './auth-state.store';

vi.mock('redis', () => ({ createClient: vi.fn() }));

function client() {
  const fake = {
    isOpen: false,
    isReady: false,
    on: vi.fn(),
    connect: vi.fn(async () => { fake.isOpen = true; fake.isReady = true; }),
    destroy: vi.fn(() => { fake.isOpen = false; fake.isReady = false; }),
    ping: vi.fn().mockResolvedValue('PONG'),
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    getDel: vi.fn().mockResolvedValue(null),
    eval: vi.fn().mockResolvedValue(null),
    multi: vi.fn(),
  };
  return fake;
}

describe('AuthStateStore connection lifecycle', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('recovers after an initial rejection without retaining the rejected promise', async () => {
    const failed = client();
    failed.connect.mockImplementationOnce(async () => {
      failed.isOpen = true;
      throw new Error('connection unavailable');
    });
    const healthy = client();
    vi.mocked(createClient).mockReturnValueOnce(failed as never).mockReturnValueOnce(healthy as never);
    const store = new AuthStateStore();
    await expect(store.ping()).rejects.toThrow('connection unavailable');
    expect(failed.destroy).toHaveBeenCalledOnce();
    await expect(store.ping()).resolves.toBe('redis');
    expect(createClient).toHaveBeenCalledTimes(2);
    store.onModuleDestroy();
  });

  it('shares an in-flight connection and reuses only ready clients', async () => {
    const fake = client();
    let connected!: () => void;
    fake.connect.mockImplementationOnce(() => new Promise<void>((resolve) => {
      connected = () => { fake.isOpen = true; fake.isReady = true; resolve(); };
    }));
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    const pending = [store.ping(), store.ping()];
    expect(createClient).toHaveBeenCalledOnce();
    connected();
    await expect(Promise.all(pending)).resolves.toEqual(['redis', 'redis']);
    await store.ping();
    expect(fake.connect).toHaveBeenCalledOnce();
    store.onModuleDestroy();
  });

  it('replaces a client that loses readiness after a successful connection', async () => {
    const first = client();
    const second = client();
    vi.mocked(createClient).mockReturnValueOnce(first as never).mockReturnValueOnce(second as never);
    const store = new AuthStateStore();
    await store.ping();
    first.isReady = false;
    await expect(store.ping()).resolves.toBe('redis');
    expect(first.destroy).toHaveBeenCalledOnce();
    expect(second.connect).toHaveBeenCalledOnce();
    store.onModuleDestroy();
  });

  it('bounds connection/command work and disables uncertain offline replay', async () => {
    vi.mocked(createClient).mockReturnValue(client() as never);
    const store = new AuthStateStore();
    await store.ping();
    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
      socket: { connectTimeout: 3_000, socketTimeout: 5_000, reconnectStrategy: false },
      commandOptions: { timeout: 3_000 }, disableOfflineQueue: true, commandsQueueMaxLength: 1_000,
    }));
    store.onModuleDestroy();
  });

  it('fails closed without Redis in production', async () => {
    vi.stubEnv('REDIS_URL', '');
    await expect(new AuthStateStore().setJson('key', 'secret', 30)).rejects.toThrow('REDIS_URL is required');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('does not reconnect or revive a store after shutdown', async () => {
    const fake = client();
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    await store.ping();
    store.onModuleDestroy();
    store.onModuleDestroy();
    await expect(store.ping()).rejects.toThrow('shutting down');
    expect(fake.destroy).toHaveBeenCalledOnce();
    expect(createClient).toHaveBeenCalledOnce();
  });

  it('rejects a connection that finishes concurrently with shutdown', async () => {
    const fake = client();
    let connected!: () => void;
    fake.connect.mockImplementationOnce(() => new Promise<void>((resolve) => {
      fake.isOpen = true;
      connected = () => resolve();
    }));
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    const pending = store.ping();
    store.onModuleDestroy();
    connected();
    await expect(pending).rejects.toThrow('shutting down');
    expect(fake.destroy).toHaveBeenCalledOnce();
  });

  it('propagates command failures without replaying a mutation', async () => {
    const fake = client();
    fake.set.mockRejectedValueOnce(new Error('uncertain write'));
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    await expect(store.setJson('key', { code: '123456' }, 60)).rejects.toThrow('uncertain write');
    expect(fake.set).toHaveBeenCalledOnce();
    store.onModuleDestroy();
  });

  it('uses one Redis operation for OTP verification and never replays uncertain results', async () => {
    const fake = client();
    fake.eval.mockResolvedValueOnce('+919876543210').mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('uncertain verification'));
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    await expect(store.verifyOtpChallenge('otp', '123456', 5)).resolves.toBe('+919876543210');
    await expect(store.verifyOtpChallenge('otp', '123456', 5)).resolves.toBeNull();
    await expect(store.verifyOtpChallenge('otp', '123456', 5)).rejects.toThrow('uncertain verification');
    expect(fake.eval).toHaveBeenCalledTimes(3);
    expect(fake.eval).toHaveBeenCalledWith(expect.any(String), { keys: ['otp'], arguments: ['123456', '5'] });
    expect(fake.get).not.toHaveBeenCalled();
    expect(fake.set).not.toHaveBeenCalled();
    store.onModuleDestroy();
  });

  it('retains atomic Redis NX, consume and fixed-window increment semantics', async () => {
    const fake = client();
    const transaction = { incr: vi.fn(), expire: vi.fn(), exec: vi.fn().mockResolvedValue([2, 1]) };
    fake.multi.mockReturnValue(transaction);
    fake.getDel.mockResolvedValueOnce(JSON.stringify({ sessionId: 'session' }));
    fake.set.mockResolvedValueOnce(null);
    vi.mocked(createClient).mockReturnValue(fake as never);
    const store = new AuthStateStore();
    await expect(store.setIfAbsentJson('claim', { nonce: 1 }, 60)).resolves.toBe(false);
    expect(fake.set).toHaveBeenCalledWith('claim', '{"nonce":1}', { EX: 60, NX: true });
    await expect(store.consumeJson('token')).resolves.toEqual({ sessionId: 'session' });
    await expect(store.increment('rate-limit', 60)).resolves.toBe(2);
    expect(transaction.expire).toHaveBeenCalledWith('rate-limit', 60, 'NX');
    await store.delete('token');
    expect(fake.del).toHaveBeenCalledWith('token');
    fake.get.mockResolvedValueOnce('{"ok":true}');
    await expect(store.getJson('state')).resolves.toEqual({ ok: true });
    fake.ping.mockResolvedValueOnce('unexpected');
    await expect(store.ping()).rejects.toThrow('Redis ping failed');
    store.onModuleDestroy();
  });
});

describe('AuthStateStore development memory state', () => {
  beforeEach(() => { vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('REDIS_URL', ''); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

  it('expires values, consumes once and respects NX without Redis', async () => {
    vi.useFakeTimers();
    const store = new AuthStateStore();
    await expect(store.ping()).resolves.toBe('memory');
    await expect(store.setIfAbsentJson('claim', { id: 1 }, 1)).resolves.toBe(true);
    await expect(store.setIfAbsentJson('claim', { id: 2 }, 1)).resolves.toBe(false);
    await expect(store.consumeJson('claim')).resolves.toEqual({ id: 1 });
    await expect(store.consumeJson('claim')).resolves.toBeNull();
    await store.setJson('expiry', { id: 1 }, 1);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(store.getJson('expiry')).resolves.toBeNull();
    await expect(store.increment('rate-limit', 1)).resolves.toBe(1);
    await expect(store.increment('rate-limit', 1)).resolves.toBe(2);
    await store.delete('rate-limit');
    await expect(store.getJson('rate-limit')).resolves.toBeNull();
    store.onModuleDestroy();
  });

  it('does not lose concurrent increments or slide a fixed rate window', async () => {
    vi.useFakeTimers();
    const store = new AuthStateStore();
    const counts = await Promise.all(Array.from({ length: 20 }, () => store.increment('limit', 10)));
    expect(counts).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    await vi.advanceTimersByTimeAsync(9_000);
    await expect(store.increment('limit', 10)).resolves.toBe(21);
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(store.increment('limit', 10)).resolves.toBe(1);
    store.onModuleDestroy();
  });

  it('allows one concurrent grant consumer', async () => {
    const store = new AuthStateStore();
    await store.setJson('grant', { userId: 'one' }, 60);
    const results = await Promise.all(Array.from({ length: 12 }, () => store.consumeJson('grant')));
    expect(results.filter(Boolean)).toEqual([{ userId: 'one' }]);
    store.onModuleDestroy();
  });

  it.each([
    { attempts: 5, code: '123456', phone: '+919876543210' },
    { attempts: -1, code: '123456', phone: '+919876543210' },
    { attempts: 0.5, code: '123456', phone: '+919876543210' },
    { attempts: 0, code: 123456, phone: '+919876543210' },
    { attempts: 0, code: '123456', phone: 123 },
  ])('rejects invalid or exhausted OTP state %j', async challenge => {
    const store = new AuthStateStore();
    await store.setJson('otp', challenge, 60);
    await expect(store.verifyOtpChallenge('otp', '123456', 5)).resolves.toBeNull();
    expect(await store.getJson('otp')).toBeNull();
    store.onModuleDestroy();
  });
});
