import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

const SHA=/^[a-f0-9]{64}$/;
const FAIL=s=>{throw new Error(s);};
const roles=['resident','guard'];
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const required=(text,key)=>{
 if(typeof text!=='string'||text.length>8192)FAIL('Invalid TEST evidence text');
 const hits=[...text.matchAll(new RegExp('^'+key+'=(.*)$','gm'))];
 if(hits.length!==1)FAIL('Missing or ambiguous evidence '+key);
 return hits[0][1];
};
const expectBoolFalse=(text,key)=>{
 if(required(text,key)!=='false')FAIL('TEST scope leaked distribution authority: '+key);
};
export function createRoleTestBuildEvidence(role,apkText,aabText,badging,apkSignature,aabSignature){
 if(!roles.includes(role))FAIL('Unexpected TEST base-app role');
 if(!exact(apkSignature,['localV2SignatureVerified','signerCount','certificateSha256','runnerAttested','partnerSignerApproved','dispatchAllowed','artifactPublished'])||
    !exact(aabSignature,['testOnly','locallyVerifiedJarSignature','observedSignerCount','observedLeafSha256','locallySignedCriticalMembers','independentlyAttestedRunner','partnerSignerPinned','partnerManifestBound','artifactApproved','artifactPublished','dispatchAllowed']))
  FAIL('Unknown or missing local signature proof');
 if(apkSignature.localV2SignatureVerified!==true||apkSignature.signerCount!==1||
    apkSignature.runnerAttested!==false||apkSignature.partnerSignerApproved!==false||
    apkSignature.dispatchAllowed!==false||apkSignature.artifactPublished!==false||
    aabSignature.testOnly!==true||aabSignature.locallyVerifiedJarSignature!==true||
    aabSignature.observedSignerCount!==1||aabSignature.locallySignedCriticalMembers!==true||
    aabSignature.independentlyAttestedRunner!==false||aabSignature.partnerSignerPinned!==false||
    aabSignature.partnerManifestBound!==false||aabSignature.artifactApproved!==false||
    aabSignature.artifactPublished!==false||aabSignature.dispatchAllowed!==false)
  FAIL('TEST signer result is not a validated local-only single signer');
 if(!SHA.test(apkSignature.certificateSha256)||!SHA.test(aabSignature.observedLeafSha256)||
    apkSignature.certificateSha256!==aabSignature.observedLeafSha256)
  FAIL('APK and AAB signer certificate mismatch within single TEST role job');
 const apkSha=required(apkText,'sha256'),aabSha=required(aabText,'sha256');
 const apkSource=required(apkText,'source_commit'),aabSource=required(aabText,'source_commit');
 const apkBytes=Number(required(apkText,'bytes')),aabBytes=Number(required(aabText,'bytes'));
 if(!SHA.test(apkSha)||!SHA.test(aabSha)||apkSha===aabSha||
    !/^[a-f0-9]{40}$/.test(apkSource)||apkSource!==aabSource||
    !Number.isSafeInteger(apkBytes)||apkBytes<10000||
    !Number.isSafeInteger(aabBytes)||aabBytes<10000)
  FAIL('Untrustworthy TEST APK/AAB hash, size or commit');
 for(const t of [apkText,aabText]){
  if(required(t,'role')!==role)FAIL('Cross-role TEST receipt swap');
  if(required(t,'distribution_approved')!=='false')FAIL('Unexpected distribution authorization');
 }
 for(const key of ['runtime_image_attested','partner_manifest_bound'])expectBoolFalse(apkText,key);
 for(const key of ['external_image_attested','partner_manifest_bound','signer_independently_pinned'])expectBoolFalse(aabText,key);
 const appId='com.aaraaplatforms.aaraagate_'+role;
 if(typeof badging!=='string'||badging.length>1024*1024||
    !badging.split('\n').some(line=>line.startsWith("package: name='"+appId+"' "))||
    !badging.includes("sdkVersion:'24'")||!badging.includes("targetSdkVersion:'36'"))
  FAIL('Unexpected TEST base app package ID or SDK');
 return Object.freeze({
  schemaVersion:1,testOnly:true,role:role.toUpperCase(),
  sourceSha:apkSource,applicationId:appId,minSdk:24,targetSdk:36,
  apk:Object.freeze({sha256:apkSha,bytes:apkBytes,localV2Verified:true}),
  aab:Object.freeze({sha256:aabSha,bytes:aabBytes,localJarVerified:true}),
  locallyObservedCertificateSha256:apkSignature.certificateSha256,
  independentlyAttestedRunner:false,approvedPartnerManifest:false,
  independentlyPinnedSigner:false,releaseApproved:false,
  dispatchAllowed:false,published:false
 });
}
export function validateCrossRoleTestEvidence(resident,guard){
 for(const [role,v] of [['RESIDENT',resident],['GUARD',guard]]){
  if(!exact(v,['schemaVersion','testOnly','role','sourceSha','applicationId','minSdk','targetSdk','apk','aab','locallyObservedCertificateSha256','independentlyAttestedRunner','approvedPartnerManifest','independentlyPinnedSigner','releaseApproved','dispatchAllowed','published'])||
     v.role!==role||v.schemaVersion!==1||v.testOnly!==true||
     v.applicationId!=='com.aaraaplatforms.aaraagate_'+role.toLowerCase()||
     v.minSdk!==24||v.targetSdk!==36||!SHA.test(v.locallyObservedCertificateSha256)||
     !/^[a-f0-9]{40}$/.test(v.sourceSha)||
     !exact(v.apk,['sha256','bytes','localV2Verified'])||
     !exact(v.aab,['sha256','bytes','localJarVerified'])||
     !SHA.test(v.apk.sha256)||!SHA.test(v.aab.sha256)||
     !Number.isSafeInteger(v.apk.bytes)||v.apk.bytes<10000||
     !Number.isSafeInteger(v.aab.bytes)||v.aab.bytes<10000||
     v.apk.localV2Verified!==true||v.aab.localJarVerified!==true||
     v.independentlyAttestedRunner!==false||v.approvedPartnerManifest!==false||
     v.independentlyPinnedSigner!==false||v.releaseApproved!==false||
     v.dispatchAllowed!==false||v.published!==false)
    FAIL('Malformed or unauthorized TEST cross-role build evidence '+role);
 }
 if(resident.sourceSha!==guard.sourceSha||
    resident.applicationId===guard.applicationId||
    resident.apk.sha256===guard.apk.sha256||
    resident.aab.sha256===guard.aab.sha256)
  FAIL('TEST resident/guard source mismatch or package/artifact collision');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',
  sourceSha:resident.sourceSha,comparedRoles:['RESIDENT','GUARD'],
  realBaseApkAndAabMetadataCompared:true,distinctBasePackageIdentities:true,
  independentlyAttestedRunner:false,partnerABInstallVerified:false,
  releaseApproved:false,dispatchAllowed:false,published:false
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const [mode,arg]=process.argv.slice(2);
  if(mode==='role'){
   if(!roles.includes(arg))FAIL('Invalid role');
   const p='dist/aaraagate-'+arg+'-test-';
   const read=s=>readFileSync(p+s,'utf8');
   const receipt=createRoleTestBuildEvidence(arg,
    read('apk-evidence.txt'),read('aab-evidence.txt'),read('aapt-badging.txt'),
    JSON.parse(read('signing-summary.json')),JSON.parse(read('aab-signing-summary.json')));
   writeFileSync('dist/aaraagate-'+arg+'-test-build-metadata.json',JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  }else if(mode==='matrix'){
   if(typeof arg!=='string'||arg.length>256)FAIL('Invalid metadata directory');
   const read=role=>JSON.parse(readFileSync(join(arg,'aaraagate-'+role+'-test-build-metadata.json'),'utf8'));
   const result=validateCrossRoleTestEvidence(read('resident'),read('guard'));
   process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }else FAIL('Expected role or matrix mode');
 }catch(error){console.error('Rejected TEST build evidence: '+error.message);process.exitCode=1;}
}
