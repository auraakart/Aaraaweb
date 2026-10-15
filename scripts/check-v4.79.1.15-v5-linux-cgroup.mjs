import {execFileSync} from 'node:child_process';
const result=execFileSync(process.execPath,['--test','scripts/android-test-linux-cgroup-observer.test.mjs'],{
 encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024
});
if(!result.includes('# fail 0'))throw Error('V5.5.43 Linux cgroup/root observer failed');
console.log('V5.5.43 Linux cgroup/rootfs host-local observation contract PASS (no external image attestation or dispatch)');
