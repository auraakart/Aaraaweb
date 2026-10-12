import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

describe('PrivacyService program readiness',()=>{
  it('reports configuration and workflow blockers without claiming legal compliance',async()=>{
    const tx={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{active:4,missingLegalBasis:1,missingRetention:1}])
      .mockResolvedValueOnce([{active:2,missingAgreement:1}])
      .mockResolvedValueOnce([{overdue:2}])
      .mockResolvedValueOnce([{open:1}])
      .mockResolvedValueOnce([{active:false}])};
    const prisma = { $queryRaw: vi.fn(), withTenantContext: vi.fn(async (_id: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service=new PrivacyService(prisma as unknown as PrismaService);
    const result=await service.programReadiness('society-1');
    expect(result.status).toBe('ACTION_REQUIRED');
    expect(prisma.withTenantContext).toHaveBeenCalledWith('society-1', expect.any(Function));
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(result.blockers).toEqual(expect.arrayContaining([
      'DATA_CATEGORY_LEGAL_BASIS_MISSING','DATA_CATEGORY_RETENTION_MISSING','PROCESSOR_AGREEMENT_REFERENCE_MISSING',
      'GRIEVANCE_CONTACT_INACTIVE','PRIVACY_CASES_OVERDUE','SECURITY_INCIDENTS_OPEN',
    ]));
    expect(result.boundary).toContain('does not certify statutory compliance');
  });

  it('uses the same tenant client for readiness and all program evidence counts', async () => {
    const tx = { $queryRaw: vi.fn() };
    const results = [
      [{active:2,missingLegalBasis:0,missingRetention:0}],
      [{active:1,missingAgreement:0}],
      [{overdue:0}], [{open:0}], [{active:true}],
      [{granted:3,withdrawn:1}], [{open:1,completed:2,erasure:1}],
      [{open:0,closed:1}], [{count:4}],
    ];
    for (const result of results) tx.$queryRaw.mockResolvedValueOnce(result);
    const prisma = {
      $queryRaw: vi.fn(),
      withTenantContext: vi.fn(async (_societyId: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)),
    };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    const evidence = await service.programEvidence('society-1');
    expect(evidence.readiness.status).toBe('READY');
    expect(evidence.readiness.metrics.activeDataCategories).toBe(2);
    expect(evidence.consentEvidence).toEqual({granted:3,withdrawn:1});
    expect(evidence.caseEvidence).toEqual({open:1,completed:2,erasure:1});
    expect(evidence.registryEventCount).toBe(4);
    expect(evidence.certificationClaim).toBe(false);
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(9);
    for (const [query] of tx.$queryRaw.mock.calls) {
      expect((query as {values: unknown[]}).values).toContain('society-1');
    }
  });

  it('propagates a scoped readiness failure without returning a partial report', async () => {
    const tx = { $queryRaw: vi.fn().mockRejectedValueOnce(new Error('readiness query failed')) };
    const prisma = { withTenantContext: vi.fn(async (_id: string, operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
    const service = new PrivacyService(prisma as unknown as PrismaService);
    await expect(service.programReadiness('society-1')).rejects.toThrow('readiness query failed');
    expect(prisma.withTenantContext).toHaveBeenCalledTimes(1);
  });
});
