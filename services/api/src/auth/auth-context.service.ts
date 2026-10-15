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
    // Repository filters are defense-in-depth, not a substitute for binding
    // every authority row to the authenticated user and chosen society.
    const roles = [...new Set(rows
      .filter((row) => row.active && row.userId === userId && row.societyId === selectedSociety)
      .map((row) => row.role as AppRole))];
    if (!roles.length) throw new UnauthorizedException('No active society membership');
    return { userId, societyId: selectedSociety, roles };
  }
}
