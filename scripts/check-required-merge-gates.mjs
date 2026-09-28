import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/ci.yml','utf8');
const required=[
  'name: Required merge gates',
  'needs: [repository-structure, api-validation, admin-validation, flutter-validation, dependency-security]',
  'REPOSITORY_STRUCTURE: ${{ needs.repository-structure.result }}',
  'API_VALIDATION: ${{ needs.api-validation.result }}',
  'ADMIN_VALIDATION: ${{ needs.admin-validation.result }}',
  'FLUTTER_VALIDATION: ${{ needs.flutter-validation.result }}',
  'DEPENDENCY_SECURITY: ${{ needs.dependency-security.result }}',
  'All required merge gates passed.',
];
const missing=required.filter(token=>!workflow.includes(token));
if(missing.length){
  console.error('Required merge-gate orchestration missing: '+missing.join(', '));
  process.exit(1);
}
if(!workflow.includes('if: always()')){
  console.error('Required merge gate must resolve even when an upstream gate fails.');
  process.exit(1);
}
const autoMerge=fs.readFileSync('.github/workflows/develop-auto-merge.yml','utf8');
const autoRequired=[
  'name: Develop auto merge',
  'workflows: ["CI"]',
  "github.event.workflow_run.conclusion == 'success'",
  "github.event.workflow_run.event == 'pull_request'",
  'pulls?state=open&base=develop&per_page=100',
  'startswith("mastermind/")',
  'test "$current_sha" = "$TESTED_SHA"',
  'test "$current_base" = "develop"',
  '-f merge_method=squash',
  '-f sha="$TESTED_SHA"',
];
const autoMissing=autoRequired.filter(token=>!autoMerge.includes(token));
if(autoMissing.length){
  console.error('Develop auto-merge safety contract missing: '+autoMissing.join(', '));
  process.exit(1);
}
if(autoMerge.includes('base=main')||autoMerge.includes('base=staging')){
  console.error('Develop auto-merge workflow must never target staging or main.');
  process.exit(1);
}

const developDeferred=[
  '.github/workflows/v2-pilot-acceptance-contract.yml',
  '.github/workflows/v2-staging-pilot-execution-contract.yml',
  '.github/workflows/v2-role-uat-contract.yml',
  '.github/workflows/v2-security-privacy-review.yml',
  '.github/workflows/v2-policy-pilot-contract.yml',
  '.github/workflows/v4.11-pilot-readiness.yml',
  '.github/workflows/v4.28-deployable-evidence.yml',
  '.github/workflows/v4.29-pilot-evidence-capture.yml',
  '.github/workflows/v4.33-competitive-readiness.yml',
];
for(const path of developDeferred){
  const source=fs.readFileSync(path,'utf8');
  const pullRequestBlock=(source.match(/pull_request:\s*\n\s*branches:\s*\[([^\]]+)\]/)||[])[1]??'';
  if(pullRequestBlock.split(',').map(x=>x.trim()).includes('develop')){
    console.error('Non-blocking workflow still consumes develop PR runners: '+path);
    process.exit(1);
  }
}
for(const token of [
  'check-v2-pilot-acceptance-plan.mjs',
  'check-v2-role-uat-plan.mjs',
  'check-v2-security-privacy-controls.mjs',
  'check-v2-policy-pilot-plan.mjs',
  'check-v4.11-pilot-readiness.mjs',
  'check-v4.28-deployable-evidence.mjs',
  'check-v4.29-pilot-evidence-capture.mjs',
  'check-competitive-readiness.mjs',
]){
  if(!workflow.includes(token)){
    console.error('Fast Repository structure gate no longer contains lightweight contract: '+token);
    process.exit(1);
  }
}

console.log('Required merge-gate orchestration contract is intact.');
