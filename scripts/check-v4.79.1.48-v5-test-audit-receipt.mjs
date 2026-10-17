import {execFileSync} from 'node:child_process';
// Existing repository structure CI glob auto-discovers V5.5.48 without
// adding another workflow, live TEST network dependency, or build execution.
const out=execFileSync(process.execPath,
 ['--test','scripts/v5.5.48-readonly-runtime-audit-receipt.test.mjs'],
 {encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
if(!out.includes('# fail 0'))
 throw Error('V5.5.48 read-only TEST operator receipt regression failed');
console.log('V5.5.48 local signed-claim metadata receipt validation PASS; no external acceptance or dispatch authority');
