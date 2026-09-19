import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PrivacyService } from './privacy.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';
import { PrivacyIncidentService } from './privacy-incident.service';

const CurrentPrivacyPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const auth = ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  return auth ? { userId: auth.userId, societyId: auth.societyId } : undefined;
});

class CreateSelfPrivacyRequestDto {
  @IsIn(['ACCESS', 'CORRECTION', 'ERASURE'])
  requestType!: 'ACCESS' | 'CORRECTION' | 'ERASURE';

  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  requestSummary!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(100)
  requestKey!: string;
}

@Controller('privacy/self')
@UseGuards(BearerGuard)
export class PrivacySelfController {
  constructor(private readonly privacy: PrivacyService, private readonly subjectData: PrivacySubjectDataService, private readonly incidents: PrivacyIncidentService) {}

  @Get('context')
  async context(
    @CurrentPrivacyPrincipal() principal?: { userId: string; societyId?: string },
  ) {
    const current = this.requirePrincipal(principal);
    if (!current.societyId) return { grievanceContact: null };
    const rows = await this.incidents.getGrievanceContact(current.societyId);
    const contact = rows[0] as { displayName?: string; email?: string | null; phone?: string | null; instructions?: string | null; active?: boolean } | undefined;
    if (!contact?.active) return { grievanceContact: null };
    return {
      grievanceContact: {
        displayName: contact.displayName ?? 'Privacy contact',
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        instructions: contact.instructions ?? null,
      },
    };
  }

  @Get('requests')
  list(
    @CurrentPrivacyPrincipal() principal?: { userId: string; societyId?: string },
  ) {
    const current = this.requirePrincipal(principal);
    return this.privacy.listMine(current.userId, current.societyId);
  }

  @Get('requests/:caseId/export')
  exportRequest(
    @CurrentPrivacyPrincipal() principal: { userId: string; societyId?: string } | undefined,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    const current = this.requirePrincipal(principal);
    return this.subjectData.exportMine(current.userId, current.societyId, caseId);
  }

  @Post('requests')
  create(
    @CurrentPrivacyPrincipal() principal: { userId: string; societyId?: string } | undefined,
    @Body() dto: CreateSelfPrivacyRequestDto,
  ) {
    const current = this.requirePrincipal(principal);
    return this.privacy.createMine(current.userId, current.societyId, dto);
  }

  private requirePrincipal(principal?: { userId: string; societyId?: string }) {
    if (!principal?.userId) throw new UnauthorizedException('Authentication required');
    return principal;
  }
}
