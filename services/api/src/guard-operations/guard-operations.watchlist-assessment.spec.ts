import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GuardOperationsService } from './guard-operations.service';

describe('GuardOperationsService watchlist assessment',()=>{
  it('returns DENY for an exact active deny match without mutating access',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([{id:'w1',kind:'DENY',subjectName:'Ravi Kumar',phone:'98765 43210',vehicleNumber:null,reason:'Supervisor hold',validFrom:null,validUntil:null}])};
    const service=new GuardOperationsService(prisma as unknown as PrismaService);
    await expect(service.assessWatchlist('society-1',{subjectName:'Ravi Kumar',phone:'9876543210'})).resolves.toMatchObject({
      decision:'DENY',automaticMutation:false,matches:[{id:'w1',matchedBy:expect.arrayContaining(['NAME','PHONE'])}],
    });
  });
  it('returns CLEAR when no active exact match exists',async()=>{
    const prisma={$queryRaw:vi.fn().mockResolvedValue([])};
    const service=new GuardOperationsService(prisma as unknown as PrismaService);
    await expect(service.assessWatchlist('society-1',{subjectName:'New Visitor'})).resolves.toMatchObject({decision:'CLEAR',matches:[],automaticMutation:false});
  });
});
