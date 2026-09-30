import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const requireTokens=(label,source,tokens)=>{
  const missing=tokens.filter(token=>!source.includes(token));
  if(missing.length)throw new Error(label+' missing: '+missing.join(', '));
};

const contract=read('services/api/src/integrations/integration-provider.contract.ts');
const registry=read('services/api/src/integrations/integration-registry.service.ts');
const admin=read('apps/admin/app/integrations/page.tsx');

requireTokens('Operation contract model',contract,[
  'aaraagate.integration.operation.v1',
  'IntegrationOperationContract',
  'QUERY_PAYMENT',
  'REQUEST_REFUND',
  'CONTROL_BARRIER',
  'INGEST_READING',
  'DELIVER_EXPORT',
  "providerAuthority:'NONE'",
  "providerAuthority:'QUARANTINED_INPUT'",
]);
requireTokens('Registry operation conformance',registry,[
  'integrationOperationContracts',
  'operationContractsPresent',
  'operationContractsUnique',
  'boundedOperationTimeouts',
  'providerNeverAuthoritative',
  'mutationIdempotencyExplicit',
  'fieldEvidenceRequired=item.operations.some',
]);
requireTokens('Admin operation evidence',admin,[
  'operations:OperationContract[]',
  'operation.operationId',
  'operation.idempotency',
  'operation.callbackVerification',
  'operation.providerAuthority',
  'operation.reconciliationRequired',
]);

if(contract.includes('providerAuthority:\'AUTHORITATIVE\'')){
  throw new Error('External providers must never become Aaraagate domain authority.');
}
if(registry.includes('operations: item.operations')){
  throw new Error('Operation contracts must come from the central versioned contract registry, not adapter-local mutation.');
}

console.log('V4.79.4 operation-level integration contract OK');
