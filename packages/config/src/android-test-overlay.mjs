import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidBuildManifestDigest, checkAndroidAssetBytes } from './android-build-contract.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex = /^[0-9a-f]{64}$/;
const pngMagic = Uint8Array.from([137,80,78,71,13,10,26,10]);
const fail = message => { throw new Error(message); };
const json = value => JSON.stringify(value, null, 2) + '\n';

/** Disposable TEST-only Android input overlay. This does not change the app,
 * invoke Flutter/Gradle, install resources into a platform wrapper or dispatch
 * an APK/AAB build. Caller MUST clean up the returned directory in a finally
 * block. Authoritative licensing, signer, brand and asset verification remain
 * the trusted builder's responsibility at dispatch AND completion. */
export async function materializeTestAndroidResourceOverlay(plan, reservation, assets) {
 if(!plan || plan.testOnly !== true || plan.dispatchAllowed !== false ||
    plan.requiresVersionReservation !== true || !plan.manifest || typeof plan.manifest !== 'object' ||
    plan.manifest.buildMode !== 'TEST' ||
    !['RESIDENT','GUARD'].includes(plan.manifest.appRole) ||
    plan.appDirectory !== 'apps/' + plan.manifest.appRole.toLowerCase() ||
    plan.manifestDigest !== androidBuildManifestDigest(plan.manifest))
   fail('Invalid TEST Android build plan');
 const m = plan.manifest;
 if(!reservation || typeof reservation !== 'object' ||
    reservation.status !== 'RESERVED_TEST_ONLY' || reservation.testOnly !== true ||
    reservation.dispatchAllowed !== false || !uuid.test(reservation.id) ||
    !uuid.test(reservation.revisionId) || !Number.isSafeInteger(reservation.versionCode) ||
    reservation.versionCode < 1 || reservation.versionCode > 2100000000 ||
    !hex.test(reservation.digest) || reservation.digest !== plan.manifestDigest)
   fail('Missing matching immutable TEST version reservation');
 if(!assets || Object.keys(assets).sort().join(',') !== 'icon,splash' ||
    !(assets.icon instanceof Uint8Array) || !(assets.splash instanceof Uint8Array))
   fail('Missing approved native PNG bytes');
 for(const role of ['icon','splash']) {
   const bytes = assets[role];
   checkAndroidAssetBytes(m.assetDigests[role], bytes);
   if(bytes.length < 33 || !pngMagic.every((b,i)=>bytes[i]===b) ||
      bytes[12]!==73 || bytes[13]!==72 || bytes[14]!==68 || bytes[15]!==82)
     fail('Invalid TEST PNG resource header');
   const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
   const width=view.getUint32(16),height=view.getUint32(20);
   if(width<1 || width>2048 || height<1 || height>2048)
     fail('Invalid TEST PNG resource dimensions');
 }
 // No user-selected path, name or script ever reaches the filesystem.
 const root = await mkdtemp(join(tmpdir(), 'aaraagate-test-android-'));
 try {
   const resources=join(root,'android','app','src','main','res','drawable-nodpi');
   const evidence=join(root,'.aaraagate');
   await mkdir(resources,{recursive:true,mode:0o700});
   await mkdir(evidence,{recursive:true,mode:0o700});
   await writeFile(join(resources,'aaraagate_test_icon.png'),assets.icon,{flag:'wx',mode:0o600});
   await writeFile(join(resources,'aaraagate_test_splash.png'),assets.splash,{flag:'wx',mode:0o600});
   // Explicit non-authoritative plan for a future native manifest/Gradle patcher.
   // Do not write a misleading "built" or "verified artifact" record.
   const metadata={
     schemaVersion:1,environment:'TEST',testOnly:true,distributionId:m.distributionId,
     revisionId:reservation.revisionId,reservationId:reservation.id,
     manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,lockDigest:m.lockDigest,
     applicationId:m.applicationId,namespace:m.namespace,appRole:m.appRole,
     appDirectory:plan.appDirectory,label:m.label,versionCode:reservation.versionCode,
     apiOrigin:m.apiOrigin,brandRevision:m.brandRevision,configDigest:m.configDigest,
     assetDigests:{icon:m.assetDigests.icon,splash:m.assetDigests.splash},
     firebaseClientRef:m.firebaseClientRef,pushEnabled:false,
     appLinkHosts:[...m.appLinkHosts],signingProfile:m.signingProfile,
     signerFingerprint:m.signerFingerprint,requiresNativeManifestPatch:true,
     requiresSourceAndToolchainVerification:true,requiresActualArtifactVerification:true,
     dispatchAllowed:false,archiveVerified:false,artifactProduced:false
   };
   await writeFile(join(evidence,'test-build-input.json'),json(metadata),{flag:'wx',mode:0o600});
   return Object.freeze({root,metadata:Object.freeze(metadata),
     appDirectory:plan.appDirectory,testOnly:true,dispatchAllowed:false,
     artifactProduced:false,cleanupRequired:true});
 } catch(error) {
   await rm(root,{recursive:true,force:true});
   throw error;
 }
}
