import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const controller=read('apps/resident/lib/data/resident_data_controller.dart');
must('V4.62 workforce mutation recovery',controller,[
  'bool isWorkforceLeaveActive(String leaveId)',
  'Map<String, dynamic>? workforceAssignmentFor(String assignmentId)',
  'bool hasMatchingWorkforceLeave({',
  'bool workforceRatingMatches(String assignmentId',
  'await _recoverWorkforceMutationFailure();',
  'await _recoverWorkforceMutationFailure(refreshAccess: true);',
  'if (hasMatchingWorkforceLeave(',
  'if (workforceRatingMatches(assignmentId',
  'Future<void> _recoverWorkforceMutationFailure({bool refreshAccess = false}) async',
  'if (refreshAccess) await _loadAccess();',
  'bool _sameDateOnly(Object? raw, DateTime expected)'
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
  'uncertain leave creation resolves as success when authoritative leave matches intent',
  'uncertain leave creation remains retryable when authoritative state did not change',
  'uncertain rating update resolves as success only when refreshed rating matches intent',
  'uncertain rating update rethrows when authoritative rating did not change',
  "expect(repository.workforceReads, 2);"
]);

must('V4.62 development truth',read('docs/AARAAGATE-V4.62-HOUSEHOLD-STAFF-RECOVERY.md'),[
  'runtime identity remains V4.61.0 until release closure',
  'Recovery only re-reads existing authoritative workforce/access state',
  'Leave creation and household-staff rating updates now use the same uncertain-outcome rule',
  'refreshed active leave matches the intended assignment',
  'refreshed score and normalized comment',
  'does not claim V4.62.0 release closure'
]);

console.log('V4.62 household staff mutation recovery development contract: PASS');
