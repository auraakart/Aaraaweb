import {execFileSync} from 'node:child_process';
const out=execFileSync(process.execPath,['--test','scripts/android-test-linux-observer.test.mjs'],{
 encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024
});
if(!out.includes('# fail 0'))throw Error('V5.5.42 Linux external-observer preparation fixture failed');
console.log('V5.5.42 Linux /proc stable PID/mount namespace observer preflight PASS (host-local fixtures; no external OCI attestation or dispatch)');
