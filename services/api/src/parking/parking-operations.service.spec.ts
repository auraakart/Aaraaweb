import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { ParkingOperationsService } from './parking-operations.service';

const societyId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';
const vehicleId='33333333-3333-4333-8333-333333333333';

describe('ParkingOperationsService',()=>{
  it('rejects invalid policy limits before persistence',async()=>{
    const prisma={$queryRaw:vi.fn()};
    const service=new ParkingOperationsService(prisma as unknown as PrismaService);
    await expect(service.updatePolicy(societyId,actorId,{maxActiveResidentVehicles:0,requireCredential:false,allowTemporaryOverflow:true}))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('issues credentials only for an active society vehicle',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([])};
    const prisma={$transaction:vi.fn((cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new ParkingOperationsService(prisma as unknown as PrismaService);
    await expect(service.issueCredential(societyId,actorId,{vehicleId,credential:'PARK-101'}))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps active credential uniqueness races to conflict',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([{id:vehicleId}]).mockRejectedValueOnce({code:'23505'})};
    const prisma={$transaction:vi.fn((cb:(client:typeof tx)=>unknown)=>cb(tx))};
    const service=new ParkingOperationsService(prisma as unknown as PrismaService);
    await expect(service.issueCredential(societyId,actorId,{vehicleId,credential:'PARK-101'}))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('requires a violation to reference a society parking entity',async()=>{
    const prisma={$queryRaw:vi.fn()};
    const service=new ParkingOperationsService(prisma as unknown as PrismaService);
    await expect(service.reportViolation(societyId,actorId,{code:'WRONG_SLOT'}))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
