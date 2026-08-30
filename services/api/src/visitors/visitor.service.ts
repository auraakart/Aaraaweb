import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VisitorService {
  constructor(private readonly prisma: PrismaService) {}

  async createPass(societyId: string, hostUserId: string, unitId: string, name: string, phone: string, validFrom: Date, validUntil: Date) {
    if (validUntil <= validFrom) throw new BadRequestException('Pass validity window is invalid');
    const link = await this.prisma.unitResident.findFirst({ where: { societyId, userId: hostUserId, unitId, active: true } });
    if (!link) throw new BadRequestException('Host is not an active resident of this unit');
    const visitor = await this.prisma.visitor.create({ data: { societyId, hostUserId, unitId, name: name.trim(), phone: phone.trim() } });
    const rawCredential = randomBytes(24).toString('base64url');
    const credentialHash = createHash('sha256').update(rawCredential).digest('hex');
    const pass = await this.prisma.visitorPass.create({ data: { societyId, visitorId: visitor.id, credentialHash, validFrom, validUntil, status: 'ACTIVE' } });
    return { visitor, pass, credential: rawCredential };
  }
}
