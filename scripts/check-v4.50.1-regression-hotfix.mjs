import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){console.error(`${label} missing: ${missing.join(', ')}`);process.exit(1)}
};

const adminClient=read('apps/admin/lib/admin-client.ts');
requireTokens('V4.50.1 Admin logout coordination',adminClient,[
  'export async function logoutAdminSession',
  'const pending=refreshes.get(contextKey(active))',
  'active=await pending',
  "request('/auth/logout'",
  'refreshToken:active.refreshToken',
]);
const consoleSource=read('apps/admin/app/admin-console.tsx');
const auditSource=read('apps/admin/app/audit/page.tsx');
requireTokens('Admin console logout',consoleSource,['logoutAdminSession(session)']);
requireTokens('Auditor logout',auditSource,['logoutAdminSession(session)']);
if(consoleSource.includes("api('/auth/logout'")||auditSource.includes("api('/auth/logout'")){
  console.error('V4.50.1 regression: canonical Admin surfaces must not construct logout from potentially stale component credentials');
  process.exit(1);
}

const guard=read('services/api/src/guard-operations/guard-operations.service.ts');
requireTokens('Overstay reopen lifecycle',guard,[
  "CASE \"status\" WHEN 'OPEN' THEN 0 WHEN 'REVIEWED' THEN 1 ELSE 2 END",
  "if(existing[0].status!=='CLOSED')",
  'UPDATE "SecurityIncident"',
  '"reviewedByUserId"=NULL',
  'reopened:true',
]);

const migration=read('services/api/prisma/migrations/20260923183000_v4501_guard_overstay_canonical_reconcile/migration.sql');
requireTokens('Overstay canonical reconciliation',migration,[
  'SET "sourceKey"=NULL',
  'ROW_NUMBER() OVER',
  "WHEN 'OPEN' THEN 0 WHEN 'REVIEWED' THEN 1 ELSE 2 END",
  'preferred."rowNumber"=1',
]);

const gateTest=read('services/api/src/ai-operations/ai-assistant.service.spec.ts');
requireTokens('Gate Action Centre query regression',gateTest,[
  'grounds gate attention in one aggregate query for a gate-only role',
  "expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)",
  "expect(sql).toContain('WITH overstays AS')",
]);

console.log('V4.50.1 regression hotfix contracts are intact.');
