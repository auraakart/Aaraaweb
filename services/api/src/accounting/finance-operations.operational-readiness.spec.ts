import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { FinanceOperationsService } from './finance-operations.service';

describe('FinanceOperationsService operational readiness',()=>{
  it('derives AT_RISK from recorded execution exceptions without claiming provider execution',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{
      draftExpenses:2,approvedUnpostedExpenses:1,overduePayables:1,draftBudgets:1,
      unresolvedReconciliation:2,unsettledGatewayOperations:1,unlinkedPurchaseOrders:1,contractsExpiring30d:1,
    }])};
    const service=new FinanceOperationsService(prisma as unknown as PrismaService);
    const result=await service.operationalReadiness('11111111-1111-4111-8111-111111111111');
    expect(result.status).toBe('AT_RISK');
    expect(result.blockers).toEqual(expect.arrayContaining([
      'RECONCILIATION_OPEN','GATEWAY_OPERATIONS_UNSETTLED','PAYABLES_OVERDUE','PROCUREMENT_ACCOUNTING_HANDOFF_PENDING',
    ]));
    expect(result.automaticDebitAvailable).toBe(false);
    expect(result.providerExecution).toBe('ADAPTER_CONTROLLED');
    expect(result.boundary).toContain('does not certify provider settlement');
  });
});
