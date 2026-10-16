import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyV5OperatorOnlyChanges as safe,
 classifyV5OperatorGitDiff as fromGit} from './classify-v5-test-operator-change.mjs';

const paths=[
 'scripts/v5.5.46-readonly-runtime-probe-policy.mjs',
 'scripts/v5.5.46-run-readonly-runtime-probe.mjs',
 'scripts/v5.5.46-readonly-runtime-probe.test.mjs',
 'scripts/v5.5.48-readonly-runtime-audit-receipt.mjs',
 'scripts/v5.5.48-readonly-runtime-audit-receipt.test.mjs'
];
const change=(path,status='M')=>({path,status});
test('V5.5.49 only the reviewed TEST operator scripts and documentation use narrow CI',()=>{
 for(const path of paths){
  assert.equal(safe([change(path)]),true,path);
  assert.equal(safe([change(path),change('docs/architecture/V5.5.48-OPERATOR-RUNTIME-AUDIT-RECEIPT.md')]),true,path);
  assert.equal(safe([change(path,'A'),change('docs/v5-release-manifest.json')]),true,path);
 }
});
test('V5.5.49 documentation alone does not become the operator fast path',()=>{
 assert.equal(safe([change('docs/a.md')]),false);
 assert.equal(safe([change('docs/v5-release-manifest.json')]),false);
});
for(const path of [
 '.github/workflows/ci.yml',
 '.github/workflows/v5-test-android-smoke.yml',
 'scripts/classify-v5-test-operator-change.mjs',
 'scripts/classify-release-control-change.mjs',
 'scripts/check-v4.79.1.46-v5-test-runtime-operator-probe.mjs',
 'scripts/check-v4.79.1.48-v5-test-audit-receipt.mjs',
 'scripts/v5.5.48-run-untrusted-build.mjs',
 'scripts/v5-test-android-smoke.sh',
 'scripts/v5-manifest-progress.mjs',
 'scripts/v5-manifest-progress.test.mjs',
 'scripts/performance-smoke.mjs',
 'packages/config/src/android-test-oci-runtime-transport.mjs',
 'packages/config/src/android-test-oci-runtime-claim.mjs',
 'services/api/src/auth/auth.service.ts',
 'services/api/src/migration/migration-opening-balance-commit.service.ts',
 'apps/admin/app/page.tsx',
 'apps/resident/lib/main.dart',
 'apps/guard/lib/main.dart',
 'package.json','pnpm-lock.yaml','services/api/package.json',
 'prisma/schema.prisma','tsconfig.json','README.md',
 'scripts/check-v4.79.1.49-v5-test-operator-scope.mjs'
])test('V5.5.49 never skips full regression for '+path,()=>{
 assert.equal(safe([change(paths[0]),change(path)]),false);
});
for(const status of ['D','R','C','T','U','X','B','R100'])test('V5.5.49 deletion or rename '+status+' is never operator-only',()=>{
 assert.equal(safe([change(paths[0],status)]),false);
});
test('V5.5.49 rejects missing, duplicate, unreviewed or malformed entries',()=>{
 assert.equal(safe([]),false);
 assert.equal(safe([change(paths[0]),change(paths[0])]),false);
 assert.equal(safe([{}]),false);
 assert.equal(safe([null]),false);
 assert.equal(safe([{status:'M',path:paths[0],execute:true}]),false);
 assert.equal(safe(Array.from({length:65},(_,i)=>change('docs/'+i+'.md')).concat([change(paths[0])])),false);
 for(const path of ['docs/../../scripts/v5.5.48-readonly-runtime-audit-receipt.mjs',
   'docs/../package.json','docs/file.txt','docs/folder/.github/workflows/ci.yml',
   'docs/file.md\nscripts/v5-test-android-smoke.sh'])assert.equal(safe([change(paths[0]),change(path)]),false);
});
test('V5.5.49 refuses invalid or absent Git revision inputs',()=>{
 assert.equal(fromGit('a'.repeat(40),'a'.repeat(40)),false);
 assert.equal(fromGit('bad','b'.repeat(40)),false);
 assert.equal(fromGit('a'.repeat(40),'invalid'),false);
});
