import {execFileSync} from 'node:child_process';
const out=execFileSync(process.execPath,
 ['--test','scripts/android-test-linux-executable-observer.test.mjs'],{
 encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024
});
if(!out.includes('# fail 0'))throw Error('V5.5.44 executable observer regression failed');
console.log('V5.5.44 pinned host-local executable and PID/user/mount namespace preflight PASS (no remote OCI attestation or dispatch)');
