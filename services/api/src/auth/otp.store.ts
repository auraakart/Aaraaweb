import { Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';

export type OtpChallenge = {
  phone: string;
  code: string;
  expiresAt: number;
  attempts: number;
};

@Injectable()
export class OtpStore {
  private readonly challenges = new Map<string, OtpChallenge>();

  create(phone: string) {
    const id = randomUUID();
    this.challenges.set(id, {
      phone,
      code: randomInt(100000, 1000000).toString(),
      expiresAt: Date.now() + 5 * 60 * 1000,
      attempts: 0,
    });
    return { id, expiresInSeconds: 300 };
  }

  consume(id: string, code: string) {
    const challenge = this.challenges.get(id);
    if (!challenge || challenge.expiresAt < Date.now() || challenge.attempts >= 5) return null;
    challenge.attempts += 1;
    if (challenge.code !== code) return null;
    this.challenges.delete(id);
    return challenge.phone;
  }
}
