import { UnauthorizedException } from '@nestjs/common';
import { PartnerInvitationStatus, PartnerRole } from '@prisma/client';
import { describe,expect,it,vi } from 'vitest';
import { AuthController } from './auth.controller';
const userId='11111111-1111-4111-8111-111111111111';
function harness(){
 const prisma={
  user:{findUnique:vi.fn().mockResolvedValue({id:userId,status:'ACTIVE'})},
  partnerMembership:{findFirst:vi.fn().mockResolvedValue({id:'role'})},
  partnerInvitation:{findFirst:vi.fn().mockResolvedValue(null)},
 };
 const auth={verifyOtp:vi.fn().mockResolvedValue({verified:true,phone:'+919999999999'})};
 const sessions={create:vi.fn().mockResolvedValue({sessionId:'session',accessToken:'token',refreshToken:'refresh'})};
 return {prisma,auth,sessions,controller:new AuthController(auth as never,prisma as never,sessions as never)};
}
const dto={challengeId:'challenge',code:'123456'};
describe('V5.4.14 dedicated partner OTP login',()=>{
 it('accepts a current owner and creates society-less non-elevated session',async()=>{
  const {prisma,sessions,controller}=harness();
  await expect(controller.verifyPartnerOtp(dto)).resolves.toMatchObject({verified:true,contextType:'PARTNER',session:{sessionId:'session'}});
  expect(sessions.create).toHaveBeenCalledWith(userId,undefined,[]);
  expect(prisma.partnerMembership.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
   userId,active:true,role:{in:expect.arrayContaining([PartnerRole.OWNER,PartnerRole.COMMERCIAL_ADMIN])},
   partner:{is:{status:'ACTIVE'}},
  })}));
 });
 it('allows an invited existing user with no current membership to accept invitation',async()=>{
  const {prisma,sessions,controller}=harness();prisma.partnerMembership.findFirst.mockResolvedValue(null);
  prisma.partnerInvitation.findFirst.mockResolvedValue({id:'invite'});
  await expect(controller.verifyPartnerOtp(dto)).resolves.toMatchObject({contextType:'PARTNER'});
  expect(prisma.partnerInvitation.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({
   userId,status:PartnerInvitationStatus.PENDING,expiresAt:{gt:expect.any(Date)},partner:{is:{status:'ACTIVE'}},
  })}));
  expect(sessions.create).toHaveBeenCalledWith(userId,undefined,[]);
 });
 it('rejects users with only society membership or revoked partner role',async()=>{
  const {prisma,sessions,controller}=harness();prisma.partnerMembership.findFirst.mockResolvedValue(null);
  await expect(controller.verifyPartnerOtp(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(sessions.create).not.toHaveBeenCalled();
 });
 it('rejects inactive identity and consumes no new session',async()=>{
  const {prisma,sessions,controller}=harness();prisma.user.findUnique.mockResolvedValue({id:userId,status:'SUSPENDED'});
  await expect(controller.verifyPartnerOtp(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(sessions.create).not.toHaveBeenCalled();
  expect(prisma.partnerMembership.findFirst).not.toHaveBeenCalled();
 });
 it('rejects invalid OTP without issuing session or querying partner memberships',async()=>{
  const {auth,prisma,sessions,controller}=harness();auth.verifyOtp.mockResolvedValue({verified:false,phone:null});
  await expect(controller.verifyPartnerOtp(dto)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(sessions.create).not.toHaveBeenCalled();expect(prisma.partnerMembership.findFirst).not.toHaveBeenCalled();
 });
});
