import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationConfigurationService } from './integration-configuration.service';

const societyId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';

describe('IntegrationConfigurationService',()=>{
  it('rejects provider keys that look like secret material before persistence',async()=>{
    const prisma={$transaction:vi.fn()} as unknown as PrismaService;
    const service=new IntegrationConfigurationService(prisma);
    await expect(service.update(societyId,actorId,{family:'OTP',providerKey:'api-key-secret',enabled:true}))
      .rejects.toThrow('must not contain secret material');
    expect((prisma as unknown as {$transaction:ReturnType<typeof vi.fn>}).$transaction).not.toHaveBeenCalled();
  });

  it('records append-only evidence for the first society selection',async()=>{
    const row={societyId,family:'PUSH',providerKey:'firebase',enabled:true,updatedByUserId:actorId,createdAt:new Date(),updatedAt:new Date()};
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([row]),$executeRaw:vi.fn().mockResolvedValue(1)};
    const prisma={$transaction:vi.fn(async(fn:(client:typeof tx)=>unknown)=>fn(tx))} as unknown as PrismaService;
    const result=await new IntegrationConfigurationService(prisma).update(societyId,actorId,{family:'PUSH',providerKey:'Firebase',enabled:true});
    expect(result).toMatchObject({family:'PUSH',providerKey:'firebase',enabled:true,changed:true});
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not create duplicate evidence for a no-op update',async()=>{
    const row={societyId,family:'PUSH',providerKey:'firebase',enabled:true,updatedByUserId:actorId,createdAt:new Date(),updatedAt:new Date()};
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([row]).mockResolvedValueOnce([row]),$executeRaw:vi.fn()};
    const prisma={$transaction:vi.fn(async(fn:(client:typeof tx)=>unknown)=>fn(tx))} as unknown as PrismaService;
    const result=await new IntegrationConfigurationService(prisma).update(societyId,actorId,{family:'PUSH',providerKey:'firebase',enabled:true});
    expect(result.changed).toBe(false);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });
});
