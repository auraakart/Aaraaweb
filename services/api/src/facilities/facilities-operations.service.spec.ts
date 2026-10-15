import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { FacilitiesOperationsService } from './facilities-operations.service';

function setup(){
  const tx={$queryRaw:vi.fn(),$executeRaw:vi.fn()};
  const prisma={
    $queryRaw:vi.fn(),
    $transaction:vi.fn().mockImplementation(async(callback:(value:typeof tx)=>unknown)=>callback(tx)),
  };
  return {
    tx,
    prisma,
    service:new FacilitiesOperationsService(prisma as unknown as ConstructorParameters<typeof FacilitiesOperationsService>[0]),
  };
}

describe('FacilitiesOperationsService',()=>{
  it('rejects assigning a task to a user outside the active society membership',async()=>{
    const {prisma,service}=setup();
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await expect(service.createTask('society-1','actor-1',{
      category:'HOUSEKEEPING',
      title:'Clean clubhouse lobby',
      assignedUserId:'user-other',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires completion evidence before closing a task',async()=>{
    const {tx,service}=setup();
    tx.$queryRaw.mockResolvedValueOnce([{status:'IN_PROGRESS'}]);
    await expect(service.setStatus('society-1','actor-1','task-1','COMPLETED','ok')).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('records a valid status transition and append-only event',async()=>{
    const {tx,service}=setup();
    tx.$queryRaw
      .mockResolvedValueOnce([{status:'OPEN'}])
      .mockResolvedValueOnce([{id:'task-1',status:'IN_PROGRESS'}]);
    tx.$executeRaw.mockResolvedValueOnce(1);

    const result=await service.setStatus('society-1','actor-1','task-1','IN_PROGRESS');
    expect(result).toEqual(expect.objectContaining({id:'task-1',status:'IN_PROGRESS'}));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
