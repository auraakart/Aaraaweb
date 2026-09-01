import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppRole, AuthPrincipal } from './auth.types';
import { PrismaMembershipRepository } from './prisma-membership.repository';

@Injectable()
export class AuthContextService {
  constructor(private readonly memberships: PrismaMembershipRepository) {}

  async resolve(userId: string, societyId?: string): Promise<AuthPrincipal> {
    const rows = societyId
      ? await this.memberships.findActiveByUserAndSociety(userId, societyId)
      : await this.memberships.findActiveByUser(userId);
    if (!rows.length) throw new UnauthorizedException('No active society membership');
    const selectedSociety = societyId ?? rows[0].societyId;
    const roles = rows.filter((row) => row.societyId === selectedSociety).map((row) => row.role as AppRole);
    return { userId, societyId: selectedSociety, roles };
  }
}
