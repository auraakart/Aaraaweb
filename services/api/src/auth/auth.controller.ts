import { Body, Controller, Post, UnauthorizedException } from '@nestjs/common';
import { IsNotEmpty, IsPhoneNumber, IsString, IsUUID, Length } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { AppRole } from './auth.types';

class RequestOtpDto { @IsPhoneNumber() phone!: string; }
class VerifyOtpDto { @IsString() challengeId!: string; @IsString() @Length(6, 6) code!: string; }
class SelectSocietyDto { @IsUUID() userId!: string; @IsUUID() societyId!: string; @IsString() @IsNotEmpty() selectionToken!: string; }
class RefreshDto { @IsUUID() sessionId!: string; @IsString() @IsNotEmpty() refreshToken!: string; }
class LogoutDto { @IsUUID() sessionId!: string; @IsString() @IsNotEmpty() refreshToken!: string; }

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

    // Independent-home consumers are valid Aaraagate users even without a society.
    // Their session deliberately carries no societyId, so TenantGuard keeps all
    // society-only APIs inaccessible.
    if (membershipRows.length === 0) {
      return {
        verified: true,
        userId: user.id,
        contextType: 'INDEPENDENT_HOME',
        memberships: [],
        session: await this.sessions.create(user.id, undefined, []),
      };
    }

    const propertyRows = await this.prisma.unitOwnership.findMany({
      where: { userId: user.id, active: true },
      select: {
        societyId: true,
        unitId: true,
        unit: { select: { number: true, building: { select: { name: true, code: true } } } },
      },
    });

    const societyMap = new Map<string, {
      societyId: string;
      role: string;
      roles: string[];
      society: { name: string; code: string };
      properties: { unitId: string; unitNumber: string; buildingName: string; buildingCode: string }[];
    }>();

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
        properties: propertyRows
          .filter((property) => property.societyId === row.societyId)
          .map((property) => ({
            unitId: property.unitId,
            unitNumber: property.unit.number,
            buildingName: property.unit.building.name,
            buildingCode: property.unit.building.code,
          })),
      });
    }

    const memberships = [...societyMap.values()];
    if (memberships.length === 1) {
      const selected = memberships[0];
      return {
        verified: true,
        userId: user.id,
        contextType: 'SOCIETY',
        memberships,
        session: await this.sessions.create(user.id, selected.societyId, selected.roles as AppRole[]),
      };
    }

    const selectionGrant = await this.authService.createSocietySelectionGrant(user.id);
    return {
      verified: true,
      userId: user.id,
      contextType: 'SOCIETY_SELECTION',
      memberships,
      selectionToken: selectionGrant.token,
      selectionExpiresAt: selectionGrant.expiresAt,
    };
  }

  @Post('society/select') async selectSociety(@Body() dto: SelectSocietyDto) {
    await this.authService.consumeSocietySelectionGrant(dto.selectionToken, dto.userId);
    const memberships = await this.prisma.societyMembership.findMany({
      where: { userId: dto.userId, societyId: dto.societyId, active: true },
      select: { role: true },
    });
    if (!memberships.length) throw new UnauthorizedException('User is not an active member of this society');
    const roles = memberships.map((membership) => membership.role as AppRole);
    const session = await this.sessions.create(dto.userId, dto.societyId, roles);
    return { contextType: 'SOCIETY', societyId: dto.societyId, role: memberships[0].role, roles, session };
  }

  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.sessions.refresh(dto.sessionId, dto.refreshToken); }
  @Post('logout') async logout(@Body() dto: LogoutDto) { await this.sessions.revoke(dto.sessionId, dto.refreshToken); return { success: true }; }
}
