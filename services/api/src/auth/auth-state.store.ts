import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

type MemoryValue = { value: string; expiresAt: number };
type RedisClient = ReturnType<typeof createClient>;

@Injectable()
export class AuthStateStore implements OnModuleDestroy {
  private readonly memory = new Map<string, MemoryValue>();
  private client?: RedisClient;
  private connecting?: Promise<RedisClient>;

  private async redis(): Promise<RedisClient | undefined> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('REDIS_URL is required for production authentication state');
      }
      return undefined;
    }
    if (this.client?.isOpen) return this.client;
    if (!this.connecting) {
      const client: RedisClient = createClient({ url });
      client.on('error', () => undefined);
      this.connecting = client.connect().then(() => {
        this.client = client;
        this.connecting = undefined;
        return client;
      });
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

  async onModuleDestroy() {
    if (this.client?.isOpen) await this.client.quit();
  }
}
