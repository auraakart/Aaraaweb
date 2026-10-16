import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const workflow=readFileSync('.github/workflows/ci.yml','utf8');
const tokens=[
 'operator_scope_only="$(node scripts/classify-v5-test-operator-change.mjs "$BASE_SHA" "${{ github.sha }}")"',
 'if [ "$operator_scope_only" = "true" ]; then',
 'node scripts/check-secret-patterns.mjs',
 'echo "run_api=false" >> "$GITHUB_OUTPUT"',
 'echo "run_admin=false" >> "$GITHUB_OUTPUT"',
 'echo "run_flutter=false" >> "$GITHUB_OUTPUT"',
 'echo "run_resident=false" >> "$GITHUB_OUTPUT"',
 'echo "run_guard=false" >> "$GITHUB_OUTPUT"',
 'echo "run_dependency_audit=false" >> "$GITHUB_OUTPUT"',
 'name: Repository structure',
 'name: Required merge gates',
 'name: Develop auto merge',
 "if: needs.change-scope.outputs.run_api == 'true'",
 "if: needs.change-scope.outputs.run_admin == 'true'",
 "if: needs.change-scope.outputs.run_flutter == 'true'"
];
if(tokens.some(t=>!workflow.includes(t)))throw Error('V5.5.49 safe scope/gates changed');
const start=workflow.indexOf('          operator_scope_only=');
const scope=workflow.indexOf('          run_api=false\n          run_admin=false\n          run_flutter=false',start);
const merge=workflow.indexOf('  required-merge-gates:');
if(start<0||scope<start||merge<scope)throw Error('V5.5.49 scope inserted out of order');
const section=workflow.slice(start,scope);
for(const gate of ['run_api','run_admin','run_flutter','run_resident','run_guard','run_dependency_audit'])
 if(!section.includes('echo "'+gate+'=false" >> "$GITHUB_OUTPUT"'))
  throw Error('V5.5.49 unsafe control flow');
if(section.includes('run_android_smoke=false')||section.includes('buildExecutionAuthorized=true')||
   section.includes('required-merge-gates=false'))throw Error('V5.5.49 illegitimate bypass');
const report=execFileSync(process.execPath,['--test','scripts/classify-v5-test-operator-change.test.mjs'],
 {encoding:'utf8',timeout:15000,maxBuffer:1024*1024});
if(!report.includes('# fail 0')||!report.includes('# pass '))
 throw Error('V5.5.49 conservative change scope regression failed');
console.log('V5.5.49 conservative offline TEST CI scope PASS; required structure/security/merge gates intact');
