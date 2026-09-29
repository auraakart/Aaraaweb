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
const requiredGateStart=workflow.indexOf('\n  required-merge-gates:\n');
const autoMergeStart=workflow.indexOf('\n  develop-auto-merge:\n');
if(requiredGateStart<0||autoMergeStart<0||autoMergeStart<=requiredGateStart){
  console.error('Required merge gate or develop auto-merge job is missing.');
  process.exit(1);
}
const requiredGate=workflow.slice(requiredGateStart,autoMergeStart);
if(!requiredGate.includes('if: ${{ !cancelled() }}')){
  console.error('Required merge gate must stop on whole-workflow cancellation while still evaluating failed/skipped upstream results.');
  process.exit(1);
}
const releaseControlRequired=[
  'release_control_only: ${{ steps.detect.outputs.release_control_only }}',
  'node scripts/classify-release-control-change.mjs "$BASE_SHA" "${{ github.sha }}"',
  'node scripts/check-secret-patterns.mjs',
  "needs.change-scope.outputs.release_control_only != 'true'",
  'RELEASE_CONTROL_ONLY: ${{ needs.change-scope.outputs.release_control_only }}',
  'Release-control-only PR: dependency graph and product surfaces are unchanged',
];
const releaseControlMissing=releaseControlRequired.filter(token=>!workflow.includes(token));
if(releaseControlMissing.length){
  console.error('Narrow release-control fast-path contract missing: '+releaseControlMissing.join(', '));
  process.exit(1);
}
if(!fs.existsSync('scripts/classify-release-control-change.mjs')){
  console.error('Narrow release-control classifier is missing.');
  process.exit(1);
}

const autoMerge=workflow.slice(autoMergeStart);
const autoRequired=[
  'name: Develop auto merge',
  'needs: [required-merge-gates]',
  'EVENT_NAME: ${{ github.event_name }}',
  'if [ "$EVENT_NAME" != "pull_request" ]',
  'contents: write',
  'pull-requests: write',
  'EXPECTED_HEAD_SHA: ${{ github.event.pull_request.head.sha }}',
  'EXPECTED_BASE_SHA: ${{ github.event.pull_request.base.sha }}',
  'if [ "$current_base" != "develop" ]',
  'if [ "$current_draft" != "false" ]',
  'if [ "$current_repo" != "$REPOSITORY" ]',
  'mastermind/*)',
  'test "$current_sha" = "$EXPECTED_HEAD_SHA"',
  'test "$current_develop_sha" = "$EXPECTED_BASE_SHA"',
  'current_merged=',
  'already merged at the exact tested head',
  '-f merge_method=squash',
  '-f sha="$EXPECTED_HEAD_SHA"',
  'if [ "$merged" != "true" ]',
];
const autoMissing=autoRequired.filter(token=>!autoMerge.includes(token));
if(autoMissing.length){
  console.error('In-CI develop auto-merge safety contract missing: '+autoMissing.join(', '));
  process.exit(1);
}
const autoHeader=autoMerge.slice(0,autoMerge.indexOf('    permissions:'));
if(!autoHeader.includes("if: ${{ !cancelled() && needs.required-merge-gates.result == 'success' }}")){
  console.error('Develop auto-merge must override transitive skipped-job suppression while still requiring successful merge gates.');
  process.exit(1);
}
if((autoHeader.match(/\n    if:/g)||[]).length!==1){
  console.error('Develop auto-merge must have exactly one status-only job condition.');
  process.exit(1);
}
if(autoMerge.includes("github.event.pull_request.base.ref == 'develop'")||
   autoMerge.includes("github.event.pull_request.head.repo.full_name == github.repository")||
   autoMerge.includes("startsWith(github.event.pull_request.head.ref, 'mastermind/')")||
   autoMerge.includes("github.event.pull_request.draft == false")){
  console.error('Develop auto-merge eligibility must be evaluated inside the observable merge step, not as a silent job-level skip condition.');
  process.exit(1);
}
if(autoMerge.includes('base=main')||autoMerge.includes('base=staging')){
  console.error('Develop auto-merge job must never target staging or main.');
  process.exit(1);
}
if(fs.existsSync('.github/workflows/develop-auto-merge.yml')){
  console.error('Standalone workflow_run auto-merge must not return; it depends on default-branch dispatch.');
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
