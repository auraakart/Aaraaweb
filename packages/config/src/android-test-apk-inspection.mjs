import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAbsolute, join, resolve } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { inspectTestAndroidCandidateArchive } from './android-test-archive-inspector.mjs';

const execute=promisify(execFile);
const SHA=/^[0-9a-f]{64}$/, UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TOOLS=['aapt2','apksigner'];
const ABI=new Set(['armeabi-v7a','arm64-v8a','x86','x86_64']);
const fail=m=>{throw new Error(m);};
const exact=(o,k)=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 Object.getPrototypeOf(o)===Object.prototype&&Object.keys(o).sort().join(',')===k.slice().sort().join(',');
const shaFile=async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');};
const one=(text,re,kind)=>{
 const match=[...text.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
 if(match.length!==1)fail('Missing or ambiguous pinned Android '+kind+' output');
 return match[0][1];
};
/**
 * Parse only aapt2/apksigner output from pinned binaries executed locally.
 * Text alone is NOT evidence of genuine Android cryptographic verification.
 */
export function parseTestAndroidApkInspectionOutputs(badging,signer,expected){
 if(!exact(expected,['applicationId','versionCode','signerFingerprint','allowedAbis'])||
    typeof expected.applicationId!=='string'||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(expected.applicationId)||
    !Number.isSafeInteger(expected.versionCode)||expected.versionCode<1||
    !SHA.test(expected.signerFingerprint)||
    !Array.isArray(expected.allowedAbis)||expected.allowedAbis.length<1||
    expected.allowedAbis.length>4||
    new Set(expected.allowedAbis).size!==expected.allowedAbis.length||
    expected.allowedAbis.some(abi=>!ABI.has(abi)))
  fail('Untrusted TEST inspection identity policy');
 if(typeof badging!=='string'||typeof signer!=='string'||
    badging.length<50||badging.length>65536||
    signer.length<50||signer.length>65536||
    /(?:^|\n)\s*(?:error:|warning:)/im.test(badging+'\n'+signer))
  fail('Invalid or warning-bearing pinned inspection output');
 const packageLine=one(badging,/^package: name='([^'\n]+)'[^\n]*$/m,'package');
 const version=one(badging,/^package: name='[^'\n]+'[^\n]*\bversionCode='([0-9]+)'/m,'version');
 const min=one(badging,/^sdkVersion:'([0-9]+)'$/m,'min SDK');
 const target=one(badging,/^targetSdkVersion:'([0-9]+)'$/m,'target SDK');
 if(packageLine!==expected.applicationId||
    Number(version)!==expected.versionCode||
    Number(min)!==24||Number(target)!==36)
  fail('TEST package, reserved version, min SDK or target SDK differs');
 const native=one(badging,/^native-code:(.*)$/m,'ABI inventory').trim();
 const codes=[...native.matchAll(/'([^'\n]+)'/g)].map(x=>x[1]);
 if(!codes.length||codes.length>4||codes.some(x=>!ABI.has(x))||
    new Set(codes).size!==codes.length||
    codes.some(x=>!expected.allowedAbis.includes(x))||
    !codes.includes('arm64-v8a')||
    native!==codes.map(x=>"'"+x+"'").join(' '))
  fail('Disallowed or missing Android native ABI');
 const count=one(signer,/^Number of signers:\s*(\d+)$/m,'signer count');
 const digest=one(signer,/^Signer #1 certificate SHA-256 digest:\s*([0-9A-Fa-f]{64})$/m,'certificate');
 const v2=one(signer,/^Verified using v2 scheme \(APK Signature Scheme v2\):\s*(true|false)$/m,'APK v2 signature');
 if(Number(count)!==1||digest.toLowerCase()!==expected.signerFingerprint||
    v2!=='true')
  fail('APK signing result differs from approved single TEST certificate');
 return Object.freeze({
  packageAndVersionReportedMatched:true,
  nativeAbiReportMatched:true,minSdk:24,targetSdk:36,
  reportedAbis:Object.freeze([...codes].sort()),
  pinnedSignerFingerprintReportedMatched:true,
  apkV2SchemeReportedVerified:true,
  // Strings can be forged; only the bounded pinned tool runner below
  // controls their origin. Not an attested container or publishing permit.
  toolOriginAuthenticated:false,runnerImageAttested:false,
  artifactApproved:false,artifactPublished:false,dispatchAllowed:false
 });
}
/**
 * TEST-only READ-ONLY APK inspection with fixed aapt2/apksigner argv.
 * Caller must already be inside an independently isolated/attested runner.
 * Expected executable hashes and signer certificate fingerprint must come
 * from independently authenticated policy, never a user request/worker claim.
 */
export async function inspectPinnedTestAndroidApk(plan,reservation,location,pins){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !UUID.test(m.distributionId)||!SHA.test(m.signerFingerprint))
  fail('Untrusted TEST APK inspection plan');
 if(!exact(pins,['executables','sha256','allowedAbis','signerFingerprint'])||
    !exact(pins.executables,TOOLS)||!exact(pins.sha256,TOOLS)||
    pins.signerFingerprint!==m.signerFingerprint||!SHA.test(pins.signerFingerprint))
  fail('Missing independent pinned Android inspection toolchain');
 const verified={};
 for(const name of TOOLS){
  const path=pins.executables[name];
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||
     !SHA.test(pins.sha256[name])||await realpath(path)!==path)
   fail('Unknown TEST Android tool path or hash');
  const st=await lstat(path);
  if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1||
     (st.mode&0o022)||!(st.mode&0o111)||st.size<1||st.size>64*1024*1024)
   fail('Untrusted TEST inspection tool executable');
  const digest=await shaFile(path);
  if(digest!==pins.sha256[name])fail('Pinned Android inspection executable changed');
  verified[name]=digest;
 }
 const archive=await inspectTestAndroidCandidateArchive(plan,reservation,location);
 if(location.format!=='APK'||archive.archiveFormat!=='APK'||
    archive.centralDirectoryVerified!==true||archive.allMemberCrcsVerified!==true||
    archive.artifactApproved!==false||archive.dispatchAllowed!==false)
  fail('TEST binary APK must pass offline archive checks first');
 const artifact=join(location.root,location.filename);
 const approvedSha=archive.sha256;
 const env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:'/nonexistent'};
 const call=async(name,args)=>{
  const {stdout,stderr}=await execute(pins.executables[name],args,{
   env,timeout:12000,maxBuffer:65536,encoding:'utf8',windowsHide:true,
   signal:AbortSignal.timeout(13500)
  });
  if(stderr.trim()||!stdout.trim())fail('Unexpected diagnostic from pinned APK tool');
  if(await shaFile(pins.executables[name])!==verified[name]||
     await shaFile(artifact)!==approvedSha)
   fail('Pinned inspection executable or TEST APK mutated');
  return stdout;
 };
 const badging=await call('aapt2',['dump','badging',artifact]);
 const signing=await call('apksigner',['verify','--verbose','--print-certs','--min-sdk-version','24',artifact]);
 const parsed=parseTestAndroidApkInspectionOutputs(badging,signing,{
  applicationId:m.applicationId,versionCode:reservation.versionCode,
  signerFingerprint:pins.signerFingerprint,allowedAbis:pins.allowedAbis
 });
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  distributionId:m.distributionId,appRole:m.appRole,
  applicationId:m.applicationId,manifestDigest:plan.manifestDigest,
  reservationId:reservation.id,versionCode:reservation.versionCode,
  sha256:approvedSha,bytes:archive.bytes,
  pinnedInspectionExecutablesVerified:true,
  localApkToolInspectionPassed:true,
  parsed,
  independentlyAttestedRunner:false,
  actualSignerVerifiedByTrustedAttestedRunner:false,
  testArtifactAuthorized:false,artifactPublished:false,
  buildExecutionAuthorized:false,dispatchAllowed:false,
  requiresIndependentRunnerAndLiveCompletionAuthority:true
 });
}
