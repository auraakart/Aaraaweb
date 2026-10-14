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
const fail=message=>{throw new Error(message);};
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
async function shaFile(path){
 const h=createHash('sha256');
 for await(const chunk of createReadStream(path))h.update(chunk);
 return h.digest('hex');
}
function exactlyOne(report,re,subject){
 const found=[...report.matchAll(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))];
 if(found.length!==1)fail('Missing or ambiguous TEST AAB '+subject);
 return found[0][1];
}
/**
 * Parse output from pinned, locally executed JDK jarsigner and keytool.
 * Return REPORT evidence only, not independently attested cryptographic proof.
 * JAR signing (AAB) is distinct from APK Signature Scheme v2.
 */
export function parseTestAabJarSignerReports(verification,certificate,fingerprint){
 if(typeof verification!=='string'||typeof certificate!=='string'||
    verification.length<100||verification.length>1024*1024||
    certificate.length<100||certificate.length>128*1024||
    !SHA.test(fingerprint))
  fail('Invalid or oversized TEST AAB signing report');
 const clean=/^\s*jar verified\.\s*$/m.test(verification);
 const pinnedSelfSigned=/^\s*jar verified, with signer errors\.\s*$/m.test(verification);
 if((!clean&&!pinnedSelfSigned)||
    /\bjar is unsigned\b|\bunsigned entries\b|\bnot integrity-checked\b/i.test(verification)||
    /\b(?:expired|revoked|disabled|weak signature|invalid signature|tampered)\b/i.test(verification)||
    /^jarsigner:|^Exception:/im.test(verification))
  fail('Pinned jarsigner does not report a fully signed, verified AAB');
 if(pinnedSelfSigned){
  // An ephemeral pinned TEST certificate is often self-signed, so jarsigner
  // reports a verified archive with a PKIX chain error. Only those two exact
  // trust-chain diagnostics are allowed; any other signer error fails closed.
  const sections=verification.split(/\nError:\s*\n/);
  if(sections.length!==2)fail('Missing expected TEST self-signed chain diagnostic');
  const errorLines=sections[1].split(/\nWarning:\s*\n/)[0].trim().split('\n')
   .map(line=>line.trim()).filter(Boolean);
  const allowed=[
   /^This jar contains entries whose signer certificate is self-signed\.$/,
   /^This jar contains entries whose certificate chain is invalid\. Reason: PKIX path building failed:.*$/
  ];
  if(!errorLines.length||errorLines.some(line=>!allowed.some(re=>re.test(line)))||
     !errorLines.some(line=>allowed[0].test(line)))
   fail('Unrecognized TEST JAR signer errors');
 }else if(/^Error:/m.test(verification)){
  fail('Unexpected pinned JAR verification diagnostic');
 }
 // The critical structural members must have signature AND manifest bits.
 for(const member of ['BundleConfig.pb','base/manifest/AndroidManifest.xml','base/dex/classes.dex']){
  const rows=verification.split('\n').filter(line=>line.endsWith(' '+member));
  if(rows.length!==1||!/^\s*sm\s+\d+\s/.test(rows[0]))
   fail('Unsigned or ambiguous TEST AAB structural member: '+member);
 }
 const signer=exactlyOne(certificate,/^Signer #([0-9]+):\s*$/m,'signer identity');
 if(signer!=='1'||/^Signer #2:/m.test(certificate))
  fail('TEST AAB has multiple signer identities');
 const first=certificate.indexOf('Certificate #1:');
 if(first<0)fail('Missing AAB leaf signer certificate');
 const tail=certificate.slice(first).split(/\nCertificate #2:/)[0];
 const hex=exactlyOne(tail,/^\s*SHA256:\s*((?:[a-fA-F0-9]{2}:){31}[a-fA-F0-9]{2})\s*$/m,'leaf signer fingerprint')
  .replaceAll(':','').toLowerCase();
 if(hex!==fingerprint)
  fail('TEST AAB leaf signer does not match immutable identity');
 return Object.freeze({
  jarSignatureReportedVerified:true,
  criticalMembersReportedSigned:true,
  pinnedLeafCertificateReportedMatched:true,
  approvedSignerCountReported:1,
  independentlyAttestedRunner:false,actualSignerCryptographicallyAttested:false,
  artifactApproved:false,artifactPublished:false,dispatchAllowed:false
 });
}
/**
 * TEST-only post-inspection read-only JAR-signer check of an EXISTING AAB.
 * Pins MUST be supplied by independently authenticated operator policy.
 * A local return value never authorizes build dispatch, signing or publish.
 */
export async function inspectPinnedTestAabJarSigning(plan,reservation,location,inspection,pins){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !SHA.test(m.signerFingerprint)||
    !exact(pins,['executables','sha256','signerFingerprint'])||
    !exact(pins.executables,['jarsigner','keytool'])||
    !exact(pins.sha256,['jarsigner','keytool'])||
    pins.signerFingerprint!==m.signerFingerprint)
  fail('Untrusted TEST AAB signing authority or pins');
 const archive=await inspectTestAndroidCandidateArchive(plan,reservation,location);
 if(location.format!=='AAB'||archive.archiveFormat!=='AAB'||
    archive.centralDirectoryVerified!==true||
    archive.allMemberCrcsVerified!==true||
    archive.artifactApproved!==false||archive.dispatchAllowed!==false)
  fail('TEST AAB must pass ZIP/CRC scan');
 if(!inspection||inspection.testOnly!==true||
    inspection.localPinnedBundletoolValidationReportedPassed!==true||
    inspection.localPinnedBundletoolManifestValuesMatched!==true||
    inspection.verifiedJavaAndBundletoolHashes!==true||
    inspection.independentlyAttestedRunner!==false||
    inspection.testAabSignerVerified!==false||
    inspection.artifactApproved!==false||inspection.dispatchAllowed!==false||
    inspection.sha256!==archive.sha256||
    inspection.manifestDigest!==plan.manifestDigest||
    inspection.reservationId!==reservation.id||
    inspection.versionCode!==reservation.versionCode||
    inspection.applicationId!==m.applicationId||
    inspection.distributionId!==m.distributionId||inspection.appRole!==m.appRole)
  fail('AAB signer check needs matching prior local identity inspection');
 const verified={};
 for(const name of ['jarsigner','keytool']){
  const path=pins.executables[name];
  if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path||
     !SHA.test(pins.sha256[name])||await realpath(path)!==path)
   fail('Untrusted pinned TEST JDK executable path/hash');
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
     (stat.mode&0o022)||!(stat.mode&0o111)||
     stat.size<1||stat.size>384*1024*1024)
   fail('Unsafe pinned TEST JDK executable');
  const digest=await shaFile(path);
  if(digest!==pins.sha256[name])fail('Pinned TEST JDK tool changed');
  verified[name]=digest;
 }
 const artifact=join(location.root,location.filename),sha=archive.sha256;
 const env={PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',HOME:'/nonexistent'};
 const run=async(name,args)=>{
  const {stdout,stderr}=await execute(pins.executables[name],args,{
   env,timeout:12000,maxBuffer:1024*1024,encoding:'utf8',
   windowsHide:true,signal:AbortSignal.timeout(13500)
  });
  if(stderr.trim()||!stdout.trim()||
     await shaFile(artifact)!==sha||
     await shaFile(pins.executables.jarsigner)!==verified.jarsigner||
     await shaFile(pins.executables.keytool)!==verified.keytool)
   fail('Pinned TEST signing tools, artifact or output changed');
  return stdout;
 };
 const verification=await run('jarsigner',['-verify','-verbose','-certs',artifact]);
 const certificate=await run('keytool',['-printcert','-jarfile',artifact]);
 const parsed=parseTestAabJarSignerReports(verification,certificate,pins.signerFingerprint);
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  distributionId:m.distributionId,appRole:m.appRole,
  applicationId:m.applicationId,reservationId:reservation.id,
  manifestDigest:plan.manifestDigest,versionCode:reservation.versionCode,
  sha256:sha,bytes:archive.bytes,
  pinnedJdkToolHashesMatched:true,
  localJarSignerInspectionPassed:true,parsed,
  independentlyAttestedRunner:false,
  actualSignerVerifiedByTrustedAttestedRunner:false,
  artifactApproved:false,artifactPublished:false,
  buildExecutionAuthorized:false,dispatchAllowed:false,
  requiresTrustedBuildRunnerAndCompletionAuthority:true
 });
}
