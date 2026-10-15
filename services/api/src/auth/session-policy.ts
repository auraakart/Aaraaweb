import { Injectable } from '@nestjs/common';
import { AppRole } from './auth.types';

@Injectable()
export class SessionPolicy {
  readonly accessTokenTtlSeconds = 15 * 60;
  readonly refreshTokenTtlSeconds = 30 * 24 * 60 * 60;

  canAccessSociety(sessionSocietyId: string | undefined, requestedSocietyId: string) {
    return !!sessionSocietyId && sessionSocietyId === requestedSocietyId;
  }

  canActAs(role: AppRole, allowed: AppRole[]) {
    return allowed.includes(role);
  }
}
