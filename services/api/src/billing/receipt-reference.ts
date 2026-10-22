import { Prisma } from '@prisma/client';

// Fixed alias p is used by both authorized receipt reads and settlement search.
// Full UUID is injective over Payment's database-enforced primary key. Historical
// eight-character aliases remain lookup hints only and can identify many rows.
export const receiptReferenceSql = Prisma.sql`CONCAT('AGRP-', UPPER(REPLACE(p."id"::text, '-', '')))`;
export const legacyReceiptReferenceSql = Prisma.sql`CONCAT('AGR-', UPPER(SUBSTRING(p."id"::text, 1, 8)))`;
