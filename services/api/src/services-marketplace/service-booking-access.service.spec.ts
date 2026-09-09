import { AccessRequestStatus, AccessSubjectType, AuditEventType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ServiceBookingAccessService } from './service-booking-access.service';

function setup() {
  const tx = {
    unitOccupancy: { findFirst: vi.fn().mockResolvedValue(null) },
    unitOwnership: { findFirst: vi.fn().mockResolvedValue({ id: 'ownership-1' }) },
    accessRequest: { create: vi.fn() },
    auditEvent: { create: vi.fn() },
  };
  tx.accessRequest.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({ id: 'access-1', ...data }));
  return { tx, service: new ServiceBookingAccessService() };
}

const input = {
  societyId: 'society-1',
  userId: 'owner-1',
  unitId: 'unit-1',
  bookingId: 'booking-1',
  providerId: 'provider-1',
  offeringId: 'offering-1',
  providerName: 'Aaraa Plumbing',
  providerPhone: '9999999999',
  offeringName: 'Pipe repair',
  validFrom: new Date('2026-09-10T10:00:00Z'),
  validUntil: new Date('2026-09-10T11:00:00Z'),
};

describe('ServiceBookingAccessService', () => {
  it('allows a verified current owner to receive service-provider access without occupancy', async () => {
    const { tx, service } = setup();

    const result = await service.createApproved(tx as never, input);

    expect(tx.unitOwnership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        societyId: 'society-1',
        userId: 'owner-1',
        unitId: 'unit-1',
        active: true,
        verified: true,
      }),
    }));
    expect(tx.accessRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        societyId: 'society-1',
        unitId: 'unit-1',
        requestedById: 'owner-1',
        subjectType: AccessSubjectType.SERVICE_PROVIDER,
        status: AccessRequestStatus.APPROVED,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
      }),
    }));
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({ event: AuditEventType.ACCESS_CREATED }),
    }));
    expect(tx.auditEvent.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({ event: AuditEventType.ACCESS_APPROVED }),
    }));
    expect(result.request.id).toBe('access-1');
    expect(result.credential).toEqual(expect.any(String));
  });

  it('rejects confirmation when neither current occupancy nor verified ownership remains', async () => {
    const { tx, service } = setup();
    tx.unitOwnership.findFirst.mockResolvedValue(null);

    await expect(service.createApproved(tx as never, input)).rejects.toThrow('no longer has access');

    expect(tx.accessRequest.create).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
  });
});
