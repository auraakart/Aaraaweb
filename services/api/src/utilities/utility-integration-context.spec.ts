import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { authenticateUtilityIntegration } from './utility-integration-auth';
import { UtilityIntegrationsService } from './utility-integrations.service';

const scope = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const secret = 'test-machine-secret';
const digest = createHash('sha256').update(secret).digest('hex');
const payload = {idempotencyKey: 'key', externalMeterId: 'EXT', readingAt: '2099-01-01', value: 10};
function fixture() {
  const tx = {$queryRaw: vi.fn().mockResolvedValue([]), $executeRaw: vi.fn().mockResolvedValue(1)};
  const lookup = vi.fn().mockResolvedValue([{id, societyId: scope}]);
  const withTenantContext = vi.fn(async (society: string, run: (client: typeof tx) => Promise<unknown>) => {
    expect(society).toBe(scope); return run(tx);
  });
  const root = new Proxy({withTenantContext, $queryRaw: lookup}, {get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    if (key === '$queryRaw') return target.$queryRaw;
    throw new Error('Root database access forbidden: ' + String(key));
  }});
  return {tx, lookup, withTenantContext, root, service: new UtilityIntegrationsService(root as never)};
}

describe('utility integration selected tenant transactions', () => {
  it.each(['list', 'listMappings', 'listReceipts', 'listEvents'] as const)('selects context for %s', async method => {
    const f = fixture(); expect(await f.service[method](scope)).toEqual([]);
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.lookup).not.toHaveBeenCalled();
  });
  it.each(['create', 'rotate', 'revoke', 'map', 'retire', 'replace', 'dismiss'])('keeps %s and its evidence in one selected client', async mode => {
    const f = fixture();
    f.tx.$queryRaw.mockResolvedValue([{id, code: 'PARTNER', name: 'Partner', status: 'ACTIVE', externalMeterId: 'EXT', meterId: 'old-meter'}]);
    if (mode === 'create') {
      const created = await f.service.create(scope, actor, {code: 'PARTNER', name: 'Partner'});
      expect(created.integrationKey).toMatch(new RegExp(`^${id}\\.`)); expect(created).not.toHaveProperty('secretHash');
    } else if (mode === 'rotate') await f.service.rotateKey(scope, actor, id);
    else if (mode === 'revoke') await f.service.revoke(scope, actor, id);
    else if (mode === 'map') await f.service.createMapping(scope, actor, id, {meterId: 'new-meter', externalMeterId: 'EXT'});
    else if (mode === 'retire') await f.service.retireMapping(scope, actor, id, 'mapping');
    else if (mode === 'replace') await f.service.replaceMapping(scope, actor, id, 'mapping', {meterId: 'new-meter'});
    else await f.service.dismissReceipt(scope, actor, 'receipt', {note: 'Reviewed'});
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.lookup).not.toHaveBeenCalled();
    if (mode !== 'dismiss') expect(f.tx.$executeRaw).toHaveBeenCalled();
  });
  it.each(['create', 'rotate', 'revoke', 'map', 'retire', 'replace'])('propagates %s audit failure without a root-client fallback', async mode => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValue([{id, externalMeterId: 'EXT', meterId: 'old'}]);
    f.tx.$executeRaw.mockRejectedValue(new Error('audit denied'));
    const result = mode === 'create' ? f.service.create(scope, actor, {code: 'P', name: 'Partner'}) :
      mode === 'rotate' ? f.service.rotateKey(scope, actor, id) : mode === 'revoke' ? f.service.revoke(scope, actor, id) :
      mode === 'map' ? f.service.createMapping(scope, actor, id, {meterId: 'new', externalMeterId: 'EXT'}) :
      mode === 'retire' ? f.service.retireMapping(scope, actor, id, 'map') : f.service.replaceMapping(scope, actor, id, 'map', {meterId: 'new'});
    await expect(result).rejects.toThrow('audit denied'); expect(f.lookup).not.toHaveBeenCalled();
  });
  it.each(['create', 'map', 'replace'])('preserves %s duplicate conflict responses for wrapped PostgreSQL errors', async mode => {
    const f = fixture(); f.tx.$queryRaw.mockRejectedValue({code: 'P2010', meta: {code: '23505'}});
    const operation = mode === 'create' ? f.service.create(scope, actor, {code: 'P', name: 'Partner'}) :
      mode === 'map' ? f.service.createMapping(scope, actor, id, {meterId: 'new', externalMeterId: 'EXT'}) :
      f.service.replaceMapping(scope, actor, id, 'mapping', {meterId: 'new'});
    await expect(operation).rejects.toThrow(/already/);
  });
  it('uses only exact id and hashed-secret capability arguments before selecting a tenant', async () => {
    const f = fixture();
    expect(await authenticateUtilityIntegration(f.root as never, `${id}.${secret}`)).toEqual({id, societyId: scope, secretHash: digest, status: 'ACTIVE'});
    const query = f.lookup.mock.calls[0][0] as {strings: string[]; values: unknown[]};
    expect(query.strings.join(' ')).toContain('aaraagate_resolve_utility_integration');
    expect(query.strings.join(' ')).not.toContain('FROM "UtilityIntegration"');
    expect(query.values).toEqual([id, digest]); expect(query.values).not.toContain(secret);
    expect(f.withTenantContext).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'no-separator', `${id}.`, 'not-a-uuid.secret'])('rejects malformed keys without any database call: %s', async key => {
    const f = fixture(); await expect(f.service.ingest(key, payload)).rejects.toThrow('key');
    expect(f.lookup).not.toHaveBeenCalled(); expect(f.withTenantContext).not.toHaveBeenCalled();
  });
  it('fails closed when routing is denied, without a table lookup or scoped mutation', async () => {
    const f = fixture(); f.lookup.mockRejectedValue(new Error('EXECUTE denied'));
    await expect(f.service.ingest(`${id}.${secret}`, payload)).rejects.toThrow('EXECUTE denied');
    expect(f.lookup).toHaveBeenCalledOnce(); expect(f.withTenantContext).not.toHaveBeenCalled();
  });
  it('rejects unresolved credentials before opening a tenant transaction', async () => {
    const f = fixture(); f.lookup.mockResolvedValue([]);
    await expect(f.service.ingest(`${id}.wrong`, payload)).rejects.toThrow('invalid');
    expect(f.withTenantContext).not.toHaveBeenCalled();
  });
  it('revalidates the authenticated key in the selected locked transaction before any receipt is accepted', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(f.service.ingest(`${id}.${secret}`, payload)).rejects.toThrow('inactive');
    expect(f.withTenantContext).toHaveBeenCalledOnce();
    const query = f.tx.$queryRaw.mock.calls[0][0] as {values: unknown[]}; expect(query.values).toContain(digest);
    expect(f.tx.$queryRaw).toHaveBeenCalledOnce(); expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed stored replay parents without leaking a foreign reading or recording a replay', async () => {
    const f = fixture(); f.tx.$queryRaw.mockResolvedValueOnce([{id}]).mockResolvedValueOnce([{id: 'receipt', parentsValid: false, readingId: 'foreign'}]);
    await expect(f.service.ingest(`${id}.${secret}`, payload)).rejects.toThrow('inconsistent parents');
    expect(f.tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
  it('rejects reprocessing without a matching scoped receipt parent', async () => {
    const f = fixture(); await expect(f.service.reprocessReceipt(scope, actor, 'receipt', {})).rejects.toThrow('not found');
    expect(f.withTenantContext).toHaveBeenCalledOnce(); expect(f.tx.$executeRaw).not.toHaveBeenCalled();
  });
});
