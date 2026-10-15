import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

// V5.5.35 is intentionally discovered by the existing scripts/check-v4.79*.mjs
// lightweight repository-structure hook. It DOES NOT modify ci.yml or wake a
// redundant Flutter/API/Admin or Android matrix on an invariant-only change.
export function ciShellBlocks(workflow){
 assert.equal(typeof workflow,'string');
 const lines=workflow.split(/\r?\n/), blocks=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^(\s*)run: \|[-+]?\s*$/);
  if(!match)continue;
  const parentIndent=match[1].length;
  let end=i+1,minIndent=Infinity;
  for(;end<lines.length;end++){
   const line=lines[end];
   if(!line.trim())continue;
   const spaces=line.match(/^ */)[0].length;
   if(spaces<=parentIndent)break;
   minIndent=Math.min(minIndent,spaces);
  }
  if(!Number.isFinite(minIndent))throw Error('Empty CI run block on line '+(i+1));
  blocks.push({
   line:i+1,
   shell:lines.slice(i+1,end).map(l=>l.trim()?l.slice(minIndent):'').join('\n')
  });
  i=end-1;
 }
 return blocks;
}
export function validateCiShellAndAndroidScope(workflow,{syntaxCheck=true}={}){
 const requiredJobs=['change-scope','repository-structure','android-test-smoke',
  'required-merge-gates','develop-auto-merge'];
 for(const name of requiredJobs){
  const match=new RegExp('^  '+name+':\\s*$','gm');
  assert.equal([...workflow.matchAll(match)].length,1,'Duplicate/missing CI job: '+name);
 }
 const blocks=ciShellBlocks(workflow);
 assert.ok(blocks.length>=4,'Missing CI embedded shell blocks');
 if(syntaxCheck)for(const {line,shell} of blocks){
  const r=spawnSync('bash',['-n'],{input:shell,encoding:'utf8',timeout:2500,maxBuffer:64*1024});
  if(r.error||r.status!==0)throw Error('Invalid CI embedded shell at run line '+line+': '+(r.stderr||r.error?.message||r.status));
 }
 const scope=blocks.filter(b=>b.shell.includes('aaraagate-changed-files.txt') &&
  b.shell.includes('run_android_smoke=true'));
 assert.equal(scope.length,1,'Expected one change-scope detector');
 const lines=scope[0].shell.split('\n').filter(line=>line.includes('v5-test-android-smoke') && line.includes('grep -Eq'));
 assert.equal(lines.length,1,'Expected one scoped Android matcher');
 const match=lines[0].match(/^\s*if grep -Eq '([^']+)' \/tmp\/aaraagate-changed-files\.txt; then\s*$/);
 assert.ok(match,'Malformed or unquoted Android change-scope matcher');
 const expr=new RegExp(match[1]);
 const allow=[
  '.github/workflows/v5-test-android-smoke.yml',
  'scripts/v5-test-android-smoke.sh',
  'scripts/v5-test-apksigner-report.mjs',
  'scripts/v5-test-apksigner-report.test.mjs',
  'scripts/v5-test-android-aab-smoke.sh',
  'scripts/v5-test-aab-signer-report.mjs',
  'scripts/v5-test-aab-signer-report.test.mjs',
  'scripts/v5-test-build-matrix-evidence.mjs',
  'scripts/v5-test-build-matrix-evidence.test.mjs'
 ];
 for(const path of allow)assert.ok(expr.test(path),'Android test file missed by selective CI: '+path);
 for(const path of ['scripts/unrelated.mjs','.github/workflows/ci.yml',
  'docs/v5-release-manifest.json','apps/guard/lib/main.dart',
  'scripts/v5-test-build-matrix-evidence.mjs.bak']){
  assert.equal(expr.test(path),false,'Android smoke unexpectedly triggered by '+path);
 }
 assert.ok(scope[0].shell.includes('echo "run_android_smoke=true" >> "$GITHUB_OUTPUT"'),
  'Android flag missing from change-scope');
 assert.ok(workflow.includes("if: needs.change-scope.outputs.run_android_smoke == 'true'"),
  'Selective Android smoke job missing its guard');
 assert.ok(workflow.includes('test "$ANDROID_SMOKE" = "success"'),
  'Required merge gate must reject failed Android smoke');
 return Object.freeze({embeddedShellBlocksChecked:blocks.length,allowedAndroidInputs:allow.length,
  duplicateJobsRejected:true,androidMergeGatePreserved:true});
}
// Negative regression fixtures must be checked without launching expensive jobs.
const workflow=readFileSync('.github/workflows/ci.yml','utf8');
const checked=validateCiShellAndAndroidScope(workflow);
assert.throws(()=>validateCiShellAndAndroidScope(workflow.replace(
 "scripts/v5-test-build-matrix-evidence(\\.test)?\\.mjs)$'",
 "scripts/v5-test-build-matrix-evidence(\\.test)?\\.mjs)")), /shell|matcher|syntax|CI/);
assert.throws(()=>validateCiShellAndAndroidScope(workflow.replace(
  '  required-merge-gates:','  change-scope:')), /Duplicate\/missing CI job/);
console.log('V5.5.35 CI shell/scope regression guard: PASS',JSON.stringify(checked));
