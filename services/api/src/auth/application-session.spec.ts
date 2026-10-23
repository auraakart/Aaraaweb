import {beforeEach,describe,expect,it,vi} from 'vitest';
import {SessionService} from './session.service';
import {AppRole} from './auth.types';
const application=vi.hoisted(()=>({assert:vi.fn()}));
vi.mock('./partner-application-binding',()=>({assertApplicationSociety:application.assert}));
beforeEach(()=>application.assert.mockReset());
const nextId='11111111-1111-4111-8111-111111111111';
function fixture(){
 const prisma={session:{findUnique:vi.fn().mockResolvedValue({id:'old'}),updateMany:vi.fn().mockResolvedValue({count:1})}};
 const service=new SessionService(prisma as never,{} as never,{} as never);
 vi.spyOn(service,'getPrincipal').mockResolvedValue({userId:'user',societyId:'society',roles:[AppRole.OWNER]});
 vi.spyOn(service,'create').mockResolvedValue({sessionId:nextId,accessToken:'new-access',refreshToken:'new-refresh',expiresAt:'now',refreshExpiresAt:'later',roles:[AppRole.OWNER]});
 return {service,prisma};
}
describe('application session binding lifecycle',()=>{
 it('replaces the source token with a restricted session and revokes the unrestricted source',async()=>{
  const f=fixture();await expect(f.service.bindApplicationSession('source','application')).resolves.toMatchObject({sessionId:nextId});
  expect(f.service.create).toHaveBeenCalledWith('user','society',[AppRole.OWNER],{partnerApplicationId:'application'});
  expect(f.prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'old',revokedAt:null}),data:expect.objectContaining({revocationReason:'APPLICATION_BOUND'})}));
 });
 it('revokes the candidate if the source changes concurrently',async()=>{
  const f=fixture();f.prisma.session.updateMany.mockResolvedValueOnce({count:0});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/Source session changed/);
  expect(f.prisma.session.updateMany).toHaveBeenLastCalledWith({where:{id:nextId},data:{revokedAt:expect.any(Date),revocationReason:'APPLICATION_BIND_CONFLICT'}});
 });
 it('rejects a society-less or already bound source before creating a candidate',async()=>{
  const f=fixture();vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',roles:[]});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/unavailable/);
  vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',societyId:'society',roles:[AppRole.OWNER],partnerApplicationId:'application'});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/already application bound/);
  expect(f.service.create).not.toHaveBeenCalled();
 });
 it.each([null,{id:'old',revokedAt:new Date()}])('rejects a missing or revoked source after principal validation: %j',async source=>{
  const f=fixture();f.prisma.session.findUnique.mockResolvedValue(source as never);
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/Session unavailable/);
  expect(f.service.create).not.toHaveBeenCalled();
  expect(f.prisma.session.updateMany).not.toHaveBeenCalled();
 });
 it('never converts commercial or foreign application sessions into society authority',async()=>{
  const f=fixture();vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',roles:[],audience:'PARTNER'});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/unavailable/);
  vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',societyId:'society',roles:[AppRole.OWNER],partnerApplicationId:'other'});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/unavailable/);
  expect(f.service.create).not.toHaveBeenCalled();
 });
});

function lifecycle(){
 const prisma={session:{findUnique:vi.fn(),create:vi.fn(),updateMany:vi.fn().mockResolvedValue({count:1})}};
 const state={getJson:vi.fn().mockResolvedValue(null),setIfAbsentJson:vi.fn().mockResolvedValue(true)};
 const contexts={resolve:vi.fn().mockResolvedValue({userId:'user',societyId:'society',roles:[AppRole.OWNER]})};
 return {prisma,state,contexts,service:new SessionService(prisma as never,state as never,contexts as never)};
}
describe('application session authorization revalidation',()=>{
 it('rejects commercial and society-less application creation before persistence',async()=>{
  const f=lifecycle();
  await expect(f.service.create('user',undefined,[],{partnerApplicationId:'application'})).rejects.toThrow(/requires a society/);
  await expect(f.service.create('user',undefined,[],{audience:'PARTNER',partnerApplicationId:'application'})).rejects.toThrow(/requires a society/);
  expect(f.prisma.session.create).not.toHaveBeenCalled();
 });
 it('requires current membership and approved application scope before issuing a session',async()=>{
  const f=lifecycle();f.contexts.resolve.mockRejectedValueOnce(new Error('Membership revoked'));
  await expect(f.service.create('user','society',[AppRole.OWNER],{partnerApplicationId:'application'})).rejects.toThrow('Membership revoked');
  expect(application.assert).not.toHaveBeenCalled();
  application.assert.mockRejectedValueOnce(new Error('Scope revoked'));
  await expect(f.service.create('user','society',[AppRole.OWNER],{partnerApplicationId:'application'})).rejects.toThrow('Scope revoked');
  expect(f.prisma.session.create).not.toHaveBeenCalled();
  await f.service.create('user','society',[AppRole.OWNER],{partnerApplicationId:'application'});
  expect(application.assert).toHaveBeenLastCalledWith(f.prisma,'application','society',[AppRole.OWNER]);
  expect(f.prisma.session.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({partnerApplicationId:'application',audience:'STANDARD',societyId:'society'})}));
 });
 it('revalidates operational scope on bearer access and refresh before rotating any token',async()=>{
  const f=lifecycle();
  const {createHash}=await import('node:crypto');
  const session={id:'bound',userId:'user',societyId:'society',audience:'STANDARD',partnerApplicationId:'application',expiresAt:new Date(Date.now()+60000),refreshExpiresAt:new Date(Date.now()+60000),refreshTokenHash:createHash('sha256').update('refresh').digest('hex'),user:{status:'ACTIVE'},society:{status:'ACTIVE'}};
  f.prisma.session.findUnique.mockResolvedValue(session);
  await expect(f.service.getPrincipal('access')).resolves.toMatchObject({partnerApplicationId:'application',roles:[AppRole.OWNER]});
  expect(application.assert).toHaveBeenLastCalledWith(f.prisma,'application','society',[AppRole.OWNER],'OPERATE');
  application.assert.mockRejectedValueOnce(new Error('Scope revoked'));
  await expect(f.service.getPrincipal('access')).rejects.toThrow('Scope revoked');
  application.assert.mockRejectedValueOnce(new Error('Scope revoked'));
  await expect(f.service.refresh('bound','refresh')).rejects.toThrow('Scope revoked');
  expect(f.state.setIfAbsentJson).not.toHaveBeenCalled();
  expect(f.prisma.session.updateMany).not.toHaveBeenCalled();
  await f.service.refresh('bound','refresh');
  expect(application.assert).toHaveBeenLastCalledWith(f.prisma,'application','society',[AppRole.OWNER],'OPERATE');
  expect(f.prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'bound'}),data:expect.not.objectContaining({partnerApplicationId:expect.anything()})}));
 });
 it('rejects corrupted application sessions without selected society on bearer and refresh',async()=>{
  const f=lifecycle();const {createHash}=await import('node:crypto');
  f.prisma.session.findUnique.mockResolvedValue({id:'bad',userId:'user',audience:'STANDARD',societyId:null,partnerApplicationId:'application',expiresAt:new Date(Date.now()+60000),refreshExpiresAt:new Date(Date.now()+60000),refreshTokenHash:createHash('sha256').update('refresh').digest('hex'),user:{status:'ACTIVE'}});
  await expect(f.service.getPrincipal('access')).rejects.toThrow(/Invalid application session/);
  await expect(f.service.refresh('bad','refresh')).rejects.toThrow(/Invalid application session/);
  expect(application.assert).not.toHaveBeenCalled();
  expect(f.prisma.session.updateMany).not.toHaveBeenCalled();
 });
});
