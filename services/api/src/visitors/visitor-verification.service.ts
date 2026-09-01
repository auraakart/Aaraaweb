import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { GateAuditService } from '../gates/gate-audit.service';

@Injectable()
export class VisitorVerificationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: GateAuditService) {}

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
    return gate;
  }

  private hash(credential: string) {
    return createHash('sha256').update(credential).digest('hex');
  }

  async verify(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const pass = await this.prisma.visitorPass.findFirst({
      where: { societyId, credentialHash: this.hash(credential) },
      include: { visitor: true },
    });
    if (!pass) throw new NotFoundException('Visitor pass not found');
    const now = new Date();
    if (pass.status !== 'ACTIVE') throw new BadRequestException(`Visitor pass is ${pass.status.toLowerCase()}`);
    if (pass.visitor.status !== 'APPROVED') throw new BadRequestException(`Visitor is ${pass.visitor.status.toLowerCase()}`);
    if (now < pass.validFrom || now > pass.validUntil) throw new BadRequestException('Visitor pass is outside its validity window');
    if (actorUserId) await this.audit.record(societyId, actorUserId, gateId, 'VISITOR_VERIFIED', pass.id);
    return pass;
  }

  async checkIn(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    const pass = await this.verify(societyId, gateId, credential);
    const checkedInAt = new Date();
    const updated = await this.prisma.visitorPass.update({
      where: { id: pass.id },
      data: { status: 'USED', checkedInAt },
      include: { visitor: true },
    });
    await this.prisma.visitor.update({ where: { id: pass.visitorId }, data: { status: 'CHECKED_IN' } });
    if (actorUserId) await this.audit.record(societyId, actorUserId, gateId, 'VISITOR_CHECKED_IN', pass.id);
    return { ...updated, visitor: { ...updated.visitor, status: 'CHECKED_IN' } };
  }

  async checkOut(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const pass = await this.prisma.visitorPass.findFirst({
      where: { societyId, credentialHash: this.hash(credential), checkedInAt: { not: null }, checkedOutAt: null },
      include: { visitor: true },
    });
    if (!pass) throw new NotFoundException('Checked-in visitor pass not found');
    if (pass.visitor.status !== 'CHECKED_IN') throw new BadRequestException(`Visitor is ${pass.visitor.status.toLowerCase()}`);

    const updated = await this.prisma.visitorPass.update({
      where: { id: pass.id },
      data: { checkedOutAt: new Date(), status: 'USED' },
      include: { visitor: true },
    });
    await this.prisma.visitor.update({ where: { id: pass.visitorId }, data: { status: 'CHECKED_OUT' } });
    if (actorUserId) await this.audit.record(societyId, actorUserId, gateId, 'VISITOR_CHECKED_OUT', pass.id);
    return { ...updated, visitor: { ...updated.visitor, status: 'CHECKED_OUT' } };
  }
}
