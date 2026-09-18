import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { AmenitiesService } from './amenities.service';

const societyId='11111111-1111-4111-8111-111111111111';
const actorId='22222222-2222-4222-8222-222222222222';
const bookingId='33333333-3333-4333-8333-333333333333';

function serviceWith(queryRaw:ReturnType<typeof vi.fn>, transaction?:ReturnType<typeof vi.fn>) {
  return new AmenitiesService({$queryRaw:queryRaw,$transaction:transaction??vi.fn()} as unknown as PrismaService);
}

describe('V4.12 amenity attendance lifecycle',()=>{
  it('checks in only within the configured attendance window',async()=>{
    const start=new Date(Date.now()+5*60*1000),end=new Date(Date.now()+65*60*1000);
    const txQuery=vi.fn()
      .mockResolvedValueOnce([{startsAt:start,endsAt:end,status:'CONFIRMED',bookingRules:{checkInOpenMinutesBefore:15}}])
      .mockResolvedValueOnce([{id:bookingId,status:'CHECKED_IN'}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    const service=serviceWith(vi.fn(),transaction);
    await expect(service.checkIn(societyId,actorId,bookingId,'Front desk')).resolves.toMatchObject({status:'CHECKED_IN'});
    const sql=(txQuery.mock.calls[1][0] as readonly string[]).join(' ');
    expect(sql).toContain('"checkedInAt"=CURRENT_TIMESTAMP');
    expect(sql).toContain('"attendanceByUserId"=');
  });

  it('rejects early check-in before the configured window',async()=>{
    const start=new Date(Date.now()+60*60*1000),end=new Date(Date.now()+120*60*1000);
    const txQuery=vi.fn().mockResolvedValue([{startsAt:start,endsAt:end,status:'CONFIRMED',bookingRules:{checkInOpenMinutesBefore:15}}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    await expect(serviceWith(vi.fn(),transaction).checkIn(societyId,actorId,bookingId)).rejects.toBeInstanceOf(ConflictException);
    expect(txQuery).toHaveBeenCalledTimes(1);
  });

  it('completes only a checked-in booking',async()=>{
    const queryRaw=vi.fn().mockResolvedValue([{id:bookingId,status:'COMPLETED'}]);
    await expect(serviceWith(queryRaw).complete(societyId,actorId,bookingId)).resolves.toMatchObject({status:'COMPLETED'});
    expect((queryRaw.mock.calls[0][0] as readonly string[]).join(' ')).toContain('"status"=\'CHECKED_IN\'');
  });

  it('marks no-show only after the configured grace period',async()=>{
    const start=new Date(Date.now()-30*60*1000);
    const txQuery=vi.fn()
      .mockResolvedValueOnce([{startsAt:start,status:'CONFIRMED',bookingRules:{noShowGraceMinutes:15}}])
      .mockResolvedValueOnce([{id:bookingId,status:'NO_SHOW'}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    await expect(serviceWith(vi.fn(),transaction).markNoShow(societyId,actorId,bookingId,'Did not arrive')).resolves.toMatchObject({status:'NO_SHOW'});
  });

  it('does not allow a no-show before the grace period expires',async()=>{
    const start=new Date(Date.now()-5*60*1000);
    const txQuery=vi.fn().mockResolvedValue([{startsAt:start,status:'CONFIRMED',bookingRules:{noShowGraceMinutes:15}}]);
    const transaction=vi.fn(async(cb:(tx:{ $queryRaw:typeof txQuery })=>Promise<unknown>)=>cb({$queryRaw:txQuery}));
    await expect(serviceWith(vi.fn(),transaction).markNoShow(societyId,actorId,bookingId)).rejects.toBeInstanceOf(ConflictException);
    expect(txQuery).toHaveBeenCalledTimes(1);
  });
});
