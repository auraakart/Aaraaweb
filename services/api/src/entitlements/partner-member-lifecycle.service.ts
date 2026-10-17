import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PartnerInvitationStatus, PartnerMemberAction, PartnerRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * V5.4.9 commercial membership lifecycle. Explicit owner authority is always
 * reloaded inside a partner-row-locked transaction. No society AppRole, gate,
 * billing or resident information is projected or mutated here.
 * Invitations target an EXISTING account ID; message delivery/onboarding are
 * deliberately outside this non-production slice.
 */
@Injectable()
export class PartnerMemberLifecycleService {
  constructor(private readonly prisma: PrismaService) {}

  private async lockPartner(tx: Prisma.TransactionClient, partnerId: string) {
    const rows = await tx.$queryRaw<{id:string;status:string}[]>`SELECT "id","status" FROM "Partner" WHERE "id"=${partnerId}::uuid FOR UPDATE`;
    if (rows.length !== 1 || rows[0].status !== 'ACTIVE') throw new NotFoundException('Partner resource unavailable');
  }

  private async owner(tx: Prisma.TransactionClient, partnerId: string, actorId: string) {
    const membership = await tx.partnerMembership.findFirst({
      where: { partnerId, userId: actorId, role: PartnerRole.OWNER, active: true, user: {is:{status:'ACTIVE'}} },
      select: {id:true},
    });
    if (!membership) throw new NotFoundException('Partner resource unavailable');
  }

  private async activeUser(tx: Prisma.TransactionClient, userId: string) {
    const user = await tx.user.findFirst({where:{id:userId,status:'ACTIVE'},select:{id:true}});
    if (!user) throw new NotFoundException('Partner user unavailable');
  }

  private async event(tx: Prisma.TransactionClient, data: {
    partnerId:string; subjectUserId:string; actorId:string; action:PartnerMemberAction;
    beforeRole?:PartnerRole; afterRole?:PartnerRole; invitationId?:string;
  }) {
    await tx.partnerMembershipEvent.create({data});
  }

  async invite(actorId:string, partnerId:string, input:{userId:string;role:PartnerRole;idempotencyKey:string}) {
    if (!Object.values(PartnerRole).includes(input.role)) throw new BadRequestException('Unknown partner role');
    if (actorId === input.userId) throw new BadRequestException('Self-invitation unavailable');
    return this.prisma.$transaction(async tx=>{
      await this.lockPartner(tx,partnerId);
      await this.owner(tx,partnerId,actorId);
      const prior = await tx.partnerInvitation.findUnique({
        where:{partnerId_idempotencyKey:{partnerId,idempotencyKey:input.idempotencyKey}},
      });
      if(prior) {
        if(prior.userId!==input.userId || prior.invitedById!==actorId || prior.role!==input.role)
          throw new ConflictException('Invitation key already used');
        return {id:prior.id,status:prior.status};
      }
      await this.activeUser(tx,input.userId);
      const roles = await tx.partnerMembership.findMany({
        where:{partnerId,userId:input.userId,active:true},select:{id:true},
      });
      if(roles.length) throw new ConflictException('User is already a partner member');
      const pending=await tx.partnerInvitation.findFirst({
        where:{partnerId,userId:input.userId,status:PartnerInvitationStatus.PENDING,expiresAt:{gt:new Date()}},
        select:{id:true},
      });
      if(pending) throw new ConflictException('An invitation is already pending');
      const invitation=await tx.partnerInvitation.create({
        data:{partnerId,userId:input.userId,invitedById:actorId,role:input.role,idempotencyKey:input.idempotencyKey,
          expiresAt:new Date(Date.now()+7*24*60*60*1000)},
        select:{id:true,status:true},
      });
      await this.event(tx,{partnerId,subjectUserId:input.userId,actorId,action:PartnerMemberAction.INVITED,afterRole:input.role,invitationId:invitation.id});
      return invitation;
    });
  }

  /** Invitee-only discovery; never reveals other users' identities. */
  inbox(userId:string) {
    return this.prisma.partnerInvitation.findMany({
      where:{userId,status:PartnerInvitationStatus.PENDING,expiresAt:{gt:new Date()},partner:{is:{status:'ACTIVE'}}},
      select:{id:true,partnerId:true,role:true,expiresAt:true,partner:{select:{displayName:true}}},
      orderBy:{createdAt:'asc'},take:50,
    });
  }

  async respond(actorId:string,partnerId:string,invitationId:string,accept:boolean) {
    return this.prisma.$transaction(async tx=>{
      await this.lockPartner(tx,partnerId);
      const invitation=await tx.partnerInvitation.findFirst({where:{id:invitationId,partnerId,userId:actorId}});
      if(!invitation) throw new NotFoundException('Partner invitation unavailable');
      await this.activeUser(tx,actorId);
      if(invitation.status!==PartnerInvitationStatus.PENDING)
        throw new ConflictException('Invitation already processed');
      if(invitation.expiresAt.getTime()<=Date.now()) throw new ConflictException('Invitation expired');
      // A stale invitation cannot outlive the owner's revocation.
      await this.owner(tx,partnerId,invitation.invitedById);
      if(accept) {
        const roles=await tx.partnerMembership.findMany({where:{partnerId,userId:actorId,active:true},select:{id:true}});
        if(roles.length) throw new ConflictException('Member role has changed');
        await tx.partnerMembership.upsert({
          where:{partnerId_userId_role:{partnerId,userId:actorId,role:invitation.role}},
          create:{partnerId,userId:actorId,role:invitation.role,active:true},
          update:{active:true},
        });
      }
      const status=accept?PartnerInvitationStatus.ACCEPTED:PartnerInvitationStatus.DECLINED;
      await tx.partnerInvitation.update({where:{id:invitation.id},data:{status,respondedAt:new Date()}});
      await this.event(tx,{partnerId,subjectUserId:actorId,actorId,
        action:accept?PartnerMemberAction.ACCEPTED:PartnerMemberAction.DECLINED,
        afterRole:accept?invitation.role:undefined,invitationId:invitation.id});
      return {id:invitation.id,status};
    });
  }

  async cancelInvite(actorId:string,partnerId:string,invitationId:string) {
    return this.prisma.$transaction(async tx=>{
      await this.lockPartner(tx,partnerId);
      await this.owner(tx,partnerId,actorId);
      const invitation=await tx.partnerInvitation.findFirst({where:{id:invitationId,partnerId}});
      if(!invitation) throw new NotFoundException('Partner invitation unavailable');
      if(invitation.status!==PartnerInvitationStatus.PENDING) throw new ConflictException('Invitation already processed');
      await tx.partnerInvitation.update({where:{id:invitation.id},data:{status:PartnerInvitationStatus.REVOKED,respondedAt:new Date()}});
      await this.event(tx,{partnerId,subjectUserId:invitation.userId,actorId,
        action:PartnerMemberAction.INVITATION_REVOKED,invitationId});
      return {id:invitation.id,status:PartnerInvitationStatus.REVOKED};
    });
  }

  private async current(tx:Prisma.TransactionClient,partnerId:string,membershipId:string) {
    const member=await tx.partnerMembership.findFirst({where:{id:membershipId,partnerId,active:true},select:{id:true,userId:true,role:true}});
    if(!member)throw new NotFoundException('Partner member unavailable');
    return member;
  }

  private async lastOwnerGuard(tx:Prisma.TransactionClient,partnerId:string,role:PartnerRole) {
    if(role!==PartnerRole.OWNER)return;
    const owners=await tx.partnerMembership.count({where:{partnerId,role:PartnerRole.OWNER,active:true,user:{is:{status:'ACTIVE'}}}});
    if(owners<=1)throw new ConflictException('Cannot remove the last active owner');
  }

  async changeRole(actorId:string,partnerId:string,membershipId:string,newRole:PartnerRole) {
    if(!Object.values(PartnerRole).includes(newRole))throw new BadRequestException('Unknown partner role');
    return this.prisma.$transaction(async tx=>{
      await this.lockPartner(tx,partnerId);
      await this.owner(tx,partnerId,actorId);
      const member=await this.current(tx,partnerId,membershipId);
      if(member.role===newRole)return {id:member.id,role:newRole};
      await this.activeUser(tx,member.userId);
      const currentRoles=await tx.partnerMembership.findMany({where:{partnerId,userId:member.userId,active:true},select:{id:true}});
      if(currentRoles.length!==1)throw new ConflictException('Multiple current roles require manual reconciliation');
      await this.lastOwnerGuard(tx,partnerId,member.role);
      await tx.partnerMembership.update({where:{id:member.id},data:{active:false}});
      const replacement=await tx.partnerMembership.upsert({
        where:{partnerId_userId_role:{partnerId,userId:member.userId,role:newRole}},
        create:{partnerId,userId:member.userId,role:newRole,active:true},
        update:{active:true},
        select:{id:true,role:true},
      });
      await this.event(tx,{partnerId,subjectUserId:member.userId,actorId,action:PartnerMemberAction.ROLE_CHANGED,beforeRole:member.role,afterRole:newRole});
      return replacement;
    });
  }

  async revoke(actorId:string,partnerId:string,membershipId:string) {
    return this.prisma.$transaction(async tx=>{
      await this.lockPartner(tx,partnerId);
      await this.owner(tx,partnerId,actorId);
      const member=await this.current(tx,partnerId,membershipId);
      await this.lastOwnerGuard(tx,partnerId,member.role);
      await tx.partnerMembership.update({where:{id:member.id},data:{active:false}});
      await this.event(tx,{partnerId,subjectUserId:member.userId,actorId,action:PartnerMemberAction.MEMBER_REVOKED,beforeRole:member.role});
      return {id:member.id,revoked:true};
    });
  }
}
