import fs from 'node:fs';

await import('../apps/admin/scripts/v4.27-onboarding-readiness-evidence-regression.mjs');

const backup=fs.readFileSync('.github/workflows/backup-restore-smoke.yml','utf8');
for(const token of [
  'name: Checkout scope evidence',
  'fetch-depth: 0',
  'BASE_SHA: ${{ github.event.pull_request.base.sha }}',
  'HEAD_SHA: ${{ github.event.pull_request.head.sha }}',
  'git diff --name-only "$BASE_SHA" "$HEAD_SHA"',
]){
  if(!backup.includes(token))throw new Error('Backup scope hardening missing: '+token);
}
if(backup.includes('gh api --paginate "/repos/$REPOSITORY/pulls/$PR_NUMBER/files')){
  throw new Error('Backup scope must not depend on GitHub PR-files API availability.');
}

const classifier=fs.readFileSync('scripts/classify-release-control-change.mjs','utf8');
for(const token of [
  "path==='.github/workflows/backup-restore-smoke.yml'",
  "const backupChanged=changed.includes('.github/workflows/backup-restore-smoke.yml')",
  "nonControlBackup",
  "stripJob(source,'change-scope','Backup restore')",
]){
  if(!classifier.includes(token))throw new Error('Release-control classifier backup boundary missing: '+token);
}

console.log('V4.79.5.1 validation delay hardening contract OK');
