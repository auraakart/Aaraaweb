import {execFileSync} from 'node:child_process';
// Lightweight auto-discovered repository-structure invariant. Ephemeral local
// TLS and OCI fixtures only; no external registry, worker or build dispatch.
const output=execFileSync(process.execPath,['--test','scripts/android-test-oci-registry.test.mjs'],{
 encoding:'utf8',timeout:35000,maxBuffer:2*1024*1024
});
if(!output.includes('# fail 0'))throw new Error('V5.5.38 OCI registry integrity preflight failed');
console.log('V5.5.38 pinned TLS read-only TEST OCI registry manifest preflight PASS (fixtures only; no dispatch)');
