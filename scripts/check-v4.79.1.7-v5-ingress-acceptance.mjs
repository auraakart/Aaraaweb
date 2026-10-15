import {execFileSync} from 'node:child_process';
// Existing repository-structure V4.79 invariant discovery runs only this local
// fixture. It NEVER runs the manual external ingress probe or opens remote DNS.
const result=execFileSync(process.execPath,['--test','scripts/v5.4.24-ingress-acceptance.test.mjs'],{
 cwd:process.cwd(),encoding:'utf8',timeout:15000,maxBuffer:1024*1024
});
if(!result.includes('# fail 0'))throw Error('V5.4.24 TEST ingress acceptance fixture did not pass');
console.log('V5.4.24 secure test ingress probe contracts PASS (external execution disabled)');
