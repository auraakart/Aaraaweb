import { Injectable } from '@nestjs/common';
import { AppRole } from './auth.types';
import { Membership } from './membership.service';

/** Persistence boundary for society memberships. Replace the adapter implementation with Prisma in the API composition root. */
@Injectable()
export class MembershipRepository {
  private readonly rows: Membership[] = [];

  upsert(row: Membership) {
    const index = this.rows.findIndex((x) => x.userId === row.userId && x.societyId === row.societyId && x.role === row.role);
    if (index >= 0) this.rows[index] = row;
    else this.rows.push(row);
    return row;
  }

  findActiveByUser(userId: string): Membership[] {
    return this.rows.filter((x) => x.userId === userId && x.active);
  }

  findActiveByUserAndSociety(userId: string, societyId: string): Membership[] {
    return this.rows.filter((x) => x.userId === userId && x.societyId === societyId && x.active);
  }

  hasRole(userId: string, societyId: string, role: AppRole) {
    return this.rows.some((x) => x.userId === userId && x.societyId === societyId && x.role === role && x.active);
  }
}
