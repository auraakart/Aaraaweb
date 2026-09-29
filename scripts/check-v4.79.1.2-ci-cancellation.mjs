import fs from 'node:fs';

const workflow=fs.readFileSync('.github/workflows/ci.yml','utf8');

const cancellableAggregators=[
  ['api-validation','API validation','[change-scope, api-validation-full]'],
  ['admin-validation','Admin validation','[change-scope, admin-validation-full]'],
  ['flutter-validation','Flutter validation','[change-scope, flutter-validation-full]'],
  ['dependency-security','Dependency security','[change-scope, dependency-security-full]'],
  ['required-merge-gates','Required merge gates','[repository-structure, api-validation, admin-validation, flutter-validation, dependency-security]'],
];

for(const [job,name,needs] of cancellableAggregators){
  const expected='  '+job+':\n    name: '+name+'\n    needs: '+needs+'\n    if: ${{ !cancelled() }}';
  if(!workflow.includes(expected)){
    throw new Error(name+' must stop on workflow cancellation so superseded PR heads do not retain queued aggregator jobs.');
  }
}

const forbidden=[
  'api-validation:\n    name: API validation\n    needs: [change-scope, api-validation-full]\n    if: always()',
  'admin-validation:\n    name: Admin validation\n    needs: [change-scope, admin-validation-full]\n    if: always()',
  'flutter-validation:\n    name: Flutter validation\n    needs: [change-scope, flutter-validation-full]\n    if: always()',
  'dependency-security:\n    name: Dependency security\n    needs: [change-scope, dependency-security-full]\n    if: always()',
  'required-merge-gates:\n    name: Required merge gates\n    needs: [repository-structure, api-validation, admin-validation, flutter-validation, dependency-security]\n    if: always()',
];

for(const token of forbidden){
  if(workflow.includes(token)) throw new Error('Superseded-run blocker reintroduced: '+token.split(':')[0]);
}

for(const cleanup of [
  'Restore API manifest after transient coverage tooling',
  'Stop production-mode API',
  'Upload API risk coverage evidence',
]){
  if(!workflow.includes(cleanup)) throw new Error('Expected cleanup/evidence step missing: '+cleanup);
}

if((workflow.match(/if: always\(\)/g)||[]).length===0){
  throw new Error('Step-level cleanup always() semantics were removed; only job-level aggregators should change.');
}

console.log('V4.79.1.2 CI cancellation contract OK');
