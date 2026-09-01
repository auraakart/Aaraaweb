import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { AuthStateStore } from './auth-state.store';
import { OtpDeliveryService } from './otp-delivery.service';

export interface OtpChallenge { challengeId: string; phone: string; expiresAt: Date; attempts: number; }
type StoredOtpChallenge = { challengeId: string; phone: string; code: string; attempts: number };
type SocietySelectionGrant = { userId: string };

const OTP_TTL_SECONDS = 5 * 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUEST_WINDOW_SECONDS = 10 * 60;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;
const SELECTION_TTL_SECONDS = 5 * 60;

@Injectable()
export class AuthService {
  constructor(
    private readonly state: AuthStateStore,
    private readonly otpDelivery: OtpDeliveryService,
  ) {}

  async requestOtp(phone: string): Promise<OtpChallenge> {
    const normalizedPhone = phone.replace(/\s+/g, '');
    const requestCount = await this.state.increment(`auth:otp:rate:${normalizedPhone}`, OTP_REQUEST_WINDOW_SECONDS);
    if (requestCount > OTP_MAX_REQUESTS_PER_WINDOW) {
      throw new HttpException('Too many OTP requests. Try again later', HttpStatus.TOO_MANY_REQUESTS);
    }

    const challengeId = randomUUID();
    const stored: StoredOtpChallenge = {
      challengeId,
      phone: normalizedPhone,
      code: randomInt(100000, 1000000).toString(),
      attempts: 0,
    };
    const key = `auth:otp:${challengeId}`;
    await this.state.setJson(key, stored, OTP_TTL_SECONDS);

    try {
      await this.otpDelivery.send({
        phone: normalizedPhone,
        code: stored.code,
        expiresInSeconds: OTP_TTL_SECONDS,
      });
    } catch (error) {
      await this.state.delete(key);
      throw error;
    }

    return { challengeId, phone: normalizedPhone, expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000), attempts: 0 };
  }

  async verifyOtp(challengeId: string, code: string) {
    const key = `auth:otp:${challengeId}`;
    const challenge = await this.state.getJson<StoredOtpChallenge>(key);
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    if (challenge.code !== code) {
      const nextAttempts = challenge.attempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await this.state.delete(key);
      } else {
        await this.state.setJson(key, { ...challenge, attempts: nextAttempts }, OTP_TTL_SECONDS);
      }
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const consumed = await this.state.consumeJson<StoredOtpChallenge>(key);
    if (!consumed) throw new UnauthorizedException('Invalid or expired OTP');
    return { verified: true, phone: consumed.phone };
  }

  async createSocietySelectionGrant(userId: string) {
    const token = randomBytes(32).toString('base64url');
    await this.state.setJson(`auth:society-select:${token}`, { userId } satisfies SocietySelectionGrant, SELECTION_TTL_SECONDS);
    return { token, expiresAt: new Date(Date.now() + SELECTION_TTL_SECONDS * 1000) };
  }

  async consumeSocietySelectionGrant(token: string, userId: string) {
    const key = `auth:society-select:${token}`;
    const grant = await this.state.getJson<SocietySelectionGrant>(key);
    if (!grant || grant.userId !== userId) {
      throw new UnauthorizedException('Society selection grant is invalid or expired');
    }
    const consumed = await this.state.consumeJson<SocietySelectionGrant>(key);
    if (!consumed || consumed.userId !== userId) {
      throw new UnauthorizedException('Society selection grant is invalid or expired');
    }
    return true;
  }
}
