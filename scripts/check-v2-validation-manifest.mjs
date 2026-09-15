import { access, readFile } from 'node:fs/promises';

const manifestPath='docs/v2-validation-manifest.json';
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const fail=message=>{throw new Error(`V2 validation manifest: ${message}`)};
const requiredPersonas=['ACCOUNTANT_TREASURER','COMMITTEE','FACILITY','SECURITY_SUPERVISOR','AUDITOR'];
const requiredDomains=['V2-FIN','V2-OCC','V2-GOV','V2-EMR','V2-PRV','V2-PAY','V2-RBAC','V2-FAC','V2-VND','V2-DOC','V2-HLP','V2-COM','V2-AMN','V2-PRC','V2-PRK','V2-UTL','V2-ANL'];
const requiredGates=['V24-ROLE-UAT','V24-POLICY-PILOT','V24-MIGRATIONS','V24-BACKUP-RESTORE','V24-SECURITY-PRIVACY','V24-PILOT-ACCEPTANCE'];
const kinds=new Set(['AUTOMATED','MANUAL_REQUIRED','PILOT_REQUIRED']);
const statuses=new Set(['PENDING','AUTOMATED_EVIDENCE_AVAILABLE','ACCEPTED']);

if(manifest.schemaVersion!=='aaraagate.v2.validation.v1')fail('unexpected schemaVersion');
if(manifest.phase!=='V2.4')fail('phase must remain V2.4');
if(manifest.releaseDecision!=='NOT_YET_APPROVED')fail('releaseDecision may only change through explicit release governance');
for(const persona of requiredPersonas)if(!manifest.requiredPersonas?.includes(persona))fail(`missing required persona ${persona}`);
for(const domain of requiredDomains)if(!manifest.requiredDomains?.includes(domain))fail(`missing required domain ${domain}`);
if(!Array.isArray(manifest.gates))fail('gates must be an array');
const ids=new Set(manifest.gates.map(g=>g.id));
if(ids.size!==manifest.gates.length)fail('gate ids must be unique');
for(const id of requiredGates)if(!ids.has(id))fail(`missing required gate ${id}`);

for(const gate of manifest.gates){
  if(!kinds.has(gate.kind))fail(`${gate.id} has unsupported kind ${gate.kind}`);
  if(!statuses.has(gate.status))fail(`${gate.id} has unsupported status ${gate.status}`);
  if(gate.status==='ACCEPTED'&&(!Array.isArray(gate.evidence)||gate.evidence.length===0))fail(`${gate.id} cannot be ACCEPTED without evidence`);
  if(gate.kind==='AUTOMATED'){
    if(gate.status!=='AUTOMATED_EVIDENCE_AVAILABLE'&&gate.status!=='ACCEPTED')fail(`${gate.id} automated gate must expose automated evidence status`);
    if(!Array.isArray(gate.evidence)||gate.evidence.length===0)fail(`${gate.id} automated gate requires evidence paths`);
  }
  for(const path of gate.evidence??[]){
    if(typeof path!=='string'||path.startsWith('/')||path.includes('..'))fail(`${gate.id} has unsafe evidence path`);
    try{await access(path)}catch{fail(`${gate.id} evidence path does not exist: ${path}`)}
  }
  for(const persona of gate.requiredPersonas??[])if(!manifest.requiredPersonas.includes(persona))fail(`${gate.id} references unknown persona ${persona}`);
  for(const domain of gate.requiredDomains??[])if(!manifest.requiredDomains.includes(domain))fail(`${gate.id} references unknown domain ${domain}`);
}

const roleGate=manifest.gates.find(g=>g.id==='V24-ROLE-UAT');
for(const persona of requiredPersonas)if(!roleGate.requiredPersonas?.includes(persona))fail(`role UAT gate does not cover ${persona}`);
const manualOrPilot=manifest.gates.filter(g=>g.kind!=='AUTOMATED');
if(manualOrPilot.every(g=>g.status==='ACCEPTED')&&manifest.releaseDecision==='NOT_YET_APPROVED'){
  console.log('All manual/pilot V2.4 gates are accepted; release promotion still requires explicit governance approval.');
}
console.log(`V2 validation manifest OK: ${manifest.gates.length} gates, ${manifest.requiredPersonas.length} personas, ${manifest.requiredDomains.length} domains.`);
