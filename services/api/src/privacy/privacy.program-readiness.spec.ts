import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { PrivacyService } from './privacy.service';

describe('PrivacyService program readiness',()=>{
  it('reports configuration and workflow blockers without claiming legal compliance',async()=>{
    const prisma={$queryRaw:vi.fn()
      .mockResolvedValueOnce([{active:4,missingLegalBasis:1,missingRetention:1}])
      .mockResolvedValueOnce([{active:2,missingAgreement:1}])
      .mockResolvedValueOnce([{overdue:2}])
      .mockResolvedValueOnce([{open:1}])
      .mockResolvedValueOnce([{active:false}])};
    const service=new PrivacyService(prisma as unknown as PrismaService);
    const result=await service.programReadiness('society-1');
    expect(result.status).toBe('ACTION_REQUIRED');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'DATA_CATEGORY_LEGAL_BASIS_MISSING','DATA_CATEGORY_RETENTION_MISSING','PROCESSOR_AGREEMENT_REFERENCE_MISSING',
      'GRIEVANCE_CONTACT_INACTIVE','PRIVACY_CASES_OVERDUE','SECURITY_INCIDENTS_OPEN',
    ]));
    expect(result.boundary).toContain('does not certify statutory compliance');
  });
});
