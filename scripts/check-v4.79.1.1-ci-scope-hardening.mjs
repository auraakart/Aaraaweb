import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/ci.yml','utf8');

const required=[
  "grep '^scripts/' /tmp/aaraagate-changed-files.txt | grep -Ev '^scripts/check-v[0-9][0-9A-Za-z._-]*\\.mjs$'",
  'checks=(scripts/check-v4.79*.mjs)',
  'for check in "${checks[@]}"; do',
  'node "$check"',
  "grep -Eq '^(\\.github/|packages/|package\\.json$|pnpm-lock\\.yaml$|pnpm-workspace\\.yaml$|tsconfig[^/]*\\.json$)'",
];
const missing=required.filter(token=>!workflow.includes(token));
if(missing.length){
  throw new Error('V4.79 CI scope hardening missing: '+missing.join(', '));
}

if(workflow.includes("^(.github/|scripts/|packages/")){
  throw new Error('All scripts must not be treated as cross-cutting; semantic milestone guards would wake unrelated runners.');
}
if(workflow.includes('name: Check V4.79.0 society knowledge AI')){
  throw new Error('V4.79 checks must be auto-discovered so each slice does not edit ci.yml.');
}

console.log('V4.79 CI scope hardening contract OK');
