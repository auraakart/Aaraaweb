import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { verifyPinnedTestAndroidCheckout } from '../packages/config/src/android-test-pinned-checkout.mjs';

const git=(root,...args)=>execFileSync('git',['-C',root,...args],
 {encoding:'utf8',env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}}).trim();
async function fixture(role='RESIDENT') {
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5510-'));
 try{
  git(root,'init','-q');
  git(root,'config','user.name','Aaraagate Contract');
  git(root,'config','user.email','test@invalid.example');
  const lock=Buffer.from('lockfileVersion: 9.0\nsettings: {}\n','utf8');
  await writeFile(join(root,'pnpm-lock.yaml'),lock);
  git(root,'add','pnpm-lock.yaml');git(root,'commit','-qm','Test pinned source');
  const sourceSha=git(root,'rev-parse','HEAD');
  const lockDigest=createHash('sha256').update(lock).digest('hex');
  const manifest={buildMode:'TEST',appRole:role,sourceSha,lockDigest};
  const plan={manifest,manifestDigest:androidBuildManifestDigest(manifest),
   appDirectory:'apps/'+role.toLowerCase(),testOnly:true,dispatchAllowed:false,
   requiresVersionReservation:true};
  return {root,plan,pin:{checkoutRoot:root,pinnedSourceSha:sourceSha,pinnedLockDigest:lockDigest}};
 }catch(error){await rm(root,{recursive:true,force:true});throw error;}
}
for(const role of ['RESIDENT','GUARD']) test('V5.5.10 verifies actual '+role+' TEST git HEAD, clean tree and lock bytes only',async()=>{
 const x=await fixture(role);
 try{
  const result=await verifyPinnedTestAndroidCheckout(x.plan,x.pin);
  assert.equal(result.checkoutVerified,true);
  assert.equal(result.runnerAuthenticated,false);
  assert.equal(result.toolchainVerified,false);
  assert.equal(result.dispatchAllowed,false);
  assert.equal(result.artifactProduced,false);
  assert.equal(result.sourceSha,x.pin.pinnedSourceSha);
 }finally{await rm(x.root,{recursive:true,force:true});}
});
test('V5.5.10 denies forged pins, source changes, dirty and untracked checkouts',async()=>{
 const x=await fixture();
 try{
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,{...x.pin,pinnedSourceSha:'0'.repeat(40)}));
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,{...x.pin,pinnedLockDigest:'0'.repeat(64)}));
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,{...x.pin,authorizationToken:'unsafe'}));
  await assert.rejects(verifyPinnedTestAndroidCheckout({...x.plan,dispatchAllowed:true},x.pin));
  await assert.rejects(verifyPinnedTestAndroidCheckout({...x.plan,manifest:{...x.plan.manifest,sourceSha:'0'.repeat(40)}},x.pin));
  await writeFile(join(x.root,'untracked.txt'),'not trusted');
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,x.pin),/dirty/);
  await rm(join(x.root,'untracked.txt'));
  await writeFile(join(x.root,'pnpm-lock.yaml'),'changed but not committed');
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,x.pin),/dirty/);
 }finally{await rm(x.root,{recursive:true,force:true});}
});
test('V5.5.10 rejects symlink dependency locks and nested checkout roots',async()=>{
 const x=await fixture();
 try {
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,{...x.pin,checkoutRoot:join(x.root,'.git')}));
  await rename(join(x.root,'pnpm-lock.yaml'),join(x.root,'lock-original'));
  await symlink('lock-original',join(x.root,'pnpm-lock.yaml'));
  await assert.rejects(verifyPinnedTestAndroidCheckout(x.plan,x.pin));
 }finally{await rm(x.root,{recursive:true,force:true});}
});
