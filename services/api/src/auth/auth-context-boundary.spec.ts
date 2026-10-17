import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthContextService } from './auth-context.service';
import { AppRole } from './auth.types';
import { PrismaMembershipRepository } from './prisma-membership.repository';
import { TenantGuard } from './tenant.guard';

const user='11111111-1111-4111-8111-111111111111';
const a='22222222-2222-4222-8222-222222222222';
const b='33333333-3333-4333-8333-333333333333';
function context(rows: Array<{userId:string;societyId:string;role:AppRole;active:boolean}>) {
  const repository={
    findActiveByUserAndSociety:vi.fn().mockResolvedValue(rows),
    findActiveByUser:vi.fn().mockResolvedValue(rows),
  };
  return {service:new AuthContextService(repository as unknown as PrismaMembershipRepository),repository};
}
function requestContext(auth:unknown) {
  return {switchToHttp:()=>({getRequest:()=>({auth})})} as ExecutionContext;
}

describe('V5.2.27 operational RBAC audience boundary',()=>{
  it('does not accept a foreign society role even when repository yields a row',async()=>{
    const {service}=context([{userId:user,societyId:b,role:AppRole.SOCIETY_ADMIN,active:true}]);
    await expect(service.resolve(user,a)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not accept another user membership from the selected society',async()=>{
    const {service}=context([{userId:'someone-else',societyId:a,role:AppRole.SOCIETY_ADMIN,active:true}]);
    await expect(service.resolve(user,a)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not elevate a revoked membership',async()=>{
    const {service}=context([{userId:user,societyId:a,role:AppRole.SOCIETY_ADMIN,active:false}]);
    await expect(service.resolve(user,a)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns only the authenticated user current society roles and deduplicates',async()=>{
    const {service,repository}=context([
      {userId:user,societyId:b,role:AppRole.SOCIETY_ADMIN,active:true},
      {userId:user,societyId:a,role:AppRole.TENANT,active:true},
      {userId:user,societyId:a,role:AppRole.TENANT,active:true},
      {userId:'other',societyId:a,role:AppRole.SOCIETY_ADMIN,active:true},
    ]);
    await expect(service.resolve(user,a)).resolves.toEqual({userId:user,societyId:a,roles:[AppRole.TENANT]});
    expect(repository.findActiveByUserAndSociety).toHaveBeenCalledWith(user,a);
  });

  it('does not infer a different society context when no society is requested',async()=>{
    const {service}=context([{userId:user,societyId:a,role:AppRole.TENANT,active:true},
      {userId:user,societyId:b,role:AppRole.SOCIETY_ADMIN,active:true}]);
    await expect(service.resolve(user)).resolves.toEqual({userId:user,societyId:a,roles:[AppRole.TENANT]});
  });

  it('requires a society context at a tenant-only endpoint',()=>{
    const guard=new TenantGuard();
    expect(()=>guard.canActivate(requestContext({userId:user,roles:[AppRole.TENANT]})))
      .toThrow('Society context is required');
  });

  it('rejects selected society without operational membership, including partner-only or personal contexts',()=>{
    const guard=new TenantGuard();
    expect(()=>guard.canActivate(requestContext({userId:user,societyId:a,roles:[]})))
      .toThrow('Active society role is required');
    expect(()=>guard.canActivate(requestContext({userId:user,societyId:a})))
      .toThrow(ForbiddenException);
  });

  it('accepts society-bound operational roles without expanding gate permissions',()=>{
    const guard=new TenantGuard();
    expect(guard.canActivate(requestContext({userId:user,societyId:a,roles:[AppRole.TENANT]}))).toBe(true);
  });
});
