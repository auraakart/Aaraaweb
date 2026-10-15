import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const SHA=/^[a-f0-9]{64}$/, APP=/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/;
const fail=m=>{throw new Error(m);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const keys=o=>o&&typeof o==='object'&&!Array.isArray(o)?Object.keys(o).sort().join(','):'';
const rootPrefix=join(tmpdir(),'aaraagate-test-android12-');
const main='android/app/src/main/';
const gradle='android/app/build.gradle.kts';
const manifest=main+'AndroidManifest.xml';
const resources=main+'res/';
function expectedPaths(applicationId){
 return [
  '.aaraagate/test-build-input.json',
  '.aaraagate/test-native-staging.json',
  gradle,manifest,
  main+'kotlin/'+applicationId.replaceAll('.','/')+'/MainActivity.kt',
  resources+'drawable/launch_background.xml',
  resources+'drawable-nodpi/aaraagate_test_icon.png',
  resources+'drawable-nodpi/aaraagate_test_splash.png',
  ...['values','values-night','values-v31','values-night-v31']
   .map(v=>resources+v+'/styles.xml')
 ].sort();
}
const one=(text,re,label)=>{const all=[...text.matchAll(new RegExp(re.source,'g'))];
 if(all.length!==1)fail('Unexpected TEST Android identity or version: '+label);
 return all[0][1];
};
async function fileList(root){
 const found=[];
 async function walk(dir,depth){
  if(depth>18)fail('Excessive TEST Android staging depth');
  const s=await lstat(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022))
   fail('Writable or linked TEST Android staging directory');
  for(const item of await readdir(dir,{withFileTypes:true})){
   if(item.name==='.'||item.name==='..'||item.name.includes('\\')||
      /[\x00-\x1f\x7f]/.test(item.name))
    fail('Unsafe TEST Android staging filename');
   const path=join(dir,item.name);
   if(item.isSymbolicLink()||(!item.isDirectory()&&!item.isFile()))
    fail('TEST Android staging link or special file');
   if(item.isDirectory())await walk(path,depth+1);
   else {
    const stat=await lstat(path);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1||
       (stat.mode&0o022)||stat.size<1||stat.size>2*1024*1024)
     fail('Unsafe TEST Android final file permissions/size');
    found.push(relative(root,path).split('\\').join('/'));
    if(found.length>13)fail('Unexpected additional TEST Android staged files');
   }
  }
 }
 await walk(root,0);
 return found.sort();
}
/**
 * Re-hash exactly 12 approved native TEST inputs + final overlay receipt
 * after V5.5.17. Verify distinct resident/guard package identity, version
 * reservation, min/target/compile API, Kotlin, manifest and splash wiring.
 * This is NOT an actual Flutter-generated native wrapper or signed artifact.
 */
export async function verifyFinalTestAndroid12NativeOverlay(plan,reservation,overlay){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    !APP.test(m.applicationId)||m.namespace!==m.applicationId||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m))
  fail('Invalid final TEST Android identity and manifest');
 if(!reservation||reservation.status!=='RESERVED_TEST_ONLY'||
    reservation.testOnly!==true||reservation.dispatchAllowed!==false||
    reservation.digest!==plan.manifestDigest||
    !Number.isSafeInteger(reservation.versionCode)||
    reservation.versionCode<1||reservation.versionCode>2100000000)
  fail('Invalid reserved TEST Android version');
 if(!overlay||overlay.testOnly!==true||overlay.dispatchAllowed!==false||
    overlay.artifactProduced!==false||overlay.flutterWrapperGenerated!==false||
    overlay.nativeStylesIntegrated!==true||overlay.android12ThemeResourcesIntegrated!==true||
    overlay.cleanupRequired!==true||overlay.fileCount!==13||
    overlay.appDirectory!==plan.appDirectory||typeof overlay.root!=='string'||
    !overlay.root.startsWith(rootPrefix)||
    resolve(overlay.root)!==overlay.root||
    !overlay.receipt||!overlay.files||
    keys(overlay.files)!==expectedPaths(m.applicationId).join(','))
  fail('Untrusted TEST Android native overlay');
 const root=overlay.root;
 if(await realpath(root)!==root)fail('Untrusted final Android root alias');
 const expected=[...expectedPaths(m.applicationId),'.aaraagate/test-android12-themes.json'].sort();
 if((await fileList(root)).join(',')!==expected.join(','))
  fail('Unexpected or missing final TEST Android native files');
 const receipt=JSON.parse(await readFile(join(root,'.aaraagate/test-android12-themes.json'),'utf8'));
 if(JSON.stringify(receipt)!==JSON.stringify(overlay.receipt)||
    JSON.stringify(receipt.files)!==JSON.stringify(overlay.files)||
    receipt.schemaVersion!==1||receipt.environment!=='TEST'||
    receipt.testOnly!==true||receipt.dispatchAllowed!==false||
    receipt.flutterWrapperGenerated!==false||receipt.toolchainExecutionStarted!==false||
    receipt.artifactProduced!==false||receipt.signerVerified!==false||
    receipt.archiveVerified!==false||receipt.nativeStylesIntegrated!==true||
    receipt.android12ThemeResourcesIntegrated!==true||
    receipt.distributionId!==m.distributionId||receipt.appRole!==m.appRole||
    receipt.reservationId!==reservation.id||receipt.revisionId!==reservation.revisionId||
    receipt.versionCode!==reservation.versionCode||
    receipt.manifestDigest!==plan.manifestDigest||
    receipt.sourceSha!==m.sourceSha||receipt.lockDigest!==m.lockDigest)
  fail('Altered or foreign final TEST Android overlay receipt');
 const bodies={};
 for(const p of expectedPaths(m.applicationId)){
  const info=overlay.files[p];
  if(!info||keys(info)!=='bytes,sha256'||!SHA.test(info.sha256)||
     !Number.isSafeInteger(info.bytes)||info.bytes<1||info.bytes>2*1024*1024)
   fail('Unknown TEST Android final file digest/size');
  const b=await readFile(join(root,...p.split('/')));
  if(b.length!==info.bytes||hash(b)!==info.sha256)
   fail('Tampered TEST Android final file: '+p);
  bodies[p]=b;
 }
 for(const kind of ['icon','splash']){
  const p=resources+'drawable-nodpi/aaraagate_test_'+kind+'.png';
  if(!SHA.test(m.assetDigests?.[kind])||hash(bodies[p])!==m.assetDigests[kind])
   fail('Unapproved TEST Android PNG bytes');
 }
 const g=bodies[gradle].toString('utf8');
 const k=bodies[main+'kotlin/'+m.applicationId.replaceAll('.','/')+'/MainActivity.kt'].toString('utf8');
 const x=bodies[manifest].toString('utf8');
 if(one(g,/\bnamespace\s*=\s*"([^"]+)"/,'namespace')!==m.applicationId||
    one(g,/\bapplicationId\s*=\s*"([^"]+)"/,'applicationId')!==m.applicationId||
    Number(one(g,/\bversionCode\s*=\s*(\d+)/,'versionCode'))!==reservation.versionCode||
    Number(one(g,/\bminSdk\s*=\s*(\d+)/,'minSdk'))!==24||
    Number(one(g,/\btargetSdk\s*=\s*(\d+)/,'targetSdk'))!==36||
    Number(one(g,/\bcompileSdk\s*=\s*(\d+)/,'compileSdk'))!==36||
    g.includes('applicationIdSuffix')||/signingConfigs\.getByName\("release"\)/.test(g)||
    one(k,/^package\s+([a-z0-9_.]+)/m,'Kotlin package')!==m.applicationId||
    !/\bclass MainActivity\s*:\s*FlutterActivity\(\)/.test(k)||
    !k.includes('import io.flutter.embedding.android.FlutterActivity'))
  fail('TEST Android package, SDK target or versionCode mismatch');
 if(/<!DOCTYPE|<!ENTITY|android:(?:debuggable|usesCleartextTraffic)="true"/i.test(x)||
    one(x,/android:label="([^"]+)"/,'launcher label')!==m.label.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll("'",'&apos;').replaceAll('<','&lt;').replaceAll('>','&gt;')||
    !x.includes('android:icon="@drawable/aaraagate_test_icon"')||
    !x.includes('android:name=".MainActivity"')||
    (x.match(/android:theme="@style\/LaunchTheme"/g)||[]).length!==1||
    (x.match(/io\.flutter\.embedding\.android\.NormalTheme/g)||[]).length!==1||
    (x.match(/android:resource="@style\/NormalTheme"/g)||[]).length!==1)
  fail('TEST Android launcher theme, icon or label mismatch');
 for(const [value,night,api31] of [
  ['values',false,false],['values-night',true,false],
  ['values-v31',false,true],['values-night-v31',true,true]
 ]){
  const s=bodies[resources+value+'/styles.xml'].toString('utf8');
  if((s.match(/name="LaunchTheme"/g)||[]).length!==1||
     (s.match(/name="NormalTheme"/g)||[]).length!==1||
     !s.includes('@drawable/launch_background')||
     !s.includes(night?'@android:style/Theme.Black.NoTitleBar':'@android:style/Theme.Light.NoTitleBar')||
     (s.includes('android:windowSplashScreenAnimatedIcon')!==api31)||
     (api31&&!s.includes('@drawable/aaraagate_test_icon')))
   fail('Unexpected Android 12 day/night TEST splash styles');
 }
 const completeHash=hash(Buffer.from(expectedPaths(m.applicationId).map(p=>
  p+'\0'+overlay.files[p].bytes+'\0'+overlay.files[p].sha256).join('\n'),'utf8'));
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,appRole:m.appRole,
  applicationId:m.applicationId,versionCode:reservation.versionCode,
  minSdk:24,targetSdk:36,compileSdk:36,
  reservationId:reservation.id,manifestDigest:plan.manifestDigest,
  sourceSha:m.sourceSha,lockDigest:m.lockDigest,
  verifiedFileCount:13,finalNativeOverlayVerified:true,
  nativeOverlayDigest:completeHash,
  flutterWrapperGenerated:false,runnerImageAttested:false,
  signerVerified:false,archiveVerified:false,artifactProduced:false,
  dispatchAllowed:false,
  requiresIndependentGeneratedWrapperAndRunnerProof:true
 });
}
