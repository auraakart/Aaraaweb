import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class VisitorService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertHostUnit(societyId: string, hostUserId: string, unitId: string) {
    const link = await this.prisma.unitResident.findFirst({ where: { societyId, userId: hostUserId, unitId, active: true } });
    if (!link) throw new BadRequestException('Host is not an active resident of this unit');
  }

  private async issuePass(tx: Tx, societyId: string, visitorId: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Pass validity window is invalid');
    const rawCredential = randomBytes(24).toString('base64url');
    const credentialHash = createHash('sha256').update(rawCredential).digest('hex');
    const pass = await tx.visitorPass.create({ data: { societyId, visitorId, credentialHash, validFrom, validUntil, status: 'ACTIVE' } });
    return { pass, credential: rawCredential };
  }

  async createRequest(societyId: string, hostUserId: string, unitId: string, name: string, phone?: string, purpose?: string) {
    await this.assertHostUnit(societyId, hostUserId, unitId);
    return this.prisma.visitor.create({ data: { societyId, hostUserId, unitId, name: name.trim(), phone: phone?.trim() || null, purpose: purpose?.trim() || null, status: 'PENDING' } });
  }

  async createPass(societyId: string, hostUserId: string, unitId: string, name: string, phone: string, validFrom: Date, validUntil: Date) {
    await this.assertHostUnit(societyId, hostUserId, unitId);
    if (validUntil <= validFrom) throw new BadRequestException('Pass validity window is invalid');
    return this.prisma.$transaction(async (tx) => {
      const visitor = await tx.visitor.create({ data: { societyId, hostUserId, unitId, name: name.trim(), phone: phone.trim(), status: 'APPROVED' } });
      const issued = await this.issuePass(tx, societyId, visitor.id, validFrom, validUntil);
      return { visitor, ...issued };
    });
  }

  listForHost(societyId: string, hostUserId: string) {
    return this.prisma.visitor.findMany({ where: { societyId, hostUserId }, include: { passes: { orderBy: { createdAt: 'desc' }, take: 1 } }, orderBy: { createdAt: 'desc' } });
  }

  async approve(societyId: string, hostUserId: string, visitorId: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Pass validity window is invalid');
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (visitor.status !== 'PENDING') throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.visitor.updateMany({ where: { id: visitor.id, societyId, hostUserId, status: 'PENDING' }, data: { status: 'APPROVED' } });
      if (changed.count !== 1) throw new BadRequestException('Visitor request changed before approval could complete');
      const issued = await this.issuePass(tx, societyId, visitor.id, validFrom, validUntil);
      const updatedVisitor = await tx.visitor.findUniqueOrThrow({ where: { id: visitor.id } });
      return { visitor: updatedVisitor, ...issued };
    });
  }

  async deny(societyId: string, hostUserId: string, visitorId: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (visitor.status !== 'PENDING') throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);
    const changed = await this.prisma.visitor.updateMany({ where: { id: visitor.id, societyId, hostUserId, status: 'PENDING' }, data: { status: 'DENIED' } });
    if (changed.count !== 1) throw new BadRequestException('Visitor request changed before denial could complete');
    return this.prisma.visitor.findUniqueOrThrow({ where: { id: visitor.id } });
  }

  async cancel(societyId: string, hostUserId: string, visitorId: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (visitor.status !== 'PENDING' && visitor.status !== 'APPROVED') throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.visitor.updateMany({ where: { id: visitor.id, societyId, hostUserId, status: visitor.status }, data: { status: 'CANCELLED' } });
      if (changed.count !== 1) throw new BadRequestException('Visitor request changed before cancellation could complete');
      await tx.visitorPass.updateMany({ where: { societyId, visitorId: visitor.id, status: 'ACTIVE' }, data: { status: 'REVOKED' } });
      return tx.visitor.findUniqueOrThrow({ where: { id: visitor.id } });
    });
  }
}
