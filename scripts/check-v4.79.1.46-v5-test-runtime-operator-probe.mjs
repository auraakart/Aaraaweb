import {execFileSync} from 'node:child_process';
// Auto-discovered repository-structure gate for the explicit, operator-initiated
// TEST-only read-only runner probe. No external network or signing secrets.
const out=execFileSync(process.execPath,
 ['--test','scripts/v5.5.46-readonly-runtime-probe.test.mjs'],
 {encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
if(!out.includes('# fail 0'))
 throw Error('V5.5.46 read-only TEST probe operator policy tests failed');
console.log('V5.5.46 TEST operator probe policy PASS; no external runtime acceptance or build authority');
