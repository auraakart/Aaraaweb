import { randomUUID } from 'node:crypto';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AppRole } from '../auth/auth.types';
import { BearerGuard } from '../auth/bearer.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ProductFeature } from './entitlement.types';
import { PartnerCapacityReservationService } from './partner-capacity-reservation.service';
import { PlatformCapacityReservationController } from './platform-capacity-reservation.controller';
const actorId=randomUUID(),societyId=randomUUID(),grantId=randomUUID(),partnerId=randomUUID(),planId=randomUUID();
const principal={userId:actorId,societyId,roles:[AppRole.SUPER_ADMIN]};
const input={grantId,expectedGrantVersion:1,expectedOwnershipVersion:1,expectedFeatures:[ProductFeature.SOS],idempotencyKey:randomUUID()};
function fixture() {
  const grant={id:grantId,partnerId,planRevisionId:planId,version:1,status:'DRAFT',
    startsAt:new Date(Date.now()-60000),endsAt:new Date(Date.now()+3600000),graceUntil:null,
    planRevision:{featureAllowlist:[ProductFeature.SOS],maximumSocieties:1}};
  const tx={
    $queryRaw:vi.fn(async (p:TemplateStringsArray)=>p.join('').includes('FROM "Partner"')?[{status:'ACTIVE'}]:p.join('').includes('count(*)')?[{used:0}]:[]),
    partnerLicenseGrant:{findFirst:vi.fn().mockResolvedValue(grant)},
    societyOwnershipTransfer:{findUnique:vi.fn()},
    partnerLicenseCapacityReservation:{findUnique:vi.fn().mockResolvedValue(null),create:vi.fn().mockResolvedValue({id:'reservation'})},
  };
  const ownership={withAuthorizedSociety:vi.fn(async (_p:unknown,_s:string,cb:(client:typeof tx,owner:{partnerId:string;ownershipVersion:number})=>Promise<unknown>)=>cb(tx,{partnerId,ownershipVersion:1}))};
  const entitlements={current:vi.fn().mockResolvedValue({enabledFeatures:[ProductFeature.SOS]})};
  return {tx,grant,ownership,entitlements,service:new PartnerCapacityReservationService(ownership as never,entitlements as never)};
}
describe('V5.4.5.3 locked development capacity reservations',()=>{
  it('retains bearer and platform-role route guards',()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,PlatformCapacityReservationController)).toEqual([BearerGuard,RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY,PlatformCapacityReservationController)).toEqual([AppRole.SUPER_ADMIN]);
  });
  it('validates expected feature and identifier contracts before access',async()=>{
    const f=fixture();
    await expect(f.service.reserve(principal,societyId,{...input,expectedFeatures:[ProductFeature.SOS,ProductFeature.SOS]})).rejects.toThrow(/Invalid/);
    expect(f.ownership.withAuthorizedSociety).not.toHaveBeenCalled();
  });
  it('creates a real reservation with no grant activation or entitlement writes',async()=>{
    const f=fixture();
    expect(await f.service.reserve(principal,societyId,input)).toEqual({id:'reservation',mode:'DRAFT_RESERVATION',ownershipVersion:1});
    expect(f.tx.partnerLicenseCapacityReservation.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({actorId,planRevisionId:planId,enabledFeatures:[ProductFeature.SOS]})}));
  });
  it('rejects ownership, foreign grant and incompatible legacy features',async()=>{
    const f=fixture();
    await expect(f.service.reserve(principal,societyId,{...input,expectedOwnershipVersion:2})).rejects.toThrow(/Ownership/);
    f.tx.partnerLicenseGrant.findFirst.mockResolvedValueOnce(null);
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/unavailable/);
    f.grant.planRevision.featureAllowlist=[];
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/compatibility/);
  });
  it('revalidates expiry and feature parity before an exact replay',async()=>{
    const f=fixture();
    f.tx.partnerLicenseCapacityReservation.findUnique.mockResolvedValue({id:'receipt',societyId,actorId,ownershipVersion:1,grantVersion:1,planRevisionId:planId,enabledFeatures:[ProductFeature.SOS]});
    expect(await f.service.reserve(principal,societyId,input)).toMatchObject({id:'receipt'});
    f.entitlements.current.mockResolvedValue({enabledFeatures:[]});
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/compatibility/);
    f.entitlements.current.mockResolvedValue({enabledFeatures:[ProductFeature.SOS]});
    f.grant.endsAt=new Date(Date.now()-1);
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/context changed/);
    expect(f.tx.partnerLicenseCapacityReservation.create).not.toHaveBeenCalled();
  });
  it('rejects another actor receipt and exhausted capacity',async()=>{
    const f=fixture();
    f.tx.partnerLicenseCapacityReservation.findUnique.mockResolvedValueOnce({id:'receipt',societyId,actorId:randomUUID()});
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/key already/);
    f.grant.planRevision.maximumSocieties=0;
    await expect(f.service.reserve(principal,societyId,input)).rejects.toThrow(/exhausted/);
    expect(f.tx.partnerLicenseCapacityReservation.create).not.toHaveBeenCalled();
  });
});
