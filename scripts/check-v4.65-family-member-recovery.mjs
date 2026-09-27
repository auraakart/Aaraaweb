import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.65 controller recovery',controller,[
  'Future<void> addFamilyMember({',
  'Future<void> updateFamilyMember({',
  'Future<void> deactivateFamilyMember({',
  'await _reloadHouseholdsForMutationRecovery();',
  'hasMatchingFamilyMember(',
  'familyMemberSettingsMatch(',
  "if (familyMemberById(householdId, occupancyId) == null) return;",
  "String _normalizeHouseholdPhone(String value)"
]);

const screen=read('apps/resident/lib/screens/family_members_screen.dart');
must('V4.65 family screen convergence',screen,[
  'await widget.controller.addFamilyMember(',
  'await widget.controller.updateFamilyMember(',
  'await widget.controller.deactivateFamilyMember('
]);
for(const token of [
  'widget.controller.repository.addFamilyMember(',
  'widget.controller.repository.updateFamilyMember(',
  'widget.controller.repository.deactivateFamilyMember('
]) {
  if(screen.includes(token)){console.error('V4.65 direct family repository mutation remains: '+token);process.exit(1)}
}

const test=read('apps/resident/test/family_member_recovery_test.dart');
must('V4.65 focused regression',test,[
  'recovers add after commit-then-transport failure',
  'recovers settings update only after authoritative state matches',
  'recovers deactivation when authoritative occupancy disappears',
  'does not manufacture add success when refreshed state does not match'
]);

must('V4.65 development truth',read('docs/AARAAGATE-V4.65-FAMILY-MEMBER-RECOVERY.md'),[
  'runtime identity remains V4.64.1',
  'fail-closed',
  'verified current owner'
]);
console.log('V4.65 family-member mutation recovery contract: PASS');
