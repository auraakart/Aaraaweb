import {createHash} from 'node:crypto';
import {constants,closeSync,fstatSync,lstatSync,openSync,readSync,realpathSync} from 'node:fs';
import {isAbsolute,relative,resolve,sep} from 'node:path';

const fileFields=['imageEnvelopeFile','imagePolicyFile','runtimePolicyFile',
 'transportPinsFile','caCertificateFile','clientCertificateFile','clientPrivateKeyFile'];
const expected=['schemaVersion','environment','purpose',...fileFields];
const sha=/^[0-9a-f]{40}$/;
const image=/^sha256:[0-9a-f]{64}$/;
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const exact=(v,keys)=>object(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
const reject=()=>{throw Error('Operator-pinned TEST read-only runtime probe policy rejected');};
const MAX_FILE_BYTES=65536;
// Private to this module. A fabricated object cannot bypass plan validation.
const validatedFiles=new WeakMap();

function readPinnedFile(path,prior){
 let fd;
 try{
  // Reject symlinked components, not just a symlink at the leaf.
  const before=lstatSync(path);
  if(!before.isFile()||realpathSync(path)!==path||
     before.size<=0||before.size>MAX_FILE_BYTES)reject();
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const opened=fstatSync(fd);
  if(!opened.isFile()||opened.dev!==before.dev||opened.ino!==before.ino||
     opened.size!==before.size||opened.size>MAX_FILE_BYTES)reject();
  const chunks=[];
  const buffer=Buffer.allocUnsafe(8192);
  let count=0;
  while(true){
   const n=readSync(fd,buffer,0,buffer.length,null);
   if(n===0)break;
   count+=n;
   if(count>MAX_FILE_BYTES)reject();
   chunks.push(Buffer.from(buffer.subarray(0,n)));
  }
  const ended=fstatSync(fd);
  const current=lstatSync(path);
  if(count!==opened.size||current.dev!==opened.dev||current.ino!==opened.ino||
     realpathSync(path)!==path||
     ended.dev!==opened.dev||ended.ino!==opened.ino||
     ended.mode!==opened.mode||ended.size!==opened.size||
     ended.mtimeMs!==opened.mtimeMs||ended.ctimeMs!==opened.ctimeMs)reject();
  const bytes=Buffer.concat(chunks);
  const proof=Object.freeze({
   dev:opened.dev,ino:opened.ino,size:opened.size,mode:opened.mode,
   mtimeMs:opened.mtimeMs,ctimeMs:opened.ctimeMs,
   digest:createHash('sha256').update(bytes).digest('hex')
  });
  if(prior&&Object.keys(proof).some(k=>proof[k]!==prior[k]))reject();
  return {proof,text:bytes.toString('utf8')};
 }catch{reject();}
 finally{if(fd!==undefined)closeSync(fd);}
}

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
    !image.test(environment.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST))reject();
 const root=realpathSync(repositoryRoot);
 const uniquePaths=new Set(),uniqueInodes=new Set(),proofs={};
 for(const field of fileFields){
  const p=plan[field];
  if(typeof p!=='string'||p.length>1024||!isAbsolute(p)||
     p!==resolve(p)||p.includes('\0')||p.includes('..'+sep))reject();
  const within=relative(root,p);
  if(within===''||(!within.startsWith('..'+sep)&&within!=='..'&&!isAbsolute(within)))
   reject();
  if(uniquePaths.has(p))reject();
  const {proof}=readPinnedFile(p);
  const inode=String(proof.dev)+':'+String(proof.ino);
  if(uniqueInodes.has(inode))reject();
  uniquePaths.add(p);uniqueInodes.add(inode);
  if(field==='clientPrivateKeyFile'&&(proof.mode&0o077)!==0)reject();
  proofs[field]=proof;
 }
 const files=Object.freeze(Object.fromEntries(fileFields.map(f=>[f,plan[f]])));
 validatedFiles.set(files,Object.freeze(proofs));
 return files;
}

function parseJson(text){
 try{return JSON.parse(text);}catch{reject();}
}

export function loadReadOnlyTestRuntimeProbeInputs(files,environment){
 const proofs=validatedFiles.get(files);
 if(!proofs||!Object.isFrozen(files)||!object(environment)||
    environment.NODE_ENV!=='test'||
    environment.AARAAGATE_V5_TEST_RUNTIME_PROBE_CONFIRM!=='I_APPROVE_READ_ONLY_TEST_RUNTIME_PROBE')
  reject();
 const contents={};
 for(const field of fileFields){
  const p=files[field];
  if(typeof p!=='string'||p!==resolve(p))reject();
  const {text,proof}=readPinnedFile(p,proofs[field]);
  if(field==='clientPrivateKeyFile'&&(proof.mode&0o077)!==0)reject();
  contents[field]=text;
 }
 const imageEnvelope=parseJson(contents.imageEnvelopeFile);
 const imagePolicy=parseJson(contents.imagePolicyFile);
 const runtimePolicy=parseJson(contents.runtimePolicyFile);
 const pins=parseJson(contents.transportPinsFile);
 if(!exact(pins,['endpoint','serverName','serverSpkiSha256','clientSpkiSha256'])||
    pins.endpoint!==environment.AARAAGATE_V5_APPROVED_TEST_RUNTIME_ENDPOINT||
    imagePolicy?.sourceSha!==environment.AARAAGATE_V5_APPROVED_TEST_SOURCE_SHA||
    imagePolicy?.imageDigest!==environment.AARAAGATE_V5_APPROVED_TEST_IMAGE_DIGEST)
   reject();
 const pem=text=>{
  if(text.length<100||text.length>20000)reject();
  return text;
 };
 const transportPolicy={...pins,caPem:pem(contents.caCertificateFile),
  clientCertPem:pem(contents.clientCertificateFile),
  clientKeyPem:pem(contents.clientPrivateKeyFile)};
 return {imageEnvelope,imagePolicy,runtimePolicy,transportPolicy};
}
