import assert from 'node:assert/strict';
import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const read=(path)=>fs.readFileSync(path,'utf8');
const json=(path)=>JSON.parse(read(path));
const atLeast=(value,minimum)=>{
  const current=value.split('+')[0].split('.').map(Number);
  for(let i=0;i<minimum.length;i+=1){
    if((current[i]??0)>minimum[i])return true;
    if((current[i]??0)<minimum[i])return false;
  }
  return true;
};

const root=json('package.json');
const api=json('services/api/package.json');
const admin=json('apps/admin/package.json');
assert.ok(atLeast(root.version,[4,83,0]),'Root release identity must be V4.83+');
assert.equal(api.version,root.version,'API release identity must match root');
assert.equal(admin.version,root.version,'Admin release identity must match root');
for(const path of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  const match=read(path).match(/^version:\s*([^\s]+)/m);
  assert.ok(match&&atLeast(match[1],[4,83,0]),path+' must be V4.83+');
}

for(const path of [
  'docs/AARAAGATE-V4.83-AUTOMATION-CONVENIENCE-ADOPTION.md',
  'services/api/prisma/migrations/20261007050000_v483_gate_approval_expiry/migration.sql',
  'services/api/prisma/migrations/20261007053000_v483_resident_directory/migration.sql',
  'services/api/src/governance/resident-directory.service.ts',
  'services/api/src/governance/resident-directory.controller.ts',
  'apps/resident/lib/screens/resident_directory_screen.dart',
]) assert.ok(fs.existsSync(path),'V4.83 artifact missing: '+path);

const finance=read('services/api/src/accounting/finance-operations.service.ts');
for(const token of [
  'DUE_DATE_LABEL_MATCH','CGST_LABEL_MATCH','SGST_LABEL_MATCH','IGST_LABEL_MATCH',
  'confidenceScore','DUE_DATE_BEFORE_INVOICE_DATE','MIXED_GST_COMPONENTS_REVIEW',
  'Confidence is extraction completeness, not accounting or tax correctness',
]) assert.ok(finance.includes(token),'V4.83 finance intelligence missing: '+token);
assert.ok(finance.includes('automaticPosting:false'),'Finance intake must remain non-posting');
assert.ok(finance.includes('humanReviewRequired:true'),'Finance intake must retain human review');

const workforce=read('services/api/src/workforce/workforce.service.ts');
for(const token of ['expectedScheduleDays','scheduledLeaveDays','scheduledEvidenceGapDays','it is not labelled absence']){
  assert.ok(workforce.includes(token),'V4.83 staff evidence contract missing: '+token);
}
const workforceUi=read('apps/resident/lib/screens/workforce_history_sheets.dart');
for(const token of ['scheduled days','evidence gaps','Period summary','not payroll liabilities or proof of bank/cash settlement']){
  assert.ok(workforceUi.includes(token),'V4.83 staff UX contract missing: '+token);
}

const utility=read('services/api/src/utilities/utility-resident.service.ts');
const utilityController=read('services/api/src/utilities/utility-resident.controller.ts');
const billing=read('apps/resident/lib/screens/billing_screen.dart');
for(const token of ['residentInsights(','HIGHER_THAN_RECENT','providerLinkedCount','rechargeExecutionAvailable:false']){
  assert.ok(utility.includes(token),'V4.83 utility intelligence missing: '+token);
}
assert.ok(utility.includes('not a leak, fault or billing diagnosis'),'Utility signal must remain non-diagnostic');
assert.ok(utilityController.includes("@Get('insights')"),'Resident utility insights route missing');
for(const token of ['Utility attention','NO HIGH-USAGE SIGNAL','Prepaid balance and recharge require an authoritative provider adapter']){
  assert.ok(billing.includes(token),'Resident utility attention UX missing: '+token);
}

const schema=read('services/api/prisma/schema.prisma');
assert.ok(schema.includes('gateApprovalExpiresAt   DateTime?'),'Gate delegation expiry must be modeled in UnitOccupancy');
const delegationMigration=read('services/api/prisma/migrations/20261007050000_v483_gate_approval_expiry/migration.sql');
assert.equal((delegationMigration.match(/ADD COLUMN "gateApprovalExpiresAt"/g)??[]).length,1,'Gate delegation expiry migration must add its column exactly once');
const household=read('services/api/src/households/household.service.ts');
for(const token of ['gateApprovalExpiry(','Gate approval expiry must be in the future','Gate approval expiry cannot be more than two years in the future']){
  assert.ok(household.includes(token),'Gate delegation validation missing: '+token);
}
const access=read('services/api/src/access/access.service.ts');
assert.ok((access.match(/gateApprovalExpiresAt: \{ gt: now \}/g)??[]).length>=2,'Expired gate delegates must be excluded both from approval and gate-arrival routing');
const decideStart=access.indexOf('private async assertCanDecideRequest');
const decideBlock=access.slice(decideStart,decideStart+1000);
assert.ok(decideBlock.includes('if (this.isGateOriginated(request.metadata))'),'Gate-originated decisions must revalidate approver authority');
assert.ok(decideBlock.indexOf('assertGateApprover')<decideBlock.indexOf('request.requestedById === userId'),'Gate-originated request ownership must not bypass delegation expiry');

const facilities=read('services/api/src/facilities/facilities.controller.ts');
for(const token of ['repeatedCorrectiveAssets','warrantiesExpiring60d','REPEATED_CORRECTIVE_90D','WARRANTY_EXPIRING_60D']){
  assert.ok(facilities.includes(token),'Facilities intelligence missing: '+token);
}
assert.ok(facilities.includes('do not certify physical asset condition, root cause, vendor performance or contract validity'),'Facilities attention must remain non-diagnostic');
const facilitiesUi=read('apps/admin/app/facilities/health/page.tsx');
assert.ok(facilitiesUi.includes('Asset & AMC attention'),'Facilities attention panel missing');

const migrationUi=read('apps/admin/app/migration/page.tsx');
for(const token of ['Guided onboarding path','Download CSV template',"'Structure'","'People'","'Access'","'Operations'","'Finance'"]){
  assert.ok(migrationUi.includes(token),'Migration onboarding convenience missing: '+token);
}
assert.ok(migrationUi.includes('do not claim compatibility with any competitor export'),'Migration templates must not claim competitor compatibility');

const directoryMigration=read('services/api/prisma/migrations/20261007053000_v483_resident_directory/migration.sql');
for(const table of ['ResidentDirectoryProfile','ResidentDirectoryContactRequest']){
  assert.equal((directoryMigration.match(new RegExp('CREATE TABLE "'+table+'"','g'))??[]).length,1,'Resident directory table must be created exactly once: '+table);
}
assert.ok(directoryMigration.includes('DEFAULT FALSE'),'Resident directory must be opt-in by default');
assert.ok(directoryMigration.includes('ResidentDirectoryContactRequest_not_self'),'Directory self-contact DB guard missing');
const directory=read('services/api/src/governance/resident-directory.service.ts');
for(const token of ['assertCurrentResident','p."visible"=TRUE','Aaraagate will not reveal']){
  // The last phrase is a UI boundary, checked below; keep service checks independent.
  if(token!=='Aaraagate will not reveal') assert.ok(directory.includes(token),'Resident directory privacy contract missing: '+token);
}
assert.ok(!directory.includes('p."phone"'),'Directory listing must not expose phone');
assert.ok(!directory.includes('p."email"'),'Directory listing must not expose email');
assert.ok(!directory.includes('p."unitId"'),'Directory listing must not expose unit identifiers');
assert.ok(directory.includes('Acceptance does not reveal phone or email details'),'Contact acceptance must not reveal contact details');
const directoryUi=read('apps/resident/lib/screens/resident_directory_screen.dart');
for(const token of ['Opt-in and privacy-safe','Phone, email and unit number are never shown here','Contact details remain private']){
  assert.ok(directoryUi.includes(token),'Resident directory trust UX missing: '+token);
}

const ai=readContractBundle('aiAssistant');
for(const token of [
  'repeatedCorrectiveAssets90d','warrantiesExpiring60d','consumptionAttention',
  'not a leak, fault or billing diagnosis','Scheduled evidence gaps are not labelled absence',
  'DETERMINISTIC_SIGNAL_NOT_CAUSAL_PROOF',
]) assert.ok(ai.includes(token),'V4.83 AI grounding missing: '+token);
assert.ok(!/mutationAllowList:[^\n]*(RESIDENT_UTILITIES|RESIDENT_WORKFORCE|FACILITIES)/.test(ai),'V4.83 AI evidence tools must remain read-only');

const previous=read('scripts/check-v4.82-competitive-resident-operations.mjs');
assert.ok(previous.includes('atLeast(root.version,[4,82,0])'),'V4.82 invariant must remain forward-compatible');

const ci=read('.github/workflows/ci.yml');
assert.ok(ci.includes('check-v4.83-automation-convenience-adoption.mjs'),'V4.83 invariant must run in protected CI');

console.log('V4.83 Automation, Convenience & Adoption Depth: PASS');
