import assert from 'node:assert/strict';
import fs from 'node:fs';

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
assert.ok(atLeast(root.version,[4,84,0]),'Root release identity must be V4.84.0+');
assert.equal(api.version,root.version,'API version must match root');
assert.equal(admin.version,root.version,'Admin version must match root');
for(const path of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml']){
  const match=read(path).match(/^version:\s*([^\s]+)/m);
  assert.ok(match&&atLeast(match[1],[4,84,0]),path+' must be V4.84.0+');
}

for(const path of [
  'docs/AARAAGATE-V4.84-FIELD-OPERATIONS-PILOT-READINESS.md',
  'services/api/src/facilities/facilities-helpdesk-handoff.service.ts',
  'services/api/src/facilities/facilities-helpdesk-handoff.service.spec.ts',
]) assert.ok(fs.existsSync(path),'V4.84 artifact missing: '+path);

const gate=read('services/api/src/guard-operations/guard-shift-handover.service.ts');
for(const token of [
  'pendingApprovalsOlder10m','activeEntries','oldestActiveEntryMinutes','oldestOpenHandoverMinutes',
  'Follow up waiting resident approvals older than 10 minutes; do not grant access automatically.',
  'not access decisions',
]) assert.ok(gate.includes(token),'Gate continuity contract missing: '+token);
assert.ok(gate.includes("INTERVAL '4 hours'"),'Four-hour overstay safety threshold must remain explicit');

const finance=read('services/api/src/accounting/payment-availability.service.ts');
for(const token of ['partiallyAllocatedCount','unallocatedPaymentCount','oldestUnappliedDays','ReceivableAllocationReversal','PaymentRefund']){
  assert.ok(finance.includes(token),'Finance exception contract missing: '+token);
}
const financeOps=read('services/api/src/accounting/finance-operations.service.ts');
assert.ok(financeOps.includes('Resolve unapplied captured cash'),'Treasurer exception guidance missing');

const handoff=read('services/api/src/facilities/facilities-helpdesk-handoff.service.ts');
for(const token of [
  'expectedTicketUpdatedAt',
  'Helpdesk ticket changed; refresh the Facilities handoff preview before confirming',
  'ACTIVE_WORK_ORDER_EXISTS',
  'confirmationRequired:true',
  'mutationPerformed:false',
]) assert.ok(handoff.includes(token),'Facilities handoff safety contract missing: '+token);

const ai=read('services/api/src/ai-operations/ai-operations.service.ts');
for(const token of [
  "'CREATE_FACILITY_WORK_ORDER_FROM_HELPDESK'",
  'proposeFacilitiesHandoff(',
  'confirmFacilitiesHandoff(',
  'facilitiesHandoff.preview(',
  'facilitiesHandoff.create(',
]) assert.ok(ai.includes(token),'Controlled Facilities AI contract missing: '+token);
const aiController=read('services/api/src/ai-operations/ai-operations.controller.ts');
for(const token of [
  "@Post('proposals/facilities-handoff')",
  "@Post('proposals/:id/confirm-facilities-handoff')",
  'AppPermission.HELPDESK_REVIEW,AppPermission.FACILITIES_MANAGE',
]) assert.ok(aiController.includes(token),'Facilities AI endpoint boundary missing: '+token);

const home=read('apps/resident/lib/screens/home_screen.dart');
assert.ok(home.includes('item.urgency != ResidentHomeUrgency.info'),'Informational Home activity must not inflate attention count');
assert.ok(home.includes('No urgent follow-up. Recent activity is shown below.'),'Home informational-state copy missing');
const community=read('apps/resident/lib/screens/community_screen.dart');
for(const token of ["label:'Requests'","label:'Circles'","label:'Directory'"]){
  assert.ok(community.includes(token),'Community discovery shortcut missing: '+token);
}

const command=read('apps/admin/app/operations-control/page.tsx');
for(const token of [
  'Morning operating picture','Open recommendations','actionIntent?.workspaceHref','Why now:','Next step:',
  'this page never mutates',
]) assert.ok(command.includes(token),'Operations Command Centre contract missing: '+token);
for(const forbidden of ["method:'POST'","method:\"POST\"","method:'PATCH'","method:\"PATCH\"","method:'DELETE'","method:\"DELETE\""]){
  assert.ok(!command.includes(forbidden),'Operations Command Centre must remain read-only: '+forbidden);
}

const doc=read('docs/AARAAGATE-V4.84-FIELD-OPERATIONS-PILOT-READINESS.md');
for(const token of [
  'Gate Operations Closure','Finance Exception Completion','Copilot Controlled Actions 2.0',
  'Resident Adoption Closure','Admin Operational Command Centre','Pilot/Test Evidence Closure',
  'field-pilot acceptance',
]) assert.ok(doc.includes(token),'V4.84 documentation contract missing: '+token);

console.log('V4.84 Field Operations & Pilot Readiness: PASS');
