import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { verifyFinalTestAndroid12NativeOverlay } from './android-test-final-native-inventory.mjs';
import { verifyFullPinnedTemplate } from './android-test-wrapper-assembly.mjs';

const SHA=/^[0-9a-f]{64}$/;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const error=message=>{throw new Error(message);};
const exact=(obj,fields)=>obj!==null&&typeof obj==='object'&&!Array.isArray(obj)&&
 Object.getPrototypeOf(obj)===Object.prototype&&
 Object.keys(obj).sort().join(',')===fields.slice().sort().join(',');
const allowedMeta=['sha256','bytes','origin'];
const fields=['schemaVersion','environment','testOnly','appRole','applicationId',
 'versionCode','minSdk','targetSdk','compileSdk','sourceSha','lockDigest',
 'manifestDigest','reservationId','workerId','runId','nativeTemplateDigest',
 'approvedOverlayDigest','assemblyDigest','files','nativeInputsMaterialized',
 'flutterWrapperGenerated','runnerImageAttested','executionStarted',
 'signerVerified','archiveVerified','artifactProduced','dispatchAllowed'];
const prefix=join(tmpdir(),'aaraagate-test-assembled-wrapper-');
const maxFiles=2500,maxBytes=250*1024*1024,maxFile=12*1024*1024;
const safeRelative=p=>typeof p==='string'&&p.startsWith('android/')&&
 p.length<300&&!p.includes('\\')&&!p.split('/').some(s=>!s||s==='.'||s==='..')&&
 !/[\x00-\x1f\x7f]/.test(p);

/** Rescan output from the filesystem. No trusted caller-supplied inventory. */
async function listFiles(root){
 const collected=[],seen=new Set();
 let bytes=0;
 async function walk(dir,depth){
  if(depth>45)error('Deep assembled Flutter wrapper tree');
  const st=await lstat(dir);
  if(!st.isDirectory()||st.isSymbolicLink()||(st.mode&0o022))
   error('Untrusted or writable assembled directory');
  for(const item of await readdir(dir,{withFileTypes:true})){
   if(item.name==='.'||item.name==='..'||item.name.includes('\\')||
      /[\x00-\x1f\x7f]/.test(item.name))
    error('Unsafe assembled wrapper path segment');
   const loc=join(dir,item.name),p=relative(root,loc).split(sep).join('/');
   if(item.isSymbolicLink()||(!item.isFile()&&!item.isDirectory()))
    error('Symbolic link or special node in final wrapper');
   if(item.isDirectory())await walk(loc,depth+1);
   else {
    const s=await lstat(loc);
    if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||
       (s.mode&0o022)||s.size<1||s.size>maxFile)
     error('Unsafe assembled wrapper file, permission or hardlink');
    bytes+=s.size;
    if(bytes>maxBytes||collected.length>=maxFiles||seen.has(p))
     error('Excessive or repeated assembled wrapper content');
    seen.add(p);collected.push(p);
   }
  }
 }
 await walk(root,0);
 return collected.sort();
}

/**
 * V5.5.22 independent re-check: compare the resulting disposable TEST native
 * workspace to BOTH the protected full template tree and approved overlay.
 * Hash each real output byte, enforce expected provenance and exact file set.
 * Does not execute Gradle, attest a runtime image or authorize a build.
 */
export async function verifyAssembledTestAndroidWrapperInputs(plan,reservation,
 overlay,assembled,sdk,acceptance,pins){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.buildMode!=='TEST'||
    !['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m))
  error('Invalid TEST Android assembled build plan');
 const native=await verifyFinalTestAndroid12NativeOverlay(plan,reservation,overlay);
 if(native.finalNativeOverlayVerified!==true||native.dispatchAllowed!==false||
    native.artifactProduced!==false)
  error('Unapproved TEST native input overlay');
 if(!acceptance||acceptance.testOnly!==true||
    acceptance.status!=='SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION'||
    acceptance.workerSignatureVerified!==true||
    acceptance.serverReplayBarrierVerified!==true||
    acceptance.dispatchAllowed!==false||acceptance.artifactProduced!==false||
    acceptance.manifestDigest!==plan.manifestDigest)
  error('Missing consumed TEST worker acceptance');
 if(!sdk||sdk.testOnly!==true||sdk.sdkTemplateBytesVerified!==true||
    sdk.completeLocalTreeHashesMatched!==true||
    sdk.dispatchAllowed!==false||sdk.artifactProduced!==false||
    sdk.manifestDigest!==plan.manifestDigest||
    sdk.sourceSha!==m.sourceSha||sdk.lockDigest!==m.lockDigest||
    sdk.workerId!==acceptance.workerId||sdk.runId!==acceptance.runId||
    !exact(sdk.verifiedTrees?.nativeTemplate,['digest','files','directories','bytes']))
  error('Missing independently pinned Flutter template root');
 if(!exact(pins,['generatedRoot','workerId','runId','nativeTemplateSha256','flutterVersion'])||
    pins.flutterVersion!=='3.47.0'||
    pins.workerId!==acceptance.workerId||pins.runId!==acceptance.runId||
    !SHA.test(pins.nativeTemplateSha256)||
    pins.nativeTemplateSha256!==sdk.verifiedTrees.nativeTemplate.digest||
    typeof pins.generatedRoot!=='string'||
    resolve(pins.generatedRoot)!==pins.generatedRoot||
    await realpath(pins.generatedRoot)!==pins.generatedRoot)
  error('Mismatched protected Flutter 3.47 template policy');
 if(!assembled||assembled.testOnly!==true||
    assembled.cleanupRequired!==true||assembled.dispatchAllowed!==false||
    assembled.artifactProduced!==false||assembled.executionStarted!==false||
    assembled.flutterWrapperGenerated!==false||
    assembled.nativeInputsMaterialized!==true||
    assembled.requiresIndependentFullAssembledTreeRecheck!==true||
    assembled.requiresTrustedAttestedRuntimeBeforeBuild!==true||
    !SHA.test(assembled.assemblyDigest)||
    typeof assembled.root!=='string'||!assembled.root.startsWith(prefix)||
    resolve(assembled.root)!==assembled.root||
    await realpath(assembled.root)!==assembled.root||
    assembled.root===pins.generatedRoot||assembled.root===overlay.root)
  error('Untrusted, aliased or executable TEST wrapper assembly');
 const tmpl=await verifyFullPinnedTemplate(
  pins.generatedRoot,sdk.verifiedTrees.nativeTemplate);
 const original=tmpl.map(x=>x.path);
 const obsolete='android/app/src/main/kotlin/com/aaraaplatforms/aaraagate_'+
  m.appRole.toLowerCase()+'/MainActivity.kt';
 if(!original.includes(obsolete)||
    original.filter(x=>x.endsWith('/MainActivity.kt')).length!==1||
    !original.includes('android/app/build.gradle.kts')||
    !original.includes('android/app/src/main/AndroidManifest.xml'))
  error('Unrecognized upstream Flutter launcher template');
 const overpaths=Object.keys(overlay.files).filter(p=>p.startsWith('android/')).sort();
 if(overpaths.length!==10||!overpaths.every(safeRelative))
  error('Unexpected native overlay resource paths');
 const expected=new Map();
 for(const f of tmpl){
  if(!safeRelative(f.path)||f.path===obsolete||overpaths.includes(f.path))continue;
  expected.set(f.path,{sha256:f.sha256,bytes:f.bytes,origin:'PINNED_TEMPLATE'});
 }
 for(const p of overpaths){
  const info=overlay.files[p];
  if(!SHA.test(info?.sha256)||!Number.isSafeInteger(info.bytes)||info.bytes<1)
   error('Missing approved TEST overlay digest');
  expected.set(p,{sha256:info.sha256,bytes:info.bytes,
   origin:'APPROVED_TEST_OVERLAY'});
 }
 const receiptPath='.aaraagate/test-assembled-wrapper.json';
 const paths=(await listFiles(assembled.root));
 if(paths.length!==expected.size+1||
    assembled.fileCount!==paths.length||
    paths.join('\n')!==[...expected.keys(),receiptPath].sort().join('\n'))
  error('Missing, additional or duplicated assembled wrapper file');
 const diskBytes=await readFile(join(assembled.root,receiptPath));
 if(diskBytes.length>1024*1024)error('Excessive TEST assembly metadata');
 let receipt;
 try{receipt=JSON.parse(diskBytes.toString('utf8'));}
 catch{error('Malformed TEST assembled receipt');}
 if(!exact(receipt,fields)||!exact(assembled.receipt,fields)||
    JSON.stringify(receipt)!==JSON.stringify(assembled.receipt)||
    receipt.schemaVersion!==1||receipt.environment!=='TEST'||
    receipt.testOnly!==true||receipt.nativeInputsMaterialized!==true||
    receipt.flutterWrapperGenerated!==false||
    receipt.runnerImageAttested!==false||receipt.executionStarted!==false||
    receipt.signerVerified!==false||receipt.archiveVerified!==false||
    receipt.artifactProduced!==false||receipt.dispatchAllowed!==false||
    receipt.appRole!==m.appRole||receipt.applicationId!==m.applicationId||
    receipt.versionCode!==reservation.versionCode||
    receipt.minSdk!==24||receipt.targetSdk!==36||receipt.compileSdk!==36||
    receipt.manifestDigest!==plan.manifestDigest||
    receipt.reservationId!==reservation.id||
    receipt.sourceSha!==m.sourceSha||receipt.lockDigest!==m.lockDigest||
    receipt.workerId!==acceptance.workerId||receipt.runId!==acceptance.runId||
    receipt.nativeTemplateDigest!==pins.nativeTemplateSha256||
    receipt.approvedOverlayDigest!==native.nativeOverlayDigest||
    receipt.assemblyDigest!==assembled.assemblyDigest||
    !receipt.files||typeof receipt.files!=='object'||Array.isArray(receipt.files)||
    Object.getPrototypeOf(receipt.files)!==Object.prototype||
    Object.keys(receipt.files).sort().join('\n')!==[...expected.keys()].sort().join('\n'))
  error('Tampered or foreign assembled TEST provenance receipt');
 const digestInput=[];
 for(const path of [...expected.keys()].sort()){
  const want=expected.get(path),claim=receipt.files[path];
  if(!exact(claim,allowedMeta)||
     claim.bytes!==want.bytes||claim.sha256!==want.sha256||
     claim.origin!==want.origin)
   error('Assembled file provenance differs from protected inputs');
  const file=join(assembled.root,...path.split('/'));
  const before=await lstat(file);
  const content=await readFile(file),after=await lstat(file);
  if(content.length!==want.bytes||hash(content)!==want.sha256||
     before.ino!==after.ino||before.dev!==after.dev||
     before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||
     before.mode!==after.mode||before.size!==after.size)
   error('Assembled Flutter native bytes changed after materialization');
  digestInput.push(path+'\0'+claim.bytes+'\0'+claim.sha256+'\0'+claim.origin);
 }
 const assemblyDigest=hash(Buffer.from(digestInput.join('\n')));
 if(assemblyDigest!==assembled.assemblyDigest||
    assemblyDigest!==receipt.assemblyDigest)
  error('Final assembled TEST wrapper inventory digest mismatch');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  appRole:m.appRole,applicationId:m.applicationId,
  reservationId:reservation.id,manifestDigest:plan.manifestDigest,
  workerId:acceptance.workerId,runId:acceptance.runId,
  assemblyDigest,verifiedFileCount:paths.length,
  minSdk:24,targetSdk:36,compileSdk:36,
  exactAssembledFilesystemVerified:true,
  pinnedTemplateAndOverlayMatched:true,obsoleteLauncherAbsent:true,
  flutterWrapperGenerated:false,runtimeImageAttested:false,
  immutableMountVerified:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false,
  requiresTrustedRunnerAndImmutableBuildAuthorization:true
 });
}
