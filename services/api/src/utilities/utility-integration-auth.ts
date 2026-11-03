import { UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type UtilityIntegrationIdentity = {
  id: string;
  societyId: string;
  secretHash: string;
  status: 'ACTIVE' | 'REVOKED';
};

export async function authenticateUtilityIntegration(prisma: PrismaService, integrationKey: string | undefined): Promise<UtilityIntegrationIdentity> {
  if (!integrationKey) throw new UnauthorizedException('Utility integration key is required');
  const separator = integrationKey.indexOf('.');
  if (separator <= 0 || separator === integrationKey.length - 1) throw new UnauthorizedException('Utility integration key is invalid');
  const integrationId = integrationKey.slice(0, separator);
  const secret = integrationKey.slice(separator + 1);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(integrationId)) {
    throw new UnauthorizedException('Utility integration key is invalid');
  }
  const secretHash = createHash('sha256').update(secret, 'utf8').digest('hex');
  // The exact capability authenticates before disclosing a routing society.
  // Missing/denied capabilities fail closed; no table-level fallback is allowed.
  const rows = await prisma.$queryRaw<Array<{id: string; societyId: string}>>(Prisma.sql`
    SELECT "id","societyId" FROM aaraagate_resolve_utility_integration(${integrationId}::uuid,${secretHash})
  `);
  const identity = rows[0];
  if (!identity) throw new UnauthorizedException('Utility integration key is invalid');
  return { ...identity, secretHash, status: 'ACTIVE' };
}
