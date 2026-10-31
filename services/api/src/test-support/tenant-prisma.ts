import { vi } from 'vitest';

/** Expose an existing behavior fixture as the transaction client, without SQL routing. */
export function tenantPrisma<T extends object>(client: T) {
  return {
    ...client,
    withTenantContext: vi.fn(async (_societyId: string, run: (tx: T) => unknown) => run(client)),
  };
}
