import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm,chmod,appendFile,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { inspectPinnedTestAndroidApk,parseTestAndroidApkInspectionOutputs } from '../packages/config/src/android-test-apk-inspection.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let n=i;for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;
});
const crc=b=>{let c=0xffffffff;for(const x of b)c=crcTable[(c^x)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function syntheticApk(){
 const names=['AndroidManifest.xml','classes.dex','resources.arsc'];
 const locals=[],centrals=[];let at=0;
 for(const name of names){
  const n=Buffer.from(name),data=Buffer.from('SYNTHETIC NOT ANDROID BINARY '+name),cs=crc(data);
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);
  l.writeUInt32LE(cs,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);
  l.writeUInt16LE(n.length,26);locals.push(l,n,data);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);
  c.writeUInt16LE(20,6);c.writeUInt32LE(cs,16);
  c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);
  c.writeUInt16LE(n.length,28);c.writeUInt32LE(at,42);
  centrals.push(c,n);at+=l.length+n.length+data.length;
 }
 const l=Buffer.concat(locals),c=Buffer.concat(centrals),e=Buffer.alloc(22);
 e.writeUInt32LE(0x06054b50);e.writeUInt16LE(3,8);e.writeUInt16LE(3,10);
 e.writeUInt32LE(c.length,12);e.writeUInt32LE(l.length,16);
 return Buffer.concat([l,c,e]);
}
const fingerprint='a'.repeat(64);
const packageName='in.fixture.partner.resident';
const goodBadging="package: name='"+packageName+"' versionCode='101' versionName='1.0'\n"+
 "sdkVersion:'24'\ntargetSdkVersion:'36'\nnative-code: 'arm64-v8a' 'x86_64'\n";
const goodSigning="Verifies\nVerified using v2 scheme (APK Signature Scheme v2): true\n"+
 "Signer #1 certificate SHA-256 digest: "+fingerprint+"\nNumber of signers: 1\n";
const expected={applicationId:packageName,versionCode:101,signerFingerprint:fingerprint,
 allowedAbis:['arm64-v8a','x86_64']};
test('V5.5.25 parses exact TEST APK package, SDK, ABI and pinned signer tool reports without authorizing artifact',()=>{
 const got=parseTestAndroidApkInspectionOutputs(goodBadging,goodSigning,expected);
 assert.equal(got.packageAndVersionReportedMatched,true);
 assert.equal(got.apkV2SchemeReportedVerified,true);
 assert.deepEqual(got.reportedAbis,['arm64-v8a','x86_64']);
 assert.equal(got.toolOriginAuthenticated,false);
 assert.equal(got.artifactApproved,false);
 assert.equal(got.dispatchAllowed,false);
});
for(const [name,change] of [
 ['wrong package',(a,b,p)=>[a.replace(packageName,'in.fake.other.resident'),b,p]],
 ['wrong reserved version',(a,b,p)=>[a.replace("versionCode='101'","versionCode='102'"),b,p]],
 ['minSDK below 24',(a,b,p)=>[a.replace("sdkVersion:'24'","sdkVersion:'23'"),b,p]],
 ['targetSDK drift',(a,b,p)=>[a.replace("targetSdkVersion:'36'","targetSdkVersion:'35'"),b,p]],
 ['missing ARM64 ABI',(a,b,p)=>[a.replace("'arm64-v8a' ",''),b,p]],
 ['untrusted ABI',(a,b,p)=>[a.replace("'x86_64'","'mips'"),b,p]],
 ['foreign signer',(a,b,p)=>[a,b.replace(fingerprint,'b'.repeat(64)),p]],
 ['multiple signers',(a,b,p)=>[a,b.replace('Number of signers: 1','Number of signers: 2'),p]],
 ['no verified v2 signature',(a,b,p)=>[a,b.replace('Scheme v2): true','Scheme v2): false'),p]],
 ['duplicate package line',(a,b,p)=>[a+a.split('\n')[0]+'\n',b,p]],
 ['extra signer warning',(a,b,p)=>[a,b+'\nWARNING: invalid v1 scheme\n',p]],
 ['caller changes approved signer',(a,b,p)=>[a,b,{...p,signerFingerprint:'b'.repeat(64)}]]
])test('V5.5.25 rejects '+name,()=>{
 const [a,b,p]=change(goodBadging,goodSigning,expected);
 assert.throws(()=>parseTestAndroidApkInspectionOutputs(a,b,p));
});
async function setup(){
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5525-local-'));
 const distributionId='11111111-1111-4111-8111-111111111111';
 const m={schemaVersion:1,buildMode:'TEST',distributionId,
  applicationId:packageName,namespace:packageName,appRole:'RESIDENT',
  sourceSha:'b'.repeat(40),lockDigest:'c'.repeat(64),signerFingerprint:fingerprint};
 const digest=androidBuildManifestDigest(m);
 const plan={testOnly:true,dispatchAllowed:false,requiresVersionReservation:true,
  manifest:m,manifestDigest:digest,appDirectory:'apps/resident'};
 const reservation={id:'55555555-5555-4555-8555-555555555555',
  status:'RESERVED_TEST_ONLY',digest,versionCode:101,testOnly:true,dispatchAllowed:false};
 const filename='test-'+distributionId+'-resident.apk',artifact=join(root,filename);
 await writeFile(artifact,syntheticApk(),{mode:0o600});
 const executables={},digests={};
 for(const [name,output] of [['aapt2',goodBadging],['apksigner',goodSigning]]){
  const file=join(root,name);
  // Synthetic pinned fixture only; not a genuine Android SDK tool.
  const body='#!'+process.execPath+'\nprocess.stdout.write('+JSON.stringify(output)+');\n';
  await writeFile(file,body,{mode:0o700});
  await chmod(file,0o700);
  executables[name]=file;digests[name]=sha(Buffer.from(body));
 }
 return {root,plan,reservation,location:{root,filename,format:'APK'},
  pins:{executables,sha256:digests,allowedAbis:['arm64-v8a','x86_64'],
   signerFingerprint:fingerprint},artifact};
}
test('V5.5.25 executes fixed read-only inspection commands against synthetic TEST APK',async()=>{
 const f=await setup();
 try{
  const got=await inspectPinnedTestAndroidApk(f.plan,f.reservation,f.location,f.pins);
  assert.equal(got.pinnedInspectionExecutablesVerified,true);
  assert.equal(got.localApkToolInspectionPassed,true);
  assert.equal(got.independentlyAttestedRunner,false);
  assert.equal(got.actualSignerVerifiedByTrustedAttestedRunner,false);
  assert.equal(got.artifactPublished,false);
  assert.equal(got.dispatchAllowed,false);
  assert.equal(got.sha256,sha(syntheticApk()));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
for(const [name,change] of [
 ['mutated pinned tool',async f=>appendFile(f.pins.executables.apksigner,'\n//unexpected')],
 ['wrong independent certificate pin',async f=>{f.pins.signerFingerprint='b'.repeat(64);}],
 ['unsafe tool permissions',async f=>chmod(f.pins.executables.aapt2,0o777)],
 ['foreign source',async f=>{f.plan={...f.plan,manifest:{...f.plan.manifest,sourceSha:'0'.repeat(40)}};}],
 ['wrong TEST artifact filename',async f=>{f.location.filename='test-foreign.apk';}],
 ['corrupt candidate APK',async f=>appendFile(f.artifact,'malicious')],
 ['build dispatch flag',async f=>{f.plan={...f.plan,dispatchAllowed:true};}],
 ['unapproved executable path',async f=>{f.pins.executables.aapt2='/bin/true';}]
])test('V5.5.25 fails closed on '+name,async()=>{
 const f=await setup();
 try{await change(f);await assert.rejects(inspectPinnedTestAndroidApk(f.plan,f.reservation,f.location,f.pins));}
 finally{await rm(f.root,{recursive:true,force:true});}
});
