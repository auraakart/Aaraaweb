import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.62 workforce mutation recovery',controller,[
  'bool isWorkforceLeaveActive(String leaveId)',
  'Map<String, dynamic>? workforceAssignmentFor(String assignmentId)',
  'await _recoverWorkforceMutationFailure();',
  'await _recoverWorkforceMutationFailure(refreshAccess: true);',
  'Future<void> _recoverWorkforceMutationFailure({bool refreshAccess = false}) async',
  'if (refreshAccess) await _loadAccess();'
]);

const screen=read('apps/resident/lib/screens/workforce_screen.dart');
must('V4.62 recovered-state UI',screen,[
  "final canDeactivate = assignment['active'] != false && status.toUpperCase() != 'SUSPENDED';",
  'if (canDeactivate)',
  "'Leave changed. It is no longer active.'",
  "'Staff assignment changed and is no longer active.'"
]);

const tests=read('apps/resident/test/workforce_modal_lifecycle_test.dart');
must('V4.62 focused regressions',tests,[
  'failed leave cancellation reloads authoritative workforce state before rethrowing',
  'failed assignment deactivation reloads authoritative inactive state before rethrowing',
  'stale leave cancel action disappears after recovered server-side cancellation',
  'stale end-assignment action disappears after recovered server-side deactivation',
  "expect(repository.workforceReads, 2);"
]);

must('V4.62 development truth',read('docs/AARAAGATE-V4.62-HOUSEHOLD-STAFF-RECOVERY.md'),[
  'runtime identity remains V4.61.0 until release closure',
  'Recovery only re-reads existing authoritative workforce/access state',
  'does not claim V4.62.0 release closure'
]);

console.log('V4.62 household staff mutation recovery development contract: PASS');
