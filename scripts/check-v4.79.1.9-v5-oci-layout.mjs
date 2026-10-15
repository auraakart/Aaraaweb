import {execFileSync} from 'node:child_process';
// Automatically discovered in the lightweight V4.79 invariant job.
// It scans disposable localhost fixture files only: NO registry, Docker,
// external worker, Android build, signing or release authority.
const stdout=execFileSync(process.execPath,['--test','scripts/android-test-oci-layout.test.mjs'],{
 encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024
});
if(!stdout.includes('# fail 0'))throw Error('V5.5.37 offline OCI image-byte guard did not pass');
console.log('V5.5.37 signed claim + offline OCI image bytes integrity PASS (no worker/registry execution)');
