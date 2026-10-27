import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

type MemoryValue = { value: string; expiresAt: number };
type RedisClient = ReturnType<typeof createClient>;

// One Redis operation checks, charges and consumes the challenge. Failed
// attempts retain the original expiry instead of opening a new OTP window.
const VERIFY_OTP = `
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local challenge = cjson.decode(raw)
local attempts = challenge.attempts
local limit = tonumber(ARGV[2])
if type(attempts) ~= 'number' or attempts < 0 or attempts % 1 ~= 0
    or type(challenge.phone) ~= 'string' or type(challenge.code) ~= 'string'
    or attempts >= limit then
  redis.call('DEL', KEYS[1])
  return false
end
if challenge.code ~= ARGV[1] then
  challenge.attempts = attempts + 1
  if challenge.attempts >= limit then
    redis.call('DEL', KEYS[1])
  else
    redis.call('SET', KEYS[1], cjson.encode(challenge), 'KEEPTTL')
  end
  return false
end
redis.call('DEL', KEYS[1])
return challenge.phone
`;

@Injectable()
export class AuthStateStore implements OnModuleDestroy {
  private readonly memory = new Map<string, MemoryValue>();
  private client?: RedisClient;
  private connecting?: Promise<RedisClient>;
  private stopped = false;

  private async redis(): Promise<RedisClient | undefined> {
    if (this.stopped) throw new Error('Authentication state store is shutting down');
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_URL is required for production authentication state');
      }
      return undefined;
    }
    if (this.client?.isReady) return this.client;
    if (!this.connecting) {
      this.dispose(this.client);
      const client: RedisClient = createClient({
        url,
        // Authentication must fail promptly instead of queuing or retrying an
        // uncertain mutation. A later request may establish a fresh connection.
        socket: { connectTimeout: 3_000, socketTimeout: 5_000, reconnectStrategy: false },
        commandOptions: { timeout: 3_000 },
        disableOfflineQueue: true,
        commandsQueueMaxLength: 1_000,
      });
      this.client = client;
      client.on('error', () => undefined);
      const connection = client.connect()
        .then(() => {
          if (this.stopped) throw new Error('Authentication state store is shutting down');
          return client;
        })
        .catch((error: unknown) => {
          if (this.client === client) this.client = undefined;
          this.dispose(client);
          throw error;
        })
        .finally(() => {
          if (this.connecting === connection) this.connecting = undefined;
        });
      this.connecting = connection;
    }
    return this.connecting;
  }

  async ping(): Promise<'redis' | 'memory'> {
    const redis = await this.redis();
    if (!redis) return 'memory';
    const result = await redis.ping();
    if (result !== 'PONG') throw new Error('Redis ping failed');
    return 'redis';
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    const encoded = JSON.stringify(value);
    const redis = await this.redis();
    if (redis) {
      await redis.set(key, encoded, { EX: ttlSeconds });
      return;
    }
    this.memory.set(key, { value: encoded, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async setIfAbsentJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    const encoded = JSON.stringify(value);
    const redis = await this.redis();
    if (redis) {
      const result = await redis.set(key, encoded, { EX: ttlSeconds, NX: true });
      return result === 'OK';
    }
    const current = this.memory.get(key);
    if (current && current.expiresAt > Date.now()) return false;
    this.memory.set(key, { value: encoded, expiresAt: Date.now() + ttlSeconds * 1000 });
    return true;
  }

  async getJson<T>(key: string): Promise<T | null> {
    const redis = await this.redis();
    if (redis) {
      const value = await redis.get(key);
      return value ? (JSON.parse(value) as T) : null;
    }
    const item = this.memoryValue(key);
    return item ? JSON.parse(item.value) as T : null;
  }

  async delete(key: string) {
    const redis = await this.redis();
    if (redis) {
      await redis.del(key);
      return;
    }
    this.memory.delete(key);
  }

  async increment(key: string, ttlSeconds: number): Promise<number> {
    const redis = await this.redis();
    if (redis) {
      const multi = redis.multi();
      multi.incr(key);
      multi.expire(key, ttlSeconds, 'NX');
      const result = await multi.exec();
      return Number(result[0]);
    }
    const current = this.memoryValue(key);
    const next = (current ? JSON.parse(current.value) as number : 0) + 1;
    this.memory.set(key, { value: JSON.stringify(next), expiresAt: current?.expiresAt ?? Date.now() + ttlSeconds * 1000 });
    return next;
  }

  async consumeJson<T>(key: string): Promise<T | null> {
    const redis = await this.redis();
    if (redis) {
      const value = await redis.getDel(key);
      return value ? (JSON.parse(value) as T) : null;
    }
    const item = this.memoryValue(key);
    this.memory.delete(key);
    return item ? JSON.parse(item.value) as T : null;
  }

  async verifyOtpChallenge(key: string, code: string, maxAttempts: number): Promise<string | null> {
    const redis = await this.redis();
    if (redis) {
      const phone = await redis.eval(VERIFY_OTP, { keys: [key], arguments: [code, String(maxAttempts)] });
      return typeof phone === 'string' ? phone : null;
    }
    // No await between reading and mutating memory: concurrent callers must
    // observe the same single-use and attempt-limit rules as Redis.
    const item = this.memoryValue(key);
    if (!item) return null;
    const challenge = JSON.parse(item.value) as { attempts: number; code: string; phone: string };
    if (!Number.isSafeInteger(challenge.attempts) || challenge.attempts < 0
        || typeof challenge.phone !== 'string' || typeof challenge.code !== 'string'
        || challenge.attempts >= maxAttempts) {
      this.memory.delete(key);
      return null;
    }
    if (challenge.code !== code) {
      challenge.attempts += 1;
      if (challenge.attempts >= maxAttempts) this.memory.delete(key);
      else this.memory.set(key, { ...item, value: JSON.stringify(challenge) });
      return null;
    }
    this.memory.delete(key);
    return challenge.phone;
  }

  private memoryValue(key: string): MemoryValue | undefined {
    const item = this.memory.get(key);
    if (item && item.expiresAt > Date.now()) return item;
    this.memory.delete(key);
    return undefined;
  }

  private dispose(client?: RedisClient) {
    // destroy closes immediately and rejects pending work, including connect.
    if (client?.isOpen) client.destroy();
  }

  onModuleDestroy() {
    this.stopped = true;
    this.dispose(this.client);
    this.client = undefined;
  }
}
