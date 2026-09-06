import { Body, Controller, ExecutionContext, Get, Post, UnauthorizedException, UseGuards, createParamDecorator } from '@nestjs/common';
import { IsNotEmpty, IsPhoneNumber, IsString, IsUUID, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { AuthenticatedRequest, BearerGuard } from './bearer.guard';
import { SessionService } from './session.service';
import { AppRole } from './auth.types';

const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<AuthenticatedRequest>().auth?.userId);

class RequestOtpDto { @IsPhoneNumber() phone!: string; }
class VerifyOtpDto { @IsString() challengeId!: string; @IsString() @Length(6, 6) code!: string; }
class SelectSocietyDto { @IsUUID() userId!: string; @IsUUID() societyId!: string; @IsString() @IsNotEmpty() selectionToken!: string; }
class SwitchSocietyDto { @IsUUID() societyId!: string; }
class RefreshDto { @IsUUID() sessionId!: string; @IsString() @IsNotEmpty() refreshToken!: string; }
class LogoutDto { @IsUUID() sessionId!: string; @IsString() @IsNotEmpty() refreshToken!: string; }

type PropertyContext = {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  buildingCode: string;
  relationship: 'OWNER' | 'OCCUPANT';
};

type SocietyContext = {
  societyId: string;
  role: string;
  roles: string[];
  society: { name: string; code: string };
  properties: PropertyContext[];
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly prisma: PrismaService, private readonly sessions: SessionService) {}

  @Post('otp/request') async requestOtp(@Body() dto: RequestOtpDto) {
    const challenge = await this.authService.requestOtp(dto.phone);
    return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
  }

  @Post('otp/verify') async verifyOtp(@Body() dto: VerifyOtpDto) {
    const result = await this.authService.verifyOtp(dto.challengeId, dto.code);
    if (!result.verified || !result.phone) throw new UnauthorizedException('Invalid or expired OTP');
    const user = await this.prisma.user.findUnique({ where: { phone: result.phone } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User is not active');

    const membershipRows = await this.prisma.societyMembership.findMany({
      where: { userId: user.id, active: true },
      select: { societyId: true, role: true, society: { select: { name: true, code: true } } },
    });
    const contexts = await this.listSocietyContexts(user.id, membershipRows);

    if (membershipRows.length === 0) {
      return {
        verified: true,
        userId: user.id,
        contextType: 'INDEPENDENT_HOME',
        memberships: [],
        contexts: [],
        session: await this.sessions.create(user.id, undefined, []),
      };
    }

    // Preserve the legacy auth response contract for the guard/admin clients:
    // only one raw membership receives a session immediately. Multiple role rows
    // continue through the existing selection-grant path. The resident app uses
    // the new grouped `contexts` field and can auto-select a sole society context.
    if (membershipRows.length === 1) {
      return {
        verified: true,
        userId: user.id,
        contextType: 'SOCIETY',
        memberships: membershipRows,
        contexts,
        session: await this.sessions.create(user.id, membershipRows[0].societyId, [membershipRows[0].role as AppRole]),
      };
    }

    const selectionGrant = await this.authService.createSocietySelectionGrant(user.id);
    return {
      verified: true,
      userId: user.id,
      contextType: 'SOCIETY_SELECTION',
      memberships: membershipRows,
      contexts,
      selectionToken: selectionGrant.token,
      selectionExpiresAt: selectionGrant.expiresAt,
    };
  }

  @Post('society/select') async selectSociety(@Body() dto: SelectSocietyDto) {
    await this.authService.consumeSocietySelectionGrant(dto.selectionToken, dto.userId);
    return this.createSocietySession(dto.userId, dto.societyId);
  }

  @Get('contexts')
  @UseGuards(BearerGuard)
  async contexts(@CurrentUser() userId: string) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    const contexts = await this.listSocietyContexts(userId);
    return {
      memberships: contexts,
      contexts,
      independentHomeAvailable: contexts.length === 0,
    };
  }

  @Post('society/switch')
  @UseGuards(BearerGuard)
  async switchSociety(@CurrentUser() userId: string, @Body() dto: SwitchSocietyDto) {
    if (!userId) throw new UnauthorizedException('Authentication required');
    return this.createSocietySession(userId, dto.societyId);
  }

  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.sessions.refresh(dto.sessionId, dto.refreshToken); }
  @Post('logout') async logout(@Body() dto: LogoutDto) { await this.sessions.revoke(dto.sessionId, dto.refreshToken); return { success: true }; }

  private async createSocietySession(userId: string, societyId: string) {
    const memberships = await this.prisma.societyMembership.findMany({
      where: { userId, societyId, active: true },
      select: { role: true },
    });
    if (!memberships.length) throw new UnauthorizedException('User is not an active member of this society');
    const roles = memberships.map((membership) => membership.role as AppRole);
    const session = await this.sessions.create(userId, societyId, roles);
    return { contextType: 'SOCIETY', societyId, role: memberships[0].role, roles, session };
  }

  private async listSocietyContexts(
    userId: string,
    suppliedMembershipRows?: Array<{ societyId: string; role: string; society: { name: string; code: string } }>,
  ): Promise<SocietyContext[]> {
    const now = new Date();
    const [membershipRows, ownershipRows, occupancyRows] = await Promise.all([
      suppliedMembershipRows
        ? Promise.resolve(suppliedMembershipRows)
        : this.prisma.societyMembership.findMany({
            where: { userId, active: true },
            select: { societyId: true, role: true, society: { select: { name: true, code: true } } },
          }),
      this.prisma.unitOwnership.findMany({
        where: {
          userId,
          active: true,
          verified: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        select: {
          societyId: true,
          unitId: true,
          unit: { select: { number: true, building: { select: { name: true, code: true } } } },
        },
      }),
      this.prisma.unitOccupancy.findMany({
        where: {
          userId,
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
        },
        select: {
          societyId: true,
          unitId: true,
          unit: { select: { number: true, building: { select: { name: true, code: true } } } },
        },
      }),
    ]);

    const propertyMap = new Map<string, PropertyContext[]>();
    const addProperty = (societyId: string, property: PropertyContext) => {
      const rows = propertyMap.get(societyId) ?? [];
      const duplicate = rows.some((row) => row.unitId === property.unitId && row.relationship === property.relationship);
      if (!duplicate) rows.push(property);
      propertyMap.set(societyId, rows);
    };

    for (const row of ownershipRows) {
      addProperty(row.societyId, {
        unitId: row.unitId,
        unitNumber: row.unit.number,
        buildingName: row.unit.building.name,
        buildingCode: row.unit.building.code,
        relationship: 'OWNER',
      });
    }
    for (const row of occupancyRows) {
      addProperty(row.societyId, {
        unitId: row.unitId,
        unitNumber: row.unit.number,
        buildingName: row.unit.building.name,
        buildingCode: row.unit.building.code,
        relationship: 'OCCUPANT',
      });
    }

    const societyMap = new Map<string, SocietyContext>();
    for (const row of membershipRows) {
      const existing = societyMap.get(row.societyId);
      if (existing) {
        if (!existing.roles.includes(row.role)) existing.roles.push(row.role);
        continue;
      }
      societyMap.set(row.societyId, {
        societyId: row.societyId,
        role: row.role,
        roles: [row.role],
        society: row.society,
        properties: propertyMap.get(row.societyId) ?? [],
      });
    }
    return [...societyMap.values()];
  }
}
