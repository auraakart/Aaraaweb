import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PartnerInvitationStatus, PartnerRole } from '@prisma/client';
import { AppRole, AuthPrincipal } from './auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthStateStore } from './auth-state.store';
import { AuthContextService } from './auth-context.service';
import { HostSessionRequest, verifiedHostSessionBinding } from './partner-host-session';

const ACCESS_TTL_MS = 15 * 60 * 1000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const replayKey = (refreshTokenHash: string) => `auth:refresh-used:${refreshTokenHash}`;

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly state: AuthStateStore,
    private readonly contexts: AuthContextService,
  ) {}

  async create(userId: string, societyId: string | undefined, roles: AppRole[], options?: {audience:'PARTNER';hostRequest?:HostSessionRequest}) {
    if (options?.audience === 'PARTNER' && (societyId || roles.length)) throw new UnauthorizedException('Partner session cannot carry society authority');
    const host = options?.hostRequest ? await verifiedHostSessionBinding(this.prisma,userId,options.hostRequest) : undefined;
    const now = Date.now();
    const accessToken = randomBytes(32).toString('hex');
    const refreshToken = randomBytes(48).toString('hex');
    const id = randomUUID();
    const expiresAt = new Date(now + ACCESS_TTL_MS);
    const refreshExpiresAt = new Date(now + REFRESH_TTL_MS);
    await this.prisma.session.create({ data: { id, userId, societyId: societyId ?? null, audience: options?.audience ?? 'STANDARD',
      ...(host?{originHost:host.originHost,hostClaimId:host.hostClaimId,hostClaimVersion:host.hostClaimVersion}:{}),
      accessTokenHash: hash(accessToken), refreshTokenHash: hash(refreshToken), expiresAt, refreshExpiresAt } });
    return { sessionId: id, accessToken, refreshToken, expiresAt: expiresAt.toISOString(), refreshExpiresAt: refreshExpiresAt.toISOString(), roles };
  }

  private async currentPartnerAccess(userId:string):Promise<boolean> {
    const [member,invite] = await Promise.all([
      this.prisma.partnerMembership.findFirst({where:{userId,active:true,role:{in:[PartnerRole.OWNER,PartnerRole.BRAND_MANAGER,PartnerRole.COMMERCIAL_ADMIN,PartnerRole.SUPPORT]},partner:{is:{status:'ACTIVE'}}},select:{id:true}}),
      this.prisma.partnerInvitation.findFirst({where:{userId,status:PartnerInvitationStatus.PENDING,expiresAt:{gt:new Date()},partner:{is:{status:'ACTIVE'}}},select:{id:true}}),
    ]);
    return Boolean(member || invite);
  }

  async getPrincipal(accessToken: string, request?:HostSessionRequest): Promise<AuthPrincipal> {
    const session = await this.prisma.session.findUnique({
      where: { accessTokenHash: hash(accessToken) },
      include: { user: true, society: { select: { status: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      session.user.status !== 'ACTIVE' ||
      (session.societyId && session.society?.status !== 'ACTIVE')
    ) {
      throw new UnauthorizedException('Session is invalid or expired');
    }

    if ((session.originHost || session.hostClaimId || session.hostClaimVersion) &&
        (session.audience !== 'PARTNER' || !session.originHost || !session.hostClaimId || !Number.isInteger(session.hostClaimVersion) || session.hostClaimVersion! <= 0))
      throw new UnauthorizedException('Invalid session host binding');
    if (session.audience !== 'STANDARD' && session.audience !== 'PARTNER' && session.audience !== undefined)
      throw new UnauthorizedException('Invalid session audience');
    if (session.audience === 'PARTNER') {
      const host = session.hostClaimId ? await verifiedHostSessionBinding(this.prisma,session.userId,request,{
        hostClaimId:session.hostClaimId,hostClaimVersion:session.hostClaimVersion!,originHost:session.originHost!,
      }) : undefined;
      if (session.societyId || !(await this.currentPartnerAccess(session.userId)))
        throw new UnauthorizedException('Partner session authorization expired');
      return { userId:session.userId, societyId:undefined, roles:[], audience:'PARTNER',...(host?{hostPartnerId:host.partnerId}:{}) };
    }

    // Independent-home sessions are intentionally society-less and must never
    // inherit roles from any memberships the same user may hold elsewhere.
    if (!session.societyId) {
      return { userId: session.userId, societyId: undefined, roles: [] };
    }

    return this.contexts.resolve(session.userId, session.societyId);
  }

  async refresh(sessionId: string, refreshToken: string, request?:HostSessionRequest) {
    const refreshTokenHash = hash(refreshToken);
    const used = await this.state.getJson<{ sessionId: string }>(replayKey(refreshTokenHash));
    if (used?.sessionId === sessionId) {
      // A replay from another host must not revoke a valid bound session.
      const replaySession = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (replaySession?.hostClaimId) await verifiedHostSessionBinding(this.prisma,replaySession.userId,request,{
        hostClaimId:replaySession.hostClaimId,hostClaimVersion:replaySession.hostClaimVersion!,originHost:replaySession.originHost!,
      });
      await this.revokeCompromised(sessionId, 'REFRESH_REPLAY');
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { select: { status: true } }, society: { select: { status: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.refreshExpiresAt.getTime() < Date.now() ||
      session.refreshTokenHash !== refreshTokenHash ||
      session.user.status !== 'ACTIVE' ||
      (session.societyId && session.society?.status !== 'ACTIVE')
    ) {
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    if ((session.originHost || session.hostClaimId || session.hostClaimVersion) &&
        (session.audience !== 'PARTNER' || !session.originHost || !session.hostClaimId || !Number.isInteger(session.hostClaimVersion) || session.hostClaimVersion! <= 0))
      throw new UnauthorizedException('Invalid session host binding');
    if (session.audience !== 'STANDARD' && session.audience !== 'PARTNER' && session.audience !== undefined)
      throw new UnauthorizedException('Invalid session audience');
    if(session.hostClaimId) await verifiedHostSessionBinding(this.prisma,session.userId,request,{
      hostClaimId:session.hostClaimId,hostClaimVersion:session.hostClaimVersion!,originHost:session.originHost!,
    });
    if (session.audience === 'PARTNER' &&
      (session.societyId || !(await this.currentPartnerAccess(session.userId))))
      throw new UnauthorizedException('Partner session authorization expired');

    // Refresh must revalidate the same operational authority as bearer access.
    // Commercial partner ownership never substitutes for society membership.
    if (session.societyId) await this.contexts.resolve(session.userId, session.societyId);

    const replayTtlSeconds = Math.max(1, Math.ceil((session.refreshExpiresAt.getTime() - Date.now()) / 1000));
    const claimed = await this.state.setIfAbsentJson(replayKey(refreshTokenHash), { sessionId }, replayTtlSeconds);
    if (!claimed) {
      await this.revokeCompromised(sessionId, 'REFRESH_ROTATION_CONFLICT');
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
      await this.revokeCompromised(sessionId, 'REFRESH_ROTATION_CONFLICT');
      throw new UnauthorizedException('Refresh session is invalid or expired');
    }

    return { sessionId, accessToken, refreshToken: nextRefresh, expiresAt: expiresAt.toISOString(), refreshExpiresAt: session.refreshExpiresAt.toISOString() };
  }

  async revoke(sessionId: string, refreshToken: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, refreshTokenHash: hash(refreshToken) },
      data: { revokedAt: new Date(), revocationReason: 'LOGOUT' },
    });
    if (result.count !== 1) throw new UnauthorizedException('Session is invalid or expired');
  }

  private async revokeCompromised(sessionId: string, reason: 'REFRESH_REPLAY' | 'REFRESH_ROTATION_CONFLICT') {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revocationReason: reason },
    });
  }
}
