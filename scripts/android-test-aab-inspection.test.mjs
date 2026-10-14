import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm,appendFile,chmod,symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import {
 inspectPinnedTestAndroidAab,parseTestAndroidAabManifestValues
} from '../packages/config/src/android-test-aab-inspection.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let n=i;for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;
});
const crc=b=>{
 let n=0xffffffff;for(const byte of b)n=crcTable[(n^byte)&255]^(n>>>8);
 return (n^0xffffffff)>>>0;
};
function fakeAab(){
 const names=['BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex'];
 const locals=[],centrals=[];let offset=0;
 for(const name of names){
  const n=Buffer.from(name),body=Buffer.from('SYNTHETIC TEST AAB '+name),sum=crc(body);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);
  local.writeUInt16LE(20,4);local.writeUInt32LE(sum,14);
  local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);
  local.writeUInt16LE(n.length,26);
  locals.push(local,n,body);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
  central.writeUInt32LE(sum,16);central.writeUInt32LE(body.length,20);
  central.writeUInt32LE(body.length,24);central.writeUInt16LE(n.length,28);
  central.writeUInt32LE(offset,42);centrals.push(central,n);
  offset+=local.length+n.length+body.length;
 }
 const local=Buffer.concat(locals),central=Buffer.concat(centrals),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);
 end.writeUInt32LE(central.length,12);end.writeUInt32LE(local.length,16);
 return Buffer.concat([local,central,end]);
}
const packageName='in.fixture.partner.guard';
const values={package:packageName,versionCode:'101',minSdk:'24',targetSdk:'36'};
test('V5.5.27 parses exact bundletool manifest identity but grants no signing authority',()=>{
 const result=parseTestAndroidAabManifestValues(values,{applicationId:packageName,versionCode:101});
 assert.equal(result.bundletoolPackageReportedMatched,true);
 assert.equal(result.signerVerified,false);
 assert.equal(result.runnerAttested,false);
 assert.equal(result.dispatchAllowed,false);
});
for(const [name,mutation] of [
 ['wrong package',x=>({...x,package:'in.other.app'})],
 ['wrong version',x=>({...x,versionCode:'102'})],
 ['min SDK drift',x=>({...x,minSdk:'23'})],
 ['target SDK drift',x=>({...x,targetSdk:'35'})],
 ['duplicate stdout line',x=>({...x,package:x.package+'\\n'+x.package})],
 ['untrimmed version',x=>({...x,versionCode:' 101'})],
 ['unknown manifest property',x=>({...x,debuggable:'true'})]
])test('V5.5.27 rejects '+name,()=>{
 assert.throws(()=>parseTestAndroidAabManifestValues(mutation(values),
  {applicationId:packageName,versionCode:101}));
});
async function setup(role='GUARD',result=values){
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5527-'));
 const m={schemaVersion:1,buildMode:'TEST',appRole:role,
  distributionId:'11111111-1111-4111-8111-111111111111',
  applicationId:packageName,namespace:packageName,sourceSha:'b'.repeat(40),
  lockDigest:'c'.repeat(64)};
 const digest=androidBuildManifestDigest(m);
 const plan={testOnly:true,dispatchAllowed:false,requiresVersionReservation:true,
  appDirectory:'apps/'+role.toLowerCase(),manifest:m,manifestDigest:digest};
 const reservation={id:'55555555-5555-4555-8555-555555555555',
  status:'RESERVED_TEST_ONLY',digest,versionCode:101,
  testOnly:true,dispatchAllowed:false};
 const location={root,format:'AAB',filename:'test-'+m.distributionId+
  '-'+role.toLowerCase()+'.aab'};
 const artifact=join(root,location.filename);
 await writeFile(artifact,fakeAab(),{mode:0o600});
 const jar=join(root,'bundletool.jar'),java=join(root,'java');
 await writeFile(jar,Buffer.from('SYNTHETIC bundletool bytes not real JAR'),{mode:0o600});
 const source='#!'+process.execPath+'\\n'+
  'const args=process.argv.slice(2);\\n'+
  'if(args[0]!=="-jar"||!args[1].endsWith("/bundletool.jar"))process.exit(11);\\n'+
  'if(args[2]==="validate"){process.exit(0); }\\n'+
  'if(args[2]!=="dump"||args[3]!=="manifest")process.exit(12);\\n'+
  'const x=args.find(x=>x.startsWith("--xpath="))?.slice(8);\\n'+
  'const out='+JSON.stringify(result)+';\\n'+
  'const fields={"/manifest/@package":"package",'+
  '"/manifest/@android:versionCode":"versionCode",'+
  '"/manifest/uses-sdk/@android:minSdkVersion":"minSdk",'+
  '"/manifest/uses-sdk/@android:targetSdkVersion":"targetSdk"};\\n'+
  'if(!fields[x])process.exit(13);process.stdout.write(out[fields[x]]+"\\n");\\n';
 await writeFile(java,source,{mode:0o700});
 await chmod(java,0o700);
 const pins={java:{executable:java,sha256:hash(Buffer.from(source))},
  bundletool:{jar,sha256:hash(Buffer.from('SYNTHETIC bundletool bytes not real JAR'))}};
 return {root,plan,reservation,location,pins,artifact,jar,java};
}
for(const role of ['RESIDENT','GUARD'])test('V5.5.27 pins read-only synthetic AAB tool execution for '+role,async()=>{
 const f=await setup(role);
 try{
  const got=await inspectPinnedTestAndroidAab(f.plan,f.reservation,f.location,f.pins);
  assert.equal(got.localPinnedBundletoolValidationReportedPassed,true);
  assert.equal(got.localPinnedBundletoolManifestValuesMatched,true);
  assert.equal(got.testAabSignerVerified,false);
  assert.equal(got.independentlyAttestedRunner,false);
  assert.equal(got.artifactApproved,false);
  assert.equal(got.dispatchAllowed,false);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
for(const [label,mutate] of [
 ['wrong bundletool report',async f=>{f.pins=await setupDifferentPins(f);}],
 ['untrusted pinned jar',async f=>{await appendFile(f.jar,'malicious');}],
 ['untrusted Java executable',async f=>{await appendFile(f.java,'// tamper');}],
 ['unexpected archive content',async f=>{await appendFile(f.artifact,'bad');}],
 ['mutable JAR',async f=>{await chmod(f.jar,0o666);}],
 ['invalid TEST reservation',async f=>{f.reservation={...f.reservation,versionCode:0};}],
 ['build dispatch forbidden',async f=>{f.plan={...f.plan,dispatchAllowed:true};}],
 ['foreign artifact name',async f=>{f.location.filename='foreign.aab';}]
])test('V5.5.27 fails closed on '+label,async()=>{
 const f=await setup();
 try{await mutate(f);await assert.rejects(inspectPinnedTestAndroidAab(
  f.plan,f.reservation,f.location,f.pins));}
 finally{await rm(f.root,{recursive:true,force:true});}
});
async function setupDifferentPins(f){
 const copy={...f.pins,java:{...f.pins.java}};
 copy.java.sha256='e'.repeat(64);
 return copy;
}
test('V5.5.27 rejects symlink bundletool JAR regardless of matching digest',async()=>{
 const f=await setup();
 try{
  const alias=join(f.root,'aliased.jar');
  await symlink(f.jar,alias);
  f.pins.bundletool.jar=alias;
  await assert.rejects(inspectPinnedTestAndroidAab(
   f.plan,f.reservation,f.location,f.pins));
 }finally{await rm(f.root,{recursive:true,force:true});}
});
