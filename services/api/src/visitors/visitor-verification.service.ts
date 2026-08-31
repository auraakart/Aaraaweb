import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitorVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertGate(societyId: string, gateId: string) {
    const gate = await this.prisma.gate.findFirst({ where: { id: gateId, societyId, active: true } });
    if (!gate) throw new BadRequestException('Gate does not belong to authenticated society or is inactive');
    return gate;
  }

  async verify(societyId: string, gateId: string, credential: string) {
    await this.assertGate(societyId, gateId);
    const hash = createHash('sha256').update(credential).digest('hex');
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: hash }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Visitor pass not found');
    const now = new Date();
    if (pass.status !== 'ACTIVE') throw new BadRequestException(`Visitor pass is ${pass.status.toLowerCase()}`);
    if (now < pass.validFrom || now > pass.validUntil) throw new BadRequestException('Visitor pass is outside its validity window');
    return pass;
  }

  async checkIn(societyId: string, gateId: string, credential: string) {
    const pass = await this.verify(societyId, gateId, credential);
    return this.prisma.visitorPass.update({ where: { id: pass.id }, data: { status: 'USED', checkedInAt: new Date() }, include: { visitor: true } });
  }

  async checkOut(societyId: string, gateId: string, credential: string) {
    await this.assertGate(societyId, gateId);
    const hash = createHash('sha256').update(credential).digest('hex');
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: hash, checkedInAt: { not: null }, checkedOutAt: null }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Checked-in visitor pass not found');
    return this.prisma.visitorPass.update({ where: { id: pass.id }, data: { checkedOutAt: new Date() }, include: { visitor: true } });
  }
}
