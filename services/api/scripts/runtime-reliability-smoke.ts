import { strict as assert } from 'node:assert';
import { AuthStateStore } from '../src/auth/auth-state.store';

async function run() {
  if (!process.env.REDIS_URL) throw new Error('REDIS_URL is required for runtime reliability smoke');
  process.env.NODE_ENV = 'production';

  const prefix = `v3-runtime-smoke:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const store = new AuthStateStore();

  try {
    assert.equal(await store.ping(), 'redis');

    const jsonKey = `${prefix}:json`;
    await store.setJson(jsonKey, { ok: true }, 60);
    assert.deepEqual(await store.getJson(jsonKey), { ok: true });

    const onceKey = `${prefix}:once`;
    assert.equal(await store.setIfAbsentJson(onceKey, { first: true }, 60), true);
    assert.equal(await store.setIfAbsentJson(onceKey, { first: false }, 60), false);
    assert.deepEqual(await store.consumeJson(onceKey), { first: true });
    assert.equal(await store.consumeJson(onceKey), null);

    const counterKey = `${prefix}:counter`;
    assert.equal(await store.increment(counterKey, 60), 1);
    assert.equal(await store.increment(counterKey, 60), 2);
    await store.delete(counterKey);
    assert.equal(await store.getJson(counterKey), null);
  } finally {
    await store.onModuleDestroy();
  }

  // A fresh application store must reconnect after the first client has closed.
  const reconnected = new AuthStateStore();
  try {
    assert.equal(await reconnected.ping(), 'redis');
  } finally {
    await reconnected.onModuleDestroy();
  }

  console.log('Redis runtime reliability smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
