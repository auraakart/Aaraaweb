import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';

type Challenge = { phone: string; code: string; expiresAt: number; attempts: number };

@Injectable()
export class OtpService {
  private readonly challenges = new Map<string, Challenge>();

  request(phone: string) {
    const challengeId = randomUUID();
    this.challenges.set(challengeId, {
      phone,
      code: randomInt(100000, 1000000).toString(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return { challengeId, expiresInSeconds: 300 };
  }

  verify(challengeId: string, code: string) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt < Date.now() || challenge.attempts >= 5) {
      throw new UnauthorizedException('OTP challenge is invalid or expired');
    }
    challenge.attempts += 1;
    if (challenge.code !== code) throw new UnauthorizedException('Invalid OTP');
    this.challenges.delete(challengeId);
    return { phone: challenge.phone };
  }
}
