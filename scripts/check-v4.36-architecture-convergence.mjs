import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
  const full=path.join(dir,e.name);
  return e.isDirectory()?walk(full):[full];
});
const problems=[];
const requireText=(file,text,message)=>{if(!read(file).includes(text))problems.push(message)};

for(const token of ["@aaraagate/api-client","@aaraagate/config","@aaraagate/types"]){
  requireText('apps/admin/lib/aaraagate-api.ts',token,`Shared Admin API wrapper is missing ${token}`);
}
for(const page of ['operations-control','helpdesk','finance','governance']){
  requireText(`apps/admin/app/${page}/page.tsx`,'lib/aaraagate-api',`${page} has not converged on the shared API wrapper`);
}
const adminFiles=walk(path.join(root,'apps/admin/app')).filter(file=>/\.(ts|tsx)$/.test(file));
const helperCount=adminFiles.reduce((sum,file)=>sum+(fs.readFileSync(file,'utf8').match(/async function api</g)?.length??0),0);
if(helperCount>52)problems.push(`Legacy Admin API helper count regressed: ${helperCount} > 52`);

requireText('apps/resident/lib/screens/services_screen.dart','ServiceOfferingSummary','Resident Services still bypasses the typed catalogue boundary');
requireText('apps/guard/lib/screens/guard_quick_arrival_screen.dart','GuardUnitSummary','Guard quick arrival still bypasses the typed unit boundary');
if(!fs.existsSync(path.join(root,'docs/CURRENT-CAPABILITY-INDEX.md')))problems.push('Current capability index is missing');
if(!fs.existsSync(path.join(root,'docs/api-contract-policy.json')))problems.push('API contract policy is missing');

for(const doc of [
  'docs/CONSUMER-PROVIDER-SELF-SERVICE.md',
  'docs/PROVIDER-BOOKING-ACCEPTANCE.md',
  'docs/PROVIDER-AVAILABILITY-SELF-SERVICE.md',
  'docs/CONSUMER-SERVICE-COMPLETION.md',
  'docs/CONSUMER-SERVICE-PAYMENT-READINESS.md'
]){
  requireText(doc,'Superseded for current-state review by V4.35',`${doc} is missing a supersession notice`);
}
if(problems.length){
  for(const problem of problems)console.error(problem);
  process.exit(1);
}
console.log(`V4.36 architecture convergence clean; legacy Admin API helpers capped at ${helperCount} and cannot increase.`);
