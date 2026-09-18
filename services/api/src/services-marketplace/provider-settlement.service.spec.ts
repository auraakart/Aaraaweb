import { BadRequestException } from '@nestjs/common';
import { describe,expect,it,vi } from 'vitest';
import { ProviderSettlementService } from './provider-settlement.service';

describe('ProviderSettlementService',()=>{
  it('rejects marking an approved batch paid when underlying payment is no longer captured',async()=>{
    const tx={
      $queryRaw:vi.fn()
        .mockResolvedValueOnce([{id:'batch-1',providerId:'provider-1',status:'APPROVED'}])
        .mockResolvedValueOnce([{count:1}]),
    };
    const prisma={$transaction:vi.fn(async(cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new ProviderSettlementService(prisma as never);
    await expect(service.markPaid('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','bank-ref-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('scopes provider settlement entries by both provider and batch',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    const service=new ProviderSettlementService(prisma as never);
    await service.entriesForProvider('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
    const query=prisma.$queryRaw.mock.calls[0][0] as {strings:readonly string[];values:unknown[]};
    expect(query.strings.join(' ')).toContain('e."providerId"');
    expect(query.strings.join(' ')).toContain('e."batchId"');
    expect(query.values).toContain('11111111-1111-4111-8111-111111111111');
    expect(query.values).toContain('22222222-2222-4222-8222-222222222222');
  });

  it('records recovery resolution with the actor and reference',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'recovery-1',status:'RESOLVED'}])};
    const service=new ProviderSettlementService(prisma as never);
    await service.resolveRecovery('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','recovery-ref');
    const query=prisma.$queryRaw.mock.calls[0][0] as {strings:readonly string[];values:unknown[]};
    expect(query.strings.join(' ')).toContain('"resolvedByUserId"');
    expect(query.values).toContain('11111111-1111-4111-8111-111111111111');
    expect(query.values).toContain('recovery-ref');
  });
});
