import {describe,expect,it,vi} from 'vitest';
import {SessionService} from './session.service';
import {AppRole} from './auth.types';
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
 it('never converts commercial or foreign application sessions into society authority',async()=>{
  const f=fixture();vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',roles:[],audience:'PARTNER'});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/unavailable/);
  vi.mocked(f.service.getPrincipal).mockResolvedValue({userId:'user',societyId:'society',roles:[AppRole.OWNER],partnerApplicationId:'other'});
  await expect(f.service.bindApplicationSession('source','application')).rejects.toThrow(/unavailable/);
  expect(f.service.create).not.toHaveBeenCalled();
 });
});
