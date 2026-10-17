import {execFileSync} from 'node:child_process';
// Auto-discovered Repository structure contract: ephemeral Ed25519 fixtures.
// NO external worker/OCI registry, live process, Android build or dispatch.
const output=execFileSync(process.execPath,['--test','scripts/android-test-oci-runtime-claim.test.mjs'],{
 encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024
});
if(!output.includes('# fail 0'))throw Error('V5.5.39 signed runtime process claim preflight failed');
console.log('V5.5.39 independent worker/observer runtime CLAIM contract PASS (no live attestation or dispatch)');
