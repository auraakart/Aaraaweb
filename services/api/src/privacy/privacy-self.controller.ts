import { Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { PrivacyService } from './privacy.service';
import { PrivacySubjectDataService } from './privacy-subject-data.service';

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
  constructor(private readonly privacy: PrivacyService, private readonly subjectData: PrivacySubjectDataService) {}

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
