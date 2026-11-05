import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { PushNotificationService } from './push-notification.service';

const sdk = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ sendEachForMulticast: sdk.send }) }));

const societyA = '11111111-1111-4111-8111-111111111111';
const societyB = '22222222-2222-4222-8222-222222222222';
const user = '33333333-3333-4333-8333-333333333333';
const applicationId = '44444444-4444-4444-8444-444444444444';

function event(societyId: string) {
  return {
    type: 'PARCEL_RECEIVED' as const, societyId, userId: user,
    unitId: '55555555-5555-4555-8555-555555555555',
    parcelId: '66666666-6666-4666-8666-666666666666',
    title: 'Parcel received', body: 'Collect at the gate', createdAt: '2026-11-05T00:00:00.000Z',
  };
}

function harness(registrations: Record<string, unknown>[] = []) {
  const findMany = vi.fn().mockResolvedValue(registrations);
  const membership = vi.fn().mockResolvedValue([{ role: AppRole.OWNER }]);
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = {
    devicePushToken: { findMany, updateMany },
    societyMembership: { findMany: membership },
    partnerApplication: { findUnique: vi.fn().mockResolvedValue({ partnerId: 'partner-1', appRole: 'RESIDENT' }) },
    society: { findFirst: vi.fn().mockResolvedValue({ id: societyA, partnerId: 'partner-1', ownershipVersion: 1 }) },
    partnerApplicationScope: { findMany: vi.fn().mockResolvedValue([{ allocationId: 'allocation-1' }]) },
  };
  const rootFind = vi.fn(() => { throw new Error('Unrestricted root device-token query'); });
  const rootMember = vi.fn(() => { throw new Error('Unrestricted root member query'); });
  const rootUpdate = vi.fn(() => { throw new Error('Unrestricted root device-token update'); });
  const withTenantContext = vi.fn(async (id: string, operation: (client: typeof tx) => Promise<unknown>) => {
    void id;
    return operation(tx);
  });
  const prisma = {
    devicePushToken: { findMany: rootFind, updateMany: rootUpdate },
    societyMembership: { findMany: rootMember },
    withTenantContext,
  };
  const service = new PushNotificationService(prisma as never);
  Object.assign(service, { firebaseApp: {} });
  return { service, findMany, membership, updateMany, withTenantContext, rootFind, rootMember, rootUpdate, tx };
}

afterEach(() => {
  sdk.send.mockReset();
  vi.unstubAllEnvs();
});

describe('V5.14.15 resident push delivery scoped DB boundaries', () => {
  it('fetches each society’s tokens independently without a root lookup', async () => {
    const { service, findMany, withTenantContext, rootFind } = harness();
    await service.sendResidentEvent(event(societyA));
    await service.sendResidentEvent(event(societyB));
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyA, societyB]);
    expect(findMany.mock.calls.map(([opts]) => opts.where)).toEqual([
      { societyId: societyA, userId: user, active: true },
      { societyId: societyB, userId: user, active: true },
    ]);
    expect(rootFind).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it('deactivates invalid resident tokens in their society after Firebase responds, not while transaction open', async () => {
    const registration = { id: 'device-1', token: 'token-1', applicationId: null, firebaseProjectId: null };
    const { service, updateMany, withTenantContext, rootUpdate } = harness([registration]);
    let transactionOpen = false;
    withTenantContext.mockImplementation(async (societyId, action) => {
      void societyId;
      transactionOpen = true;
      try { return await action({
        devicePushToken: { findMany: vi.fn().mockResolvedValue([registration]), updateMany },
      } as never); } finally { transactionOpen = false; }
    });
    sdk.send.mockImplementation(async () => {
      expect(transactionOpen).toBe(false);
      return { responses: [{ success: false, error: { code: 'messaging/invalid-registration-token' } }] };
    });
    await service.sendResidentEvent(event(societyA));
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyA, societyA]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['device-1'] }, societyId: societyA, userId: user },
      data: { active: false },
    });
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(sdk.send).toHaveBeenCalledTimes(1);
  });

  it('resolves branded-app membership in society context and preserves approved application routing', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AARAGATE_ENABLE_TEST_APP_SESSIONS', 'true');
    const registration = { id: 'device-brand', token: 'token-brand', applicationId, firebaseProjectId: 'partner-testproject' };
    const { service, membership, withTenantContext, tx, rootMember } = harness([registration]);
    Object.assign(service, {
      applicationRoutes: [{ applicationId, projectId: 'partner-testproject', credentialsEnv: 'AARAGATE_TEST_FIREBASE_X' }],
      applicationApps: new Map([[applicationId, {}]]),
    });
    sdk.send.mockResolvedValue({ responses: [{ success: true }] });
    await service.sendResidentEvent(event(societyA));
    expect(membership).toHaveBeenCalledWith({
      where: { societyId: societyA, userId: user, active: true, user: { is: { status: 'ACTIVE' } } },
      select: { role: true },
    });
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyA, societyA, societyA]);
    expect(tx.partnerApplication.findUnique).toHaveBeenCalled();
    expect(rootMember).not.toHaveBeenCalled();
    expect(sdk.send).toHaveBeenCalledWith(expect.objectContaining({ tokens: ['token-brand'] }));
  });

  it('revokes an unauthorized branded token only within its issuing society and user', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('AARAGATE_ENABLE_TEST_APP_SESSIONS', 'true');
    const registration = { id: 'device-brand', token: 'token-brand', applicationId, firebaseProjectId: 'partner-testproject' };
    const { service, membership, updateMany, withTenantContext, rootUpdate } = harness([registration]);
    membership.mockResolvedValue([]);
    Object.assign(service, {
      applicationRoutes: [{ applicationId, projectId: 'partner-testproject', credentialsEnv: 'AARAGATE_TEST_FIREBASE_X' }],
      applicationApps: new Map([[applicationId, {}]]),
    });
    await expect(service.sendResidentEvent(event(societyA))).rejects.toThrow('routing failure');
    expect(withTenantContext.mock.calls.map(([id]) => id)).toEqual([societyA, societyA, societyA, societyA]);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'device-brand', societyId: societyA, userId: user },
      data: { active: false },
    });
    expect(rootUpdate).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });
});
