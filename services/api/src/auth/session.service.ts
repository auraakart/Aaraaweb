import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { AppRole, AuthPrincipal } from './auth.types';

type Session = { userId: string; societyId?: string; roles: AppRole[]; refreshTokenHash: string; expiresAt: number };

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, Session>();

  create(userId: string, societyId: string | undefined, roles: AppRole[]) {
    const sessionId = randomUUID();
    const refreshToken = randomBytes(32).toString('hex');
    this.sessions.set(sessionId, {
      userId, societyId, roles,
      refreshTokenHash: refreshToken,
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    return { sessionId, accessToken: sessionId, refreshToken };
  }

  getPrincipal(accessToken: string): AuthPrincipal {
    const session = this.sessions.get(accessToken);
    if (!session || session.expiresAt < Date.now()) throw new UnauthorizedException('Session is invalid or expired');
    return { userId: session.userId, societyId: session.societyId, roles: session.roles };
  }

  revoke(sessionId: string) { this.sessions.delete(sessionId); }
}
