import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitorService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertHostUnit(societyId: string, hostUserId: string, unitId: string) {
    const link = await this.prisma.unitResident.findFirst({
      where: { societyId, userId: hostUserId, unitId, active: true },
    });
    if (!link) throw new BadRequestException('Host is not an active resident of this unit');
  }

  private async issuePass(societyId: string, visitorId: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Pass validity window is invalid');
    const rawCredential = randomBytes(24).toString('base64url');
    const credentialHash = createHash('sha256').update(rawCredential).digest('hex');
    const pass = await this.prisma.visitorPass.create({
      data: { societyId, visitorId, credentialHash, validFrom, validUntil, status: 'ACTIVE' },
    });
    return { pass, credential: rawCredential };
  }

  async createRequest(societyId: string, hostUserId: string, unitId: string, name: string, phone?: string, purpose?: string) {
    await this.assertHostUnit(societyId, hostUserId, unitId);
    return this.prisma.visitor.create({
      data: {
        societyId,
        hostUserId,
        unitId,
        name: name.trim(),
        phone: phone?.trim() || null,
        purpose: purpose?.trim() || null,
        status: 'PENDING',
      },
    });
  }

  async createPass(societyId: string, hostUserId: string, unitId: string, name: string, phone: string, validFrom: Date, validUntil: Date) {
    await this.assertHostUnit(societyId, hostUserId, unitId);
    const visitor = await this.prisma.visitor.create({
      data: { societyId, hostUserId, unitId, name: name.trim(), phone: phone.trim(), status: 'APPROVED' },
    });
    const issued = await this.issuePass(societyId, visitor.id, validFrom, validUntil);
    return { visitor, ...issued };
  }

  async listForHost(societyId: string, hostUserId: string) {
    return this.prisma.visitor.findMany({
      where: { societyId, hostUserId },
      include: { passes: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approve(societyId: string, hostUserId: string, visitorId: string, validFrom: Date, validUntil: Date) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (visitor.status !== 'PENDING') throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);

    const issued = await this.issuePass(societyId, visitor.id, validFrom, validUntil);
    const updatedVisitor = await this.prisma.visitor.update({ where: { id: visitor.id }, data: { status: 'APPROVED' } });
    return { visitor: updatedVisitor, ...issued };
  }

  async deny(societyId: string, hostUserId: string, visitorId: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (visitor.status !== 'PENDING') throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);
    return this.prisma.visitor.update({ where: { id: visitor.id }, data: { status: 'DENIED' } });
  }

  async cancel(societyId: string, hostUserId: string, visitorId: string) {
    const visitor = await this.prisma.visitor.findFirst({ where: { id: visitorId, societyId, hostUserId } });
    if (!visitor) throw new NotFoundException('Visitor request not found');
    if (!['PENDING', 'APPROVED'].includes(visitor.status)) {
      throw new BadRequestException(`Visitor request is ${visitor.status.toLowerCase()}`);
    }
    await this.prisma.visitorPass.updateMany({
      where: { societyId, visitorId: visitor.id, status: 'ACTIVE' },
      data: { status: 'REVOKED' },
    });
    return this.prisma.visitor.update({ where: { id: visitor.id }, data: { status: 'CANCELLED' } });
  }
}
