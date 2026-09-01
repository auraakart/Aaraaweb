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
class LogoutDto { @IsUUID() sessionId!: string; }

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly prisma: PrismaService, private readonly sessions: SessionService) {}

  @Post('otp/request') requestOtp(@Body() dto: RequestOtpDto) {
    const challenge = this.authService.requestOtp(dto.phone);
    return { challengeId: challenge.challengeId, expiresAt: challenge.expiresAt };
  }

  @Post('otp/verify') async verifyOtp(@Body() dto: VerifyOtpDto) {
    const result = this.authService.verifyOtp(dto.challengeId, dto.code);
    if (!result.verified || !result.phone) throw new UnauthorizedException('Invalid or expired OTP');
    const user = await this.prisma.user.findUnique({ where: { phone: result.phone } });
    if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException('User is not active');
    const memberships = await this.prisma.societyMembership.findMany({
      where: { userId: user.id, active: true },
      select: { societyId: true, role: true, society: { select: { name: true, code: true } } },
    });
    if (memberships.length === 1) {
      return { verified: true, userId: user.id, memberships, session: await this.sessions.create(user.id, memberships[0].societyId, [memberships[0].role as AppRole]) };
    }
    const selectionGrant = this.authService.createSocietySelectionGrant(user.id);
    return { verified: true, userId: user.id, memberships, selectionToken: selectionGrant.token, selectionExpiresAt: selectionGrant.expiresAt };
  }

  @Post('society/select') async selectSociety(@Body() dto: SelectSocietyDto) {
    this.authService.consumeSocietySelectionGrant(dto.selectionToken, dto.userId);
    const membership = await this.prisma.societyMembership.findFirst({ where: { userId: dto.userId, societyId: dto.societyId, active: true } });
    if (!membership) throw new UnauthorizedException('User is not an active member of this society');
    const session = await this.sessions.create(dto.userId, dto.societyId, [membership.role as AppRole]);
    return { societyId: dto.societyId, role: membership.role, session };
  }

  @Post('refresh') refresh(@Body() dto: RefreshDto) { return this.sessions.refresh(dto.sessionId, dto.refreshToken); }
  @Post('logout') async logout(@Body() dto: LogoutDto) { await this.sessions.revoke(dto.sessionId); return { success: true }; }
}
