import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read=(file)=>fs.readFileSync(file,'utf8');

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}

function parseVersion(value){
  const parts=value.split('.').map(Number);
  assert.equal(parts.length,3,'Release identity must be major.minor.patch.');
  assert.ok(parts.every(Number.isInteger),'Release identity must be numeric.');
  return parts;
}

function compare(a,b){
  for(let i=0;i<3;i++) if(a[i]!==b[i]) return a[i]-b[i];
  return 0;
}

const root=JSON.parse(read('package.json'));
const api=JSON.parse(read('services/api/package.json'));
const admin=JSON.parse(read('apps/admin/package.json'));
const current=parseVersion(root.version);
assert.ok(compare(current,[4,81,1])>=0,'Release identity must not regress below V4.81.1.');
assert.equal(api.version,root.version,'API release identity must match root.');
assert.equal(admin.version,root.version,'Admin release identity must match root.');

const buildCode=String(current[0])+String(current[1]).padStart(2,'0')+String(current[2]).padStart(2,'0');
for(const pubspec of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  assert.ok(read(pubspec).includes('version: '+root.version+'+'+buildCode),pubspec+' release identity is not aligned.');
}

const runtimeFiles=walk('services/api/src').filter((file)=>file.endsWith('.ts'));
const unsafeRuntime=runtimeFiles.filter((file)=>{
  const source=read(file);
  return source.includes('$queryRawUnsafe(')||source.includes('$executeRawUnsafe(');
});
assert.deepEqual(unsafeRuntime,[],'Runtime API source must not use Prisma unsafe raw-query APIs.');

const prisma=read('services/api/src/prisma/prisma.service.ts');
for(const token of [
  "TENANT_CONTEXT_SETTING = 'app.aaraagate_society_id'",
  'withTenantContext<T>',
  'SELECT set_config',
  ', true)',
  'Prisma.TransactionClient',
]){
  assert.ok(prisma.includes(token),'Tenant database context missing: '+token);
}

const guard=read('services/api/src/auth/tenant.guard.ts');
assert.ok(guard.includes('request.auth?.societyId'),'TenantGuard must require authenticated society context.');

const scope=read('services/api/src/auth/property-scope.sql.ts');
for(const token of ['currentResidentPropertySql','currentPayerPropertySql','"societyId"','"unitId"','"userId"']){
  assert.ok(scope.includes(token),'Property scope helper missing: '+token);
}

const schema=read('services/api/prisma/schema.prisma');
const tenantModels=[];
for(const match of schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)){
  const [,name,body]=match;
  if(!/\bsocietyId\s+String\??/.test(body)) continue;
  tenantModels.push(name);
  assert.ok(
    /@@(?:index|unique)\(\[\s*societyId\b/.test(body),
    'Tenant model '+name+' must have a society-leading index or unique key before RLS rollout.',
  );
}
assert.ok(tenantModels.length>=40,'Tenant isolation audit expected the established multi-society schema.');

const health=read('services/api/src/health/health.controller.ts');
assert.ok(health.includes('this.prisma.$queryRaw(Prisma.sql'),'Health DB probe must use parameterized Prisma SQL.');
assert.ok(health.includes('SELECT 1'),'Health DB probe must retain the lightweight database check.');
assert.ok(!health.includes('$queryRawUnsafe'),'Health DB probe must not use unsafe raw SQL.');
assert.ok(health.includes('dependency_ready'),'Readiness must emit provider-neutral dependency telemetry.');

const telemetry=read('services/api/src/observability/telemetry.service.ts');
for(const token of [
  'export interface TelemetryExporter',
  'maxSeries = 512',
  'normalizeTelemetryRoute',
  'droppedSeries',
  "'method'",
  "'route'",
  "'statusClass'",
  "'dependency'",
]){
  assert.ok(telemetry.includes(token),'Telemetry readiness missing: '+token);
}
for(const forbidden of ["'societyId'","'userId'","'unitId'","'requestId'","'email'","'phone'","'token'"]){
  assert.ok(!telemetry.includes(forbidden),'Telemetry labels must not include identity dimension '+forbidden+'.');
}

const requestObservability=read('services/api/src/observability/request-observability.middleware.ts');
for(const token of ['normalizeTelemetryRoute','http_requests_total','http_request_duration_ms']){
  assert.ok(requestObservability.includes(token),'Request telemetry missing: '+token);
}

const evidence=read('docs/AARAAGATE-V4.81.1-TENANT-OBSERVABILITY-READINESS.md');
for(const token of [
  'transaction-local PostgreSQL tenant context',
  'RLS is not enabled',
  'unsafe raw-query APIs',
  'bounded-cardinality',
  'no society, user, unit or request identifiers',
  'external exporter activation remains productionization',
]){
  assert.ok(evidence.includes(token),'V4.81.1 evidence missing: '+token);
}

console.log('V4.81.1 tenant isolation and observability readiness: PASS ('+tenantModels.length+' tenant models audited)');
