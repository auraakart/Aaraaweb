import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { FacilitiesPreventiveService } from './facilities-preventive.service';

describe('FacilitiesPreventiveService continuity posture',()=>{
  it('derives AT_RISK only from recorded current-state evidence',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{activeAssets:12,activePlans:8,activeWorkOrders:3,overdueWorkOrders:1,openAlerts:2,criticalAlerts:1,contractsExpiring30d:1}])};
    const service=new FacilitiesPreventiveService(prisma as unknown as PrismaService);
    const result=await service.metrics('society-1') as Record<string,any>;
    expect(result.continuity.status).toBe('AT_RISK');
    expect(result.continuity.blockers).toEqual(expect.arrayContaining(['CRITICAL_ALERTS_OPEN','WORK_ORDERS_OVERDUE','SERVICE_CONTRACTS_EXPIRING']));
    expect(result.continuity.boundary).toContain('not predictive reliability');
  });
});
