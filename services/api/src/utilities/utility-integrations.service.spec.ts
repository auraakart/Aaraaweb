import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { UtilityIntegrationsService } from './utility-integrations.service';

const societyId = '11111111-1111-4111-8111-111111111111';
const integrationId = '22222222-2222-4222-8222-222222222222';
const meterId = '33333333-3333-4333-8333-333333333333';
const receiptId = '44444444-4444-4444-8444-444444444444';
const readingId = '55555555-5555-4555-8555-555555555555';
const secret = 'integration-secret';

function hash(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function identity() {
  return { id: integrationId, societyId, name: 'Meter partner', secretHash: hash(secret), status: 'ACTIVE' };
}

describe('UtilityIntegrationsService', () => {
  it('rotates a key atomically and records lifecycle evidence without returning the hash', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: integrationId, code: 'PARTNER', name: 'Meter partner', status: 'ACTIVE' }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
    };
    const prisma = {
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UtilityIntegrationsService(prisma as unknown as PrismaService);

    const rotated = await service.rotateKey(societyId, '66666666-6666-4666-8666-666666666666', integrationId);

    expect(rotated.integrationKey).toMatch(new RegExp(`^${integrationId}\\.`));
    expect(rotated).not.toHaveProperty('secretHash');
    const update = tx.$queryRaw.mock.calls[0][0] as { strings: readonly string[]; values: unknown[] };
    expect(update.strings.join(' ')).toContain('SET "secretHash"');
    expect(update.values).not.toContain(secret);
    const event = tx.$executeRaw.mock.calls[0][0] as { values: unknown[] };
    expect(event.values).toContain('KEY_ROTATED');
  });

  it('returns the immutable receipt for an exact idempotent replay and records replay evidence', async () => {
    const input = {
      idempotencyKey: 'reading-001',
      externalMeterId: 'EXT-101',
      readingAt: '2026-09-15T04:00:00.000Z',
      value: 125,
      readingKind: 'ACTUAL' as const,
    };
    const payloadHash = hash(JSON.stringify({ ...input, note: null }));
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: integrationId }])
        .mockResolvedValueOnce([{
          id: receiptId,
          payloadHash,
          status: 'ACCEPTED',
          readingId,
          errorCode: null,
          errorMessage: null,
        }]),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([identity()]),
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UtilityIntegrationsService(prisma as unknown as PrismaService);

    await expect(service.ingest(`${integrationId}.${secret}`, input)).resolves.toMatchObject({
      receiptId,
      status: 'ACCEPTED',
      readingId,
      replayed: true,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    const attempt = tx.$executeRaw.mock.calls[1][0] as { values: unknown[] };
    expect(attempt.values).toContain('REPLAY');
  });

  it('quarantines an unknown external meter without creating a reading', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: integrationId }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: receiptId }]),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([identity()]),
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UtilityIntegrationsService(prisma as unknown as PrismaService);

    await expect(service.ingest(`${integrationId}.${secret}`, {
      idempotencyKey: 'reading-unknown',
      externalMeterId: 'UNKNOWN',
      readingAt: '2026-09-15T04:00:00.000Z',
      value: 10,
    })).resolves.toMatchObject({
      receiptId,
      status: 'QUARANTINED',
      readingId: null,
      errorCode: 'METER_MAPPING_NOT_FOUND',
      replayed: false,
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(4);
    const receiptInsert = tx.$queryRaw.mock.calls[3][0] as { values: unknown[] };
    expect(receiptInsert.values).toContain('METER_MAPPING_NOT_FOUND');
  });

  it('creates integration-attributed readings without fabricating a human actor', async () => {
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: integrationId }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ meterId, meterActive: true }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ value: '100.000000' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: readingId }])
        .mockResolvedValueOnce([{ id: receiptId }]),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([identity()]),
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UtilityIntegrationsService(prisma as unknown as PrismaService);

    await expect(service.ingest(`${integrationId}.${secret}`, {
      idempotencyKey: 'reading-accepted',
      externalMeterId: 'EXT-101',
      readingAt: '2026-09-15T04:00:00.000Z',
      value: 125,
      note: 'Provider sync',
    })).resolves.toMatchObject({
      receiptId,
      status: 'ACCEPTED',
      readingId,
      replayed: false,
    });
    const readingInsert = tx.$queryRaw.mock.calls[6][0] as { strings: readonly string[]; values: unknown[] };
    expect(readingInsert.strings.join(' ')).toContain("'INTEGRATION'");
    expect(readingInsert.values).toContain(integrationId);
    const eventInsert = tx.$executeRaw.mock.calls[2][0] as { strings: readonly string[]; values: unknown[] };
    expect(eventInsert.strings.join(' ')).toContain("'INTEGRATION'");
    expect(eventInsert.values).toContain(integrationId);
  });

  it('reprocesses quarantine into a new linked receipt without mutating original evidence', async () => {
    const actorUserId = '66666666-6666-4666-8666-666666666666';
    const replacementReceiptId = '77777777-7777-4777-8777-777777777777';
    const tx = {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn()
        .mockResolvedValueOnce([{ id: integrationId }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: replacementReceiptId }]),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([{
        ...identity(),
        rawPayload: {
          idempotencyKey: 'original-key',
          externalMeterId: 'UNMAPPED',
          readingAt: '2026-09-15T04:00:00.000Z',
          value: 10,
          readingKind: 'ACTUAL',
          note: null,
        },
      }]),
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new UtilityIntegrationsService(prisma as unknown as PrismaService);

    await expect(service.reprocessReceipt(societyId, actorUserId, receiptId, { note: 'Mapping reviewed' }))
      .resolves.toMatchObject({
        originalReceiptId: receiptId,
        replacementReceipt: { receiptId: replacementReceiptId, status: 'QUARANTINED' },
      });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const requested = prisma.$executeRaw.mock.calls[0][0] as { values: unknown[] };
    const completed = prisma.$executeRaw.mock.calls[1][0] as { values: unknown[] };
    expect(requested.values).toContain('REPROCESS_REQUESTED');
    expect(completed.values).toContain('REPROCESS_QUARANTINED');
    expect(completed.values).toContain(replacementReceiptId);
    const replacementInsert = tx.$queryRaw.mock.calls[3][0] as { values: unknown[] };
    expect(replacementInsert.values).not.toContain('original-key');
  });
});
