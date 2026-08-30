import { Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';

export interface OtpChallenge {
  challengeId: string;
  phone: string;
  expiresAt: Date;
  attempts: number;
}

@Injectable()
export class AuthService {
  private readonly challenges = new Map<string, OtpChallenge & { code: string }>();

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
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) return { verified: false };
    if (challenge.attempts >= 5) return { verified: false };
    challenge.attempts += 1;
    const verified = challenge.code === code;
    if (verified) this.challenges.delete(challengeId);
    return { verified, phone: verified ? challenge.phone : undefined };
  }
}
