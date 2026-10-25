import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

type MemoryValue = { value: string; expiresAt: number };
type RedisClient = ReturnType<typeof createClient>;

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
    const item = this.memory.get(key);
    if (!item) return null;
    if (item.expiresAt <= Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return JSON.parse(item.value) as T;
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
    const current = await this.getJson<number>(key);
    const next = (current ?? 0) + 1;
    await this.setJson(key, next, ttlSeconds);
    return next;
  }

  async consumeJson<T>(key: string): Promise<T | null> {
    const redis = await this.redis();
    if (redis) {
      const value = await redis.getDel(key);
      return value ? (JSON.parse(value) as T) : null;
    }
    const value = await this.getJson<T>(key);
    if (value !== null) this.memory.delete(key);
    return value;
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
