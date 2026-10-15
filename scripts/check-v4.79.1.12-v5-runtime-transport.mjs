import {execFileSync} from 'node:child_process';
const stdout=execFileSync(process.execPath,['--test','scripts/android-test-oci-runtime-transport.test.mjs'],{
 encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024
});
if(!stdout.includes('# fail 0'))throw Error('V5.5.40 mTLS TEST runtime probe fixture suite failed');
console.log('V5.5.40 live loopback TLS 1.3/mTLS nonce-bound runtime CLAIM response PASS (no external attestation or dispatch)');
