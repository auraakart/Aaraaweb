import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};
const root=JSON.parse(read('package.json')),api=JSON.parse(read('services/api/package.json')),admin=JSON.parse(read('apps/admin/package.json'));
if(root.version!=='4.65.1'||api.version!==root.version||admin.version!==root.version){console.error('Root/API/Admin release identity must be V4.65.1.');process.exit(1)}
for(const file of ['apps/resident/pubspec.yaml','apps/guard/pubspec.yaml'])must(file,read(file),['version: 4.65.1+46501']);

must('V4.65.1 resident request read',read('apps/resident/lib/data/resident_repository.dart'),[
  "api.get('/api/v1/household-change-requests/mine')",
  'Future<List<Map<String, dynamic>>> householdChangeRequests()'
]);
const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.65.1 approval recovery',controller,[
  'List<Map<String, dynamic>> householdChangeRequests = const [];',
  'pendingFamilyRequestsForHousehold',
  'hasMatchingFamilyAddRequest',
  'hasMatchingFamilyRemoveRequest',
  'await _reloadHouseholdChangeRequestsForMutationRecovery();',
  "const {'PENDING', 'PROCESSING', 'APPROVED'}"
]);
must('V4.65.1 production pending UI',read('apps/resident/lib/screens/family_members_screen.dart'),[
  'widget.controller.pendingFamilyRequestsForHousehold(widget.householdId)'
]);
const test=read('apps/resident/test/family_member_recovery_test.dart');
must('V4.65.1 realistic regression',test,[
  'recovers add from authoritative pending approval without inventing active occupancy',
  'recovers removal submission from authoritative pending approval while member remains active',
  'does not manufacture add success when no matching approval request exists',
  'does not manufacture remove success when no matching approval request exists'
]);
if(test.includes('recovers deactivation when authoritative occupancy disappears')){
  console.error('V4.65.1 regression must not model an approval request as immediate deactivation.');
  process.exit(1);
}
must('V4.65.1 release truth',read('docs/AARAAGATE-V4.65.1-FAMILY-APPROVAL-RECOVERY.md'),[
  'approval request, not an immediate active-occupancy mutation',
  'household-change-requests/mine',
  'V4.65.1+46501',
  'Staging/main promotion remains separate'
]);
console.log('V4.65.1 family approval-request recovery closure: PASS');
