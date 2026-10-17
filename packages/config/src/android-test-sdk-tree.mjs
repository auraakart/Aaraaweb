import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const NAMES=Object.freeze(['flutterSdk','androidSdk','javaHome','nativeTemplate']);
const SHA=/^[a-f0-9]{64}$/, GIT=/^[a-f0-9]{40}$/;
const WORKER=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const RUN=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const IMAGE=/^sha256:[a-f0-9]{64}$/;
const MAX_FILES=160000, MAX_BYTES=40*1024**3, MAX_FILE=2*1024**3;
const err=m=>{throw new Error(m);};
const exact=(o,fields)=>o && typeof o==='object' &&
 !Array.isArray(o) && Object.getPrototypeOf(o)===Object.prototype &&
 Object.keys(o).sort().join(',')===fields.slice().sort().join(',');
const mode=s=>(s.mode&0o777).toString(8).padStart(3,'0');
const validPath=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p;
const childOf=(child,parent)=>child.startsWith(parent+sep);
const treeHash=async file=>{
 const h=createHash('sha256');
 for await(const buf of createReadStream(file,{highWaterMark:1024*1024})) h.update(buf);
 return h.digest('hex');
};

/**
 * Exhaustive *local byte inventory* of four independent TEST SDK/template roots.
 *
 * Pins (including all four expected full-tree digests) must be supplied from
 * authenticated, independently managed runner IMAGE policy. Do not use any
 * client, partner, build manifest or self-reported worker digest as policy.
 * This requires an already isolated/disposable runner, and neither attests
 * that the claimed image executed nor authorizes build dispatch.
 */
export async function verifyPinnedTestAndroidSdkTrees(plan,checkout,toolchain,acceptance,policy){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !GIT.test(m.sourceSha)||!SHA.test(m.lockDigest))
  err('Invalid TEST SDK inventory plan');
 if(!checkout||checkout.testOnly!==true||checkout.dispatchAllowed!==false||
    checkout.checkoutVerified!==true||checkout.checkoutClean!==true||
    checkout.manifestDigest!==plan.manifestDigest||
    checkout.sourceSha!==m.sourceSha||checkout.lockDigest!==m.lockDigest||
    checkout.appRole!==m.appRole)
  err('Missing pinned TEST source checkout');
 if(!toolchain||toolchain.testOnly!==true||toolchain.dispatchAllowed!==false||
    toolchain.executableChecksPassed!==true||
    toolchain.reportedVersionsMatched!==true||
    toolchain.manifestDigest!==plan.manifestDigest||
    toolchain.sourceSha!==m.sourceSha||toolchain.lockDigest!==m.lockDigest||
    toolchain.appRole!==m.appRole)
  err('Missing TEST executable byte/version proof');
 if(!acceptance||acceptance.testOnly!==true||
    acceptance.status!=='SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION'||
    acceptance.workerSignatureVerified!==true||
    acceptance.serverReplayBarrierVerified!==true||
    acceptance.dispatchAllowed!==false||acceptance.artifactProduced!==false||
    acceptance.manifestDigest!==plan.manifestDigest)
  err('Missing durable TEST signed worker evidence acceptance');
 if(!exact(policy,['workspaceRoot','roots','expectedTrees','workerId','runId','imageDigest'])||
    !validPath(policy.workspaceRoot)||!exact(policy.roots,NAMES)||
    !exact(policy.expectedTrees,NAMES)||
    !WORKER.test(policy.workerId)||!RUN.test(policy.runId)||
    !IMAGE.test(policy.imageDigest)||policy.workerId!==acceptance.workerId||
    policy.runId!==acceptance.runId)
  err('Untrusted independently pinned TEST SDK policy');
 const work=policy.workspaceRoot;
 if(await realpath(work)!==work||!(await lstat(work)).isDirectory())
  err('Untrusted SDK workspace root');
 const paths=[];
 for(const name of NAMES){
  const p=policy.roots[name],pin=policy.expectedTrees[name];
  if(!validPath(p)||!childOf(p,work)||
     !exact(pin,['digest','files','directories','bytes'])||
     !SHA.test(pin.digest)||
     !Number.isSafeInteger(pin.files)||pin.files<1||pin.files>MAX_FILES||
     !Number.isSafeInteger(pin.directories)||pin.directories<1||
     pin.directories>MAX_FILES||
     !Number.isSafeInteger(pin.bytes)||pin.bytes<1||pin.bytes>MAX_BYTES)
   err('Invalid independent TEST SDK root and complete-tree pin');
  if(await realpath(p)!==p||!(await lstat(p)).isDirectory())
   err('SDK tree root is noncanonical or missing');
  paths.push(p);
 }
 for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
  if(paths[i]===paths[j]||childOf(paths[i],paths[j])||childOf(paths[j],paths[i]))
   err('Overlapping pinned TEST SDK roots');
 }
 const results={};
 for(const name of NAMES){
  const root=policy.roots[name],expected=policy.expectedTrees[name];
  const hash=createHash('sha256');
  hash.update('aaraagate:v5.5.16:test-sdk-tree:v1\n','utf8');
  let files=0,directories=0,bytes=0;
  async function walk(dir,relative,depth){
   if(depth>64)err('TEST SDK directory depth exceeded');
   const st=await lstat(dir);
   if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022))
    err('Untrusted writable/link TEST SDK directory');
   directories++;
   if(directories>expected.directories||directories>MAX_FILES)
    err('Unexpected TEST SDK directory count');
   hash.update('D\0'+(relative||'.')+'\0'+mode(st)+'\n','utf8');
   const children=(await readdir(dir,{withFileTypes:true}))
    .sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
   for(const child of children){
    if(child.name==='.'||child.name==='..'||child.name.includes('\\')||
       /[\x00-\x1f\x7f]/.test(child.name))
     err('Unexpected TEST SDK path');
    const rel=relative?relative+'/'+child.name:child.name;
    const path=join(dir,child.name);
    if(child.isSymbolicLink()||(!child.isFile()&&!child.isDirectory()))
     err('Symlink or special node in pinned SDK');
    if(child.isDirectory()){
     await walk(path,rel,depth+1);
    }else{
     const stat=await lstat(path);
     if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
        (stat.mode&0o022)||stat.size>MAX_FILE)
      err('Unsafe TEST SDK file/permission/link/size');
     files++;bytes+=stat.size;
     if(files>expected.files||bytes>expected.bytes||files>MAX_FILES||bytes>MAX_BYTES)
      err('Unapproved extra TEST SDK files/bytes');
     const leaf=await treeHash(path);
     const after=await lstat(path);
     if(after.ino!==stat.ino||after.dev!==stat.dev||
        after.size!==stat.size||after.mtimeMs!==stat.mtimeMs||
        after.ctimeMs!==stat.ctimeMs||after.mode!==stat.mode)
      err('TEST SDK file changed while hashing');
     hash.update('F\0'+rel+'\0'+mode(stat)+'\0'+stat.size+'\0'+leaf+'\n','utf8');
    }
   }
  }
  await walk(root,'',0);
  const observed=hash.digest('hex');
  if(files!==expected.files||directories!==expected.directories||
     bytes!==expected.bytes||observed!==expected.digest)
   err('TEST SDK/template tree differs from independently pinned full inventory');
  results[name]=Object.freeze({digest:observed,files,directories,bytes});
 }
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  appRole:m.appRole,sourceSha:m.sourceSha,lockDigest:m.lockDigest,
  manifestDigest:plan.manifestDigest,
  workerId:acceptance.workerId,runId:acceptance.runId,
  verifiedTrees:Object.freeze(results),
  completeLocalTreeHashesMatched:true,
  sdkTemplateBytesVerified:true,
  runnerTransportAuthenticated:false,runtimeImageAttested:false,
  immutableMountVerified:false,signerVerified:false,archiveVerified:false,
  artifactProduced:false,dispatchAllowed:false,
  requiresIsolatedAuthenticatedTransport:true,
  requiresImmutableMountAndExecutionApproval:true
 });
}
