import { readFile } from 'node:fs/promises';

const manifestPath='docs/v4.28-pilot-evidence.json';
const recordPath=process.argv[2]??'docs/v4.29-pilot-evidence-record.example.json';
const fail=(message)=>{throw new Error(`V4.29 pilot evidence capture: ${message}`);};
const readJson=async(path)=>JSON.parse(await readFile(path,'utf8'));

const [manifest,record]=await Promise.all([readJson(manifestPath),readJson(recordPath)]);
const schema='aaraagate.v4.29.pilot-evidence-record.v1';
const evidenceTypes=new Set(['KPI','ACCEPTANCE_SCRIPT','EXTERNAL_PROOF','TRAINING','SIGN_OFF']);
const fieldDispositions=new Set(['PASS','FAIL','BLOCKED','OBSERVED','NEEDS_FOLLOW_UP']);
const shaOk=(value)=>typeof value==='string'&&/^[0-9a-f]{40}$/i.test(value);
const isoOk=(value)=>typeof value==='string'&&!Number.isNaN(Date.parse(value));
const nonEmpty=(value)=>typeof value==='string'&&value.trim().length>0;

if(record.schemaVersion!==schema)fail('unexpected schemaVersion');
if(!['FIELD','SYNTHETIC_EXAMPLE'].includes(record.evidenceClass))fail('evidenceClass must be FIELD or SYNTHETIC_EXAMPLE');
if(!evidenceTypes.has(record.evidenceType))fail(`invalid evidenceType ${record.evidenceType??''}`);
for(const key of ['pilotIdentifier','referenceId','ownerRole','expectedThreshold','observedResult','disposition','artifactReference']){
  if(!nonEmpty(record[key]))fail(`${key} is required`);
}
if(!shaOk(record.candidateSha))fail('candidateSha must be a 40-character commit SHA');
if(!isoOk(record.windowStart)||!isoOk(record.windowEnd))fail('windowStart/windowEnd must be ISO-parseable timestamps');
if(Date.parse(record.windowEnd)<Date.parse(record.windowStart))fail('windowEnd cannot precede windowStart');
if(typeof record.notes!=='undefined'&&!nonEmpty(record.notes))fail('notes must be omitted or non-empty');

const ids={
  KPI:new Set((manifest.kpis??[]).map(item=>item.id)),
  ACCEPTANCE_SCRIPT:new Set(Object.keys(manifest.acceptanceScripts??{})),
  EXTERNAL_PROOF:new Set(Object.keys(manifest.externalProofs??{})),
  TRAINING:new Set(Object.keys(manifest.training??{})),
  SIGN_OFF:new Set(Object.keys(manifest.signOff??{})),
};
if(!ids[record.evidenceType].has(record.referenceId)){
  fail(`referenceId ${record.referenceId} is not defined for ${record.evidenceType} in the V4.28 manifest`);
}

const forbiddenKey=/resident.?name|phone|mobile|email|visitor.?credential|visitor.?code|access.?token|refresh.?token|password|secret|card.?number|upi.?id/i;
const walk=(value,path='record')=>{
  if(Array.isArray(value)){value.forEach((item,index)=>walk(item,`${path}[${index}]`));return;}
  if(value&&typeof value==='object'){
    for(const [key,item] of Object.entries(value)){
      if(forbiddenKey.test(key))fail(`privacy-unsafe field key at ${path}.${key}`);
      walk(item,`${path}.${key}`);
    }
    return;
  }
  if(typeof value==='string'){
    if(/\bBearer\s+[A-Za-z0-9._-]+/i.test(value)||/\bsk-[A-Za-z0-9_-]{12,}\b/.test(value)){
      fail(`credential-like value at ${path}`);
    }
  }
};
walk(record);

if(record.evidenceClass==='SYNTHETIC_EXAMPLE'){
  if(!record.pilotIdentifier.startsWith('SYNTHETIC_'))fail('synthetic example pilotIdentifier must start with SYNTHETIC_');
  if(record.disposition!=='EXAMPLE_ONLY')fail('synthetic example disposition must be EXAMPLE_ONLY');
  if(record.artifactReference!=='synthetic://example-only')fail('synthetic example artifactReference must remain synthetic://example-only');
}else{
  if(record.pilotIdentifier.startsWith('SYNTHETIC_'))fail('FIELD evidence cannot use a synthetic pilot identifier');
  if(!fieldDispositions.has(record.disposition))fail(`invalid FIELD disposition ${record.disposition}`);
  if(record.artifactReference.startsWith('synthetic://'))fail('FIELD evidence cannot reference synthetic artifacts');
}

console.log(`V4.29 pilot evidence record OK: ${record.evidenceType}/${record.referenceId}; class ${record.evidenceClass}.`);
