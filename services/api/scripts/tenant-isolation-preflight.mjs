// Read-only, opt-in inspection using the actual runtime-role DATABASE_URL.
// Does not enable policies, modify grants or authorize a deployment.
import { readFileSync } from 'node:fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { evaluateTenantIsolationCatalog } from '../../../scripts/lib/tenant-isolation-policy.mjs';

const inventory = JSON.parse(readFileSync(new URL('../../../docs/architecture/v5-tenant-access-inventory.json', import.meta.url), 'utf8'));
const requiredTables = inventory.tables.filter(table => table.fields.includes('societyId')).map(table => table.name);
if (!process.env.DATABASE_URL?.trim()) throw new Error('DATABASE_URL must select the runtime database role');
const prisma = new PrismaClient({ log: [] });
try {
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
    await tx.$executeRaw(Prisma.sql`SET LOCAL statement_timeout = '5s'`);
    const roles = await tx.$queryRaw(Prisma.sql`
      SELECT r.rolsuper AS "superuser", r.rolbypassrls AS "bypassRls"
      FROM pg_roles r WHERE r.rolname = current_user OR pg_has_role(current_user, r.oid, 'MEMBER')
    `);
    const tables = await tx.$queryRaw(Prisma.sql`
      SELECT c.relname AS "name", c.relrowsecurity AS "rlsEnabled", c.relforcerowsecurity AS "rlsForced",
        (pg_has_role(current_user, c.relowner, 'MEMBER') OR c.relowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)) AS "ownerReachable",
        (SELECT COUNT(*)::int FROM pg_policy p WHERE p.polrelid = c.oid) AS "policyCount"
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname IN (${Prisma.join(requiredTables)})
    `);
    return evaluateTenantIsolationCatalog(roles, tables, requiredTables);
  }, { maxWait: 5_000, timeout: 10_000 });
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'CATALOG_PREREQUISITES_MET') process.exitCode = 1;
} catch {
  // Database errors may contain host/user/credential details: never echo them.
  console.error('Tenant isolation catalog inspection failed; no acceptance evidence produced.');
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
