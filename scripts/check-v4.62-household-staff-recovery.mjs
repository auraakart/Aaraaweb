import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{const missing=tokens.filter(t=>!source.includes(t));if(missing.length){console.error(label+' missing: '+missing.join(', '));process.exit(1)}};

const controller=readContractBundle('residentController');
const snapshots=read('apps/resident/lib/data/resident_state_snapshots.dart');
must('V4.62 workforce mutation orchestration',controller,[
  'bool isWorkforceLeaveActive(String leaveId)',
  'Map<String, dynamic>? workforceAssignmentFor(String assignmentId)',
  'bool hasMatchingWorkforceLeave({',
  'bool workforceRatingMatches(String assignmentId',
  'bool hasMatchingWorkforceAssignment({',
  'ResidentWorkforceSnapshot get _workforceSnapshot',
  'if (hasMatchingWorkforceAssignment(',
  'await _recoverWorkforceMutationFailure();',
  'await _recoverWorkforceMutationFailure(refreshAccess: true);',
  'if (hasMatchingWorkforceLeave(',
  'if (workforceRatingMatches(assignmentId',
  'Future<void> _recoverWorkforceMutationFailure({bool refreshAccess = false}) async',
  'if (refreshAccess) await this._loadAccess();'
]);
must('V4.62 extracted workforce state matching',snapshots,[
  'class ResidentWorkforceSnapshot',
  'final expectedPhone = normalizePhone(phone);',
  'static bool sameDateOnly(Object? raw, DateTime expected)',
  "static String normalizePhone(String value) => value.replaceAll(RegExp(r'\\D'), '');"
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
  'uncertain staff submission resolves as success when refreshed assignment matches intent',
  'uncertain staff submission remains retryable when refreshed assignment is absent',
  "expect(repository.workforceReads, 2);"
]);

const rootPackage=JSON.parse(read('package.json'));
const apiPackage=JSON.parse(read('services/api/package.json'));
const adminPackage=JSON.parse(read('apps/admin/package.json'));
const currentVersion=rootPackage.version.split('.').map(Number);
const atLeastV462=currentVersion.length===3&&currentVersion.every(Number.isInteger)&&(currentVersion[0]>4||(currentVersion[0]===4&&currentVersion[1]>=62));
if(!atLeastV462||apiPackage.version!==rootPackage.version||adminPackage.version!==rootPackage.version){
  console.error('Root/API/Admin release identity must remain aligned at V4.62.0 or newer.');
  process.exit(1);
}
const runtimeVersionToken='version: '+rootPackage.version+'+';
if(!read('apps/resident/pubspec.yaml').includes(runtimeVersionToken)||!read('apps/guard/pubspec.yaml').includes(runtimeVersionToken)){
  console.error('Resident/Guard release identity must remain aligned with the current root release.');
  process.exit(1);
}

must('V4.62 release truth',read('docs/AARAAGATE-V4.62-HOUSEHOLD-STAFF-RECOVERY.md'),[
  'Release candidate closed on `develop`; release identity is V4.62.0.',
  'accepts success only when refreshed state proves the intended result.',
  'V4.62 release closure is repository evidence on `develop`'
]);
must('V4.62 release closure evidence',read('docs/AARAAGATE-V4.62-RELEASE-CLOSURE.md'),[
  'PR #930',
  'PR #931',
  'PR #932',
  '4.62.0+46200',
  'does not claim staging/main promotion'
]);

console.log('V4.62 household staff mutation recovery release closure: PASS');
