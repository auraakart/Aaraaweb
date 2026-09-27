import fs from 'node:fs';

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

must('V4.60 authoritative access recovery',read('apps/resident/lib/data/resident_data_controller.dart'),[
  'Future<T> _withAccessMutationRecovery<T>',
  'await _loadAccess();',
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

must('V4.60 development truth',read('docs/AARAAGATE-V4.60-GATE-DECISION-RECOVERY.md'),[
  'runtime identity remains V4.59.0',
  'server continues to perform conditional status updates',
  'does not claim V4.60.0 release closure'
]);

console.log('V4.60 gate decision recovery development contract: PASS');
