import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { verifyPinnedTestAndroidToolchain } from '../packages/config/src/android-test-toolchain.mjs';

const tools=['flutter','java','node','pnpm'];
const versions={flutter:'3.47.0',java:'17',node:'22.20.0',pnpm:'10.15.0'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const results={
 flutter:{args:'--version --machine',out:JSON.stringify({frameworkVersion:'3.47.0',channel:'stable'})},
 java:{args:'-version',out:'openjdk version "17.0.13" 2024-10-15'},
 node:{args:'--version',out:'v22.20.0'},
 pnpm:{args:'--version',out:'10.15.0'}
};
async function fixture(role='RESIDENT'){
 const dir=await mkdtemp(join(tmpdir(),'aaraagate-v5512-'));
 try{
  const executables={},sha256={};
  for(const name of tools){
   const file=join(dir,name),r=results[name];
   const script='#!/usr/bin/env node\n' +
    'if(process.argv.slice(2).join(" ")!=='+JSON.stringify(r.args)+')process.exit(4);\n' +
    (name==='java'?'console.error(':'console.log(')+JSON.stringify(r.out)+');\n';
   await writeFile(file,script,{mode:0o700});await chmod(file,0o700);
   executables[name]=file;sha256[name]=hash(await readFile(file));
  }
  const manifest={buildMode:'TEST',appRole:role,sourceSha:'a'.repeat(40),lockDigest:'b'.repeat(64)};
  const plan={manifest,manifestDigest:androidBuildManifestDigest(manifest),
   appDirectory:'apps/'+role.toLowerCase(),testOnly:true,dispatchAllowed:false,
   requiresVersionReservation:true};
  const checkout={testOnly:true,dispatchAllowed:false,checkoutClean:true,
   checkoutVerified:true,runnerAuthenticated:false,manifestDigest:plan.manifestDigest,
   sourceSha:manifest.sourceSha,lockDigest:manifest.lockDigest,appRole:role};
  return {dir,plan,checkout,pins:{executables,sha256,versions:{...versions}}};
 }catch(err){await rm(dir,{recursive:true,force:true});throw err;}
}
for(const role of ['RESIDENT','GUARD'])test('V5.5.12 '+role+' validates real TEST executable SHA and versions',async()=>{
 const x=await fixture(role);
 try{
  const verified=await verifyPinnedTestAndroidToolchain(x.plan,x.checkout,x.pins);
  assert.equal(verified.executableChecksPassed,true);
  assert.equal(verified.verifiedExecutables.flutter.version,'3.47.0');
  assert.equal(verified.verifiedExecutables.java.version,'17');
  assert.equal(verified.verifiedExecutables.node.version,'22.20.0');
  assert.equal(verified.verifiedExecutables.pnpm.version,'10.15.0');
  assert.equal(verified.dispatchAllowed,false);
  assert.equal(verified.runnerAuthenticated,false);
  assert.equal(verified.flutterSdkTreeVerified,false);
  assert.equal(verified.artifactProduced,false);
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
for(const [name,change] of [
 ['wrong flutter version pin',x=>{x.pins.versions.flutter='3.48.0';}],
 ['incorrect byte digest',x=>{x.pins.sha256.java='0'.repeat(64);}],
 ['foreign checked-out source',x=>{x.checkout.sourceSha='0'.repeat(40);}],
 ['untrusted asserted worker auth',x=>{x.checkout.runnerAuthenticated=true;}],
 ['dispatchable plan',x=>{x.plan.dispatchAllowed=true;}],
 ['unexpected secret field',x=>{x.pins.token='unsafe';}],
 ['relative executable',x=>{x.pins.executables.node='node';}]
])test('V5.5.12 fails closed on '+name,async()=>{
 const x=await fixture();
 try{change(x);await assert.rejects(verifyPinnedTestAndroidToolchain(x.plan,x.checkout,x.pins));}
 finally{await rm(x.dir,{recursive:true,force:true});}
});
test('V5.5.12 rejects modified binary even when claimed version matches',async()=>{
 const x=await fixture();
 try{
  const p=x.pins.executables.pnpm;
  await writeFile(p,(await readFile(p,'utf8'))+'\n// tampered');
  await assert.rejects(verifyPinnedTestAndroidToolchain(x.plan,x.checkout,x.pins),/SHA pin/);
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
test('V5.5.12 rejects observed version drift even if the new executable hash is pinned',async()=>{
 const x=await fixture();
 try{
  const p=x.pins.executables.flutter;
  await writeFile(p,(await readFile(p,'utf8')).replace('3.47.0','3.48.0'));
  x.pins.sha256.flutter=hash(await readFile(p));
  await assert.rejects(verifyPinnedTestAndroidToolchain(x.plan,x.checkout,x.pins),/version/);
 }finally{await rm(x.dir,{recursive:true,force:true});}
});
