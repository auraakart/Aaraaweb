import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planTestAndroidNativeWrapperPatch } from '../packages/config/src/android-test-native-wrapper.mjs';
import { materializeTestAndroidNativeWorkspace } from '../packages/config/src/android-test-native-workspace.mjs';
import { materializeTestAndroidResourceOverlay } from '../packages/config/src/android-test-overlay.mjs';
import { androidBuildManifestDigest,planTestAndroidBuild,checkAndroidAssetBytes,recordTestAndroidProvenance } from '../packages/config/src/android-build-contract.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const distributionId='11111111-1111-4111-8111-111111111111',approvalId='22222222-2222-4222-8222-222222222222',partnerId='33333333-3333-4333-8333-333333333333',societyId='44444444-4444-4444-8444-444444444444';
function fixture(role='RESIDENT'){
 const bytes=new Uint8Array(32).fill(12),asset=createHash('sha256').update(bytes).digest('hex');
 const m={schemaVersion:1,distributionId,approvalId,partnerId,societyId,brandRevision:2,sourceSha:'a'.repeat(40),lockDigest:'b'.repeat(64),applicationId:`in.fixture.partner.${role.toLowerCase()}`,namespace:`in.fixture.partner.${role.toLowerCase()}`,appRole:role,label:`Partner ${role}`,buildMode:'TEST',apiOrigin:'https://test-api.fixture.in',configDigest:'c'.repeat(64),assetDigests:{icon:asset,splash:asset},firebaseClientRef:'TEST_NO_PUSH',appLinkHosts:['app.fixture.in'],signingProfile:'TEST_FIXTURE',signerFingerprint:'d'.repeat(64)};
 const approvedInputs={schemaVersion:1,environment:'TEST',applicationId:m.applicationId,namespace:m.namespace,appRole:role,label:m.label,sourceSha:m.sourceSha,configDigest:m.configDigest,signingProfile:m.signingProfile,apiOrigin:m.apiOrigin};
 const d={id:distributionId,approvalId,partnerId,societyId,status:'APPROVED_TEST_INPUT',revoked:false,activeAllocation:true,partnerStatus:'ACTIVE',startsAt:'2026-10-14T00:00:00Z',endsAt:'2026-10-15T00:00:00Z',approvedInputs,approvedDigest:androidBuildManifestDigest(approvedInputs)};
 const c={environment:'TEST',now:'2026-10-14T01:00:00Z',distributions:[d],sourceSha:m.sourceSha,lockDigest:m.lockDigest,apiOrigins:[m.apiOrigin],brand:{published:true,partnerId,societyId,version:2,digest:m.configDigest},verifiedAssets:['icon','splash'].map(role=>({role,digest:asset,partnerId,societyId,brandRevision:2,contentType:'image/png',metadataStripped:true})),signingProfiles:[{id:m.signingProfile,environment:'TEST',distributionId,fingerprint:m.signerFingerprint}],firebaseClients:[{id:m.firebaseClientRef,environment:'TEST',distributionId,applicationId:m.applicationId,pushEnabled:false}],verifiedAppLinks:[{hostname:'app.fixture.in',partnerId,societyId,verified:true,verifiedUntil:'2026-10-15T00:00:00Z'}]};
 return {m,c,d,bytes};
}
function evidence(plan){return {sourceSha:plan.manifest.sourceSha,manifestDigest:plan.manifestDigest,lockDigest:plan.manifest.lockDigest,applicationId:plan.manifest.applicationId,signerFingerprint:plan.manifest.signerFingerprint,distributionId,versionCode:101,reservationConsumed:true,archiveVerified:true,demoFixturesPresent:false,testSigned:true,toolchain:{flutter:'3.47.0',java:'17',node:'22.20.0',pnpm:'10.15.0'},artifacts:[{kind:'APK',sha256:'e'.repeat(64),bytes:100},{kind:'AAB',sha256:'f'.repeat(64),bytes:200}]};}
for(const role of ['RESIDENT','GUARD'])test(`plans ${role} from shared sources without enabling dispatch`,()=>{
 const {m,c}=fixture(role),before=clone({m,c}),plan=planTestAndroidBuild(m,c);
 assert.equal(plan.appDirectory,`apps/${role.toLowerCase()}`);assert.equal(plan.dispatchAllowed,false);assert.equal(plan.testOnly,true);assert.equal(plan.requiresVersionReservation,true);
 assert.equal(Object.isFrozen(plan.manifest.assetDigests),true);assert.deepEqual({m,c},before);assert.equal(Object.isFrozen(m),false);
 assert.equal(androidBuildManifestDigest({...m}),plan.manifestDigest);
});
const badManifest=[
 ['unknown secret',m=>m.privateKey='secret'],['production',m=>m.buildMode='RELEASE'],['mutable source',m=>m.sourceSha='develop'],['bad digest',m=>m.configDigest='latest'],
 ['foreign approval',m=>m.approvalId=distributionId],['native package drift',m=>m.applicationId='in.other.application'],['default identity',m=>m.applicationId=m.namespace='com.aaraaplatforms.aaraagate_resident'],
 ['Java keyword',m=>m.applicationId=m.namespace='in.class.resident'],['manifest injection',m=>m.label='<script>'],['bidi label',m=>m.label='Hidden\u202eText'],['live signing',m=>m.signingProfile='LIVE_KEY'],
 ['API path',m=>m.apiOrigin+='/?secret=1'],['duplicate app links',m=>m.appLinkHosts.push(m.appLinkHosts[0])],['noncanonical link',m=>m.appLinkHosts=['APP.fixture.in']],['foreign assets',m=>m.assetDigests.icon='0'.repeat(64)],['asset secret',m=>m.assetDigests.key='secret'],['invalid revision',m=>m.brandRevision=0],
];
for(const [name,mutate] of badManifest)test(`rejects ${name}`,()=>{const {m,c}=fixture();mutate(m);assert.throws(()=>planTestAndroidBuild(m,c));});
const badContext=[
 ['revoked approval',c=>c.distributions[0].revoked=true],['withdrawn consent',c=>c.distributions[0].activeAllocation=false],['suspended partner',c=>c.distributions[0].partnerStatus='RESTRICTED'],
 ['exclusive period end',c=>c.now=c.distributions[0].endsAt],['not yet active',c=>c.now='2026-10-13T23:59:59Z'],['impossible calendar date',c=>c.now='2026-02-30T00:00:00Z'],
 ['foreign owner',c=>c.distributions[0].partnerId=societyId],['duplicate authority',c=>c.distributions.push(clone(c.distributions[0]))],['identity collision',c=>c.distributions.push({...clone(c.distributions[0]),id:approvalId})],
 ['forged approval digest',c=>c.distributions[0].approvedDigest='0'.repeat(64)],['changed label',c=>c.distributions[0].approvedInputs.label='Changed'],['wrong checkout',c=>c.sourceSha='0'.repeat(40)],['changed dependency lock',c=>c.lockDigest='0'.repeat(64)],
 ['draft brand',c=>c.brand.published=false],['foreign brand',c=>c.brand.societyId=partnerId],['missing sanitization',c=>c.verifiedAssets[0].metadataStripped=false],['foreign asset',c=>c.verifiedAssets[0].partnerId=societyId],
 ['signer mismatch',c=>c.signingProfiles[0].fingerprint='0'.repeat(64)],['live Firebase',c=>c.firebaseClients[0].pushEnabled=true],['foreign app link',c=>c.verifiedAppLinks[0].partnerId=societyId],['expired link',c=>c.verifiedAppLinks[0].verifiedUntil=c.now],
];
for(const [name,mutate] of badContext)test(`rejects ${name}`,()=>{const {m,c}=fixture();mutate(c);assert.throws(()=>planTestAndroidBuild(m,c));});
test('asset byte validation proves digest equality, not image decoding',()=>{
 const {m,bytes}=fixture();assert.equal(checkAndroidAssetBytes(m.assetDigests.icon,bytes),true);bytes[0]++;
 assert.throws(()=>checkAndroidAssetBytes(m.assetDigests.icon,bytes));assert.throws(()=>checkAndroidAssetBytes(m.assetDigests.icon,new Uint8Array(3)));
});
test('records bounded TEST provenance without publication',()=>{
 const {m,c}=fixture(),plan=planTestAndroidBuild(m,c),e=evidence(plan),r=recordTestAndroidProvenance(plan,e);
 assert.equal(r.testOnly,true);assert.equal(r.published,false);assert.equal(r.versionCode,101);assert.equal(Object.isFrozen(r.artifacts[0]),true);assert.equal(Object.isFrozen(e),false);
});
for(const [name,mutate] of [
 ['unreserved version',e=>e.reservationConsumed=false],['bad version',e=>e.versionCode=0],['unverified archive',e=>e.archiveVerified=false],['demo fixture',e=>e.demoFixturesPresent=true],['wrong signer',e=>e.signerFingerprint='0'.repeat(64)],
 ['wrong source',e=>e.sourceSha='0'.repeat(40)],['unpinned Flutter',e=>e.toolchain.flutter='3.48.0'],['secret evidence',e=>e.password='hidden'],['duplicate APK',e=>e.artifacts[1].kind='APK'],['missing AAB',e=>e.artifacts.pop()],['secret artifact',e=>e.artifacts[0].token='hidden'],
])test(`rejects provenance ${name}`,()=>{const {m,c}=fixture(),plan=planTestAndroidBuild(m,c),e=evidence(plan);mutate(e);assert.throws(()=>recordTestAndroidProvenance(plan,e));});

// V5.5.4: isolated native inputs without generated platform wrapper mutation.
const validPng=()=>{
 const png=new Uint8Array(33);
 png.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82],0);
 png[19]=1;png[23]=1;png[24]=8;png[25]=6;
 return png;
};
function overlayFixture(role='RESIDENT') {
 const {m,c}=fixture(role);
 const png=validPng(),d=createHash('sha256').update(png).digest('hex');
 m.assetDigests.icon=d;m.assetDigests.splash=d;
 c.verifiedAssets.forEach(a=>{a.digest=d;});
 const plan=planTestAndroidBuild(m,c);
 const reservation={id:'55555555-5555-4555-8555-555555555555',
  revisionId:'66666666-6666-4666-8666-666666666666',versionCode:101,
  digest:plan.manifestDigest,status:'RESERVED_TEST_ONLY',testOnly:true,dispatchAllowed:false};
 return {plan,reservation,png};
}
for(const role of ['RESIDENT','GUARD'])test(`TEST ${role} native overlay is disposable, non-dispatchable and uses a fixed file inventory`,async()=>{
 const {plan,reservation,png}=overlayFixture(role);
 const overlay=await materializeTestAndroidResourceOverlay(plan,reservation,{icon:png,splash:png});
 try {
  assert.equal(overlay.testOnly,true);assert.equal(overlay.dispatchAllowed,false);
  assert.equal(overlay.artifactProduced,false);assert.equal(overlay.appDirectory,`apps/${role.toLowerCase()}`);
  assert.equal(overlay.root.startsWith(tmpdir()),true);
  const metadata=JSON.parse(await readFile(join(overlay.root,'.aaraagate','test-build-input.json'),'utf8'));
  assert.equal(metadata.applicationId,plan.manifest.applicationId);
  assert.equal(metadata.versionCode,101);assert.equal(metadata.archiveVerified,false);
  assert.equal(metadata.requiresNativeManifestPatch,true);
  assert.equal(metadata.dispatchAllowed,false);assert.equal(metadata.artifactProduced,false);
  assert.deepEqual(new Uint8Array(await readFile(join(overlay.root,'android','app','src','main','res','drawable-nodpi','aaraagate_test_icon.png'))),png);
  assert.deepEqual(new Uint8Array(await readFile(join(overlay.root,'android','app','src','main','res','drawable-nodpi','aaraagate_test_splash.png'))),png);
 } finally {await rm(overlay.root,{recursive:true,force:true});}
 await assert.rejects(readFile(join(overlay.root,'.aaraagate','test-build-input.json'),'utf8'));
});
for(const [label,mutate] of [
 ['missing reservation',x=>x.reservation=null],
 ['unreserved version',x=>x.reservation.versionCode=0],
 ['version overflow',x=>x.reservation.versionCode=2100000001],
 ['untrusted digest',x=>x.reservation.digest='0'.repeat(64)],
 ['foreign revision',x=>x.reservation.revisionId='invalid'],
 ['already dispatched',x=>x.reservation.dispatchAllowed=true],
 ['release mode',x=>x.plan={...x.plan,manifest:{...x.plan.manifest,buildMode:'RELEASE'}}],
 ['false source',x=>x.plan={...x.plan,manifest:{...x.plan.manifest,sourceSha:'0'.repeat(40)}}],
 ['app checkout drift',x=>x.plan={...x.plan,appDirectory:'apps/unknown'}],
 ['tampered icon bytes',x=>x.png[20]++],
 ['incomplete bytes',x=>x.png=new Uint8Array(12)]
])test(`TEST overlay rejects ${label}`,async()=>{
 const x=overlayFixture();mutate(x);
 await assert.rejects(materializeTestAndroidResourceOverlay(x.plan,x.reservation,{icon:x.png,splash:x.png}));
});
test('TEST overlay refuses wrong PNG header even if the supplied bytes digest is internally consistent',async()=>{
 const {m,c}=fixture(),fake=new Uint8Array(34).fill(3),digest=createHash('sha256').update(fake).digest('hex');
 m.assetDigests.icon=digest;m.assetDigests.splash=digest;
 c.verifiedAssets.forEach(a=>{a.digest=digest});
 const plan=planTestAndroidBuild(m,c),reservation={id:'55555555-5555-4555-8555-555555555555',
  revisionId:'66666666-6666-4666-8666-666666666666',versionCode:1,
  digest:plan.manifestDigest,status:'RESERVED_TEST_ONLY',testOnly:true,dispatchAllowed:false};
 await assert.rejects(materializeTestAndroidResourceOverlay(plan,reservation,{icon:fake,splash:fake}),/PNG/);
});


// V5.5.6 strict pure Kotlin wrapper patch tests: no build, dispatch or native file writes.
const kotlinTemplate=role=>{
 const p='com.aaraaplatforms.aaraagate_'+role.toLowerCase();
 return {
  gradleKts:'plugins {\n id("com.android.application")\n id("kotlin-android")\n id("dev.flutter.flutter-gradle-plugin")\n}\nandroid {\n namespace = "'+p+'"\n compileSdk = flutter.compileSdkVersion\n defaultConfig {\n applicationId = "'+p+'"\n minSdk = flutter.minSdkVersion\n versionCode = flutter.versionCode\n versionName = flutter.versionName\n }\n}\n',
  manifestXml:'<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n <application android:label="aaraagate_'+role.toLowerCase()+'" android:icon="@mipmap/ic_launcher" android:name="'+ '$'+'{applicationName}">\n <activity android:name=".MainActivity" android:exported="true">\n <intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter>\n </activity>\n </application>\n</manifest>\n',
  mainActivityKotlin:'package '+p+'\nimport io.flutter.embedding.android.FlutterActivity\nclass MainActivity: FlutterActivity() {}\n'
 };
};
for(const role of ['RESIDENT','GUARD'])test('V5.5.6 '+role+' Kotlin native TEST patch plans scoped package and launcher branding',()=>{
 const {plan,reservation}=overlayFixture(role),source=kotlinTemplate(role),before=clone(source);
 const patch=planTestAndroidNativeWrapperPatch(plan,reservation,source);
 assert.equal(patch.dispatchAllowed,false);assert.equal(patch.artifactProduced,false);
 assert.equal(patch.versionCode,101);assert.equal(patch.requiresTrustedWorker,true);
 assert.match(patch.files['android/app/build.gradle.kts'],/versionCode = 101/);
 assert.ok(patch.files['android/app/build.gradle.kts'].includes('applicationId = "'+plan.manifest.applicationId+'"'));
 assert.ok(patch.files['android/app/src/main/AndroidManifest.xml'].includes('@drawable/aaraagate_test_icon'));
 assert.ok(patch.files['android/app/src/main/AndroidManifest.xml'].includes('android:host="app.fixture.in"'));
 assert.ok(patch.files['android/app/src/main/res/drawable/launch_background.xml'].includes('@drawable/aaraagate_test_splash'));
 const path='android/app/src/main/kotlin/'+plan.manifest.applicationId.replaceAll('.','/')+'/MainActivity.kt';
 assert.ok(patch.files[path].startsWith('package '+plan.manifest.applicationId+'\n'));
 assert.equal(Object.isFrozen(patch.files),true);assert.deepEqual(source,before);
});
for(const [label,change] of [
 ['extra template input',x=>x.generated.extra='unsafe'],
 ['incorrect Flutter namespace',x=>x.generated.gradleKts=x.generated.gradleKts.replace('com.aaraaplatforms.aaraagate_resident','in.foreign.default')],
 ['missing plugin',x=>x.generated.gradleKts=x.generated.gradleKts.replace('dev.flutter.flutter-gradle-plugin','other.plugin')],
 ['duplicate version code',x=>x.generated.gradleKts+='versionCode = flutter.versionCode\n'],
 ['wrong default icon',x=>x.generated.manifestXml=x.generated.manifestXml.replace('@mipmap/ic_launcher','@mipmap/foreign')],
 ['explicit cleartext',x=>x.generated.manifestXml=x.generated.manifestXml.replace('<application','<application android:usesCleartextTraffic="true"')],
 ['XML DTD',x=>x.generated.manifestXml='<!DOCTYPE manifest [ <!ENTITY xx SYSTEM "file:///etc/passwd"> ]>'+x.generated.manifestXml],
 ['unexpected Kotlin package',x=>x.generated.mainActivityKotlin=x.generated.mainActivityKotlin.replace('com.aaraaplatforms.aaraagate_resident','in.foreign.launcher')],
 ['stale reservation',x=>x.reservation.versionCode=0],
 ['mutable plan',x=>x.plan={...x.plan,manifest:{...x.plan.manifest,applicationId:'in.unknown.test'}}]
])test('V5.5.6 rejects '+label,()=>{
 const f=overlayFixture(),x={plan:f.plan,reservation:f.reservation,generated:kotlinTemplate('RESIDENT')};
 change(x);assert.throws(()=>planTestAndroidNativeWrapperPatch(x.plan,x.reservation,x.generated));
});
test('V5.5.6 escapes XML entities in reviewed TEST brand labels',()=>{
 const {m,c}=fixture();m.label='Partner & Friends "TEST"';
 c.distributions[0].approvedInputs.label=m.label;
 c.distributions[0].approvedDigest=androidBuildManifestDigest(c.distributions[0].approvedInputs);
 const plan=planTestAndroidBuild(m,c);
 const reservation={id:'55555555-5555-4555-8555-555555555555',revisionId:'66666666-6666-4666-8666-666666666666',versionCode:3,digest:plan.manifestDigest,status:'RESERVED_TEST_ONLY',testOnly:true,dispatchAllowed:false};
 const patch=planTestAndroidNativeWrapperPatch(plan,reservation,kotlinTemplate('RESIDENT'));
 assert.ok(patch.files['android/app/src/main/AndroidManifest.xml'].includes('Partner &amp; Friends &quot;TEST&quot;'));
});


// V5.5.9: staging only in a fresh disposable directory, never invoking Flutter.
const independentTemplateDigests = generated => Object.fromEntries(
 Object.entries(generated).map(([name,contents])=>[name,createHash('sha256').update(contents,'utf8').digest('hex')])
);
for(const role of ['RESIDENT','GUARD'])test('V5.5.9 '+role+' stages only TEST native resources, verified Kotlin patch and bounded evidence',async()=>{
 const {plan,reservation,png}=overlayFixture(role);
 const generated=kotlinTemplate(role);
 const before=clone(generated),digests=independentTemplateDigests(generated);
 const stage=await materializeTestAndroidNativeWorkspace(plan,reservation,{icon:png,splash:png},generated,digests);
 try{
  assert.equal(stage.testOnly,true);assert.equal(stage.dispatchAllowed,false);
  assert.equal(stage.artifactProduced,false);assert.equal(stage.cleanupRequired,true);
  assert.equal(stage.root.startsWith(tmpdir()),true);
  assert.equal(stage.manifest.generatedWrapperPresent,false);
  assert.equal(stage.manifest.workerExecutionAllowed,false);
  assert.equal(stage.manifest.archiveVerified,false);
  assert.equal(stage.manifest.signerVerified,false);
  assert.equal(stage.manifest.versionCode,101);
  assert.equal(Object.keys(stage.patchFiles).length,4);
  const metadata=JSON.parse(await readFile(join(stage.root,'.aaraagate','test-native-staging.json'),'utf8'));
  assert.equal(metadata.manifestDigest,plan.manifestDigest);
  assert.equal(metadata.sourceSha,plan.manifest.sourceSha);
  assert.deepEqual(metadata.templateDigests,digests);
  for(const [relative,info] of Object.entries(stage.patchFiles)){
   const contents=await readFile(join(stage.root,...relative.split('/')));
   assert.equal(createHash('sha256').update(contents).digest('hex'),info.sha256);
   assert.equal(contents.length,info.bytes);
  }
  for(const name of ['aaraagate_test_icon.png','aaraagate_test_splash.png']){
   const bytes=await readFile(join(stage.root,'android','app','src','main','res','drawable-nodpi',name));
   assert.deepEqual(new Uint8Array(bytes),png);
  }
  const kotlinPath='android/app/src/main/kotlin/'+plan.manifest.applicationId.replaceAll('.','/')+'/MainActivity.kt';
  assert.equal(stage.patchFiles[kotlinPath].bytes>20,true);
  assert.notEqual(stage.obsoleteActivityPath,kotlinPath);
  assert.deepEqual(generated,before);
 }finally{
  await rm(stage.root,{recursive:true,force:true});
 }
 await assert.rejects(readFile(join(stage.root,'.aaraagate','test-native-staging.json'),'utf8'));
});
for(const [reason,mutate] of [
 ['tampered generated template',x=>{x.generated.manifestXml=x.generated.manifestXml.replace('android:label=','android:debuggable="true" android:label=');}],
 ['untrusted expected digest',x=>{x.digests.gradleKts='0'.repeat(64);}],
 ['missing independent digest',x=>{delete x.digests.gradleKts;}],
 ['extra template field',x=>{x.generated.extra='unchecked';}],
 ['changed version reservation',x=>{x.reservation.versionCode=0;}],
 ['altered approved icon',x=>{x.png[12]++;}],
 ['changed TEST source',x=>{x.plan={...x.plan,manifest:{...x.plan.manifest,sourceSha:'0'.repeat(40)}};}],
 ['foreign role directory',x=>{x.plan={...x.plan,appDirectory:'apps/foreign'};}],
])test('V5.5.9 fails closed before leaving a workspace on '+reason,async()=>{
 const f=overlayFixture(),generated=kotlinTemplate('RESIDENT');
 const x={...f,generated,digests:independentTemplateDigests(generated)};
 mutate(x);
 await assert.rejects(materializeTestAndroidNativeWorkspace(
  x.plan,x.reservation,{icon:x.png,splash:x.png},x.generated,x.digests));
});

// V5.5.10: actual pinned checkout and lock verification contract.
import './android-test-checkout.test.mjs';
