import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseTests = process.env.DATABASE_URL ? describe : describe.skip;

databaseTests('Helpdesk ticket number migration and database allocation', () => {
  const schema = `ticket_numbers_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(process.env.DATABASE_URL ?? 'postgresql://localhost/aaraagate_test');
  url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

  beforeAll(async () => {
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute',
      '--stdin', '--url', process.env.DATABASE_URL!], {
      input: `CREATE SCHEMA "${schema}"`, stdio: 'pipe', timeout: 30_000,
    });
    // A pre-upgrade table with historical tickets, including a closed complaint.
    await db.$executeRaw`CREATE TABLE "HelpdeskTicket" (
      "id" UUID PRIMARY KEY, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" TEXT NOT NULL DEFAULT 'OPEN'
    )`;
    await db.$executeRaw`INSERT INTO "HelpdeskTicket" ("id", "createdAt", "updatedAt", "status") VALUES
      (${randomUUID()}::uuid, '2025-12-31T23:59:00Z', '2026-01-02T00:00:00Z', 'CLOSED'),
      (${randomUUID()}::uuid, '2026-01-01T00:01:00Z', '2026-01-02T00:00:00Z', 'OPEN')`;
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute',
      '--file', resolve('prisma/migrations/20261021120000_helpdesk_ticket_numbers/migration.sql'),
      '--url', url.toString()], { stdio: 'pipe', timeout: 30_000 });
  }, 40_000);

  afterAll(async () => {
    await db.$disconnect();
    execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute',
      '--stdin', '--url', process.env.DATABASE_URL!], {
      input: `DROP SCHEMA IF EXISTS "${schema}" CASCADE`, stdio: 'pipe', timeout: 30_000,
    });
  });

  it('backfills historical tickets using their UTC creation year and preserves history', async () => {
    const rows = await db.$queryRaw<Array<{ ticketNumber: string; status: string; updatedAt: Date }>>`
      SELECT "ticketNumber", "status", "updatedAt" FROM "HelpdeskTicket" ORDER BY "createdAt"`;
    expect(rows[0].ticketNumber).toMatch(/^HD-2025-\d{6,}$/);
    expect(rows[1].ticketNumber).toMatch(/^HD-2026-\d{6,}$/);
    expect(rows[0].status).toBe('CLOSED');
    expect(rows[0].updatedAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    expect(new Set(rows.map(row => row.ticketNumber)).size).toBe(2);
  });

  it('allocates distinct numbers under concurrent inserts without client-generated references', async () => {
    const inserted = await Promise.all(Array.from({ length: 24 }, async () => {
      const [row] = await db.$queryRaw<Array<{ ticketNumber: string }>>`
        INSERT INTO "HelpdeskTicket" ("id") VALUES (${randomUUID()}::uuid) RETURNING "ticketNumber"`;
      return row.ticketNumber;
    }));
    expect(new Set(inserted).size).toBe(24);
    expect(inserted.every(number => /^HD-\d{4}-\d{6,}$/.test(number))).toBe(true);
  });

  it('retains the number when reopened and rejects attempts to change it', async () => {
    const [original] = await db.$queryRaw<Array<{ id: string; ticketNumber: string }>>`
      SELECT "id", "ticketNumber" FROM "HelpdeskTicket" WHERE "status"='CLOSED'`;
    const [reopened] = await db.$queryRaw<Array<{ ticketNumber: string }>>`
      UPDATE "HelpdeskTicket" SET "status"='IN_PROGRESS' WHERE "id"=${original.id}::uuid RETURNING "ticketNumber"`;
    expect(reopened.ticketNumber).toBe(original.ticketNumber);
    await expect(db.$executeRaw`UPDATE "HelpdeskTicket" SET "ticketNumber"='HD-2026-999999' WHERE "id"=${original.id}::uuid`)
      .rejects.toThrow('Helpdesk ticket number cannot be changed');
  });

  it('does not truncate sequence numbers after six digits', async () => {
    await db.$executeRaw`ALTER SEQUENCE "HelpdeskTicket_number_seq" RESTART WITH 1000000`;
    const [row] = await db.$queryRaw<Array<{ ticketNumber: string }>>`
      INSERT INTO "HelpdeskTicket" ("id") VALUES (${randomUUID()}::uuid) RETURNING "ticketNumber"`;
    expect(row.ticketNumber).toMatch(/^HD-\d{4}-1000000$/);
  });
});
