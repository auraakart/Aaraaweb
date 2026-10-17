import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = /^[0-9a-f]{64}$/;
const fail = message => { throw new Error(message); };
const keys = object => Object.keys(object).sort().join(',');
const files = async root => {
 const found=[];
 async function walk(directory) {
  for(const item of await readdir(directory,{withFileTypes:true})) {
   const path=join(directory,item.name);
   if(item.isSymbolicLink() || (!item.isDirectory() && !item.isFile()))
    fail('Unexpected link or special file in TEST native staging');
   if(item.isDirectory()) await walk(path);
   else found.push(relative(root,path).split('\\').join('/'));
  }
 }
 await walk(root);
 return found.sort();
};

/** Recheck filesystem contents after V5.5.9 staging and before a future
 * isolated worker consumes the bytes. Inventory hashes are integrity
 * assertions, NOT authentic signatures or execution permits. */
export async function verifyStagedTestAndroidInventory(plan,reservation,stage) {
 const m=plan?.manifest;
 if(!plan || plan.testOnly !== true || plan.dispatchAllowed !== false ||
    !m || m.buildMode !== 'TEST' || !['RESIDENT','GUARD'].includes(m.appRole) ||
    !/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(m.applicationId) ||
    plan.appDirectory !== 'apps/' + m.appRole.toLowerCase() ||
    plan.manifestDigest !== androidBuildManifestDigest(m))
  fail('Invalid Android TEST staging plan');
 if(!reservation || reservation.status !== 'RESERVED_TEST_ONLY' ||
    reservation.dispatchAllowed !== false || reservation.testOnly !== true ||
    reservation.digest !== plan.manifestDigest ||
    !Number.isSafeInteger(reservation.versionCode) || reservation.versionCode < 1)
  fail('Invalid TEST build reservation');
 if(!stage || stage.testOnly !== true || stage.dispatchAllowed !== false ||
    stage.artifactProduced !== false || stage.cleanupRequired !== true ||
    stage.appDirectory !== plan.appDirectory || !stage.manifest ||
    typeof stage.root !== 'string' || !stage.root.startsWith(join(tmpdir(),'aaraagate-test-android-')))
  fail('Untrusted TEST native staging root');
 const evidence=stage.manifest;
 if(evidence.schemaVersion !== 1 || evidence.environment !== 'TEST' ||
    evidence.testOnly !== true || evidence.workerExecutionAllowed !== false ||
    evidence.generatedWrapperPresent !== false || evidence.signerVerified !== false ||
    evidence.archiveVerified !== false || evidence.artifactProduced !== false ||
    evidence.distributionId !== m.distributionId ||
    evidence.applicationId !== m.applicationId || evidence.sourceSha !== m.sourceSha ||
    evidence.lockDigest !== m.lockDigest || evidence.manifestDigest !== plan.manifestDigest ||
    evidence.reservationId !== reservation.id || evidence.revisionId !== reservation.revisionId ||
    evidence.versionCode !== reservation.versionCode || !evidence.patchFiles ||
    !stage.patchFiles || keys(evidence.patchFiles) !== keys(stage.patchFiles))
  fail('Native staging metadata is stale, foreign or dispatchable');
 const kotlin='android/app/src/main/kotlin/'+m.applicationId.replaceAll('.','/')+'/MainActivity.kt';
 const expectedPatch=[
  'android/app/build.gradle.kts',
  'android/app/src/main/AndroidManifest.xml',
  'android/app/src/main/res/drawable/launch_background.xml',kotlin
 ].sort();
 if(keys(stage.patchFiles) !== expectedPatch.join(','))
  fail('Unexpected staged native patch inventory');
 const resource='android/app/src/main/res/drawable-nodpi/';
 const expectedAll=[...expectedPatch,
  resource+'aaraagate_test_icon.png',resource+'aaraagate_test_splash.png',
  '.aaraagate/test-native-staging.json','.aaraagate/test-build-input.json'].sort();
 const root=resolve(stage.root),canonical=await realpath(root);
 if(root !== canonical || !(await lstat(root)).isDirectory())
  fail('Native staging root is not canonical');
 const found=await files(root);
 if(found.join(',') !== expectedAll.join(','))
  fail('Unrecognized or missing TEST staging files');
 const parsed=JSON.parse(await readFile(join(root,'.aaraagate','test-native-staging.json'),'utf8'));
 if(JSON.stringify(parsed) !== JSON.stringify(evidence) ||
    JSON.stringify(stage.patchFiles) !== JSON.stringify(evidence.patchFiles))
  fail('Staged TEST metadata differs from caller receipt');
 const overlay=JSON.parse(await readFile(join(root,'.aaraagate','test-build-input.json'),'utf8'));
 if(overlay.environment !== 'TEST' || overlay.dispatchAllowed !== false ||
    overlay.archiveVerified !== false || overlay.artifactProduced !== false ||
    overlay.manifestDigest !== plan.manifestDigest ||
    overlay.reservationId !== reservation.id || overlay.sourceSha !== m.sourceSha ||
    overlay.lockDigest !== m.lockDigest)
  fail('Resource overlay receipt does not match reserved TEST inputs');
 const validated={};
 for(const path of expectedPatch){
  const info=stage.patchFiles[path];
  if(!info || !digest.test(info.sha256) || !Number.isSafeInteger(info.bytes) ||
     info.bytes < 1 || info.bytes > 40000) fail('Invalid reviewed patch size or hash');
  const data=await readFile(join(root,...path.split('/')));
  if(data.length !== info.bytes || hash(data) !== info.sha256)
   fail('Native patch file modified after TEST staging');
  validated[path]=Object.freeze({sha256:hash(data),bytes:data.length});
 }
 for(const role of ['icon','splash']){
  if(!digest.test(m.assetDigests?.[role])) fail('Missing approved TEST asset digests');
  const data=await readFile(join(root,resource,'aaraagate_test_'+role+'.png'));
  if(data.length < 33 || data.length > 2*1024*1024 || hash(data) !== m.assetDigests[role])
   fail('Native PNG modified after TEST staging');
 }
 return Object.freeze({schemaVersion:1,environment:'TEST',testOnly:true,
  reservationId:reservation.id,manifestDigest:plan.manifestDigest,
  verifiedFileCount:expectedAll.length,patchFiles:Object.freeze(validated),
  inventoryVerified:true,runnerAuthenticated:false,toolchainVerified:false,
  signerVerified:false,artifactProduced:false,dispatchAllowed:false,
  requiresAuthenticatedWorker:true,requiresRecheckAtConsumption:true});
}
