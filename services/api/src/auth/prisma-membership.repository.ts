import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppRole } from './auth.types';
import { Membership } from './membership.service';

const toAppRole = (role: MembershipRole): AppRole => role as AppRole;

@Injectable()
export class PrismaMembershipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByUser(userId: string): Promise<Membership[]> {
    const rows = await this.prisma.societyMembership.findMany({ where: { userId, active: true } });
    return rows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: toAppRole(row.role), active: row.active }));
  }

  async findActiveByUserAndSociety(userId: string, societyId: string): Promise<Membership[]> {
    const rows = await this.prisma.societyMembership.findMany({ where: { userId, societyId, active: true } });
    return rows.map((row) => ({ userId: row.userId, societyId: row.societyId, role: toAppRole(row.role), active: row.active }));
  }

  async hasRole(userId: string, societyId: string, role: AppRole): Promise<boolean> {
    return this.prisma.societyMembership.count({ where: { userId, societyId, role: role as MembershipRole, active: true } }) > 0;
  }
}
