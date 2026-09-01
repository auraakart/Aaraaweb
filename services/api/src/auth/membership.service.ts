import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AppRole, AuthPrincipal } from './auth.types';

export type Membership = { userId: string; societyId: string; role: AppRole; active: boolean };

@Injectable()
export class MembershipService {
  private readonly memberships: Membership[] = [];

  addMembership(membership: Membership) {
    const exists = this.memberships.some((m) => m.userId === membership.userId && m.societyId === membership.societyId && m.role === membership.role);
    if (!exists) this.memberships.push(membership);
    return membership;
  }

  resolve(userId: string, societyId?: string): AuthPrincipal {
    const matches = this.memberships.filter((m) => m.userId === userId && m.active && (!societyId || m.societyId === societyId));
    if (!matches.length) throw new UnauthorizedException('No active society membership');
    const selectedSociety = societyId ?? matches[0].societyId;
    return { userId, societyId: selectedSociety, roles: matches.filter((m) => m.societyId === selectedSociety).map((m) => m.role) };
  }
}
