import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from './documents.service';

function sqlText(call: unknown): string {
  return ((call as { strings?: readonly string[] }).strings ?? []).join('?');
}

function sqlValues(call: unknown): readonly unknown[] {
  return (call as { values?: readonly unknown[] }).values ?? [];
}

describe('DocumentsService authorization regression', () => {
  const societyId = '11111111-1111-4111-8111-111111111111';
  const userId = '22222222-2222-4222-8222-222222222222';
  const documentId = '33333333-3333-4333-8333-333333333333';

  it('scopes management document lookup by both document and current society', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new DocumentsService({ $queryRaw: queryRaw } as never);

    await expect(service.getManagementDocument(societyId, documentId)).rejects.toBeInstanceOf(NotFoundException);

    const call = queryRaw.mock.calls[0]?.[0];
    expect(sqlText(call)).toContain('WHERE "id" = ?::uuid AND "societyId" = ?::uuid');
    expect(sqlValues(call)).toContain(documentId);
    expect(sqlValues(call)).toContain(societyId);
  });

  it('authorizes published download lookup with tenant, user, status and audience ownership checks', async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const service = new DocumentsService({ $queryRaw: queryRaw } as never);

    await expect(service.getPublishedDocumentForUser(societyId, userId, documentId)).rejects.toBeInstanceOf(NotFoundException);

    const call = queryRaw.mock.calls[0]?.[0];
    const text = sqlText(call);
    const values = sqlValues(call);

    expect(text).toContain('d."id" = ?::uuid');
    expect(text).toContain('d."societyId" = ?::uuid');
    expect(text).toContain('d."status" = \'PUBLISHED\'');
    expect(text).toContain('d."audience" = \'ALL_MEMBERS\'');
    expect(text).toContain('d."audience" = \'OWNERS_ONLY\'');
    expect(text).toContain('d."audience" = \'PROPERTY_OWNER_ONLY\'');
    expect(text).toContain('uo."societyId" = ?::uuid');
    expect(text).toContain('uo."userId" = ?::uuid');
    expect(text).toContain('uo."active" = true');
    expect(text).toContain('uo."effectiveFrom" <= CURRENT_TIMESTAMP');
    expect(text).toContain('uo."effectiveTo" IS NULL OR uo."effectiveTo" > CURRENT_TIMESTAMP');
    expect(values.filter((value) => value === societyId).length).toBeGreaterThanOrEqual(3);
    expect(values.filter((value) => value === userId).length).toBeGreaterThanOrEqual(2);
    expect(values).toContain(documentId);
  });
});
