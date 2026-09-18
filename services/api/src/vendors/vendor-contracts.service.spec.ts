import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { VendorContractsService } from './vendor-contracts.service';

describe('VendorContractsService',()=>{
 function setup(){const tx={$queryRaw:vi.fn(),$executeRaw:vi.fn()};const prisma={$queryRaw:vi.fn(),$transaction:vi.fn(async(cb:(v:typeof tx)=>Promise<unknown>)=>cb(tx))};return{tx,prisma,service:new VendorContractsService(prisma as never)}}
 it('rejects vendor outside active current-society set',async()=>{const{prisma,service}=setup();prisma.$queryRaw.mockResolvedValue([]);await expect(service.createContract('society-1','actor-1',{vendorId:'11111111-1111-1111-1111-111111111111',contractNumber:'C-1',title:'Lift AMC',contractType:'AMC',startsOn:'2026-01-01',endsOn:'2026-12-31',renewalNoticeDays:30})).rejects.toBeInstanceOf(BadRequestException)})
 it('creates contract and append-only evidence transactionally',async()=>{const{prisma,tx,service}=setup();prisma.$queryRaw.mockResolvedValue([{id:'vendor-1'}]);tx.$queryRaw.mockResolvedValue([{id:'contract-1'}]);await service.createContract('society-1','actor-1',{vendorId:'11111111-1111-1111-1111-111111111111',contractNumber:'C-1',title:'Lift AMC',contractType:'AMC',startsOn:'2026-01-01',endsOn:'2026-12-31',renewalNoticeDays:30});expect(tx.$executeRaw).toHaveBeenCalledTimes(1)})
 it('fails closed for status update outside tenant',async()=>{const{tx,service}=setup();tx.$queryRaw.mockResolvedValue([]);await expect(service.updateStatus('society-1','actor-1','11111111-1111-1111-1111-111111111111','TERMINATED')).rejects.toBeInstanceOf(NotFoundException);expect(tx.$executeRaw).not.toHaveBeenCalled()})
});
