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
assert.ok(atLeast(root.version,[4,82,0]),'Root release identity must be V4.82+');
assert.equal(api.version,root.version);
assert.equal(admin.version,root.version);
for(const path of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  const match=read(path).match(/^version:\s*([^\s]+)/m);
  assert.ok(match&&atLeast(match[1],[4,82,0]),path+' must be V4.82+');
}

for(const path of [
  'services/api/prisma/migrations/20261006131500_v482_household_staff_payments/migration.sql',
  'services/api/prisma/migrations/20261006143000_v482_community_circles/migration.sql',
  'apps/resident/lib/screens/workforce_history_sheets.dart',
  'apps/resident/lib/screens/resident_requests_screen.dart',
  'apps/resident/lib/screens/community_circles_screen.dart',
  'apps/admin/app/community-circles/page.tsx',
  'services/api/src/governance/community-circles.controller.spec.ts',
  'docs/AARAAGATE-V4.82-COMPETITIVE-RESIDENT-OPERATIONS-DEPTH.md',
]) assert.ok(fs.existsSync(path),'V4.82 artifact missing: '+path);

const workforce=read('services/api/src/workforce/workforce.service.ts');
for(const token of [
  'async attendanceMine(',
  'WORKFORCE_ATTENDANCE',
  '"presentDays30d"',
  '"recordedPayments30dPaise"',
  'async paymentRecordsMine(',
  'async createPaymentRecordMine(',
  'existingPaymentDate',
  "Attendance is derived only from authoritative gate check-in/check-out records",
]) assert.ok(workforce.includes(token),'Workforce V4.82 contract missing: '+token);

const workforceUi=read('apps/resident/lib/screens/workforce_history_sheets.dart');
for(const token of [
  'Monthly attendance view',
  'Expected schedule day; no gate evidence',
  'Aaraagate did not move or verify money',
  'SAVE PAYMENT RECORD',
]) assert.ok(workforceUi.includes(token),'Resident workforce UX contract missing: '+token);
assert.ok(!workforceUi.includes('No gate evidence = Absent'),'Missing gate evidence must never be labelled as absence.');

const requests=read('apps/resident/lib/screens/resident_requests_screen.dart');
for(const token of [
  "'NOC': 'No-objection certificate'",
  "'NO_DUES': 'No-dues certificate'",
  "'ADDRESS_PROOF': 'Address proof letter'",
  "'MOVE_OUT': 'Move-out letter'",
  "'PARKING_PERMISSION': 'Parking permission'",
  "category: 'RESIDENT_REQUEST:$_kind'",
  'validity remains a society decision',
]) assert.ok(requests.includes(token),'Resident request contract missing: '+token);

const finance=read('apps/admin/app/finance/page.tsx');
for(const token of ['selectedReceivables','Select overdue','Export selected','Bulk export is review-only']) {
  assert.ok(finance.includes(token),'Finance convenience contract missing: '+token);
}

const utilityService=read('services/api/src/utilities/utility-resident.service.ts');
const utilityUi=read('apps/resident/lib/screens/billing_screen.dart');
for(const token of ['listUsageHistory(','consumptionSincePrevious',"INTERVAL '13 months'"]) assert.ok(utilityService.includes(token),'Utility history contract missing: '+token);
for(const token of ['Recent meter readings','reset/replacement boundaries','_UtilityUsageHistory']) assert.ok(utilityUi.includes(token),'Utility Resident UX missing: '+token);

const aiPolicy=read('services/api/src/ai-operations/ai-assistant.policy.ts');
const ai=readContractBundle('aiAssistant');
for(const token of ['RESIDENT_UTILITIES','RESIDENT_REQUESTS']) {
  assert.ok(aiPolicy.includes(token),'AI tool policy missing: '+token);
  assert.ok(ai.includes(token),'AI routing missing: '+token);
}
assert.ok(!/mutationAllowList:[^\n]*RESIDENT_UTILITIES/.test(ai),'Resident utility AI must remain read-only.');
assert.ok(!/mutationAllowList:[^\n]*RESIDENT_REQUESTS/.test(ai),'Resident request AI must remain read-only.');

const circles=read('services/api/src/governance/community-circles.service.ts');
const circlesController=read('services/api/src/governance/community-circles.controller.ts');
const circlesUi=read('apps/resident/lib/screens/community_circles_screen.dart');
for(const token of [
  'assertCurrentResident',
  'assertMembership',
  'Closed community circle is read-only',
  'Join this community circle before viewing or posting messages',
]) assert.ok(circles.includes(token),'Community circle trust contract missing: '+token);
for(const token of ['AppPermission.NOTICE_READ','AppPermission.NOTICE_MANAGE','ProductFeature.NOTICES']) assert.ok(circlesController.includes(token),'Community circle authorization contract missing: '+token);
for(const token of ['Member identities are not exposed','resident identities are not exposed','not statutory voting']) assert.ok(circlesUi.includes(token),'Community circle Resident trust copy missing: '+token);
assert.ok(!circles.includes('JOIN "User"'),'Resident circle post queries must not expose a member directory.');

const previous=read('scripts/check-v4.81.5-maintainability-hygiene.mjs');
assert.ok(previous.includes('versionAtLeast'),'V4.81.5 invariant must remain forward-compatible.');

const ci=read('.github/workflows/ci.yml');
assert.ok(ci.includes('check-v4.82-competitive-resident-operations.mjs'),'V4.82 invariant must run in protected CI.');

console.log('V4.82 competitive Resident & Operations Depth: PASS');
