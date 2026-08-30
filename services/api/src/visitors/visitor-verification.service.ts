import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitorVerificationService {
  constructor(private readonly prisma: PrismaService) {}

  async verify(societyId: string, credential: string) {
    const hash = createHash('sha256').update(credential).digest('hex');
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: hash }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Visitor pass not found');
    const now = new Date();
    if (pass.status !== 'ACTIVE') throw new BadRequestException(`Visitor pass is ${pass.status.toLowerCase()}`);
    if (now < pass.validFrom || now > pass.validUntil) throw new BadRequestException('Visitor pass is outside its validity window');
    return pass;
  }

  async checkIn(societyId: string, credential: string) {
    const pass = await this.verify(societyId, credential);
    return this.prisma.visitorPass.update({ where: { id: pass.id }, data: { status: 'USED', checkedInAt: new Date() }, include: { visitor: true } });
  }

  async checkOut(societyId: string, credential: string) {
    const hash = createHash('sha256').update(credential).digest('hex');
    const pass = await this.prisma.visitorPass.findFirst({ where: { societyId, credentialHash: hash, checkedInAt: { not: null } }, include: { visitor: true } });
    if (!pass) throw new NotFoundException('Checked-in visitor pass not found');
    return this.prisma.visitorPass.update({ where: { id: pass.id }, data: { checkedOutAt: new Date() }, include: { visitor: true } });
  }
}
