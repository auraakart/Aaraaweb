import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { mkdtemp, writeFile, rm, appendFile, symlink, link, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { verifyTestAndroidZip32Bytes,inspectTestAndroidCandidateArchive } from '../packages/config/src/android-test-archive-inspector.mjs';

const crcTable=Uint32Array.from({length:256},(_,i)=>{
 let n=i;for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;
 return n>>>0;
});
function crc32(bytes){
 let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);
 return (c^0xffffffff)>>>0;
}
function zip(entries){
 const locals=[],central=[];let position=0;
 for(const entry of entries){
  const name=Buffer.from(entry.name,'utf8'),body=Buffer.from(entry.body||'test-bytes');
  const compression=entry.deflate?8:0,encoded=entry.deflate?deflateRawSync(body):body;
  const checksum=crc32(body);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(0,6);local.writeUInt16LE(compression,8);
  local.writeUInt32LE(checksum,14);
  local.writeUInt32LE(encoded.length,18);local.writeUInt32LE(body.length,22);
  local.writeUInt16LE(name.length,26);
  locals.push(local,name,encoded);
  const c=Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);
  c.writeUInt16LE(20,6);c.writeUInt16LE(0,8);
  c.writeUInt16LE(compression,10);c.writeUInt32LE(checksum,16);
  c.writeUInt32LE(encoded.length,20);c.writeUInt32LE(body.length,24);
  c.writeUInt16LE(name.length,28);c.writeUInt32LE(position,42);
  central.push(c,name);
  position+=local.length+name.length+encoded.length;
 }
 const body=Buffer.concat(locals),index=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);
 end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(index.length,12);end.writeUInt32LE(body.length,16);
 return Buffer.concat([body,index,end]);
}
const apk=()=>zip([
 {name:'AndroidManifest.xml',body:'SYNTHETIC not compiled Android binary XML'},
 {name:'classes.dex',body:'synthetic dex fixture',deflate:true},
 {name:'resources.arsc',body:'synthetic resource table'}
]);
const aab=()=>zip([
 {name:'BundleConfig.pb',body:'synthetic config',deflate:true},
 {name:'base/manifest/AndroidManifest.xml',body:'synthetic manifest'},
 {name:'base/dex/classes.dex',body:'synthetic dex',deflate:true},
 {name:'base/root/assets/test.txt',body:'synthetic fixture'}
]);
const manifest=role=>({
 schemaVersion:1,buildMode:'TEST',appRole:role,distributionId:
 '11111111-1111-4111-8111-111111111111',
 applicationId:'in.fixture.partner.'+role.toLowerCase(),
 namespace:'in.fixture.partner.'+role.toLowerCase(),
 sourceSha:'a'.repeat(40),lockDigest:'b'.repeat(64)
});
const fixture=role=>{
 const m=manifest(role),digest=androidBuildManifestDigest(m);
 return {
  plan:{testOnly:true,dispatchAllowed:false,requiresVersionReservation:true,
   manifest:m,appDirectory:'apps/'+role.toLowerCase(),manifestDigest:digest},
  reservation:{id:'55555555-5555-4555-8555-555555555555',
   revisionId:'66666666-6666-4666-8666-666666666666',
   status:'RESERVED_TEST_ONLY',testOnly:true,dispatchAllowed:false,
   digest,versionCode:101}
 };
};
test('V5.5.23 checks every APK ZIP member and returns no signing/package approval',()=>{
 const r=verifyTestAndroidZip32Bytes(apk(),'APK');
 assert.equal(r.archiveFormat,'APK');
 assert.equal(r.centralDirectoryVerified,true);
 assert.equal(r.allMemberCrcsVerified,true);
 assert.equal(r.entryCount,3);
 assert.equal(r.signerVerified,false);
 assert.equal(r.packageIdentityVerified,false);
 assert.equal(r.dispatchAllowed,false);
});
test('V5.5.23 accepts bounded synthetic AAB archive without declaring installability',()=>{
 const r=verifyTestAndroidZip32Bytes(aab(),'AAB');
 assert.equal(r.archiveFormat,'AAB');
 assert.equal(r.entryCount,4);
 assert.equal(r.apkSigningBlockVerified,false);
 assert.equal(r.packageIdentityVerified,false);
});
for(const [label,mutate] of [
 ['extra ZIP trailing comment',b=>Buffer.concat([b,Buffer.from('x')])],
 ['ZIP64 sentinel',b=>{b.writeUInt32LE(0xffffffff,b.length-22+12);return b;}],
 ['multi-disk file',b=>{b.writeUInt16LE(1,b.length-22+4);return b;}],
 ['corrupted compressed member',b=>{const p=b.indexOf(Buffer.from('synthetic dex fixture'));b[p>=0?p:35]^=0xff;return b;}],
 ['incorrect CRC',b=>{const offset=b.readUInt32LE(b.length-22+16);b.writeUInt32LE(0,offset+16);return b;}],
 ['local header mismatch',b=>{b.writeUInt16LE(8,8);return b;}],
 ['encrypted file',b=>{const off=b.readUInt32LE(b.length-22+16);b.writeUInt16LE(1,off+8);return b;}],
 ['oversized declared member',b=>{const off=b.readUInt32LE(b.length-22+16);b.writeUInt32LE(0xffffffff,off+24);return b;}],
 ['unsafe filename traversal',b=>{const p=b.indexOf(Buffer.from('AndroidManifest.xml'));b.write('../AndroidManifest.xml',p,'utf8');return b;}],
 ['duplicate manifest entry',()=>zip([
  {name:'AndroidManifest.xml'},{name:'AndroidManifest.xml'},
  {name:'classes.dex'},{name:'resources.arsc'}])],
 ['missing resources table',()=>zip([
  {name:'AndroidManifest.xml'},{name:'classes.dex'},{name:'x.bin'}])],
 ['unexpected AAB layout',b=>b],
 ['truncated central record',b=>b.subarray(0,b.length-7)]
])test('V5.5.23 rejects '+label,()=>{
 const archive=label==='unexpected AAB layout'?aab():apk();
 const bytes=mutate(Buffer.from(archive));
 assert.throws(()=>verifyTestAndroidZip32Bytes(bytes,'APK'));
});
for(const role of ['RESIDENT','GUARD'])for(const format of ['APK','AAB'])
 test('V5.5.23 inspects '+role+' '+format+' candidate with bounded file integrity',async()=>{
  const root=await mkdtemp(join(tmpdir(),'aaraagate-test-archive-fixture-'));
  const f=fixture(role);
  const filename='test-'+f.plan.manifest.distributionId+'-'+role.toLowerCase()+'.'+format.toLowerCase();
  try{
   const bytes=format==='APK'?apk():aab();
   await writeFile(join(root,filename),bytes,{mode:0o600,flag:'wx'});
   const got=await inspectTestAndroidCandidateArchive(f.plan,f.reservation,{root,filename,format});
   assert.equal(got.sha256,createHash('sha256').update(bytes).digest('hex'));
   assert.equal(got.bytes,bytes.length);
   assert.equal(got.appRole,role);
   assert.equal(got.applicationId,f.plan.manifest.applicationId);
   assert.equal(got.versionCode,101);
   assert.equal(got.allMemberCrcsVerified,true);
   assert.equal(got.archiveVerified,false);
   assert.equal(got.signerVerified,false);
   assert.equal(got.artifactApproved,false);
   assert.equal(got.dispatchAllowed,false);
  }finally{await rm(root,{recursive:true,force:true});}
 });
for(const [label,mutate] of [
 ['altered source revision',async x=>{x.plan={...x.plan,manifest:{...x.plan.manifest,sourceSha:'0'.repeat(40)}};}],
 ['attempted build dispatch',async x=>{x.plan={...x.plan,dispatchAllowed:true};}],
 ['foreign reserved version',async x=>{x.reservation={...x.reservation,versionCode:0};}],
 ['foreign artifact filename',async x=>{x.location.filename='test-injected.apk';}],
 ['untrusted archive symlink',async x=>{await rm(join(x.root,x.location.filename));await symlink('/etc/hosts',join(x.root,x.location.filename));}],
 ['hardlinked archive',async x=>{await link(join(x.root,x.location.filename),join(x.root,'extra-hardlink'));}],
 ['world-writable archive',async x=>{await chmod(join(x.root,x.location.filename),0o666);}],
 ['changed archive bytes',async x=>{await appendFile(join(x.root,x.location.filename),'unapproved');}]
])test('V5.5.23 refuses '+label+' candidate',async()=>{
 const root=await mkdtemp(join(tmpdir(),'aaraagate-test-archive-negative-'));
 const x={...fixture('RESIDENT'),root};
 x.location={root,format:'APK',filename:'test-'+x.plan.manifest.distributionId+'-resident.apk'};
 try{
  await writeFile(join(root,x.location.filename),apk(),{mode:0o600});
  await mutate(x);
  await assert.rejects(inspectTestAndroidCandidateArchive(x.plan,x.reservation,x.location));
 }finally{await rm(root,{recursive:true,force:true});}
});
