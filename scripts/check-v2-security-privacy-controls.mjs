import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const fail=(message)=>{throw new Error(`V2 security/privacy review: ${message}`)};
const read=path=>readFile(path,'utf8');
const privacyControllers=[
  'services/api/src/privacy/privacy.controller.ts',
  'services/api/src/privacy/privacy-consent.controller.ts',
  'services/api/src/privacy/privacy-registry.controller.ts',
  'services/api/src/privacy/privacy-incident.controller.ts',
];

for(const path of privacyControllers){
  const source=await read(path);
  for(const required of [
    '@UseGuards(BearerGuard, TenantGuard, PermissionsGuard)',
    'AppPermission.PRIVACY_OPERATIONS_READ',
    'AppPermission.PRIVACY_OPERATIONS_MANAGE',
    '@CurrentTenant()',
  ]) if(!source.includes(required)) fail(`${path} is missing ${required}`);
}

const privacy=await read('services/api/src/privacy/privacy.controller.ts');
for(const required of ['legal-hold','retentionReason','REQUEST_TYPES','ERASURE']) if(!privacy.includes(required)) fail(`privacy case controls missing ${required}`);

const consent=await read('services/api/src/privacy/privacy-consent.controller.ts');
for(const required of ['minorAtRecord','representativeUserId','withdraw','evidenceReference']) if(!consent.includes(required)) fail(`consent controls missing ${required}`);

const registry=await read('services/api/src/privacy/privacy-registry.controller.ts');
for(const required of ['retentionTrigger','retentionDays','containsSensitiveData','containsMinorData','processingLocation','agreementReference']) if(!registry.includes(required)) fail(`privacy registry control missing ${required}`);

const incident=await read('services/api/src/privacy/privacy-incident.controller.ts');
for(const required of ['security-incidents','affectedDataCategoryCodes','minorDataSuspected','grievance-contact']) if(!incident.includes(required)) fail(`incident control missing ${required}`);

const preflight=await read('scripts/production-preflight.sh');
for(const required of [
  'CORS_ALLOWED_ORIGINS',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'PAYMENT_WEBHOOK_SECRET',
  'NEXT_PUBLIC_AARAGATE_API_BASE_URL must use HTTPS in production',
  'OBJECT_STORAGE_S3_ENDPOINT must use HTTPS in production',
  'MEDIA_SAFETY_SCANNER_DRIVER=clamav is required when provider-media object storage is enabled',
]) if(!preflight.includes(required)) fail(`production preflight missing ${required}`);

const ci=await read('.github/workflows/ci.yml');
if(!ci.includes('pnpm audit --audit-level high')) fail('dependency security audit is not enforced in CI');

const reportsController=await read('services/api/src/reports/reports.controller.ts');
for(const required of [
  '@UseGuards(BearerGuard, TenantGuard, FeatureGuard, PermissionsGuard)',
  '@RequiresFeature(ProductFeature.ADVANCED_REPORTS)',
  '@Get(\'maintenance/export.csv\')',
  '@RequiresPermissions(AppPermission.REPORTS_READ, AppPermission.FINANCE_READ)',
  '@Get(\'audit/export.csv\')',
  '@RequiresPermissions(AppPermission.AUDIT_READ)',
  '@CurrentTenant() societyId: string',
  'if (!actorUserId) throw new ForbiddenException',
]) if(!reportsController.includes(required)) fail(`reports export route control missing ${required}`);

const reportsExport=await read('services/api/src/reports/reports-export.service.ts');
for(const required of [
  'const MAX_EXPORT_ROWS = 5000',
  'where: { societyId',
  'take: MAX_EXPORT_ROWS + 1',
  'if (rows.length > MAX_EXPORT_ROWS)',
  'AuditEventType.REPORT_EXPORTED',
  '/^[\\t\\r\\n]|^\\s*[=+\\-@＝＋－＠]/u',
]) if(!reportsExport.includes(required)) fail(`reports export data safety control missing ${required}`);

const reportsExportSpec=await read('services/api/src/reports/reports-export.service.spec.ts');
for(const required of [
  'exports a bounded, tenant-scoped audit feed and records the export',
  'rejects unknown audit-event filters before querying data',
  'neutralizes unsafe spreadsheet prefix',
  'scopes finance exports to the authenticated society',
  'fails closed when the export would exceed the bounded row limit',
]) if(!reportsExportSpec.includes(required)) fail(`reports export automated evidence missing ${required}`);

const accountingExportController=await read('services/api/src/accounting/accounting-export.controller.ts');
for(const required of [
  '@UseGuards(BearerGuard,TenantGuard,FeatureGuard,PermissionsGuard)',
  '@RequiresFeature(ProductFeature.SOCIETY_ACCOUNTING)',
  '@Post() @RequiresPermissions(AppPermission.FINANCE_READ)',
  '@Get() @RequiresPermissions(AppPermission.FINANCE_READ)',
  '@Get(\':id/artifact\') @RequiresPermissions(AppPermission.FINANCE_READ)',
  '@Get(\':id\') @RequiresPermissions(AppPermission.FINANCE_READ)',
  '@CurrentTenant() societyId:string',
]) if(!accountingExportController.includes(required)) fail(`accounting export route control missing ${required}`);

const accountingExportSpec=await read('services/api/src/accounting/accounting-export.authorization.spec.ts');
for(const required of [
  'requires accounting entitlement and finance-read for every export operation',
  'ProductFeature.SOCIETY_ACCOUNTING',
  'AppPermission.FINANCE_READ',
]) if(!accountingExportSpec.includes(required)) fail(`accounting export authorization evidence missing ${required}`);

async function files(root){
  const out=[];
  for(const name of await readdir(root)){
    const path=join(root,name); const info=await stat(path);
    if(info.isDirectory()) out.push(...await files(path));
    else if(/\.(ts|tsx|js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

for(const path of await files('services/api/src')){
  const source=await read(path);
  const unsafe=[/console\.log\s*\(\s*process\.env\s*\)/, /JSON\.stringify\s*\(\s*process\.env\s*\)/];
  if(unsafe.some(pattern=>pattern.test(source))) fail(`${path} logs the full process environment`);
}

console.log(`V2 security/privacy automated review OK: ${privacyControllers.length} privacy controllers, production preflight, dependency audit, report/accounting export controls, and environment-log guard checked.`);
