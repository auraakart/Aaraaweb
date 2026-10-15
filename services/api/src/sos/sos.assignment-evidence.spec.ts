import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { SosService } from './sos.service';

describe('SosService incident assignment and evidence', () => {
  it('assigns an open incident only after validating a same-society responder membership', async () => {
    const assignedAt = new Date('2026-09-16T09:00:00Z');
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACKNOWLEDGED', societyId: 'society-1' }])
        .mockResolvedValueOnce([{ id: 'membership-1' }])
        .mockResolvedValueOnce([{ occurredAt: assignedAt }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    const result = await service.assign('society-1', 'supervisor-1', 'incident-1', 'guard-1', 'Take east gate response');

    const membershipQuery = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    const membershipSql = membershipQuery.strings.join(' ');
    expect(membershipSql).toContain('"SocietyMembership"');
    expect(membershipSql).toContain('sm."societyId"');
    expect(membershipSql).toContain('sm."active" = true');
    expect(membershipSql).toContain('"MembershipRole"');
    expect(membershipQuery.values).toContain('society-1');
    expect(membershipQuery.values).toContain('guard-1');
    expect(membershipQuery.values).toContain('SECURITY_GUARD');
    expect(membershipQuery.values).toContain('SECURITY_SUPERVISOR');

    const assignment = prisma.$queryRaw.mock.calls[2][0] as { strings: readonly string[]; values: unknown[] };
    expect(assignment.strings.join(' ')).toContain("'ASSIGNED'");
    expect(assignment.values.some((value) => typeof value === 'string' && value.includes('guard-1'))).toBe(true);
    expect(result).toMatchObject({ assignedToUserId: 'guard-1', assignedAt });
  });

  it('rejects assignment when the target has no active responder membership in the society', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }])
        .mockResolvedValueOnce([]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(service.assign('society-1', 'admin-1', 'incident-1', 'outsider-1')).rejects.toThrow(
      'Assignee must be an active SOS responder in this society',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('rejects assignment after an incident is closed', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1', status: 'RESOLVED', societyId: 'society-1' }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(service.assign('society-1', 'admin-1', 'incident-1', 'guard-1')).rejects.toThrow(
      'Only active or acknowledged SOS incidents can be updated',
    );
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('stores evidence as an append-only private object reference and never as a public URL', async () => {
    const occurredAt = new Date('2026-09-16T09:05:00Z');
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }])
        .mockResolvedValueOnce([{ id: 'event-1', occurredAt }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    const result = await service.addEvidence('society-1', 'guard-1', 'incident-1', {
      objectKey: 'sos/society-1/incident-1/photo-1.jpg',
      fileName: 'lift-panel.jpg',
      contentType: 'image/jpeg',
      note: 'Panel state on arrival',
    });

    const insert = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    expect(insert.strings.join(' ')).toContain("'EVIDENCE_ADDED'");
    expect(insert.values.some((value) => typeof value === 'string' && value.includes('sos/society-1/incident-1/photo-1.jpg'))).toBe(true);
    expect(result).toMatchObject({
      id: 'event-1',
      incidentId: 'incident-1',
      objectKey: 'sos/society-1/incident-1/photo-1.jpg',
      fileName: 'lift-panel.jpg',
      contentType: 'image/jpeg',
    });
  });

  it('rejects evidence that attempts to persist an externally reachable URL', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1', status: 'ACTIVE', societyId: 'society-1' }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(
      service.addEvidence('society-1', 'guard-1', 'incident-1', {
        objectKey: 'https://public.example/evidence.jpg',
        fileName: 'evidence.jpg',
      }),
    ).rejects.toThrow('Evidence must use a private object key, not a public URL');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('rejects new evidence after an incident is closed', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'incident-1', status: 'CANCELLED', societyId: 'society-1' }]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await expect(
      service.addEvidence('society-1', 'guard-1', 'incident-1', {
        objectKey: 'sos/society-1/incident-1/photo-2.jpg',
        fileName: 'closed.jpg',
      }),
    ).rejects.toThrow('Only active or acknowledged SOS incidents can be updated');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('lists evidence only after resolving the incident inside the current society boundary', async () => {
    const prisma = {
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'incident-1', status: 'ACKNOWLEDGED', societyId: 'society-1' }])
        .mockResolvedValueOnce([]),
    };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.evidence('society-1', 'incident-1');

    const query = prisma.$queryRaw.mock.calls[1][0] as { strings: readonly string[]; values: unknown[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain('se."societyId"');
    expect(sql).toContain('se."incidentId"');
    expect(sql).toContain("se.\"action\" = 'EVIDENCE_ADDED'");
    expect(query.values).toContain('society-1');
    expect(query.values).toContain('incident-1');
  });

  it('derives current assignment and evidence count in the responder queue without mutable side tables', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([]) };
    const service = new SosService(prisma as unknown as PrismaService);

    await service.listManage('society-1');

    const query = prisma.$queryRaw.mock.calls[0][0] as { strings: readonly string[] };
    const sql = query.strings.join(' ');
    expect(sql).toContain("se.\"action\" = 'ASSIGNED'");
    expect(sql).toContain("se.\"action\" = 'EVIDENCE_ADDED'");
    expect(sql).toContain('"assignedToUserId"');
    expect(sql).toContain('"evidenceCount"');
  });
});
