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
  "needs.change-scope.outputs.run_dependency_audit == 'true'",
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
  'concurrency:',
  'group: aaraagate-develop-auto-merge',
  'cancel-in-progress: false',
  'if [ "$current_develop_sha" != "$EXPECTED_BASE_SHA" ]',
  'latest_develop_sha=',
  'if [ "$latest_develop_sha" != "$EXPECTED_BASE_SHA" ]',
  'require_fresh_base()',
  'Stale PR requires user-authored synchronization',
  'exit 1',
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
if(!autoHeader.includes('concurrency:')||
   !autoHeader.includes('group: aaraagate-develop-auto-merge')||
   !autoHeader.includes('cancel-in-progress: false')){
  console.error('Develop auto-merge must serialize base-changing merge decisions without cancelling queued validations.');
  process.exit(1);
}
if(autoMerge.includes('/pulls/$PR_NUMBER/update-branch')||
   autoMerge.includes('-f expected_head_sha="$EXPECTED_HEAD_SHA"')){
  console.error('Develop auto-merge must never bot-refresh a PR head: github.token suppresses new CI checks and strands the PR.');
  process.exit(1);
}
if(!autoMerge.includes('require_fresh_base') || !autoMerge.includes('exit 1')){
  console.error('Develop auto-merge must fail closed on stale base and require externally triggered CI revalidation.');
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

const appScopedRequired=[
  'run_resident: ${{ steps.detect.outputs.run_resident }}',
  'run_guard: ${{ steps.detect.outputs.run_guard }}',
  "if grep -Eq '^apps/resident/' /tmp/aaraagate-changed-files.txt",
  "if grep -Eq '^apps/guard/' /tmp/aaraagate-changed-files.txt",
  "if: needs.change-scope.outputs.run_resident == 'true'",
  "if: needs.change-scope.outputs.run_guard == 'true'",
  'test/amenities_screen_test.dart',
  'node scripts/v4.34-cross-app-journey-contract.mjs',
  'Upload Resident risk coverage evidence',
  'Upload Guard risk coverage evidence',
  'run_dependency_audit: ${{ steps.detect.outputs.run_dependency_audit }}',
  'run_dependency_audit=false',
  'run_dependency_audit=true',
  'echo "run_dependency_audit=$run_dependency_audit"',
  "needs.change-scope.outputs.run_dependency_audit == 'true'",
  'RUN_DEPENDENCY_AUDIT: ${{ needs.change-scope.outputs.run_dependency_audit }}',
  'Scan tracked source for high-confidence secret patterns',
  'Dependency graph unchanged: full package audit skipped',
  'node scripts/check-v4-release-evidence.mjs',
  'bash -n scripts/release-migration-gate.sh',
];
const appScopedMissing=appScopedRequired.filter(token=>!workflow.includes(token));
if(appScopedMissing.length){
  console.error('App-scoped Flutter validation contract missing: '+appScopedMissing.join(', '));
  process.exit(1);
}

const dependencyWrapperStart=workflow.indexOf('  dependency-security:\n');
const requiredMergeStart=workflow.indexOf('  required-merge-gates:\n');
const dependencyWrapper=dependencyWrapperStart>=0&&requiredMergeStart>dependencyWrapperStart
  ? workflow.slice(dependencyWrapperStart,requiredMergeStart)
  : '';
const dependencyWrapperOrder=[
  'if [ "$RELEASE_CONTROL_ONLY" = "true" ]; then',
  'Release-control-only PR: dependency graph and product surfaces are unchanged',
  'if [ "$RUN_DEPENDENCY_AUDIT" != "true" ]; then',
  'Dependency graph unchanged: full package audit skipped',
  'test "$FULL_RESULT" = "success"',
];
let dependencyCursor=-1;
for(const token of dependencyWrapperOrder){
  const nextIndex=dependencyWrapper.indexOf(token,dependencyCursor+1);
  if(nextIndex<0){
    console.error('Dependency security wrapper control-flow token missing/out of order: '+token);
    process.exit(1);
  }
  dependencyCursor=nextIndex;
}
const releaseClose=dependencyWrapper.indexOf('          fi',dependencyWrapper.indexOf('if [ "$RELEASE_CONTROL_ONLY" = "true" ]; then'));
const auditStart=dependencyWrapper.indexOf('if [ "$RUN_DEPENDENCY_AUDIT" != "true" ]; then');
if(releaseClose<0||auditStart<0||releaseClose>auditStart){
  console.error('Dependency security wrapper must close the release-control branch before dependency-audit resolution.');
  process.exit(1);
}

const workflowSource=(path)=>fs.readFileSync(path,'utf8');
const eventBranches=(source,event)=>{
  const match=source.match(new RegExp('(?:^|\\n)\\s*'+event+':\\s*\\n\\s*branches:\\s*\\[([^\\]]+)\\]'));
  return match?match[1].split(',').map(value=>value.trim()):[];
};
const codeqlWorkflow=workflowSource('.github/workflows/codeql.yml');
const supplyWorkflow=workflowSource('.github/workflows/supply-chain-security.yml');
const crossRoleWorkflow=workflowSource('.github/workflows/cross-role-e2e.yml');
const backupWorkflow=workflowSource('.github/workflows/backup-restore-smoke.yml');

const specialistMainPr=[
  ['CodeQL',codeqlWorkflow],
  ['Supply-chain security',supplyWorkflow],
  ['Cross-role E2E',crossRoleWorkflow],
  ['Performance regression',workflowSource('.github/workflows/performance-regression.yml')],
  ['Runtime reliability',workflowSource('.github/workflows/v3-runtime-reliability.yml')],
  ['V4 release consolidation',workflowSource('.github/workflows/v4-release-consolidation.yml')],
];
for(const [label,source] of specialistMainPr){
  if(eventBranches(source,'pull_request').includes('develop')){
    console.error(label+' must not consume develop PR runners outside canonical CI.');
    process.exit(1);
  }
  if(!eventBranches(source,'pull_request').includes('main')){
    console.error(label+' must retain pre-main pull-request coverage.');
    process.exit(1);
  }
}

const noDevelopPush=[
  ['Canonical CI',workflow],
  ['CodeQL',codeqlWorkflow],
  ['Supply-chain security',supplyWorkflow],
  ['Cross-role E2E',crossRoleWorkflow],
  ['Branch hygiene',workflowSource('.github/workflows/branch-hygiene.yml')],
  ['Resident demo APK',workflowSource('.github/workflows/resident-demo-apk.yml')],
  ['Staging smoke',workflowSource('.github/workflows/staging-smoke.yml')],
  ['V2 role UAT',workflowSource('.github/workflows/v2-role-uat-contract.yml')],
  ['V2 policy pilot',workflowSource('.github/workflows/v2-policy-pilot-contract.yml')],
  ['V2 security/privacy',workflowSource('.github/workflows/v2-security-privacy-review.yml')],
  ['V2 pilot acceptance',workflowSource('.github/workflows/v2-pilot-acceptance-contract.yml')],
  ['V2 staging pilot execution',workflowSource('.github/workflows/v2-staging-pilot-execution-contract.yml')],
  ['V4.11 pilot readiness',workflowSource('.github/workflows/v4.11-pilot-readiness.yml')],
  ['V4.28 deployable evidence',workflowSource('.github/workflows/v4.28-deployable-evidence.yml')],
  ['V4.29 pilot evidence',workflowSource('.github/workflows/v4.29-pilot-evidence-capture.yml')],
  ['V4.33 competitive readiness',workflowSource('.github/workflows/v4.33-competitive-readiness.yml')],
];
for(const [label,source] of noDevelopPush){
  if(eventBranches(source,'push').includes('develop')){
    console.error(label+' must not start a post-merge develop runner.');
    process.exit(1);
  }
}
if(!eventBranches(workflow,'pull_request').includes('develop')||
   !eventBranches(workflow,'pull_request').includes('main')){
  console.error('Canonical CI must remain the protected pre-merge validator for develop and main.');
  process.exit(1);
}
const backupPrBranches=eventBranches(backupWorkflow,'pull_request');
if(!backupPrBranches.includes('staging')||backupPrBranches.includes('develop')||backupPrBranches.includes('main')){
  console.error('Backup restore must run for staging pull requests only; develop/main PRs use canonical validation.');
  process.exit(1);
}
if(backupWorkflow.includes('paths:')){
  console.error('Backup restore staging pull requests must remain unfiltered by paths.');
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
