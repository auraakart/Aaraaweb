import { BadRequestException, Body, Controller, ExecutionContext, Get, Param, ParseUUIDPipe, Post, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AuthenticatedRequest, BearerGuard } from '../auth/bearer.guard';
import { AppPermission } from '../auth/permission.types';
import { RequiresPermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentTenant } from '../auth/tenant.decorator';
import { TenantGuard } from '../auth/tenant.guard';
import { AccountingService } from './accounting.service';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) =>
  ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId,
);

class CreateLedgerAccountDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']) type!: string;
  @IsOptional() @IsUUID() parentAccountId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

class CreateAccountingPeriodDto {
  @IsString() @MinLength(1) @MaxLength(30) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() endsOn!: string;
}

class JournalLineDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsUUID() fundId?: string;
  @IsOptional() @IsUUID() unitId?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsInt() @Min(0) debitPaise!: number;
  @IsInt() @Min(0) creditPaise!: number;
}

class CreateJournalDto {
  @IsUUID() periodId!: string;
  @IsString() @MinLength(1) @MaxLength(60) entryNumber!: string;
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(1) @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(60) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(120) sourceId?: string;
  @IsOptional() @IsString() @MaxLength(120) externalReference?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines!: JournalLineDto[];
}

class ReverseJournalDto {
  @IsString() @MinLength(1) @MaxLength(60) entryNumber!: string;
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
}

@Controller('accounting')
@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('accounts')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  listAccounts(@CurrentTenant() societyId: string) {
    return this.accounting.listAccounts(societyId);
  }

  @Post('accounts')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  createAccount(@CurrentTenant() societyId: string, @Body() dto: CreateLedgerAccountDto) {
    return this.accounting.createAccount(societyId, dto);
  }

  @Get('periods')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  listPeriods(@CurrentTenant() societyId: string) {
    return this.accounting.listPeriods(societyId);
  }

  @Post('periods')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  createPeriod(@CurrentTenant() societyId: string, @Body() dto: CreateAccountingPeriodDto) {
    return this.accounting.createPeriod(societyId, dto);
  }

  @Get('journals')
  @RequiresPermissions(AppPermission.FINANCE_READ)
  listJournals(@CurrentTenant() societyId: string) {
    return this.accounting.listJournals(societyId);
  }

  @Post('journals')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  createJournal(@CurrentTenant() societyId: string, @CurrentUser() userId: string | undefined, @Body() dto: CreateJournalDto) {
    return this.accounting.createDraft(societyId, this.requireUser(userId), dto);
  }

  @Post('journals/:journalId/post')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  postJournal(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('journalId', new ParseUUIDPipe()) journalId: string,
  ) {
    return this.accounting.postJournal(societyId, this.requireUser(userId), journalId);
  }

  @Post('journals/:journalId/reverse')
  @RequiresPermissions(AppPermission.FINANCE_MANAGE)
  reverseJournal(
    @CurrentTenant() societyId: string,
    @CurrentUser() userId: string | undefined,
    @Param('journalId', new ParseUUIDPipe()) journalId: string,
    @Body() dto: ReverseJournalDto,
  ) {
    return this.accounting.reverseJournal(societyId, this.requireUser(userId), journalId, dto);
  }

  private requireUser(userId?: string) {
    if (!userId) throw new BadRequestException('Authenticated user is required');
    return userId;
  }
}
