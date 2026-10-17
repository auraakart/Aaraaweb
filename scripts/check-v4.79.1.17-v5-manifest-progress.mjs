import {execFileSync} from 'node:child_process';
// Auto-discovered lightweight repository structure contract; does not build Android.
const out=execFileSync(process.execPath,
 ['--test','scripts/v5-manifest-progress.test.mjs'],
 {encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024});
if(!out.includes('# fail 0'))throw Error('V5.5.45 release manifest integrity regression failed');
console.log('V5.5.45 release manifest progress integrity PASS (nonproduction only; external attestation still blocked)');
