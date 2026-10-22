import { PrismaClient, Prisma } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';
import { receiptReferenceSql, legacyReceiptReferenceSql } from './receipt-reference';

const database = process.env.DATABASE_URL ? describe : describe.skip;
database('Permanent receipt identity on PostgreSQL', () => {
  const db = new PrismaClient();
  afterAll(() => db.$disconnect());
  it('distinguishes payments sharing the entire legacy reference and is deterministic', async () => {
    const ids = ['12345678-1111-4111-8111-111111111111', '12345678-2222-4222-8222-222222222222'];
    const query = Prisma.sql`SELECT ${receiptReferenceSql} AS canonical,
      ${legacyReceiptReferenceSql} AS legacy FROM (VALUES
      (${ids[0]}::uuid), (${ids[1]}::uuid)) AS p("id") ORDER BY p."id"`;
    const rows = await db.$queryRaw<Array<{ canonical: string; legacy: string }>>(query);
    expect(rows.map(row => row.canonical)).toEqual(ids.map(id => `AGRP-${id.replaceAll('-', '').toUpperCase()}`));
    expect(new Set(rows.map(row => row.legacy)).size).toBe(1);
    expect(new Set(rows.map(row => row.canonical)).size).toBe(2);
    expect(await db.$queryRaw(query)).toEqual(rows);
  });
});
