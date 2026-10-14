import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { androidBuildManifestDigest } from './android-build-contract.mjs';
import { materializeTestAndroidResourceOverlay } from './android-test-overlay.mjs';
import { planTestAndroidNativeWrapperPatch } from './android-test-native-wrapper.mjs';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hex = /^[0-9a-f]{64}$/;
const fail = message => { throw new Error(message); };
const keys = value => value && typeof value === 'object' && !Array.isArray(value) ?
 Object.keys(value).sort().join(',') : '';
const templateKeys = ['gradleKts','mainActivityKotlin','manifestXml'].sort().join(',');

/**
 * Stage ONLY derived TEST branding/native patch bytes inside a freshly minted,
 * disposable directory. This does not create a Flutter wrapper or execute a
 * builder: caller must independently attest the pinned toolchain, checkout,
 * template and sanitized asset provenance, then separately reauthorize BOTH
 * execution boundaries. Caller owns cleanup in finally after success.
 *
 * The template digest input is an assertion, NOT proof of trusted origin:
 * it must be provided by an independently authenticated runner, never by
 * partner configuration or an HTTP request.
 */
export async function materializeTestAndroidNativeWorkspace(plan,reservation,assets,generated,templateDigests) {
 if(!plan || plan.testOnly !== true || plan.dispatchAllowed !== false ||
    !plan.manifest || plan.manifestDigest !== androidBuildManifestDigest(plan.manifest))
  fail('Invalid Android TEST staging plan');
 if(keys(generated) !== templateKeys || keys(templateDigests) !== templateKeys)
  fail('Unrecognized pinned Flutter template inventory');
 for(const name of ['gradleKts','manifestXml','mainActivityKotlin']) {
  const bytes = generated[name];
  if(typeof bytes !== 'string' || bytes.length < 50 || bytes.length > 40000 ||
     typeof templateDigests[name] !== 'string' || !hex.test(templateDigests[name]) ||
     sha256(Buffer.from(bytes,'utf8')) !== templateDigests[name])
   fail('Native Flutter template differs from independent expected digest');
 }
 const patch = planTestAndroidNativeWrapperPatch(plan,reservation,generated);
 if(!patch.testOnly || patch.dispatchAllowed !== false || patch.artifactProduced !== false ||
    patch.reservationId !== reservation.id || patch.manifestDigest !== plan.manifestDigest ||
    patch.requiresTrustedWorker !== true)
  fail('Untrusted TEST native patch plan');
 // The overlay helper generates its own new private temp root. Never take an
 // arbitrary filesystem root from a partner, a claim, or a previous build.
 const overlay = await materializeTestAndroidResourceOverlay(plan,reservation,assets);
 const root = overlay.root;
 try {
  const fileEntries = Object.entries(patch.files);
  if(fileEntries.length !== 4) fail('Unexpected TEST Android native patch file count');
  const staged = {};
  for(const [relative,contents] of fileEntries) {
   // Only fixed Android relative paths or Kotlin path derived from validated
   // package identifier. No absolute, traversal, symbolic or user paths.
   if(typeof relative !== 'string' ||
      !/^android\/app\/(?:build\.gradle\.kts|src\/main\/(?:AndroidManifest\.xml|res\/drawable\/launch_background\.xml|kotlin\/[a-z0-9_/]+\/MainActivity\.kt))$/.test(relative) ||
      relative.includes('..') || typeof contents !== 'string' || !contents.length)
    fail('Forbidden Android staging path or contents');
   const filepath = join(root,...relative.split('/'));
   await mkdir(join(root,...relative.split('/').slice(0,-1)),{recursive:true,mode:0o700});
   await writeFile(filepath,contents,{flag:'wx',mode:0o600});
   staged[relative] = Object.freeze({sha256:sha256(Buffer.from(contents,'utf8')),
    bytes:Buffer.byteLength(contents,'utf8')});
  }
  const manifest = Object.freeze({
   schemaVersion:1,environment:'TEST',testOnly:true,
   distributionId:patch.distributionId,reservationId:reservation.id,
   revisionId:patch.revisionId,versionCode:patch.versionCode,
   applicationId:patch.applicationId,sourceSha:patch.sourceSha,lockDigest:patch.lockDigest,
   manifestDigest:patch.manifestDigest,workerExecutionAllowed:false,
   generatedWrapperPresent:false,signerVerified:false,archiveVerified:false,
   artifactProduced:false,requiresPinnedTemplateVerification:true,
   requiresNativeStylesAndAndroid12SplashIntegration:true,
   templateDigests:{...templateDigests},patchFiles:staged
  });
  await writeFile(join(root,'.aaraagate','test-native-staging.json'),
   JSON.stringify(manifest,null,2) + '\n',{flag:'wx',mode:0o600});
  return Object.freeze({
   root,appDirectory:patch.appDirectory,obsoleteActivityPath:patch.obsoleteActivityPath,
   manifest,patchFiles:Object.freeze(staged),testOnly:true,dispatchAllowed:false,
   artifactProduced:false,cleanupRequired:true,requiresTrustedWorker:true,
   requiresSourceAndToolchainVerification:true,requiresSignedArchiveVerification:true
  });
 }catch(error){
  await rm(root,{recursive:true,force:true});
  throw error;
 }
}
