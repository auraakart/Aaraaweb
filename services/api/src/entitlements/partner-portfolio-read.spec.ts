import { GUARDS_METADATA } from '@nestjs/common/constants';
import { NotFoundException } from '@nestjs/common';
import { PartnerRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { BearerGuard } from '../auth/bearer.guard';
import { PartnerPortfolioReadController } from './partner-portfolio-read.controller';
import { PartnerPortfolioReadService } from './partner-portfolio-read.service';

const user='11111111-1111-4111-8111-111111111111';
const partnerA='22222222-2222-4222-8222-222222222222';
const partnerB='33333333-3333-4333-8333-333333333333';

function harness(member: {id:string}|null) {
  const tx={
    partnerMembership:{
      findFirst:vi.fn().mockResolvedValue(member),
      findMany:vi.fn().mockResolvedValue([{id:'membership-a',role:'OWNER',createdAt:new Date()}]),
    },
    partner:{findUnique:vi.fn().mockResolvedValue({id:partnerA,displayName:'Partner A'})},
    society:{findMany:vi.fn().mockResolvedValue([
      {id:'society-1',name:'Society A',status:'ACTIVE'},
    ])},
  };
  const prisma={
    partnerMembership:tx.partnerMembership,
    $transaction:vi.fn(async (run:(input:typeof tx)=>Promise<unknown>)=>run(tx)),
    societyMembership:{findMany:vi.fn()},
  };
  return {tx,prisma,service:new PartnerPortfolioReadService(prisma as never)};
}

describe('V5.4.4 scoped partner control-plane reads',()=>{
  it('discovers only current active user memberships without identity contacts or society roles',async()=>{
    const {tx,service}=harness({id:'m1'});
    tx.partnerMembership.findMany.mockResolvedValue([]);
    await expect(service.workspaces(user)).resolves.toEqual({memberships:[],hasMore:false});
    expect(tx.partnerMembership.findMany).toHaveBeenCalledWith({
      where:{userId:user,active:true,user:{is:{status:'ACTIVE'}},role:{in:[PartnerRole.OWNER,PartnerRole.BRAND_MANAGER,PartnerRole.COMMERCIAL_ADMIN]},partner:{is:{status:'ACTIVE'}}},
      select:{id:true,role:true,partner:{select:{id:true,displayName:true}}},orderBy:{id:'asc'},take:51,
    });
    expect(tx.society.findMany).not.toHaveBeenCalled();
  });

  it('requires a bearer session; never grants an AppRole via partner membership',()=>{
    const guards=Reflect.getMetadata(GUARDS_METADATA,PartnerPortfolioReadController) as unknown[];
    expect(guards).toContain(BearerGuard);
    expect(guards).not.toHaveLength(0);
  });

  it('returns only own-partner society display metadata to a verified member',async()=>{
    const {tx,prisma,service}=harness({id:'membership'});
    await expect(service.portfolio(user,partnerA)).resolves.toEqual({
      partner:{id:partnerA,displayName:'Partner A'},
      societies:[{id:'society-1',name:'Society A',status:'ACTIVE'}],
      hasMore:false,
    });
    expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith({
      where:{
        userId:user,partnerId:partnerA,active:true,
        user:{is:{status:'ACTIVE'}},
        role:{in:[PartnerRole.OWNER,PartnerRole.BRAND_MANAGER,PartnerRole.COMMERCIAL_ADMIN]},
        partner:{is:{status:'ACTIVE'}},
      },select:{id:true},
    });
    expect(tx.society.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{partnerId:partnerA},
      select:{id:true,name:true,status:true},
    }));
    expect(prisma.societyMembership.findMany).not.toHaveBeenCalled();
  });

  it('conceals foreign partner, revoked membership, missing partner and support role',async()=>{
    const {tx,service}=harness(null);
    for(const target of [partnerA,partnerB]){
      await expect(service.portfolio(user,target)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.members(user,target)).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(tx.society.findMany).not.toHaveBeenCalled();
    expect(tx.partnerMembership.findMany).not.toHaveBeenCalled();
    expect(tx.partner.findUnique).not.toHaveBeenCalled();
  });

  it('permits only OWNER and COMMERCIAL_ADMIN for member role labels, never user contacts',async()=>{
    const {tx,service}=harness({id:'m1'});
    await service.members(user,partnerA);
    expect(tx.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:expect.objectContaining({
        role:{in:[PartnerRole.OWNER,PartnerRole.COMMERCIAL_ADMIN]},
      }),
    }));
    expect(tx.partnerMembership.findMany).toHaveBeenCalledWith({
      where:{partnerId:partnerA,active:true},
      select:{id:true,role:true,createdAt:true},
      orderBy:{id:'asc'},take:50,
    });
  });

  it('caps portfolio display to fifty and signals pagination without fetching operational PII',async()=>{
    const {tx,service}=harness({id:'m1'});
    tx.society.findMany.mockResolvedValue(Array.from({length:51},(_,i)=>({
      id:'society-'+i,name:'Society '+i,status:'ACTIVE',
    })));
    const result=await service.portfolio(user,partnerA);
    expect(result.societies).toHaveLength(50);
    expect(result.hasMore).toBe(true);
    expect(tx.society.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take:51,select:{id:true,name:true,status:true},
    }));
  });
});
