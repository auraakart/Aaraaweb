import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const migration=readFileSync('services/api/prisma/migrations/20261015080000_v5541_runtime_probe_replay/migration.sql','utf8');
const schema=readFileSync('services/api/prisma/schema.prisma','utf8');
const service=readFileSync('services/api/src/entitlements/partner-android-runner-runtime-probe-ledger.service.ts','utf8');
const probe=readFileSync('packages/config/src/android-test-oci-runtime-transport.mjs','utf8');
assert.match(schema,/model PartnerAndroidRunnerRuntimeProbe \{/);
for(const column of ['acceptanceId','challengeId','runId','transportNonceDigest','runtimeEnvelopeDigest','transportSignatureDigest'])
 assert.ok(migration.includes('"AndroidRuntimeProbe_'+column+'_key"'),column+' uniqueness absent');
assert.match(migration,/BEFORE INSERT ON "PartnerAndroidRunnerRuntimeProbe"/);
assert.match(migration,/aaraagate_v5541_runtime_probe_guard/);
assert.match(migration,/aaraagate_partner_license_append_only/);
assert.match(migration,/aaraagate_v5420_allocation/);
assert.match(service,/stage:'BEFORE_DISPATCH'/);
assert.match(service,/await probeOnce\(\)/);
assert.match(service,/partnerAndroidRunnerRuntimeProbe\.create/);
assert.match(probe,/transportNonceDigest:sha\(requestNonce\)/);
assert.match(probe,/buildExecutionAuthorized:false/);
console.log('V5.5.41 TEST runtime replay DB contract PASS (static migration + non-dispatchable source gate)');
