import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { AppPermission } from '../auth/permission.types';
import { PrismaService } from '../prisma/prisma.service';
import { SosRespondersController } from './sos-responders.controller';

describe('SosRespondersController', () => {
  it('requires SOS respond permission', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, SosRespondersController)).toEqual([AppPermission.SOS_RESPOND]);
  });

  it('lists only active users and memberships inside the current society', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const controller = new SosRespondersController(prisma as unknown as PrismaService);

    await controller.list('society-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('sm."societyId"');
    expect(sql).toContain('sm."active" = true');
    expect(sql).toContain('u."status" = \'ACTIVE\'');
    expect(sql).toContain('"MembershipRole"');
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('SECURITY_SUPERVISOR');
    expect(query.values).toContain('SECURITY_GUARD');
    expect(query.values).not.toContain('ACCOUNTANT');
  });
});
