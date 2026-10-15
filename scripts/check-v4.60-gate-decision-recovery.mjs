import fs from 'node:fs';
import { readContractBundle } from './lib/source-contract-bundles.mjs';

const read=p=>fs.readFileSync(p,'utf8');
const must=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length){
    console.error(label+' missing: '+missing.join(', '));
    process.exit(1);
  }
};

must('V4.60 Gate card serialization',read('apps/resident/lib/screens/gate_screen.dart'),[
  'class _AccessCard extends StatefulWidget',
  'bool _busy = false;',
  'Future<void> _run(Future<void> Function() action) async',
  'if (_busy) return;',
  'onPressed: _busy ? null'
]);

must('V4.60 authoritative outcome clarity',read('apps/resident/lib/screens/gate_screen.dart'),[
  "_mutationErrorMessage(e, request)",
  "'gateRequestChanged'",
  "_accessStatusTone(request['status']?.toString())",
  "case 'DENIED':",
  "case 'CANCELLED':",
  "case 'CHECKED_OUT':"
]);
must('V4.60 stale outcome regression',read('apps/resident/test/gate_screen_test.dart'),[
  'stale gate decision surfaces the refreshed authoritative status',
  'This gate request changed. Latest status: Approved.'
]);

must('V4.60 authoritative access recovery',readContractBundle('residentController'),[
  'Future<T> _withAccessMutationRecovery<T>',
  'await this._loadAccess();',
  'repository.approveAccess',
  'repository.denyAccess',
  'repository.cancelAccess'
]);

must('V4.60 focused regressions',read('apps/resident/test/gate_screen_test.dart'),[
  'serializes a gate decision while the first mutation is in flight',
  'expect(repository.denyCalls, 1);',
  'failed gate mutation reloads authoritative request state before rethrowing',
  "expect(controller.accessRequests.single['status'], 'APPROVED');"
]);

must('V4.60 visitor cancellation review',read('apps/resident/lib/screens/gate_screen.dart'),[
  "strings.text('cancelPassConfirm')",
  "showDialog<bool>",
  "if (confirmed != true || !context.mounted) return;",
  "rawType == 'VISITOR' && request['status'] == 'APPROVED'",
  "strings.format('validUntil'"
]);
must('V4.60 visitor cancellation regression',read('apps/resident/test/gate_screen_test.dart'),[
  'approved visitor pass requires review before cancellation',
  'expect(repository.cancelCalls, 0);',
  "expect(controller.accessRequests.single['status'], 'CANCELLED');"
]);

const rootPackage=JSON.parse(read('package.json'));
const apiPackage=JSON.parse(read('services/api/package.json'));
const adminPackage=JSON.parse(read('apps/admin/package.json'));
const currentVersion=rootPackage.version.split('.').map(Number);
const atLeastV460=currentVersion.length===3&&currentVersion.every(Number.isInteger)&&(currentVersion[0]>4||(currentVersion[0]===4&&currentVersion[1]>=60));
if(!atLeastV460||apiPackage.version!==rootPackage.version||adminPackage.version!==rootPackage.version){
  console.error('Root/API/Admin release identity must remain aligned at V4.60.0 or newer.');
  process.exit(1);
}
const runtimeVersionToken='version: '+rootPackage.version+'+';
if(!read('apps/resident/pubspec.yaml').includes(runtimeVersionToken)||!read('apps/guard/pubspec.yaml').includes(runtimeVersionToken)){
  console.error('Resident/Guard release identity must remain aligned with the current root release.');
  process.exit(1);
}

must('V4.60 release truth',read('docs/AARAAGATE-V4.60-GATE-DECISION-RECOVERY.md'),[
  'Release candidate closed on `develop`; release identity is V4.60.0.',
  'server continues to perform conditional status updates',
  'V4.60 release closure'
]);
must('V4.60 release closure evidence',read('docs/AARAAGATE-V4.60-RELEASE-CLOSURE.md'),[
  'PR #924',
  'PR #925',
  'PR #926',
  '4.60.0+46000',
  'does not claim staging/main promotion'
]);

console.log('V4.60 gate decision recovery release closure: PASS');
