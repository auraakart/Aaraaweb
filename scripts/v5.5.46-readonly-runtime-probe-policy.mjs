import {isAbsolute, relative, resolve, sep} from 'node:path';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';

const fileFields=['imageEnvelopeFile','imagePolicyFile','runtimePolicyFile',
 'transportPinsFile','caCertificateFile','clientCertificateFile','clientPrivateKeyFile'];
const expected=['schemaVersion','environment','purpose',...fileFields];
const sha=/^[0-9a-f]{40}$/;
const image=/^sha256:[0-9a-f]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const reject=()=>{throw Error('Operator-pinned TEST read-only runtime probe policy rejected');};

export function validateReadOnlyTestRuntimeProbePlan(plan,environment,repositoryRoot){
 if(!exact(plan,expected)||plan.schemaVersion!==1||
    plan.environment!=='TEST'||plan.purpose!=='READ_ONLY_RUNTIME_CLAIM_PROBE'||
    !object(environment)||!isAbsolute(repositoryRoot)||
    environment.NODE_ENV!=='test'||
    environment.AARAAGATE_V5_TEST_RUNTIME_PROBE_CONFIRM!=='I_APPROVE_READ_ONLY_TEST_RUNTIME_PROBE'||
    typeof environment.AARAAGATE_V5_APPROVED_TEST_RUNTIME_ENDPOINT!=='string'||
    typeof environment.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA!=='string'||
    typeof environment.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST!=='string'||
    !sha.test(environment.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA)||
    !image.test(environment.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST))
   reject();
 const root=realpathSync(repositoryRoot);
 const unique=new Set();
 for(const field of fileFields){
  const p=plan[field];
  if(typeof p!=='string'||p.length>1024||!isAbsolute(p)||
     p.includes('\0')||p.includes('..'+sep))reject();
  let resolved,stats;
  try{
   resolved=realpathSync(p);stats=lstatSync(p);
  }catch{reject();}
  if(!stats.isFile()||resolved!==p||unique.has(p))reject();
  const within=relative(root,p);
  if(within===''||(!within.startsWith('..'+sep)&&within!=='..'&&!isAbsolute(within)))
   reject();
  unique.add(p);
  if(field==='clientPrivateKeyFile'&&(stats.mode&0o077)!==0)reject();
 }
 return Object.freeze({
  imageEnvelopeFile:plan.imageEnvelopeFile,imagePolicyFile:plan.imagePolicyFile,
  runtimePolicyFile:plan.runtimePolicyFile,transportPinsFile:plan.transportPinsFile,
  caCertificateFile:plan.caCertificateFile,
  clientCertificateFile:plan.clientCertificateFile,
  clientPrivateKeyFile:plan.clientPrivateKeyFile,
 });
}

function jsonFile(path){
 let contents;
 try{contents=readFileSync(path,'utf8');}catch{reject();}
 if(contents.length>65536)reject();
 try{return JSON.parse(contents);}catch{reject();}
}

export function loadReadOnlyTestRuntimeProbeInputs(files,environment){
 const imageEnvelope=jsonFile(files.imageEnvelopeFile);
 const imagePolicy=jsonFile(files.imagePolicyFile);
 const runtimePolicy=jsonFile(files.runtimePolicyFile);
 const pins=jsonFile(files.transportPinsFile);
 if(!exact(pins,['endpoint','serverName','serverSpkiSha256','clientSpkiSha256'])||
    pins.endpoint!==environment.AARAAGATE_V5_APPROVED_TEST_RUNTIME_ENDPOINT||
    imagePolicy?.sourceSha!==environment.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA||
    imagePolicy?.imageDigest!==environment.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST)
   reject();
 const pem=(path)=>{let bytes;try{bytes=readFileSync(path,'utf8');}catch{reject();}
  if(bytes.length<100||bytes.length>20000)reject();
  return bytes;
 };
 const transportPolicy={...pins,caPem:pem(files.caCertificateFile),
  clientCertPem:pem(files.clientCertificateFile),
  clientKeyPem:pem(files.clientPrivateKeyFile)};
 return {imageEnvelope,imagePolicy,runtimePolicy,transportPolicy};
}
