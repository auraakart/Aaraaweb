import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditEventType } from '@prisma/client';
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

  private hash(credential: string) { return createHash('sha256').update(credential).digest('hex'); }

  async verify(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: this.hash(credential) }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Visitor pass not found');
    const now = new Date();
    if (pass.status !== 'ACTIVE') throw new BadRequestException(`Visitor pass is ${pass.status.toLowerCase()}`);
    if (pass.visitor.status !== 'APPROVED') throw new BadRequestException(`Visitor is ${pass.visitor.status.toLowerCase()}`);
    if (now < pass.validFrom || now > pass.validUntil) throw new BadRequestException('Visitor pass is outside its validity window');
    if (actorUserId) await this.audit.record(societyId, actorUserId, gateId, AuditEventType.VISITOR_VERIFIED, pass.id);
    return pass;
  }

  async checkIn(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: this.hash(credential) }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Visitor pass not found');
    const now = new Date();
    if (pass.status !== 'ACTIVE') throw new BadRequestException(`Visitor pass is ${pass.status.toLowerCase()}`);
    if (pass.visitor.status !== 'APPROVED') throw new BadRequestException(`Visitor is ${pass.visitor.status.toLowerCase()}`);
    if (now < pass.validFrom || now > pass.validUntil) throw new BadRequestException('Visitor pass is outside its validity window');

    return this.prisma.$transaction(async (tx) => {
      const passChanged = await tx.visitorPass.updateMany({ where: { id: pass.id, societyId, status: 'ACTIVE', checkedInAt: null }, data: { status: 'USED', checkedInAt: now } });
      if (passChanged.count !== 1) throw new BadRequestException('Visitor pass changed before check-in could complete');
      const visitorChanged = await tx.visitor.updateMany({ where: { id: pass.visitorId, societyId, status: 'APPROVED' }, data: { status: 'CHECKED_IN' } });
      if (visitorChanged.count !== 1) throw new BadRequestException('Visitor changed before check-in could complete');
      if (actorUserId) await tx.auditEvent.create({ data: { societyId, actorUserId, gateId, visitorPassId: pass.id, event: AuditEventType.VISITOR_CHECKED_IN } });
      const updated = await tx.visitorPass.findUniqueOrThrow({ where: { id: pass.id }, include: { visitor: true } });
      return updated;
    });
  }

  async checkOut(societyId: string, gateId: string, credential: string, actorUserId?: string) {
    await this.assertGate(societyId, gateId);
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: this.hash(credential), checkedInAt: { not: null }, checkedOutAt: null }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Checked-in visitor pass not found');
    if (pass.visitor.status !== 'CHECKED_IN') throw new BadRequestException(`Visitor is ${pass.visitor.status.toLowerCase()}`);
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const passChanged = await tx.visitorPass.updateMany({ where: { id: pass.id, societyId, checkedInAt: { not: null }, checkedOutAt: null }, data: { checkedOutAt: now, status: 'USED' } });
      if (passChanged.count !== 1) throw new BadRequestException('Visitor pass changed before check-out could complete');
      const visitorChanged = await tx.visitor.updateMany({ where: { id: pass.visitorId, societyId, status: 'CHECKED_IN' }, data: { status: 'CHECKED_OUT' } });
      if (visitorChanged.count !== 1) throw new BadRequestException('Visitor changed before check-out could complete');
      if (actorUserId) await tx.auditEvent.create({ data: { societyId, actorUserId, gateId, visitorPassId: pass.id, event: AuditEventType.VISITOR_CHECKED_OUT } });
      return tx.visitorPass.findUniqueOrThrow({ where: { id: pass.id }, include: { visitor: true } });
    });
  }
}
