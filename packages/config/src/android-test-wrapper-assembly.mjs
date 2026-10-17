import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath, readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { verifyFinalTestAndroid12NativeOverlay } from './android-test-final-native-inventory.mjs';

const SHA=/^[a-f0-9]{64}$/, sha=b=>createHash('sha256').update(b).digest('hex');
const MAX_FILES=2500,MAX_BYTES=250*1024*1024,MAX_ONE_FILE=12*1024*1024;
const fail=m=>{throw new Error(m);};
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
const mode=s=>(s.mode&0o777).toString(8).padStart(3,'0');
const canonicalPath=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p&&!p.includes('\\');
/**
 * Revalidate an independently approved V5.5.16 nativeTemplate root using
 * EXACTLY the same domain, sorted relative paths, UNIX modes and SHA-256.
 * Reads bytes only; never calls flutter create, Gradle, Java or a shell.
 */
export async function verifyFullPinnedTemplate(root,expected){
 const h=createHash('sha256').update('aaraagate:v5.5.16:test-sdk-tree:v1\n');
 let files=0,dirs=0,total=0;
 const collected=[];
 async function walk(dir,relative,depth){
  if(depth>45)fail('Excessive pinned Flutter wrapper depth');
  const s=await lstat(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o022))
   fail('Unsafe pinned Flutter template directory');
  dirs++;if(dirs>expected.directories||dirs>MAX_FILES)fail('Unexpected Flutter template dirs');
  h.update('D\0'+(relative||'.')+'\0'+mode(s)+'\n');
  const children=(await readdir(dir,{withFileTypes:true}))
   .sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
  for(const item of children){
   if(item.name==='.'||item.name==='..'||item.name.includes('\\')||
      /[\x00-\x1f\x7f]/.test(item.name))
    fail('Unsafe generated Flutter template path');
   const path=join(dir,item.name),rel=relative?relative+'/'+item.name:item.name;
   if(item.isSymbolicLink()||(!item.isFile()&&!item.isDirectory()))
    fail('Generated Flutter template contains link or device');
   if(item.isDirectory())await walk(path,rel,depth+1);
   else{
    const before=await lstat(path);
    if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||
       (before.mode&0o022)||before.size<1||before.size>MAX_ONE_FILE)
     fail('Unsafe generated Flutter template file');
    files++;total+=before.size;
    if(files>expected.files||files>MAX_FILES||total>expected.bytes||total>MAX_BYTES)
     fail('Unexpected extra Flutter template bytes');
    const ih=createHash('sha256');
    for await(const chunk of createReadStream(path))ih.update(chunk);
    const digest=ih.digest('hex'),after=await lstat(path);
    if(after.ino!==before.ino||after.dev!==before.dev||
       after.size!==before.size||after.mtimeMs!==before.mtimeMs||
       after.ctimeMs!==before.ctimeMs||after.mode!==before.mode)
     fail('Pinned Flutter template mutated during verification');
    h.update('F\0'+rel+'\0'+mode(before)+'\0'+before.size+'\0'+digest+'\n');
    collected.push({path:rel,sha256:digest,bytes:before.size});
   }
  }
 }
 await walk(root,'',0);
 if(files!==expected.files||dirs!==expected.directories||total!==expected.bytes||
    h.digest('hex')!==expected.digest)
  fail('Flutter-generated template tree differs from independently pinned SDK receipt');
 return collected;
}
/**
 * Materialize previously approved TEST overlay onto a pinned Flutter native
 * template in a NEW disposable private directory. The original template and
 * reviewed overlays are immutable inputs; no external tool executes here.
 */
export async function materializeVerifiedTestAndroidWrapperInputs(plan,reservation,overlay,sdk,acceptance,pins){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.buildMode!=='TEST'||
    !['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m))
  fail('Untrusted TEST Flutter wrapper assembly plan');
 const final=await verifyFinalTestAndroid12NativeOverlay(plan,reservation,overlay);
 if(!final.finalNativeOverlayVerified||final.dispatchAllowed!==false||final.artifactProduced!==false)
  fail('Missing fully verified Android 12 TEST overlay');
 if(!acceptance||acceptance.testOnly!==true||
    acceptance.status!=='SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION'||
    acceptance.workerSignatureVerified!==true||
    acceptance.serverReplayBarrierVerified!==true||
    acceptance.dispatchAllowed!==false||acceptance.artifactProduced!==false||
    acceptance.manifestDigest!==plan.manifestDigest)
  fail('Missing durable accepted TEST runner assertion');
 if(!sdk||sdk.testOnly!==true||
    sdk.sdkTemplateBytesVerified!==true||sdk.completeLocalTreeHashesMatched!==true||
    sdk.dispatchAllowed!==false||sdk.artifactProduced!==false||
    sdk.manifestDigest!==plan.manifestDigest||
    sdk.sourceSha!==m.sourceSha||sdk.lockDigest!==m.lockDigest||
    sdk.workerId!==acceptance.workerId||sdk.runId!==acceptance.runId||
    !sdk.verifiedTrees?.nativeTemplate)
  fail('Missing pinned generated Flutter template verification');
 if(!exact(pins,['generatedRoot','workerId','runId','nativeTemplateSha256','flutterVersion'])||
    !canonicalPath(pins.generatedRoot)||
    pins.workerId!==acceptance.workerId||pins.runId!==acceptance.runId||
    pins.flutterVersion!=='3.47.0'||
    !SHA.test(pins.nativeTemplateSha256)||
    pins.nativeTemplateSha256!==sdk.verifiedTrees.nativeTemplate.digest||
    !exact(sdk.verifiedTrees.nativeTemplate,['digest','files','directories','bytes']))
  fail('Untrusted independent Flutter 3.47 template pin');
 const root=pins.generatedRoot;
 if(await realpath(root)!==root||!((await lstat(root)).isDirectory())||
    root===overlay.root||root.startsWith(overlay.root+sep)||
    overlay.root.startsWith(root+sep))
  fail('Foreign or overlapping Flutter template path');
 const files=await verifyFullPinnedTemplate(root,sdk.verifiedTrees.nativeTemplate);
 const paths=files.map(f=>f.path);
 const oldActivity='android/app/src/main/kotlin/com/aaraaplatforms/aaraagate_'+
  m.appRole.toLowerCase()+'/MainActivity.kt';
 const required=['android/app/build.gradle.kts','android/app/src/main/AndroidManifest.xml',oldActivity];
 if(required.some(p=>!paths.includes(p)))
  fail('Missing generated Flutter 3.47 base native files');
 if(paths.filter(p=>p.endsWith('/MainActivity.kt')).length!==1)
  fail('Ambiguous generated Kotlin launcher before TEST branding');
 const overlays=Object.keys(overlay.files).filter(p=>p.startsWith('android/')).sort();
 if(overlays.length!==10||overlays.some(p=>!overlay.files[p]?.sha256))
  fail('Unexpected approved TEST native overlay file set');
 const output=await mkdtemp(join(tmpdir(),'aaraagate-test-assembled-wrapper-'));
 try{
  const finalFiles={};
  for(const file of files){
   if(file.path===oldActivity||overlays.includes(file.path))continue;
   const data=await readFile(join(root,...file.path.split('/')));
   if(data.length!==file.bytes||sha(data)!==file.sha256)
    fail('Generated Flutter wrapper bytes changed during assembly');
   const to=join(output,...file.path.split('/'));
   await mkdir(join(output,...file.path.split('/').slice(0,-1)),{recursive:true,mode:0o700});
   await writeFile(to,data,{flag:'wx',mode:0o600});
   finalFiles[file.path]={sha256:sha(data),bytes:data.length,origin:'PINNED_TEMPLATE'};
  }
  for(const path of overlays){
   const info=overlay.files[path],data=await readFile(join(overlay.root,...path.split('/')));
   if(sha(data)!==info.sha256||data.length!==info.bytes)
    fail('Approved TEST overlay modified during assembly');
   const to=join(output,...path.split('/'));
   await mkdir(join(output,...path.split('/').slice(0,-1)),{recursive:true,mode:0o700});
   await writeFile(to,data,{flag:'wx',mode:0o600});
   finalFiles[path]={sha256:sha(data),bytes:data.length,origin:'APPROVED_TEST_OVERLAY'};
  }
  const sorted=Object.entries(finalFiles).sort(([a],[b])=>a<b?-1:a>b?1:0);
  const assemblyDigest=sha(Buffer.from(sorted.map(([p,v])=>
   p+'\0'+v.bytes+'\0'+v.sha256+'\0'+v.origin).join('\n')));
  const receipt={
   schemaVersion:1,environment:'TEST',testOnly:true,appRole:m.appRole,
   applicationId:m.applicationId,versionCode:reservation.versionCode,
   minSdk:24,targetSdk:36,compileSdk:36,
   sourceSha:m.sourceSha,lockDigest:m.lockDigest,manifestDigest:plan.manifestDigest,
   reservationId:reservation.id,workerId:acceptance.workerId,runId:acceptance.runId,
   nativeTemplateDigest:pins.nativeTemplateSha256,
   approvedOverlayDigest:final.nativeOverlayDigest,
   assemblyDigest,files:finalFiles,
   nativeInputsMaterialized:true,flutterWrapperGenerated:false,
   runnerImageAttested:false,executionStarted:false,
   signerVerified:false,archiveVerified:false,artifactProduced:false,
   dispatchAllowed:false
  };
  const receiptPath=join(output,'.aaraagate','test-assembled-wrapper.json');
  await mkdir(join(output,'.aaraagate'),{recursive:true,mode:0o700});
  await writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
  return Object.freeze({
   root:output,receipt:Object.freeze(receipt),fileCount:sorted.length+1,
   assemblyDigest,nativeInputsMaterialized:true,
   testOnly:true,cleanupRequired:true,dispatchAllowed:false,
   flutterWrapperGenerated:false,executionStarted:false,artifactProduced:false,
   requiresIndependentFullAssembledTreeRecheck:true,
   requiresTrustedAttestedRuntimeBeforeBuild:true
  });
 }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
