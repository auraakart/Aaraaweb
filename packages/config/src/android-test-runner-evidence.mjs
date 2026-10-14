import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hex40=/^[0-9a-f]{40}$/, hex64=/^[0-9a-f]{64}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const run=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const payloadKeys=['schemaVersion','environment','workerId','runId','imageDigest',
 'distributionId','reservationId','revisionId','consumptionId','manifestDigest',
 'appRole','sourceSha','lockDigest','versionCode','nativeInventoryDigest',
 'toolchainReceiptDigest','nonce','issuedAt','expiresAt'];
const fail=message=>{throw new Error(message);};
const shape=(v,fields)=>v!==null && typeof v==='object' && !Array.isArray(v) &&
 Object.getPrototypeOf(v)===Object.prototype &&
 Object.keys(v).sort().join(',')===fields.slice().sort().join(',');
function canonical(value) {
 if(value===null || typeof value!=='object') return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(value)!==Object.prototype)fail('Noncanonical runner evidence object');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const instant=v=>{
 if(typeof v!=='string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v))
  fail('Invalid runner assertion time');
 const date=new Date(v);
 if(!Number.isFinite(date.getTime()) || date.toISOString().slice(0,19)!==v.slice(0,19))
  fail('Invalid runner assertion time');
 return date.getTime();
};
export function testAndroidRunnerSignedBytes(payload){
 if(!shape(payload,payloadKeys))fail('Unrecognized runner statement fields');
 return Buffer.from('aaraagate:v5.5.13:runner-evidence:v1\n'+canonical(payload),'utf8');
}

/**
 * Verify Ed25519 possession proof for a single TEST worker *consumption*,
 * binding reviewed manifest + staged inventory + checked toolchain to a
 * server-pinned image/nonce/run. The public key and policy must come from
 * independently trusted server configuration; never accept client-supplied
 * keys or pins. This cannot attest a real runtime image or grant dispatch.
 *
 * Assertion replay is only prevented when the calling service also consumes
 * the server-minted nonce/run ID exactly once in durable storage.
 */
export function verifyTestAndroidRunnerEvidence(plan,reservation,consumption,
 checkout,inventory,toolchain,assertion,trustedPolicy){
 const m=plan?.manifest;
 if(!plan || plan.testOnly!==true || plan.dispatchAllowed!==false ||
    plan.requiresVersionReservation!==true || !m || m.buildMode!=='TEST' ||
    !['RESIDENT','GUARD'].includes(m.appRole) ||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase() ||
    plan.manifestDigest!==androidBuildManifestDigest(m) ||
    !hex40.test(m.sourceSha)||!hex64.test(m.lockDigest))
  fail('Untrusted TEST Android build plan');
 if(!reservation || reservation.status!=='RESERVED_TEST_ONLY' ||
    reservation.testOnly!==true || reservation.dispatchAllowed!==false ||
    !uuid.test(reservation.id) || !uuid.test(reservation.revisionId) ||
    reservation.digest!==plan.manifestDigest ||
    !Number.isSafeInteger(reservation.versionCode)||reservation.versionCode<1)
  fail('Missing matching TEST build reservation');
 if(!consumption || consumption.status!=='CONSUMED_TEST_NO_EXECUTION' ||
    consumption.testOnly!==true || consumption.dispatchAllowed!==false ||
    consumption.executionStarted!==false || consumption.artifactProduced!==false ||
    !uuid.test(consumption.id)||!uuid.test(consumption.claimId) ||
    consumption.reservationId!==reservation.id ||
    consumption.manifestDigest!==plan.manifestDigest ||
    consumption.versionCode!==reservation.versionCode ||
    !worker.test(consumption.workerId))
  fail('Unverified one-time TEST worker consumption receipt');
 if(!checkout || checkout.testOnly!==true || checkout.dispatchAllowed!==false ||
    checkout.checkoutVerified!==true || checkout.checkoutClean!==true ||
    checkout.runnerAuthenticated!==false ||
    checkout.manifestDigest!==plan.manifestDigest ||
    checkout.sourceSha!==m.sourceSha || checkout.lockDigest!==m.lockDigest ||
    checkout.appRole!==m.appRole)
  fail('TEST source evidence is missing or mismatched');
 if(!inventory || inventory.testOnly!==true || inventory.dispatchAllowed!==false ||
    inventory.inventoryVerified!==true || inventory.artifactProduced!==false ||
    inventory.reservationId!==reservation.id ||
    inventory.manifestDigest!==plan.manifestDigest ||
    inventory.verifiedFileCount!==8 || !inventory.patchFiles ||
    Object.keys(inventory.patchFiles).length!==4)
  fail('Unverified TEST native staging inventory');
 if(!toolchain || toolchain.testOnly!==true || toolchain.dispatchAllowed!==false ||
    toolchain.executableChecksPassed!==true ||
    toolchain.reportedVersionsMatched!==true ||
    toolchain.runnerAuthenticated!==false ||
    toolchain.manifestDigest!==plan.manifestDigest ||
    toolchain.sourceSha!==m.sourceSha || toolchain.lockDigest!==m.lockDigest ||
    toolchain.appRole!==m.appRole || !toolchain.verifiedExecutables ||
    Object.keys(toolchain.verifiedExecutables).length!==4)
  fail('Missing pinned TEST toolchain evidence');
 if(!shape(trustedPolicy,['publicKeyPem','workerId','runId','imageDigest','nonce']) ||
    !worker.test(trustedPolicy.workerId)||!run.test(trustedPolicy.runId)||
    !/^sha256:[0-9a-f]{64}$/.test(trustedPolicy.imageDigest) ||
    !hex64.test(trustedPolicy.nonce) ||
    typeof trustedPolicy.publicKeyPem!=='string' ||
    !/^-----BEGIN PUBLIC KEY-----\r?\n/.test(trustedPolicy.publicKeyPem))
  fail('Missing independent server-side TEST worker trust policy');
 if(!shape(assertion,['payload','signature']) || !shape(assertion.payload,payloadKeys))
  fail('Unrecognized TEST runner assertion');
 const p=assertion.payload;
 if(p.schemaVersion!==1 || p.environment!=='TEST' ||
    p.workerId!==trustedPolicy.workerId ||
    p.workerId!==consumption.workerId ||
    p.runId!==trustedPolicy.runId ||
    p.imageDigest!==trustedPolicy.imageDigest ||
    p.nonce!==trustedPolicy.nonce ||
    p.distributionId!==m.distributionId ||
    p.reservationId!==reservation.id ||
    p.revisionId!==reservation.revisionId ||
    p.consumptionId!==consumption.id ||
    p.manifestDigest!==plan.manifestDigest ||
    p.appRole!==m.appRole || p.sourceSha!==m.sourceSha ||
    p.lockDigest!==m.lockDigest || p.versionCode!==reservation.versionCode ||
    p.nativeInventoryDigest!==digest(inventory.patchFiles) ||
    p.toolchainReceiptDigest!==digest(toolchain.verifiedExecutables))
  fail('Signed TEST worker evidence differs from immutable server-bound inputs');
 const now=Date.now(),start=instant(p.issuedAt),end=instant(p.expiresAt);
 if(start>now+5000 || start<now-30000 || end<=now ||
    end<=start || end>start+90000)
  fail('Expired or excessive TEST worker evidence lifetime');
 if(typeof assertion.signature!=='string' ||
    !/^[A-Za-z0-9_-]{86}$/.test(assertion.signature))
  fail('Invalid TEST runner evidence signature');
 const signature=Buffer.from(assertion.signature,'base64url');
 if(signature.length!==64 || signature.toString('base64url')!==assertion.signature)
  fail('Noncanonical TEST runner evidence signature');
 let key;
 try {key=createPublicKey(trustedPolicy.publicKeyPem);}
 catch{fail('Invalid pinned TEST worker public key');}
 if(key.asymmetricKeyType!=='ed25519' ||
    !verifySignature(null,testAndroidRunnerSignedBytes(p),key,signature))
  fail('Untrusted signed TEST worker statement');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  workerId:p.workerId,runId:p.runId,
  reservationId:reservation.id,consumptionId:consumption.id,
  manifestDigest:plan.manifestDigest,workerSignatureVerified:true,
  pinnedImageClaimMatched:true,nonceMatched:true,
  serverReplayBarrierVerified:false,runnerTransportAuthenticated:false,
  runtimeImageAttested:false,flutterSdkTreeVerified:false,
  archiveVerified:false,signerVerified:false,artifactProduced:false,
  dispatchAllowed:false,requiresDurableNonceConsumption:true,
  requiresTrustedTransportAndSdkAttestation:true
 });
}
