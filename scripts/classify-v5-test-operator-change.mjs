import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Only these existing, manually invoked TEST claim tools are isolated from
// API/Admin/Flutter runtime. Their regressions are ALWAYS run by Repository
// structure via the already protected V5.5.46 / V5.5.48 check-v4.79 hooks.
// Do not generalize this list to scripts/v5* or packages/config runtime.
const reviewed=new Set([
 'scripts/v5.5.46-readonly-runtime-probe-policy.mjs',
 'scripts/v5.5.46-run-readonly-runtime-probe.mjs',
 'scripts/v5.5.46-readonly-runtime-probe.test.mjs',
 'scripts/v5.5.48-readonly-runtime-audit-receipt.mjs',
 'scripts/v5.5.48-readonly-runtime-audit-receipt.test.mjs'
]);
const documentation=/^docs\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:md|json)$/;
const sha=/^[a-f0-9]{40}$/;

// Fail closed for any deletion, rename, unknown file, new hook, runtime,
// dependency, workflow, package or schema change. Docs alone use docs_only.
export function classifyV5OperatorOnlyChanges(changes){
 if(!Array.isArray(changes)||changes.length===0||changes.length>64)return false;
 let operatorChanged=false;
 const seen=new Set();
 for(const change of changes){
  if(!change||typeof change!=='object'||Array.isArray(change)||
     Object.keys(change).sort().join('|')!=='path|status'||
     !['A','M'].includes(change.status)||
     typeof change.path!=='string'||seen.has(change.path))return false;
  seen.add(change.path);
  if(reviewed.has(change.path)){operatorChanged=true;continue;}
  if(documentation.test(change.path))continue;
  return false;
 }
 return operatorChanged;
}

export function classifyV5OperatorGitDiff(base,head){
 if(!sha.test(base)||!sha.test(head)||base===head)return false;
 try{
  const out=execFileSync('git',['diff','--name-status','--no-renames',base,head],{
   encoding:'utf8',timeout:10000,maxBuffer:128*1024,stdio:['ignore','pipe','ignore']
  });
  const lines=out.trim().split('\n');
  if(lines.length===1&&lines[0]==='')return false;
  const changes=[];
  for(const line of lines){
   const parts=line.split('\t');
   if(parts.length!==2||!['A','M'].includes(parts[0]))return false;
   changes.push({status:parts[0],path:parts[1]});
  }
  return classifyV5OperatorOnlyChanges(changes);
 }catch{return false;}
}

// Called only from the existing, protected change-scope PR job; never from
// the runtime itself. The return is a conservative CI-scope hint, not a
// release/TEST/worker attestation or build authorization.
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [base,head,...extra]=process.argv.slice(2);
 console.log(extra.length===0&&classifyV5OperatorGitDiff(base,head)?'true':'false');
}
