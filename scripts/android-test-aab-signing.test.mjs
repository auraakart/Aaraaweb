import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp,writeFile,rm,chmod,appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { parseTestAabJarSignerReports,inspectPinnedTestAabJarSigning } from '../packages/config/src/android-test-aab-signing.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const fingerprint='a'.repeat(64);
const pkg='in.fixture.partner.guard';
const report="s       123 Thu Oct 15 09:00:00 UTC 2026 META-INF/MANIFEST.MF\n"+
 "sm       50 Thu Oct 15 09:00:00 UTC 2026 BundleConfig.pb\n"+
 "sm       50 Thu Oct 15 09:00:00 UTC 2026 base/manifest/AndroidManifest.xml\n"+
 "sm       50 Thu Oct 15 09:00:00 UTC 2026 base/dex/classes.dex\n"+
 "  s = signature was verified\n  m = entry is listed in manifest\n"+
 "- Signed by \"CN=Test\"\njar verified.\n";
const cert="Signer #1:\n\nCertificate #1:\nOwner: CN=Test\nIssuer: CN=Test\n"+
 "Certificate fingerprints:\n\t SHA256: "+fingerprint.match(/.{2}/g).join(':')+"\n"+
 "Signature algorithm name: SHA384withRSA\nSubject Public Key Algorithm: 2048-bit RSA key\nVersion: 3\n";
function zip(){
 const files=['BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex'];
 let offset=0;const locals=[],central=[];
 let table=Uint32Array.from({length:256},(_,i)=>{
  let n=i;for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;
 });
 for(const name of files){
  const n=Buffer.from(name),body=Buffer.from('synthetic not signed '+name);
  let crc=0xffffffff;
  for(const byte of body)crc=table[(crc^byte)&255]^(crc>>>8);
  crc=(crc^0xffffffff)>>>0;
  const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50);
  l.writeUInt16LE(20,4);l.writeUInt32LE(crc,14);
  l.writeUInt32LE(body.length,18);l.writeUInt32LE(body.length,22);
  l.writeUInt16LE(n.length,26);locals.push(l,n,body);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);
  c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);
  c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);
  c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
  central.push(c,n);offset+=l.length+n.length+body.length;
 }
 const a=Buffer.concat(locals),b=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(3,8);end.writeUInt16LE(3,10);
 end.writeUInt32LE(b.length,12);end.writeUInt32LE(a.length,16);
 return Buffer.concat([a,b,end]);
}
test('V5.5.28 parses single pinned TEST AAB signer without claiming trusted execution',()=>{
 const x=parseTestAabJarSignerReports(report,cert,fingerprint);
 assert.equal(x.jarSignatureReportedVerified,true);
 assert.equal(x.criticalMembersReportedSigned,true);
 assert.equal(x.independentlyAttestedRunner,false);
 assert.equal(x.actualSignerCryptographicallyAttested,false);
 assert.equal(x.dispatchAllowed,false);
});
for(const [label,change] of [
 ['missing bundle signature',()=>[report.replace('sm       50','         50'),cert,fingerprint]],
 ['unsigned-entry warning',()=>[report+'This jar contains unsigned entries which have not been integrity-checked.\n',cert,fingerprint]],
 ['jar verification failed',()=>[report.replace('jar verified.','jar is unsigned.'),cert,fingerprint]],
 ['second signing identity',()=>[report,cert+'Signer #2:\n',fingerprint]],
 ['changed fingerprint',()=>[report,cert,'b'.repeat(64)]],
 ['duplicate critical member',()=>[report+report.split('\n')[1]+'\n',cert,fingerprint]],
 ['diagnostic',()=>[report+'Error: forged signature\n',cert,fingerprint]]
])test('V5.5.28 rejects '+label,()=>{
 const [a,b,c]=change();
 assert.throws(()=>parseTestAabJarSignerReports(a,b,c));
});
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5528-'));
 const m={schemaVersion:1,buildMode:'TEST',appRole:'GUARD',
  distributionId:'11111111-1111-4111-8111-111111111111',
  applicationId:pkg,namespace:pkg,sourceSha:'b'.repeat(40),
  lockDigest:'c'.repeat(64),signerFingerprint:fingerprint};
 const digest=androidBuildManifestDigest(m);
 const plan={testOnly:true,dispatchAllowed:false,requiresVersionReservation:true,
  appDirectory:'apps/guard',manifest:m,manifestDigest:digest};
 const reservation={id:'55555555-5555-4555-8555-555555555555',
  status:'RESERVED_TEST_ONLY',digest,versionCode:101,testOnly:true,dispatchAllowed:false};
 const location={root,format:'AAB',filename:'test-'+m.distributionId+'-guard.aab'};
 const bytes=zip(),artifact=join(root,location.filename);
 await writeFile(artifact,bytes,{mode:0o600});
 const exe={},digests={};
 for(const [tool,text] of [['jarsigner',report],['keytool',cert]]){
  const file=join(root,tool);
  const body=['#!'+process.execPath,'process.stdout.write('+JSON.stringify(text)+');'].join('\n')+'\n';
  await writeFile(file,body,{mode:0o700});await chmod(file,0o700);
  exe[tool]=file;digests[tool]=sha(Buffer.from(body));
 }
 const pins={executables:exe,sha256:digests,signerFingerprint:fingerprint};
 const inspection={testOnly:true,localPinnedBundletoolValidationReportedPassed:true,
  localPinnedBundletoolManifestValuesMatched:true,verifiedJavaAndBundletoolHashes:true,
  independentlyAttestedRunner:false,testAabSignerVerified:false,
  artifactApproved:false,dispatchAllowed:false,sha256:sha(bytes),
  manifestDigest:digest,reservationId:reservation.id,versionCode:101,
  applicationId:pkg,distributionId:m.distributionId,appRole:'GUARD'};
 return {root,plan,reservation,location,pins,inspection,artifact};
}
test('V5.5.28 pins TEST JDK fake tools and checks local AAB signature reports',async()=>{
 const x=await fixture();
 try{
  const result=await inspectPinnedTestAabJarSigning(
   x.plan,x.reservation,x.location,x.inspection,x.pins);
  assert.equal(result.pinnedJdkToolHashesMatched,true);
  assert.equal(result.localJarSignerInspectionPassed,true);
  assert.equal(result.actualSignerVerifiedByTrustedAttestedRunner,false);
  assert.equal(result.artifactApproved,false);
  assert.equal(result.dispatchAllowed,false);
 }finally{await rm(x.root,{recursive:true,force:true});}
});
for(const [label,change] of [
 ['mutated TEST archive',async x=>appendFile(x.artifact,'tamper')],
 ['mutated jarsigner tool',async x=>appendFile(x.pins.executables.jarsigner,'tamper')],
 ['wrong pinned signer',async x=>{x.pins={...x.pins,signerFingerprint:'b'.repeat(64)};}],
 ['wrong prior local inspection',async x=>{x.inspection={...x.inspection,sha256:'b'.repeat(64)};}],
 ['dispatch request',async x=>{x.plan={...x.plan,dispatchAllowed:true};}],
 ['wrong reserved code',async x=>{x.reservation={...x.reservation,versionCode:102};}],
 ['untrusted executable permissions',async x=>chmod(x.pins.executables.keytool,0o777)]
])test('V5.5.28 fails closed on '+label,async()=>{
 const x=await fixture();
 try{await change(x);await assert.rejects(inspectPinnedTestAabJarSigning(
  x.plan,x.reservation,x.location,x.inspection,x.pins));}
 finally{await rm(x.root,{recursive:true,force:true});}
});

const pinnedSelfSignedReport=report.replace('jar verified.',
 'jar verified, with signer errors.\n\nError: \n'+
 'This jar contains entries whose certificate chain is invalid. Reason: PKIX path building failed: unable to find certification path\n'+
 'This jar contains entries whose signer certificate is self-signed.\n\nWarning: \n'+
 'This jar contains signatures that do not include a timestamp.\n');
test('V5.5.28 accepts pinned self-signed TEST certificate with only known chain diagnostics',()=>{
 const r=parseTestAabJarSignerReports(pinnedSelfSignedReport,cert,fingerprint);
 assert.equal(r.jarSignatureReportedVerified,true);
 assert.equal(r.actualSignerCryptographicallyAttested,false);
});
test('V5.5.28 refuses unexpected TEST signer error even with a matching certificate pin',()=>{
 assert.throws(()=>parseTestAabJarSignerReports(
  pinnedSelfSignedReport.replace('Warning: ','This jar has an invalid signature\n\nWarning: '),
  cert,fingerprint));
});
test('V5.5.28 refuses expired TEST signer report',()=>{
 assert.throws(()=>parseTestAabJarSignerReports(
  pinnedSelfSignedReport.replace('certificate is self-signed.','certificate is expired.'),
  cert,fingerprint));
});
