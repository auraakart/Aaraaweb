import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoleTestBuildEvidence,validateCrossRoleTestEvidence} from './v5-test-build-matrix-evidence.mjs';
const sha=(v)=>v.repeat(64);
function fixture(role){
 const source='d'.repeat(40),app='com.aaraaplatforms.aaraagate_'+role;
 const apk=["role="+role,"sha256="+sha(role==='resident'?'a':'b'),"bytes=200000","source_commit="+source,"distribution_approved=false","runtime_image_attested=false","partner_manifest_bound=false"].join('\n')+'\n';
 const aab=["role="+role,"sha256="+sha(role==='resident'?'c':'e'),"bytes=210000","source_commit="+source,"distribution_approved=false","external_image_attested=false","partner_manifest_bound=false","signer_independently_pinned=false"].join('\n')+'\n';
 const badge="package: name='"+app+"' versionCode='1'\nsdkVersion:'24'\ntargetSdkVersion:'36'\n";
 const apkSig={localV2SignatureVerified:true,signerCount:1,certificateSha256:sha('f'),runnerAttested:false,partnerSignerApproved:false,dispatchAllowed:false,artifactPublished:false};
 const aabSig={testOnly:true,locallyVerifiedJarSignature:true,observedSignerCount:1,observedLeafSha256:sha('f'),locallySignedCriticalMembers:true,independentlyAttestedRunner:false,partnerSignerPinned:false,partnerManifestBound:false,artifactApproved:false,artifactPublished:false,dispatchAllowed:false};
 return {role,apk,aab,badge,apkSig,aabSig};
}
const make=f=>createRoleTestBuildEvidence(f.role,f.apk,f.aab,f.badge,f.apkSig,f.aabSig);
test('V5.5.34 local receipts retain zero dispatch and distinct base identities',()=>{
 const r=make(fixture('resident')),g=make(fixture('guard'));
 const x=validateCrossRoleTestEvidence(r,g);
 assert.equal(x.realBaseApkAndAabMetadataCompared,true);
 assert.equal(x.partnerABInstallVerified,false);
 assert.equal(x.dispatchAllowed,false);
 assert.notEqual(r.applicationId,g.applicationId);
});
for(const [description,mutate] of [
 ['foreign role',f=>f.apk=f.apk.replace('role=resident','role=guard')],
 ['distribution authority',f=>f.aab=f.aab.replace('distribution_approved=false','distribution_approved=true')],
 ['changed source',f=>f.aab=f.aab.replace('source_commit='+('d'.repeat(40)),'source_commit='+('c'.repeat(40)))],
 ['wrong package',f=>f.badge=f.badge.replace('aaraagate_resident','aaraagate_guard')],
 ['SDK mismatch',f=>f.badge=f.badge.replace("targetSdkVersion:'36'","targetSdkVersion:'35'")],
 ['different APK signer',f=>f.apkSig.certificateSha256=sha('1')],
 ['invalid artifact hash',f=>f.apk=f.apk.replace(sha('a'),'not-hex')]
])test('V5.5.34 rejects '+description,()=>{
 const f=fixture('resident');mutate(f);assert.throws(()=>make(f));
});
test('V5.5.34 rejects cross-role artifact checksum collisions and altered flags',()=>{
 const r=make(fixture('resident')),g=make(fixture('guard'));
 assert.throws(()=>validateCrossRoleTestEvidence(r,{...g,sourceSha:'c'.repeat(40)}));
 assert.throws(()=>validateCrossRoleTestEvidence(r,{...g,apk:{...g.apk,sha256:r.apk.sha256}}));
 assert.throws(()=>validateCrossRoleTestEvidence(r,{...g,releaseApproved:true}));
});
