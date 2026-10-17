import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat,realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute,join,resolve } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { inspectTestAndroidCandidateArchive } from './android-test-archive-inspector.mjs';

const execute=promisify(execFile);
const SHA=/^[a-f0-9]{64}$/;
const PACKAGE=/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const fail=m=>{throw new Error(m);};
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&
 Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const shaFile=async p=>{
 const h=createHash('sha256');
 for await(const b of createReadStream(p))h.update(b);
 return h.digest('hex');
};
/**
 * Validate the literal stdout of individually queried bundletool XPath values.
 * This parser DOES NOT trust stdout as independently attested build evidence.
 */
export function parseTestAndroidAabManifestValues(values,expected){
 if(!exact(values,['package','versionCode','minSdk','targetSdk'])||
    !exact(expected,['applicationId','versionCode'])||
    typeof expected.applicationId!=='string'||!PACKAGE.test(expected.applicationId)||
    !Number.isSafeInteger(expected.versionCode)||expected.versionCode<1||
    expected.versionCode>2100000000)
  fail('Untrusted AAB manifest identity policy');
 for(const value of Object.values(values)){
  if(typeof value!=='string'||value.length<1||value.length>250||
     value.trim()!==value||/[\r\n\x00-\x1f]/.test(value))
   fail('Malformed or ambiguous TEST AAB bundletool value');
 }
 if(values.package!==expected.applicationId||
    !/^[1-9][0-9]*$/.test(values.versionCode)||
    Number(values.versionCode)!==expected.versionCode||
    values.minSdk!=='24'||values.targetSdk!=='36')
  fail('TEST AAB package, reserved version or Android SDK differs');
 return Object.freeze({
  bundletoolPackageReportedMatched:true,
  bundletoolVersionReportedMatched:true,
  reportedMinSdk:24,reportedTargetSdk:36,
  signerVerified:false,runnerAttested:false,artifactApproved:false,
  dispatchAllowed:false
 });
}
/**
 * TEST-only local, read-only inspection of an EXISTING AAB candidate.
 * A separate independent runner must authenticate java/jar pins and enforce
 * isolation; unsigned worker requests or partner manifests are not trusted pins.
 */
export async function inspectPinnedTestAndroidAab(plan,reservation,location,pins){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !exact(pins,['java','bundletool'])||
    !exact(pins.java,['executable','sha256'])||
    !exact(pins.bundletool,['jar','sha256']))
  fail('Untrusted TEST AAB inspection plan and tool pins');
 const paths={java:pins.java.executable,bundletool:pins.bundletool.jar};
 const hashes={java:pins.java.sha256,bundletool:pins.bundletool.sha256};
 for(const name of ['java','bundletool']){
  const path=paths[name];
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||
     !SHA.test(hashes[name])||await realpath(path)!==path)
   fail('Untrusted TEST AAB tool path/pin');
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
     (stat.mode&0o022)||stat.size<1||
     stat.size>(name==='java'?384:128)*1024*1024||
     (name==='java'&&!(stat.mode&0o111))||
     (name==='bundletool'&&(stat.mode&0o111)))
   fail('Unsafe pinned Java or bundletool JAR');
  if(await shaFile(path)!==hashes[name])
   fail('Pinned TEST AAB executable/JAR bytes differ');
 }
 const archive=await inspectTestAndroidCandidateArchive(plan,reservation,location);
 if(location.format!=='AAB'||archive.archiveFormat!=='AAB'||
    archive.centralDirectoryVerified!==true||
    archive.allMemberCrcsVerified!==true||
    archive.artifactApproved!==false||archive.dispatchAllowed!==false)
  fail('TEST AAB must pass bounded ZIP32 checks first');
 const artifact=join(location.root,location.filename);
 const sha256=archive.sha256;
 const env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:'/nonexistent'};
 const run=async args=>{
  const {stdout,stderr}=await execute(paths.java,['-jar',paths.bundletool,...args],{
   env,timeout:12000,maxBuffer:32768,windowsHide:true,encoding:'utf8',
   signal:AbortSignal.timeout(13500)
  });
  if(stderr.trim()||stdout.length>8192||
     await shaFile(paths.java)!==hashes.java||
     await shaFile(paths.bundletool)!==hashes.bundletool||
     await shaFile(artifact)!==sha256)
   fail('Pinned AAB tool or artifact mutated or emitted diagnostics');
  return stdout.trim();
 };
 // A successful bundletool validate can print a multiline module inventory.
 // Trust only its zero exit status, with bounded output and stderr rejection.
 const report=await run(['validate','--bundle='+artifact]);
 if(/(?:^|\n)\s*(?:error:|exception:|warning:)/im.test(report))
  fail('Pinned bundletool validation reported an error');
 const pathsToQuery={
  package:'/manifest/@package',
  versionCode:'/manifest/@android:versionCode',
  minSdk:'/manifest/uses-sdk/@android:minSdkVersion',
  targetSdk:'/manifest/uses-sdk/@android:targetSdkVersion'
 };
 const values={};
 for(const [key,xpath] of Object.entries(pathsToQuery))
  values[key]=await run(['dump','manifest','--bundle='+artifact,'--xpath='+xpath]);
 const parsed=parseTestAndroidAabManifestValues(values,{
  applicationId:m.applicationId,versionCode:reservation.versionCode
 });
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  distributionId:m.distributionId,appRole:m.appRole,
  applicationId:m.applicationId,manifestDigest:plan.manifestDigest,
  reservationId:reservation.id,versionCode:reservation.versionCode,
  sha256,bytes:archive.bytes,
  localPinnedBundletoolValidationReportedPassed:true,
  localPinnedBundletoolManifestValuesMatched:true,
  verifiedJavaAndBundletoolHashes:true,parsed,
  independentlyAttestedRunner:false,
  testAabSignerVerified:false,artifactApproved:false,
  artifactPublished:false,buildExecutionAuthorized:false,
  dispatchAllowed:false,
  requiresTrustedTestRunnerAndIndependentJarSigningVerification:true
 });
}
