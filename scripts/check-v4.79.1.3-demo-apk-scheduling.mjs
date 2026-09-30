import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/resident-demo-apk.yml','utf8');

if(/\n\s*pull_request:\s*\n/.test(workflow)){
  throw new Error('Resident Demo APK is supplementary evidence and must not compete with required PR validation.');
}
for(const token of [
  'push:',
  'branches: [main]',
  'workflow_dispatch:',
  'Build Resident demo APK',
  "flutter-version: '3.47.0'",
  'Build debug APK',
  "github.event_name == 'push' && github.ref == 'refs/heads/main'",
]){
  if(!workflow.includes(token)) throw new Error('Resident Demo APK main-boundary evidence contract missing: '+token);
}
console.log('V4.79.1.3 Resident Demo APK scheduling contract OK');
