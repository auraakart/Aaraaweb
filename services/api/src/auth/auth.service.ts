import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface OtpChallenge { challengeId: string; phone: string; expiresAt: Date; attempts: number; }
interface SocietySelectionGrant { token: string; userId: string; expiresAt: Date; }

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, OtpChallenge & { code: string }>();
  private readonly societySelectionGrants = new Map<string, SocietySelectionGrant>();
  constructor(private readonly prisma: PrismaService) {}

  requestOtp(phone: string): OtpChallenge {
    const normalizedPhone = phone.replace(/\s+/g, '');
    const challengeId = randomUUID();
    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.challenges.set(challengeId, { challengeId, phone: normalizedPhone, expiresAt, attempts: 0, code });
    return { challengeId, phone: normalizedPhone, expiresAt, attempts: 0 };
  }

  verifyOtp(challengeId: string, code: string) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt.getTime() < Date.now() || challenge.attempts >= 5) throw new UnauthorizedException('Invalid or expired OTP');
    challenge.attempts += 1;
    if (challenge.code !== code) throw new UnauthorizedException('Invalid or expired OTP');
    this.challenges.delete(challengeId);
    return { verified: true, phone: challenge.phone };
  }

  createSocietySelectionGrant(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    this.societySelectionGrants.set(token, { token, userId, expiresAt });
    return { token, expiresAt };
  }

  consumeSocietySelectionGrant(token: string, userId: string) {
    const grant = this.societySelectionGrants.get(token);
    if (!grant || grant.userId !== userId || grant.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Society selection grant is invalid or expired');
    }
    this.societySelectionGrants.delete(token);
    return true;
  }
}
