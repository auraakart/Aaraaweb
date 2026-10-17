import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, lstat, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { verifyStagedTestAndroidInventory } from './android-test-staging-inventory.mjs';

const sha=data=>createHash('sha256').update(data).digest('hex');
const fail=message=>{throw new Error(message);};
const xmlRoot='android/app/src/main/res/';
const manifestPath='android/app/src/main/AndroidManifest.xml';
const themeNames=[
 'values/styles.xml','values-night/styles.xml',
 'values-v31/styles.xml','values-night-v31/styles.xml'
];
const validRoot=(value)=>value&&typeof value==='object'&&value.testOnly===true&&
 value.dispatchAllowed===false&&value.artifactProduced===false;
/**
 * Integrate reviewed Android 12 splash/theme XML into a NEW, disposable
 * TEST overlay. The previous V5.5.11 eight-file staging is verified first
 * and never edited; returned copy is a non-dispatchable native INPUT,
 * not a generated Flutter wrapper or a build artifact.
 */
export async function materializeTestAndroid12ThemeWorkspace(plan,reservation,stage){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    !m||m.schemaVersion!==1||m.buildMode!=='TEST'||
    !['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !validRoot(stage))
  fail('Unapproved TEST Android 12 theme plan');
 const source=await verifyStagedTestAndroidInventory(plan,reservation,stage);
 if(!source.inventoryVerified||source.verifiedFileCount!==8||
    source.reservationId!==reservation.id||source.manifestDigest!==plan.manifestDigest)
  fail('Missing verified TEST native staging');
 const inputManifest=await readFile(join(stage.root,...manifestPath.split('/')));
 if(inputManifest.length!==stage.patchFiles[manifestPath]?.bytes||
    sha(inputManifest)!==stage.patchFiles[manifestPath].sha256)
  fail('TEST Android native manifest changed after verification');
 const original=inputManifest.toString('utf8');
 if(/<!DOCTYPE|<!ENTITY|android:(?:debuggable|usesCleartextTraffic)="true"/i.test(original)||
    original.includes('@style/LaunchTheme')||original.includes('@style/NormalTheme')||
    original.includes('io.flutter.embedding.android.NormalTheme'))
  fail('Unsafe or already-themed TEST Android manifest');
 const activities=[...original.matchAll(/<activity\b[^>]*>/g)];
 if(activities.length!==1||!activities[0][0].includes('android:name=".MainActivity"')||
    activities[0][0].includes('android:theme=')||
    (original.match(/<\/activity>/g)||[]).length!==1)
  fail('Unrecognized Flutter launcher activity for TEST theme');
 let themed=original.replace(activities[0][0],
  activities[0][0].replace(/>$/,' android:theme="@style/LaunchTheme">'));
 themed=themed.replace('</activity>',
  '  <meta-data android:name="io.flutter.embedding.android.NormalTheme" android:resource="@style/NormalTheme" />\n </activity>');
 const style=(dark,api31)=>{
  const parent=dark?'@android:style/Theme.Black.NoTitleBar':'@android:style/Theme.Light.NoTitleBar';
  const splash=api31?
   '        <item name="android:windowSplashScreenBackground">@android:color/'+(dark?'black':'white')+'</item>\n'+
   '        <item name="android:windowSplashScreenAnimatedIcon">@drawable/aaraagate_test_icon</item>\n':'';
  return '<?xml version="1.0" encoding="utf-8"?>\n'+
   '<resources>\n'+
   '    <style name="LaunchTheme" parent="'+parent+'">\n'+
   '        <item name="android:windowBackground">@drawable/launch_background</item>\n'+
   splash+
   '    </style>\n'+
   '    <style name="NormalTheme" parent="'+parent+'">\n'+
   '        <item name="android:windowBackground">?android:colorBackground</item>\n'+
   '    </style>\n'+
   '</resources>\n';
 };
 const themes={
  [xmlRoot+'values/styles.xml']:style(false,false),
  [xmlRoot+'values-night/styles.xml']:style(true,false),
  [xmlRoot+'values-v31/styles.xml']:style(false,true),
  [xmlRoot+'values-night-v31/styles.xml']:style(true,true)
 };
 if(Object.keys(themes).length!==themeNames.length)
  fail('Unexpected TEST theme inventory');
 const resources='android/app/src/main/res/drawable-nodpi/';
 const inputPaths=[
  ...Object.keys(stage.patchFiles),
  resources+'aaraagate_test_icon.png',resources+'aaraagate_test_splash.png',
  '.aaraagate/test-native-staging.json','.aaraagate/test-build-input.json'
 ].sort();
 if(new Set(inputPaths).size!==8)
  fail('Unexpected duplicate TEST native inventory');
 const output=await mkdtemp(join(tmpdir(),'aaraagate-test-android12-'));
 try{
  const outputFiles={};
  for(const path of inputPaths){
   const src=join(stage.root,...path.split('/')),stat=await lstat(src);
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>2*1024*1024)
    fail('Unsafe TEST native staging file');
   const originalBytes=await readFile(src);
   if(path in stage.patchFiles&&
      (sha(originalBytes)!==stage.patchFiles[path].sha256||
       originalBytes.length!==stage.patchFiles[path].bytes))
    fail('Native patch changed while composing TEST themes');
   if(path.startsWith(resources)){
    const type=path.endsWith('_icon.png')?'icon':'splash';
    if(sha(originalBytes)!==m.assetDigests[type])
     fail('TEST splash/icon digest drift');
   }
   const bytes=path===manifestPath?Buffer.from(themed,'utf8'):originalBytes;
   const target=join(output,...path.split('/'));
   await mkdir(join(output,...path.split('/').slice(0,-1)),{recursive:true,mode:0o700});
   await writeFile(target,bytes,{flag:'wx',mode:0o600});
   outputFiles[path]=Object.freeze({sha256:sha(bytes),bytes:bytes.length});
  }
  for(const [path,body] of Object.entries(themes)){
   const target=join(output,...path.split('/')),bytes=Buffer.from(body,'utf8');
   await mkdir(join(output,...path.split('/').slice(0,-1)),{recursive:true,mode:0o700});
   await writeFile(target,bytes,{flag:'wx',mode:0o600});
   outputFiles[path]=Object.freeze({sha256:sha(bytes),bytes:bytes.length});
  }
  if(Object.keys(outputFiles).length!==12)
   fail('TEST themed overlay must contain exact reviewed inputs');
  const receipt={
   schemaVersion:1,environment:'TEST',testOnly:true,
   distributionId:m.distributionId,appRole:m.appRole,
   reservationId:reservation.id,revisionId:reservation.revisionId,
   versionCode:reservation.versionCode,
   manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,lockDigest:m.lockDigest,
   inputNativePatchDigests:stage.patchFiles,
   nativeStylesIntegrated:true,android12ThemeResourcesIntegrated:true,
   flutterWrapperGenerated:false,toolchainExecutionStarted:false,
   signerVerified:false,archiveVerified:false,artifactProduced:false,dispatchAllowed:false,
   files:outputFiles
  };
  const evidence='.aaraagate/test-android12-themes.json';
  await writeFile(join(output,...evidence.split('/')),
   JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return Object.freeze({
   root:output,appDirectory:plan.appDirectory,receipt:Object.freeze(receipt),
   files:Object.freeze(outputFiles),fileCount:13,
   nativeStylesIntegrated:true,android12ThemeResourcesIntegrated:true,
   testOnly:true,dispatchAllowed:false,artifactProduced:false,cleanupRequired:true,
   flutterWrapperGenerated:false,requiresAuthenticatedImmutableWorker:true,
   requiresIndependentFinalOverlayVerification:true,requiresSignedArchiveVerification:true
  });
 }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
