import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HouseholdService } from './household.service';

const scope = '11111111-1111-4111-8111-111111111111';
const contact = { name: ' Family ', phone: ' +91 900-000 ', relation: ' Sister ', priority: 2, idempotencyKey: ' contact-key-1 ' };
function fixture() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    household: { findFirst: vi.fn().mockResolvedValue({ id: 'home', unitId: 'unit' }) },
    unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'ownership' }) },
    unitOccupancy: {
      findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn().mockImplementation(async ({ data }: { data: unknown }) => ({ id: 'member-link', ...(data as object) })),
      update: vi.fn().mockResolvedValue({ id: 'member-link', active: false }), count: vi.fn().mockResolvedValue(0),
    },
    user: { findUnique: vi.fn().mockResolvedValue({ id: 'member', name: 'Member', phone: '999', status: 'ACTIVE' }), create: vi.fn().mockResolvedValue({ id: 'new-member', name: 'New', phone: '999', status: 'ACTIVE' }) },
    societyMembership: { upsert: vi.fn(), updateMany: vi.fn() },
    emergencyContact: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'contact' }), update: vi.fn().mockResolvedValue({ id: 'contact', active: false }) },
  };
  const prisma = new Proxy({ withTenantContext: vi.fn(async (societyId: string, run: (client: typeof tx) => Promise<unknown>) => {
    if (societyId !== scope) throw new Error('Missing tenant context');
    return run(tx);
  }) }, { get(target, key) {
    if (key === 'withTenantContext') return target.withTenantContext;
    throw new Error(`Unscoped database access: ${String(key)}`);
  } });
  return { tx, prisma, service: new HouseholdService(prisma as never) };
}
function resident(tx: ReturnType<typeof fixture>['tx']) { tx.unitOccupancy.findFirst.mockResolvedValue({ id: 'resident' } as never); }
const family = { name: ' Member ', phone: ' 999 ', primaryGateContact: true, gateNotificationEnabled: false, gateApprovalEnabled: true };

describe('Household contact and family tenant context', () => {
  it('authorizes and normalizes contact creation under the existing idempotency lock', async () => {
    const { service, tx, prisma } = fixture(); resident(tx);
    await service.addEmergencyContact(scope, 'resident', 'home', contact);
    expect(prisma.withTenantContext).toHaveBeenCalledOnce();
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.emergencyContact.findFirst.mock.invocationCallOrder[0]);
    expect(tx.emergencyContact.create).toHaveBeenCalledWith({ data: { societyId: scope, householdId: 'home', name: 'Family', phone: '+91 900-000', relation: 'Sister', priority: 2, idempotencyKey: 'contact-key-1' } });
  });
  it.each([7, 121])('retains invalid key length %s rejection without contact writes', async length => {
    const { service, tx } = fixture(); resident(tx);
    await expect(service.addEmergencyContact(scope, 'resident', 'home', { ...contact, idempotencyKey: 'x'.repeat(length) })).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.emergencyContact.create).not.toHaveBeenCalled();
  });
  it.each([8, 120])('retains key boundary %s, null relation and default priority', async length => {
    const { service, tx } = fixture(); resident(tx);
    await service.addEmergencyContact(scope, 'resident', 'home', { name: 'Family', phone: '999', relation: ' ', idempotencyKey: 'x'.repeat(length) });
    expect(tx.emergencyContact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ relation: null, priority: 1 }) });
  });
  it('replays normalized intent without reinserting or reactivating an inactive contact', async () => {
    const { service, tx } = fixture(); resident(tx);
    const existing = { id: 'contact', name: 'family', phone: '+91900000', relation: 'sister', priority: 2, active: false };
    tx.emergencyContact.findFirst.mockResolvedValue(existing as never);
    expect(await service.addEmergencyContact(scope, 'resident', 'home', contact)).toBe(existing);
    expect(tx.emergencyContact.create).not.toHaveBeenCalled();
    expect(tx.emergencyContact.update).not.toHaveBeenCalled();
  });
  it.each([{ name: 'Other' }, { phone: '123' }, { relation: 'Other' }, { priority: 3 }])('rejects changed contact intent: %j', async change => {
    const { service, tx } = fixture(); resident(tx);
    tx.emergencyContact.findFirst.mockResolvedValue({ id: 'contact', name: 'Family', phone: '+91900000', relation: 'Sister', priority: 2 } as never);
    await expect(service.addEmergencyContact(scope, 'resident', 'home', { ...contact, ...change })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.emergencyContact.create).not.toHaveBeenCalled();
  });
  it('deactivates only a scoped contact and returns inactive retries unchanged', async () => {
    const { service, tx } = fixture(); resident(tx);
    await expect(service.deactivateEmergencyContact(scope, 'resident', 'home', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    tx.emergencyContact.findFirst.mockResolvedValueOnce({ id: 'contact', active: true } as never).mockResolvedValueOnce({ id: 'contact', active: false } as never);
    await service.deactivateEmergencyContact(scope, 'resident', 'home', 'contact');
    await service.deactivateEmergencyContact(scope, 'resident', 'home', 'contact');
    expect(tx.emergencyContact.findFirst).toHaveBeenLastCalledWith({ where: { id: 'contact', householdId: 'home', societyId: scope } });
    expect(tx.emergencyContact.update).toHaveBeenCalledOnce();
  });
  it('adds a family member through the tenant client with primary contact and membership rules intact', async () => {
    const { service, tx } = fixture();
    const result = await service.addFamilyMember(scope, 'owner', 'home', family);
    expect(result).toMatchObject({ userId: 'member', relation: 'FAMILY_MEMBER', primaryGateContact: true, gateNotificationEnabled: true, gateApprovalEnabled: true });
    expect(tx.unitOwnership.findFirst).toHaveBeenCalledWith({ where: expect.objectContaining({ societyId: scope, userId: 'owner', unitId: 'unit', verified: true, active: true, unit: { societyId: scope, building: { societyId: scope } } }) });
    expect(tx.unitOccupancy.updateMany).toHaveBeenCalledWith({ where: { societyId: scope, unitId: 'unit', active: true, primaryGateContact: true }, data: { primaryGateContact: false } });
    expect(tx.societyMembership.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_societyId_role: { userId: 'member', societyId: scope, role: 'FAMILY_MEMBER' } } }));
  });
  it('creates global identity only within the tenant operation and retains existing family links', async () => {
    const { service, tx } = fixture(); tx.user.findUnique.mockResolvedValueOnce(null as never);
    await service.addFamilyMember(scope, 'owner', 'home', { name: ' New ', phone: ' 999 ' });
    expect(tx.user.create).toHaveBeenCalledWith({ data: { phone: '999', name: 'New' } });
    tx.unitOccupancy.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'existing-family', gateApprovalEnabled: false, primaryGateContact: false, gateApprovalExpiresAt: null } as never);
    await service.addFamilyMember(scope, 'owner', 'home', { name: 'Member', phone: '999' });
    expect(tx.unitOccupancy.update).toHaveBeenLastCalledWith(expect.objectContaining({ where: { id: 'existing-family' } }));
  });
  it('retains self-link, owner/tenant conflict and invalid-name rejections', async () => {
    const { service, tx } = fixture();
    await expect(service.addFamilyMember(scope, 'owner', 'home', { name: ' ', phone: '999' })).rejects.toBeInstanceOf(BadRequestException);
    tx.user.findUnique.mockResolvedValueOnce({ id: 'owner' } as never);
    await expect(service.addFamilyMember(scope, 'owner', 'home', family)).rejects.toThrow('already linked');
    tx.unitOccupancy.findFirst.mockResolvedValueOnce({ id: 'tenant' } as never);
    await expect(service.addFamilyMember(scope, 'owner', 'home', family)).rejects.toThrow('owner or tenant relationship');
  });
  it('updates family flags and clears approval expiry when disabling authority', async () => {
    const { service, tx } = fixture();
    tx.unitOccupancy.findFirst.mockResolvedValue({ id: 'link', gateApprovalEnabled: true, gateApprovalExpiresAt: new Date() } as never);
    await service.updateFamilyMember(scope, 'owner', 'home', 'link', { primaryGateContact: true, gateApprovalEnabled: false, escalationOrder: 1 });
    expect(tx.unitOccupancy.update).toHaveBeenCalledWith({ where: { id: 'link' }, data: { primaryGateContact: true, gateNotificationEnabled: true, gateApprovalEnabled: false, gateApprovalExpiresAt: null, escalationOrder: 1 } });
  });
  it.each([0, 1])('ends membership only when remaining family occupancy count is %s', async remaining => {
    const { service, tx } = fixture();
    tx.unitOccupancy.findFirst.mockResolvedValueOnce({ id: 'link', userId: 'member', primaryGateContact: true } as never).mockResolvedValueOnce({ id: 'fallback' } as never);
    tx.unitOccupancy.count.mockResolvedValue(remaining);
    await service.deactivateFamilyMember(scope, 'owner', 'home', 'link');
    expect(tx.unitOccupancy.update).toHaveBeenCalledWith({ where: { id: 'link' }, data: expect.objectContaining({ active: false, gateApprovalEnabled: false, gateApprovalExpiresAt: null, gateNotificationEnabled: false }) });
    expect(tx.unitOccupancy.update).toHaveBeenLastCalledWith({ where: { id: 'fallback' }, data: { primaryGateContact: true } });
    expect(tx.societyMembership.updateMany).toHaveBeenCalledTimes(remaining ? 0 : 1);
  });
  it.each(['addContact', 'removeContact', 'addFamily', 'updateFamily', 'removeFamily'])('denies absent context and unauthorized callers for %s', async operation => {
    const { service, tx } = fixture();
    const run = (societyId: string) => operation === 'addContact' ? service.addEmergencyContact(societyId, 'actor', 'home', contact) : operation === 'removeContact' ? service.deactivateEmergencyContact(societyId, 'actor', 'home', 'contact') : operation === 'addFamily' ? service.addFamilyMember(societyId, 'actor', 'home', family) : operation === 'updateFamily' ? service.updateFamilyMember(societyId, 'actor', 'home', 'link', {}) : service.deactivateFamilyMember(societyId, 'actor', 'home', 'link');
    await expect(run('')).rejects.toThrow('Missing tenant context');
    tx.unitOwnership.findFirst.mockResolvedValue(null as never);
    await expect(run(scope)).rejects.toBeInstanceOf(BadRequestException);
    tx.household.findFirst.mockResolvedValue(null as never);
    await expect(run(scope)).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.emergencyContact.create).not.toHaveBeenCalled();
    expect(tx.unitOccupancy.create).not.toHaveBeenCalled();
  });
});
