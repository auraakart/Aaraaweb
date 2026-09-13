import { BadRequestException, Body, Controller, ExecutionContext, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { PrismaService } from '../prisma/prisma.service';

const CurrentUser=createParamDecorator((_d:unknown,ctx:ExecutionContext)=>ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class AddGovernanceDocumentDto{
  @IsOptional() @IsUUID() resolutionId?:string;
  @IsString() @MinLength(1) @MaxLength(80) kind!:string;
  @IsString() @MinLength(1) @MaxLength(1000) fileReference!:string;
  @IsOptional() @IsString() @MaxLength(2000) note?:string;
}
class VerifyGovernanceDocumentDto{@IsOptional() @IsString() @MaxLength(2000) note?:string;}
class CreateGovernancePollDto{
  @IsOptional() @IsUUID() meetingId?:string;
  @IsIn(['ADVISORY','SURVEY']) pollType!:'ADVISORY'|'SURVEY';
  @IsString() @MinLength(1) @MaxLength(240) title!:string;
  @IsOptional() @IsString() @MaxLength(5000) description?:string;
  @IsOptional() @IsISO8601() opensAt?:string;
  @IsOptional() @IsISO8601() closesAt?:string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20) @IsString({each:true}) options!:string[];
}

@Controller('governance')
@UseGuards(BearerGuard,TenantGuard,PermissionsGuard)
export class GovernanceArtifactsController{
  constructor(private readonly prisma:PrismaService){}

  @Get('meetings/:meetingId/documents')
  @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async listDocuments(@CurrentTenant() societyId:string,@Param('meetingId',new ParseUUIDPipe()) meetingId:string){
    await this.assertMeeting(societyId,meetingId);
    return this.prisma.$queryRaw(Prisma.sql`SELECT * FROM "GovernanceDocumentReference" WHERE "societyId"=${societyId}::uuid AND "meetingId"=${meetingId}::uuid ORDER BY "createdAt" DESC`);
  }

  @Post('meetings/:meetingId/documents')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async addDocument(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('meetingId',new ParseUUIDPipe()) meetingId:string,@Body() dto:AddGovernanceDocumentDto){
    const actor=this.user(userId);await this.assertMeeting(societyId,meetingId);
    if(dto.resolutionId){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceResolution" WHERE "id"=${dto.resolutionId}::uuid AND "societyId"=${societyId}::uuid AND "meetingId"=${meetingId}::uuid LIMIT 1`);if(!rows.length)throw new BadRequestException('Resolution does not belong to this meeting');}
    const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`INSERT INTO "GovernanceDocumentReference" ("societyId","meetingId","resolutionId","kind","fileReference","note","createdByUserId") VALUES (${societyId}::uuid,${meetingId}::uuid,${dto.resolutionId??null}::uuid,${dto.kind.trim()},${dto.fileReference.trim()},${dto.note?.trim()||null},${actor}::uuid) RETURNING *`);
    await this.evidence(societyId,meetingId,actor,'DOCUMENT_REFERENCE_ADDED',`Governance document reference added: ${dto.kind.trim()}`);
    return rows[0];
  }

  @Post('documents/:id/verify')
  @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async verifyDocument(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Param('id',new ParseUUIDPipe()) id:string,@Body() dto:VerifyGovernanceDocumentDto){
    const actor=this.user(userId);const rows=await this.prisma.$queryRaw<Array<{id:string;meetingId:string;kind:string}>>(Prisma.sql`UPDATE "GovernanceDocumentReference" SET "verifiedAt"=CURRENT_TIMESTAMP,"verifiedByUserId"=${actor}::uuid,"note"=COALESCE(${dto.note?.trim()||null},"note") WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid AND "verifiedAt" IS NULL RETURNING "id","meetingId","kind"`);if(!rows.length)throw new NotFoundException('Unverified governance document reference not found');
    await this.evidence(societyId,rows[0].meetingId,actor,'DOCUMENT_REFERENCE_VERIFIED',`Governance document verified: ${rows[0].kind}`);return rows[0];
  }

  @Get('polls') @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  listPolls(@CurrentTenant() societyId:string){return this.prisma.$queryRaw(Prisma.sql`SELECT p.*,COALESCE(json_agg(json_build_object('id',o."id",'ordinal',o."ordinal",'label',o."label") ORDER BY o."ordinal") FILTER (WHERE o."id" IS NOT NULL),'[]'::json) AS options FROM "GovernancePoll" p LEFT JOIN "GovernancePollOption" o ON o."pollId"=p."id" WHERE p."societyId"=${societyId}::uuid GROUP BY p."id" ORDER BY p."createdAt" DESC`);}

  @Get('polls/:id') @RequiresPermissions(AppPermission.GOVERNANCE_READ)
  async getPoll(@CurrentTenant() societyId:string,@Param('id',new ParseUUIDPipe()) id:string){const rows=await this.prisma.$queryRaw<Array<Record<string,unknown>>>(Prisma.sql`SELECT p.*,COALESCE(json_agg(json_build_object('id',o."id",'ordinal',o."ordinal",'label',o."label") ORDER BY o."ordinal") FILTER (WHERE o."id" IS NOT NULL),'[]'::json) AS options FROM "GovernancePoll" p LEFT JOIN "GovernancePollOption" o ON o."pollId"=p."id" WHERE p."societyId"=${societyId}::uuid AND p."id"=${id}::uuid GROUP BY p."id" LIMIT 1`);if(!rows.length)throw new NotFoundException('Governance poll not found');return rows[0];}

  @Post('polls') @RequiresPermissions(AppPermission.GOVERNANCE_MANAGE)
  async createPoll(@CurrentTenant() societyId:string,@CurrentUser() userId:string|undefined,@Body() dto:CreateGovernancePollDto){
    const actor=this.user(userId),title=dto.title.trim(),options=dto.options.map(v=>v.trim()).filter(Boolean);if(options.length<2)throw new BadRequestException('At least two non-empty options are required');if(new Set(options.map(v=>v.toLocaleLowerCase())).size!==options.length)throw new BadRequestException('Poll options must be unique');
    const opensAt=dto.opensAt?new Date(dto.opensAt):undefined,closesAt=dto.closesAt?new Date(dto.closesAt):undefined;if(opensAt&&closesAt&&closesAt<opensAt)throw new BadRequestException('Poll close time cannot precede open time');if(dto.meetingId)await this.assertMeeting(societyId,dto.meetingId);
    return this.prisma.$transaction(async tx=>{const poll=await tx.$queryRaw<Array<{id:string}>>(Prisma.sql`INSERT INTO "GovernancePoll" ("societyId","meetingId","pollType","title","description","opensAt","closesAt","createdByUserId","statutoryUseProhibited") VALUES (${societyId}::uuid,${dto.meetingId??null}::uuid,${dto.pollType},${title},${dto.description?.trim()||null},${opensAt??null},${closesAt??null},${actor}::uuid,TRUE) RETURNING "id"`);for(const [index,label] of options.entries())await tx.$executeRaw(Prisma.sql`INSERT INTO "GovernancePollOption" ("pollId","ordinal","label") VALUES (${poll[0].id}::uuid,${index+1},${label})`);return {id:poll[0].id,pollType:dto.pollType,title,statutoryUseProhibited:true,options:options.map((label,index)=>({ordinal:index+1,label}))};});
  }

  private async assertMeeting(societyId:string,id:string){const rows=await this.prisma.$queryRaw<Array<{id:string}>>(Prisma.sql`SELECT "id" FROM "GovernanceMeeting" WHERE "id"=${id}::uuid AND "societyId"=${societyId}::uuid LIMIT 1`);if(!rows.length)throw new NotFoundException('Governance meeting not found');}
  private user(userId?:string){if(!userId)throw new BadRequestException('Authenticated user is required');return userId;}
  private evidence(societyId:string,meetingId:string,actorUserId:string,eventType:string,summary:string){return this.prisma.$executeRaw(Prisma.sql`INSERT INTO "GovernanceEvidenceEvent" ("societyId","meetingId","eventType","actorUserId","summary") VALUES (${societyId}::uuid,${meetingId}::uuid,${eventType},${actorUserId}::uuid,${summary})`);}
}
