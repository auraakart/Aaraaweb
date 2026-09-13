import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyIncidentService } from './privacy-incident.service';

describe('PrivacyIncidentService', () => {
  it('rejects processor-category references outside the current society inventory', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([]),
    } as unknown as PrismaService;
    const service = new PrivacyIncidentService(prisma);

    await expect(service.createIncident('society-a', 'actor-1', {
      category: 'DISCLOSURE',
      severity: 'HIGH',
      summary: 'Unexpected disclosure',
      affectedDataCategoryCodes: ['RESIDENT_IDENTITY'],
      minorDataSuspected: false,
      detectedAt: new Date().toISOString(),
    })).rejects.toThrow('Unknown or inactive privacy data categories');
  });

  it('records incident creation and append-only event evidence in one transaction', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'incident-1', status: 'OPEN' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ code: 'RESIDENT_IDENTITY' }]),
      $transaction: vi.fn(async (fn: (arg: typeof tx) => unknown) => fn(tx)),
    } as unknown as PrismaService;
    const service = new PrivacyIncidentService(prisma);

    const result = await service.createIncident('society-a', 'actor-1', {
      category: 'UNAUTHORIZED_ACCESS',
      severity: 'CRITICAL',
      summary: 'Credential compromise under investigation',
      affectedDataCategoryCodes: ['RESIDENT_IDENTITY'],
      affectedSubjectEstimate: 12,
      minorDataSuspected: true,
      detectedAt: new Date().toISOString(),
    });

    expect(result).toMatchObject({ id: 'incident-1', status: 'OPEN' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not reopen a closed privacy/security incident', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'incident-1', societyId: 'society-a', status: 'CLOSED' }]),
    } as unknown as PrismaService;
    const service = new PrivacyIncidentService(prisma);

    await expect(service.updateStatus('society-a', 'actor-1', 'incident-1', 'INVESTIGATING'))
      .rejects.toThrow('Closed privacy/security incidents cannot be reopened');
  });
});
