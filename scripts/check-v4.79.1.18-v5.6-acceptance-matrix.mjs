import {execFileSync} from 'node:child_process';
// Auto-discovered V4.79 repository structure check. Lightweight Node-only,
// no CI YAML edits, remote worker dispatch, Android build or release claims.
const output=execFileSync(process.execPath,
 ['--test','scripts/v5.6.2-acceptance-matrix.test.mjs'],
 {encoding:'utf8',timeout:20000,maxBuffer:2*1024*1024});
if(!output.includes('# fail 0'))
 throw Error('V5.6.2 nonproduction acceptance matrix guard failed');
console.log('V5.6.2 TEST-only acceptance matrix PASS (15 planned cases, 0 executed, release blocked)');
