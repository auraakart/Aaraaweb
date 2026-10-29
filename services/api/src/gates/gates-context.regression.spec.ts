import { describe, expect, it, vi } from 'vitest';
import { GatesController } from './gates.controller';

function fixture() {
  const gate = { id: 'gate', societyId: 'society', name: 'North', code: 'N', active: true };
  const tx = { gate: {
    findMany: vi.fn().mockResolvedValue([gate]), findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'gate', ...data })),
    update: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...gate, ...data })),
  } };
  const root = new Proxy({ withTenantContext: vi.fn(async (scope: string, operation: (client: typeof tx) => Promise<unknown>) => {
    if (scope !== 'society') throw new Error('Missing tenant context');
    return operation(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { gate, tx, root, controller: new GatesController(root as never, {} as never, {} as never) };
}

describe('Gate administration tenant context', () => {
  it('lists only the selected society in name order without using the root client', async () => {
    const { controller, tx, gate, root } = fixture();
    expect(await controller.list('society')).toEqual([gate]);
    expect(tx.gate.findMany).toHaveBeenCalledWith({ where: { societyId: 'society' }, orderBy: { name: 'asc' } });
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, true, false])('preserves normalization and explicit active=%s within creation scope', async active => {
    const { controller, tx, root } = fixture();
    expect(await controller.create({ name: ' North ', code: ' n ', active }, 'society'))
      .toMatchObject({ societyId: 'society', name: 'North', code: 'N', active: active ?? true });
    expect(tx.gate.findFirst).toHaveBeenCalledWith({ where: { societyId: 'society', code: 'N' } });
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it('retains the existing duplicate-code response without attempting creation', async () => {
    const { controller, tx, gate } = fixture();
    tx.gate.findFirst.mockResolvedValue(gate);
    await expect(controller.create({ name: 'North', code: ' n ' }, 'society')).rejects.toThrow('Gate code already exists in this society');
    expect(tx.gate.create).not.toHaveBeenCalled();
  });

  it.each(['activate', 'deactivate'] as const)('keeps %s lookup and write in one scope with an explicit society write predicate', async method => {
    const { controller, tx, gate, root } = fixture();
    tx.gate.findFirst.mockResolvedValue(gate);
    expect(await controller[method]('gate', 'society')).toMatchObject({ active: method === 'activate' });
    expect(tx.gate.update).toHaveBeenCalledWith({ where: { id: 'gate', societyId: 'society' }, data: { active: method === 'activate' } });
    expect(root.withTenantContext).toHaveBeenCalledTimes(1);
  });

  it.each(['activate', 'deactivate'] as const)('denies an unknown or foreign gate before %s writes', async method => {
    const { controller, tx } = fixture();
    await expect(controller[method]('foreign', 'society')).rejects.toThrow('Gate does not belong to authenticated society');
    expect(tx.gate.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', societyId: 'society' } });
    expect(tx.gate.update).not.toHaveBeenCalled();
  });

  it.each(['activate', 'deactivate'] as const)('propagates %s transaction failure without a root-client fallback', async method => {
    const { controller, tx, gate } = fixture();
    tx.gate.findFirst.mockResolvedValue(gate);
    tx.gate.update.mockRejectedValue(new Error('Gate persistence failed'));
    await expect(controller[method]('gate', 'society')).rejects.toThrow('Gate persistence failed');
  });

  it('fails closed without tenant context for discovery and creation', async () => {
    const { controller, tx } = fixture();
    await expect(controller.list('')).rejects.toThrow('Missing tenant context');
    await expect(controller.create({ name: 'North', code: 'N' }, '')).rejects.toThrow('Missing tenant context');
    expect(tx.gate.create).not.toHaveBeenCalled();
  });
});
