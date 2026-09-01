import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppRole, AuthPrincipal } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthStateStore } from './auth-state.store';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const replayKey = (refreshTokenHash: string) => `auth:refresh-used:${refreshTokenHash}`;

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService, private readonly state: AuthStateStore) {}

  async create(userId: string, societyId: string | undefined, roles: AppRole[]) {
    const now = Date.now();
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(48).toString('hex');
    const id = randomUUID();
    const expiresAt = new Date(now + ACCESS_TTL_MS);
    const refreshExpiresAt = new Date(now + REFRESH_TTL_MS);
    await this.prisma.session.create({ data: { id, userId, societyId: societyId ?? null, accessTokenHash: hash(accessToken), refreshTokenHash: hash(refreshToken), expiresAt, refreshExpiresAt } });
    return { sessionId: id, accessToken, refreshToken, expiresAt: expiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString(), roles };
  }

  async getPrincipal(accessToken: string): Promise<AuthPrincipal> {
    const session = await this.prisma.session.findUnique({ where: { accessTokenHash: hash(accessToken) }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now() || session.user.status !== 'ACTIVE') throw new UnauthorizedException('Session is invalid or expired');
    const memberships = await this.prisma.societyMembership.findMany({ where: { userId: session.userId, societyId: session.societyId ?? undefined, active: true }, select: { role: true } });
    return { userId: session.userId, societyId: session.societyId ?? undefined, roles: memberships.map(m => m.role as AppRole) };
  }

  async refresh(sessionId: string, refreshToken: string) {
    const refreshTokenHash = hash(refreshToken);
    const used = await this.state.getJson<{ sessionId: string }>(replayKey(refreshTokenHash));
    if (used?.sessionId === sessionId) {
      await this.revokeCompromised(sessionId);
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session || session.revokedAt || session.refreshExpiresAt.getTime() < Date.now() || session.refreshTokenHash !== refreshTokenHash) {
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const replayTtlSeconds = Math.max(1, Math.ceil((session.refreshExpiresAt.getTime() - Date.now()) / 1000));
    const claimed = await this.state.setIfAbsentJson(replayKey(refreshTokenHash), { sessionId }, replayTtlSeconds);
    if (!claimed) {
      await this.revokeCompromised(sessionId);
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const accessToken = randomBytes(32).toString('hex');
    const nextRefresh = randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + ACCESS_TTL_MS);
    const rotated = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, refreshTokenHash, refreshExpiresAt: { gt: new Date() } },
      data: { accessTokenHash: hash(accessToken), refreshTokenHash: hash(nextRefresh), expiresAt },
    });
    if (rotated.count !== 1) {
      await this.revokeCompromised(sessionId);
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    return { sessionId, accessToken, refreshToken: nextRefresh, expiresAt: expiresAt.toISOString(), refreshExpiresAt: session.refreshExpiresAt.toISOString() };
  }

  async revoke(sessionId: string, refreshToken: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, refreshTokenHash: hash(refreshToken) },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1) throw new UnauthorizedException('Session is invalid or expired');
  }

  private async revokeCompromised(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
