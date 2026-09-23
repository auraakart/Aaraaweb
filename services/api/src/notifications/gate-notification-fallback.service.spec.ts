import { afterEach, describe, expect, it, vi } from 'vitest';
import { GateNotificationFallbackService } from './gate-notification-fallback.service';

const event={
  type:'ACCESS_APPROVAL_REQUESTED' as const,
  societyId:'11111111-1111-4111-8111-111111111111',
  unitId:'22222222-2222-4222-8222-222222222222',
  requestId:'33333333-3333-4333-8333-333333333333',
  subjectType:'VISITOR',subjectName:'Visitor A',status:'PENDING',createdAt:new Date().toISOString(),
};

describe('GateNotificationFallbackService',()=>{
  const originalProvider=process.env.GATE_IVR_PROVIDER;
  const originalNodeEnv=process.env.NODE_ENV;
  afterEach(()=>{
    if(originalProvider===undefined)delete process.env.GATE_IVR_PROVIDER;else process.env.GATE_IVR_PROVIDER=originalProvider;
    if(originalNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=originalNodeEnv;
  });

  it('simulates IVR without exposing the full phone number outside the provider boundary',async()=>{
    process.env.NODE_ENV='test';process.env.GATE_IVR_PROVIDER='simulator';
    const prisma={user:{findUnique:vi.fn().mockResolvedValue({phone:'+919876543210'})},$executeRaw:vi.fn().mockResolvedValue(1)};
    const service=new GateNotificationFallbackService(prisma as never);
    await expect(service.fallback(event,'44444444-4444-4444-8444-444444444444','NO_PUSH_DEVICE')).resolves.toEqual(
      expect.objectContaining({channel:'IVR',status:'SIMULATED',phoneSuffix:'3210',provider:'simulator'}),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('requires manual guard fallback when production IVR is not configured',async()=>{
    process.env.NODE_ENV='production';delete process.env.GATE_IVR_PROVIDER;
    const prisma={user:{findUnique:vi.fn().mockResolvedValue({phone:'+919876543210'})},$executeRaw:vi.fn().mockResolvedValue(1)};
    const service=new GateNotificationFallbackService(prisma as never);
    await expect(service.fallback(event,'44444444-4444-4444-8444-444444444444','PUSH_UNAVAILABLE')).resolves.toEqual(
      expect.objectContaining({channel:'MANUAL',status:'REQUIRED',reason:'IVR_UNCONFIGURED'}),
    );
  });
});
