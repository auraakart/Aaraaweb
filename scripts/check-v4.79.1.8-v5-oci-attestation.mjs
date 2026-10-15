import {execFileSync} from 'node:child_process';
// Auto-discovered repository-structure gate: verify cryptographic DSSE claims
// using fresh isolated Ed25519 fixture keys. Never contact OCI registries,
// perform build execution, or claim a real independent TEST runner exists.
const out=execFileSync(process.execPath,['--test','scripts/android-test-oci-provenance.test.mjs'],{
 encoding:'utf8',timeout:15000,maxBuffer:1024*1024
});
if(!out.includes('# pass 15')||!out.includes('# fail 0'))
 throw Error('V5.5.36 independent OCI attestor regression failed');
console.log('V5.5.36 pinned OCI image claim signature and separation guard PASS');
