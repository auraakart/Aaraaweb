import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { normalizePartnerDomainHostname } from './partner-domain-contract.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex=/^[0-9a-f]{64}$/;
const fail=message=>{throw new Error(message);};
const exact=(obj,keys)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.keys(obj).sort().join(',')===[...keys].sort().join(',');
function one(text,re,replacement,label){
 if([...text.matchAll(new RegExp(re.source,'g'))].length!==1)
  fail('Unexpected Flutter Kotlin wrapper: '+label);
 return text.replace(re,replacement);
}
const xml=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;')
 .replaceAll("'",'&apos;').replaceAll('<','&lt;').replaceAll('>','&gt;');

/** Pure TEST-only native patch data, NOT a worker, build permit or verifier.
 * Only a trusted worker may stage the output after independently checking a
 * pinned Flutter wrapper and both live distribution authority checkpoints. */
export function planTestAndroidNativeWrapperPatch(plan,reservation,generated){
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!plan.manifest||
    plan.manifestDigest!==androidBuildManifestDigest(plan.manifest)||
    !['RESIDENT','GUARD'].includes(plan.manifest.appRole)||
    plan.appDirectory!=='apps/'+plan.manifest.appRole.toLowerCase())
  fail('Invalid TEST Android plan');
 const m=plan.manifest;
 if(m.schemaVersion!==1||m.buildMode!=='TEST'||
    typeof m.applicationId!=='string'||m.applicationId.length>150||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(m.applicationId)||
    /^(com\.example|com\.aaraagate|in\.aaraagate|com\.aaraaweb|com\.aaraaplatforms)(\.|$)/.test(m.applicationId)||
    m.namespace!==m.applicationId||typeof m.label!=='string'||m.label.length<1||m.label.length>60||
    /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069<>]/.test(m.label)||
    !/^[0-9a-f]{40}$/.test(m.sourceSha)||!hex.test(m.lockDigest)||!hex.test(m.signerFingerprint))
  fail('Invalid TEST native identity');
 if(!exact(reservation,['id','revisionId','versionCode','digest','status','testOnly','dispatchAllowed'])||
    reservation.status!=='RESERVED_TEST_ONLY'||reservation.testOnly!==true||
    reservation.dispatchAllowed!==false||!uuid.test(reservation.id)||!uuid.test(reservation.revisionId)||
    reservation.digest!==plan.manifestDigest||!Number.isSafeInteger(reservation.versionCode)||
    reservation.versionCode<1||reservation.versionCode>2100000000)
  fail('Invalid reserved TEST Android versionCode');
 if(!Array.isArray(m.appLinkHosts)||m.appLinkHosts.length>5||
    new Set(m.appLinkHosts).size!==m.appLinkHosts.length||
    m.appLinkHosts.some(h=>typeof h!=='string'||h.length>253||normalizePartnerDomainHostname(h)!==h))
  fail('Invalid verified app-link host');
 if(!exact(generated,['gradleKts','manifestXml','mainActivityKotlin'])||
    Object.values(generated).some(s=>typeof s!=='string'||s.length<50||s.length>40000||s.includes('\0')))
  fail('Invalid generated Kotlin wrapper inventory');
 let {gradleKts,manifestXml,mainActivityKotlin}=generated;
 const role=m.appRole.toLowerCase(),defaultPackage='com.aaraaplatforms.aaraagate_'+role;
 if(!gradleKts.includes('id("com.android.application")')||
    !gradleKts.includes('id("kotlin-android")')||
    !gradleKts.includes('id("dev.flutter.flutter-gradle-plugin")')||
    gradleKts.includes('applicationIdSuffix')||gradleKts.includes('signingConfigs.getByName("release")')||
    !manifestXml.includes('xmlns:android="http://schemas.android.com/apk/res/android"')||
    /<!DOCTYPE|<!ENTITY|android:(?:debuggable|usesCleartextTraffic)="true"/i.test(manifestXml)||
    manifestXml.includes('android:networkSecurityConfig=')||
    !manifestXml.includes('android:name=".MainActivity"')||manifestXml.includes('android:autoVerify=')||
    !mainActivityKotlin.includes('import io.flutter.embedding.android.FlutterActivity'))
  fail('Unexpected or unsafe Flutter-generated native template');
 if(generated.gradleKts.match(/\bnamespace\s*=\s*"([^"]*)"/)?.[1]!==defaultPackage||
    generated.gradleKts.match(/\bapplicationId\s*=\s*"([^"]*)"/)?.[1]!==defaultPackage||
    generated.manifestXml.match(/android:label="([^"]*)"/)?.[1]!=='aaraagate_'+role||
    generated.mainActivityKotlin.match(/^package\s+([a-zA-Z0-9_.]+)/m)?.[1]!==defaultPackage||
    !/class MainActivity\s*:\s*FlutterActivity\(\)/.test(mainActivityKotlin))
  fail('Foreign or already modified Flutter wrapper');
 gradleKts=one(gradleKts,/\bnamespace\s*=\s*"[^"]*"/,'namespace = "'+m.applicationId+'"','namespace');
 gradleKts=one(gradleKts,/\bapplicationId\s*=\s*"[^"]*"/,'applicationId = "'+m.applicationId+'"','applicationId');
 gradleKts=one(gradleKts,/\bversionCode\s*=\s*flutter\.versionCode\b/,
   'versionCode = '+reservation.versionCode,'versionCode');
 gradleKts=one(gradleKts,/\bcompileSdk\s*=\s*flutter\.compileSdkVersion\b/,'compileSdk = 36','compileSdk');
 gradleKts=one(gradleKts,/\bminSdk\s*=\s*flutter\.minSdkVersion\b/,'minSdk = 23','minSdk');
 manifestXml=one(manifestXml,/android:label="[^"]*"/,'android:label="'+xml(m.label)+'"','label');
 manifestXml=one(manifestXml,/android:icon="@mipmap\/ic_launcher"/,
  'android:icon="@drawable/aaraagate_test_icon"','launcher icon');
 if((manifestXml.match(/<activity\b/g)||[]).length!==1||
    (manifestXml.match(/<\/activity>/g)||[]).length!==1||
    (manifestXml.match(/<\/application>/g)||[]).length!==1)
  fail('Ambiguous Android launcher activity');
 const filters=m.appLinkHosts.map(h=>
  '            <intent-filter android:autoVerify="true">\n'+
  '                <action android:name="android.intent.action.VIEW" />\n'+
  '                <category android:name="android.intent.category.DEFAULT" />\n'+
  '                <category android:name="android.intent.category.BROWSABLE" />\n'+
  '                <data android:scheme="https" android:host="'+xml(h)+'" />\n'+
  '            </intent-filter>\n').join('');
 if(filters)manifestXml=manifestXml.replace('</activity>',filters+'</activity>');
 mainActivityKotlin=one(mainActivityKotlin,/^package\s+[a-zA-Z0-9_.]+/m,
   'package '+m.applicationId,'Kotlin package');
 const kotlinPath='android/app/src/main/kotlin/'+m.applicationId.replaceAll('.','/')+'/MainActivity.kt';
 const oldPath='android/app/src/main/kotlin/'+defaultPackage.replaceAll('.','/')+'/MainActivity.kt';
 const splash='<?xml version="1.0" encoding="utf-8"?>\n'+
  '<layer-list xmlns:android="http://schemas.android.com/apk/res/android">\n'+
  '    <item android:drawable="@drawable/aaraagate_test_splash" />\n</layer-list>\n';
 return Object.freeze({
  environment:'TEST',testOnly:true,dispatchAllowed:false,artifactProduced:false,
  distributionId:m.distributionId,revisionId:reservation.revisionId,reservationId:reservation.id,
  manifestDigest:plan.manifestDigest,versionCode:reservation.versionCode,
  applicationId:m.applicationId,appDirectory:plan.appDirectory,sourceSha:m.sourceSha,
  lockDigest:m.lockDigest,apiOrigin:m.apiOrigin,signerFingerprint:m.signerFingerprint,
  obsoleteActivityPath:oldPath,
  files:Object.freeze({
   'android/app/build.gradle.kts':gradleKts,
   'android/app/src/main/AndroidManifest.xml':manifestXml,
   [kotlinPath]:mainActivityKotlin,
   'android/app/src/main/res/drawable/launch_background.xml':splash
  }),
  requiresTrustedWorker:true,requiresPinnedTemplateVerification:true,
  requiresSanitizedAssets:true,requiresStylesAndSplashIntegration:true,
  requiresDispatchAndCompletionReauthorization:true,requiresRealSignerAndArchiveVerification:true
 });
}
