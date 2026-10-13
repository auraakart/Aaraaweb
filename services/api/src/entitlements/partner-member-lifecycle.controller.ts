import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PartnerRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsUUID } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PartnerMemberLifecycleService } from './partner-member-lifecycle.service';
class PartnerInviteDto {
  @IsUUID() userId!:string;
  @IsEnum(PartnerRole) role!:PartnerRole;
  @IsUUID() idempotencyKey!:string;
}
class PartnerInvitationDecisionDto { @IsBoolean() accept!:boolean; }
class PartnerRoleChangeDto { @IsEnum(PartnerRole) role!:PartnerRole; }
@Controller('partners')
@UseGuards(BearerGuard)
export class PartnerMemberLifecycleController {
  constructor(private readonly members:PartnerMemberLifecycleService){}
  @Get('my-invitations') @Header('Cache-Control','no-store')
  inbox(@Req() req:AuthenticatedRequest){return this.members.inbox(req.auth!.userId)}
  @Post(':partnerId/invitations') @Header('Cache-Control','no-store')
  invite(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,@Body() input:PartnerInviteDto){
    return this.members.invite(req.auth!.userId,partnerId,input);
  }
  @Post(':partnerId/invitations/:invitationId/respond') @Header('Cache-Control','no-store')
  respond(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,
    @Param('invitationId',ParseUUIDPipe) id:string,@Body() input:PartnerInvitationDecisionDto){
    return this.members.respond(req.auth!.userId,partnerId,id,input.accept);
  }
  @Delete(':partnerId/invitations/:invitationId') @Header('Cache-Control','no-store')
  cancel(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,
    @Param('invitationId',ParseUUIDPipe) id:string){return this.members.cancelInvite(req.auth!.userId,partnerId,id)}
  @Patch(':partnerId/members/:membershipId/role') @Header('Cache-Control','no-store')
  role(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,
    @Param('membershipId',ParseUUIDPipe) id:string,@Body() input:PartnerRoleChangeDto){
    return this.members.changeRole(req.auth!.userId,partnerId,id,input.role);
  }
  @Delete(':partnerId/members/:membershipId') @Header('Cache-Control','no-store')
  revoke(@Req() req:AuthenticatedRequest,@Param('partnerId',ParseUUIDPipe) partnerId:string,
    @Param('membershipId',ParseUUIDPipe) id:string){return this.members.revoke(req.auth!.userId,partnerId,id)}
}
