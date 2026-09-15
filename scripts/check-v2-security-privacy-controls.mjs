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

console.log(`V2 security/privacy automated review OK: ${privacyControllers.length} privacy controllers, production preflight, dependency audit, and environment-log guard checked.`);
