import { vi } from 'vitest';

/** Retain legacy preflight/write doubles; production never falls back to a root client. */
export function workforceFixture<T extends object>(client: T): T {
  const base = client as { withTenantContext?: unknown; $transaction?: (run: (tx: unknown) => unknown, options: unknown) => unknown };
  if (typeof base.withTenantContext === 'function') return client;
  return { ...client, withTenantContext: vi.fn((_scope: string, run: (tx: unknown) => unknown, options?: unknown) =>
    options && base.$transaction ? base.$transaction(run, options) : run(client)),
  } as T;
}
