import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, mkdir, writeFile, chmod, rm, symlink, link, appendFile, readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { verifyPinnedTestAndroidSdkTrees } from '../packages/config/src/android-test-sdk-tree.mjs';

const NAMES=['flutterSdk','androidSdk','javaHome','nativeTemplate'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const mode=s=>(s.mode&0o777).toString(8).padStart(3,'0');
async function expectedTree(root){
 const h=createHash('sha256');
 h.update('aaraagate:v5.5.16:test-sdk-tree:v1\n');
 let files=0,directories=0,bytes=0;
 async function walk(dir,relative){
  const s=await lstat(dir);directories++;
  h.update('D\0'+(relative||'.')+'\0'+mode(s)+'\n');
  const children=(await readdir(dir,{withFileTypes:true}))
   .sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const e of children){
   const rel=relative?relative+'/'+e.name:e.name,loc=join(dir,e.name);
   if(e.isDirectory()){await walk(loc,rel);continue;}
   const stat=await lstat(loc);
   const leaf=createHash('sha256');
   for await(const data of createReadStream(loc))leaf.update(data);
   files++;bytes+=stat.size;
   h.update('F\0'+rel+'\0'+mode(stat)+'\0'+stat.size+'\0'+leaf.digest('hex')+'\n');
  }
 }
 await walk(root,'');
 return {digest:h.digest('hex'),files,directories,bytes};
}
async function fixture(role='RESIDENT'){
 const workspaceRoot=await mkdtemp(join(tmpdir(),'aaraagate-v5516-test-'));
 try{
  const roots={},expectedTrees={};
  for(const name of NAMES){
   const root=join(workspaceRoot,name);await mkdir(root,{mode:0o700});
   await mkdir(join(root,'bin'),{mode:0o700});
   await writeFile(join(root,'README.txt'),'Verified fixture for '+name,{mode:0o600});
   await writeFile(join(root,'bin','tool.txt'),'binary-'+name,{mode:0o600});
   roots[name]=root;
   expectedTrees[name]=await expectedTree(root);
  }
  const manifest={schemaVersion:1,buildMode:'TEST',appRole:role,
   sourceSha:'a'.repeat(40),lockDigest:'b'.repeat(64)};
  const manifestDigest=androidBuildManifestDigest(manifest);
  const plan={manifest,manifestDigest,appDirectory:'apps/'+role.toLowerCase(),
   testOnly:true,dispatchAllowed:false,requiresVersionReservation:true};
  const checkout={testOnly:true,dispatchAllowed:false,checkoutVerified:true,
   checkoutClean:true,manifestDigest,sourceSha:manifest.sourceSha,
   lockDigest:manifest.lockDigest,appRole:role};
  const toolchain={testOnly:true,dispatchAllowed:false,executableChecksPassed:true,
   reportedVersionsMatched:true,manifestDigest,sourceSha:manifest.sourceSha,
   lockDigest:manifest.lockDigest,appRole:role};
  const acceptance={testOnly:true,dispatchAllowed:false,
   status:'SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION',
   workerSignatureVerified:true,serverReplayBarrierVerified:true,
   artifactProduced:false,manifestDigest,workerId:'TEST_WORKER_CI_01',
   runId:'TEST_RUN_CI_01'};
  const policy={workspaceRoot,roots,expectedTrees,workerId:acceptance.workerId,
   runId:acceptance.runId,imageDigest:'sha256:'+'f'.repeat(64)};
  return {workspaceRoot,plan,checkout,toolchain,acceptance,policy};
 }catch(e){await rm(workspaceRoot,{recursive:true,force:true});throw e;}
}
const verify=x=>verifyPinnedTestAndroidSdkTrees(x.plan,x.checkout,x.toolchain,x.acceptance,x.policy);
for(const role of ['RESIDENT','GUARD'])
 test('V5.5.16 '+role+' verifies every local TEST SDK/template file and stays non-dispatchable',async()=>{
  const x=await fixture(role);
  try{
   const receipt=await verify(x);
   assert.equal(receipt.sdkTemplateBytesVerified,true);
   assert.equal(receipt.completeLocalTreeHashesMatched,true);
   assert.equal(Object.keys(receipt.verifiedTrees).length,4);
   assert.equal(receipt.verifiedTrees.nativeTemplate.files,2);
   assert.equal(receipt.runnerTransportAuthenticated,false);
   assert.equal(receipt.runtimeImageAttested,false);
   assert.equal(receipt.dispatchAllowed,false);
   assert.equal(receipt.artifactProduced,false);
  }finally{await rm(x.workspaceRoot,{recursive:true,force:true});}
 });
for(const [name,mutate] of [
 ['invalid image policy',async x=>{x.policy.imageDigest='latest';}],
 ['wrong trusted worker',async x=>{x.policy.workerId='TEST_WORKER_FOREIGN';}],
 ['wrong trusted run',async x=>{x.policy.runId='TEST_RUN_FOREIGN';}],
 ['self-added request field',async x=>{x.policy.secrets='do not accept';}],
 ['untrusted source',async x=>{x.checkout.sourceSha='0'.repeat(40);}],
 ['unsigned acceptance',async x=>{x.acceptance.workerSignatureVerified=false;}],
 ['replay not consumed',async x=>{x.acceptance.serverReplayBarrierVerified=false;}],
 ['attempt to dispatch',async x=>{x.plan.dispatchAllowed=true;}],
 ['tampered file',async x=>{await appendFile(join(x.policy.roots.flutterSdk,'README.txt'),'\nchanged');}],
 ['additional file',async x=>{await writeFile(join(x.policy.roots.androidSdk,'bin','unreviewed'),'x');}],
 ['removed inventory file',async x=>{await rm(join(x.policy.roots.javaHome,'bin','tool.txt'));}],
 ['extra directory',async x=>{await mkdir(join(x.policy.roots.nativeTemplate,'new'));}],
 ['untrusted claimed digest',async x=>{x.policy.expectedTrees.flutterSdk.digest='0'.repeat(64);}],
 ['root symlink',async x=>{const path=x.policy.roots.flutterSdk;await symlink(path,join(x.workspaceRoot,'link'));x.policy.roots.flutterSdk=join(x.workspaceRoot,'link');}],
 ['nested SDK roots',async x=>{x.policy.roots.nativeTemplate=join(x.policy.roots.flutterSdk,'bin');}],
 ['world-writable file',async x=>{await chmod(join(x.policy.roots.androidSdk,'README.txt'),0o666);}],
 ['hardlinked inventory file',async x=>{await link(join(x.policy.roots.flutterSdk,'README.txt'),join(x.workspaceRoot,'hardlink'));}]
])test('V5.5.16 rejects '+name,async()=>{
 const x=await fixture();
 try{await mutate(x);await assert.rejects(verify(x));}
 finally{await rm(x.workspaceRoot,{recursive:true,force:true});}
});
