import {createHash} from 'node:crypto';

// Bounded export of an ALREADY validated read-only TLS 1.3/mTLS probe result.
// This receipt is not signed, does not establish independent OCI measurement,
// and cannot supply build, distribution, or V5.6 release authority.
const SHA=/^[0-9a-f]{64}$/;
const GIT=/^[0-9a-f]{40}$/;
const OCI=/^sha256:[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sourceFields=['schemaVersion','environment','testOnly','imageDigest','sourceSha',
 'workerId','runId','challengeId','acceptanceId',
 'tls13PinnedPeerVerified','clientTlsCertificateConfigured',
 'freshTransportNonceSignatureVerified','independentRuntimeClaimSignaturesVerified',
 'transportNonceDigest','runtimeEnvelopeDigest','transportSignatureDigest',
 'serverSpkiSha256','verifiedAt','independentlyProvisionedWorkerVerified',
 'remoteProcessMeasured','runtimeImageAttested','immutableMountVerified',
 'singleUseChallengeConsumed','buildExecutionAuthorized','artifactProduced','dispatchAllowed'];
const outputFields=['schemaVersion','environment','kind','testOnly','sourceSha','imageDigest',
 'workerId','runId','acceptanceId','challengeId','serverSpkiSha256','verifiedAt',
 'transportNonceDigest','runtimeEnvelopeDigest','transportSignatureDigest',
 'tls13PinnedPeerVerified','freshTransportNonceSignatureVerified',
 'independentRuntimeClaimSignaturesVerified','independentlyProvisionedWorkerVerified',
 'remoteProcessMeasured','runtimeImageAttested','immutableMountVerified',
 'singleUseChallengeConsumed','buildExecutionAuthorized','artifactProduced',
 'dispatchAllowed','independentExternalAcceptanceVerified'];
const exact=(v,fields)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&
 Object.keys(v).sort().join('|')===fields.slice().sort().join('|');
const deny=()=>{throw Error('Read-only TEST operator evidence receipt is invalid');};
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const utc=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&
 Number.isFinite(Date.parse(v))&&new Date(Date.parse(v)).toISOString()===v;
const bounded=v=>typeof v==='string'&&v.length>=4&&v.length<=128&&
 /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
const flags=['independentlyProvisionedWorkerVerified','remoteProcessMeasured',
 'runtimeImageAttested','immutableMountVerified','singleUseChallengeConsumed',
 'buildExecutionAuthorized','artifactProduced','dispatchAllowed'];
const yes=['tls13PinnedPeerVerified','clientTlsCertificateConfigured',
 'freshTransportNonceSignatureVerified','independentRuntimeClaimSignaturesVerified'];

export function createReadOnlyTestRuntimeAuditReceipt(probe, pins, {now=Date.now()}={}){
 if(!exact(probe,sourceFields)||!exact(pins,['sourceSha','imageDigest','serverSpkiSha256'])||
    !Number.isFinite(now)||probe.schemaVersion!==1||probe.environment!=='TEST'||
    probe.testOnly!==true||!GIT.test(probe.sourceSha)||!OCI.test(probe.imageDigest)||
    !SHA.test(probe.serverSpkiSha256)||!bounded(probe.workerId)||!bounded(probe.runId)||
    !UUID.test(probe.acceptanceId)||!UUID.test(probe.challengeId)||
    ![probe.transportNonceDigest,probe.runtimeEnvelopeDigest,probe.transportSignatureDigest].every(v=>SHA.test(v))||
    !utc(probe.verifiedAt)||Math.abs(now-Date.parse(probe.verifiedAt))>5*60*1000||
    !yes.every(k=>probe[k]===true)||!flags.every(k=>probe[k]===false)||
    pins.sourceSha!==probe.sourceSha||pins.imageDigest!==probe.imageDigest||
    pins.serverSpkiSha256!==probe.serverSpkiSha256)deny();
 const value={
  schemaVersion:1,environment:'TEST',kind:'UNSIGNED_LOCAL_READ_ONLY_PROBE_RECEIPT',
  testOnly:true,sourceSha:probe.sourceSha,imageDigest:probe.imageDigest,
  workerId:probe.workerId,runId:probe.runId,
  acceptanceId:probe.acceptanceId,challengeId:probe.challengeId,
  serverSpkiSha256:probe.serverSpkiSha256,verifiedAt:probe.verifiedAt,
  transportNonceDigest:probe.transportNonceDigest,
  runtimeEnvelopeDigest:probe.runtimeEnvelopeDigest,
  transportSignatureDigest:probe.transportSignatureDigest,
  tls13PinnedPeerVerified:true,freshTransportNonceSignatureVerified:true,
  independentRuntimeClaimSignaturesVerified:true,
  independentlyProvisionedWorkerVerified:false,remoteProcessMeasured:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false,
  independentExternalAcceptanceVerified:false
 };
 return Object.freeze({...value,receiptSha256:digest(value)});
}

// Detect inadvertent receipt corruption and unexpected fields during manual
// handoff. Hash checking is NOT authentication: the operator must independently
// authenticate the originating channel and measure external TEST runtime.
export function verifyReadOnlyTestRuntimeAuditReceipt(receipt,pins){
 if(!exact(receipt,[...outputFields,'receiptSha256'])||
    !exact(pins,['sourceSha','imageDigest','serverSpkiSha256'])||
    receipt.schemaVersion!==1||receipt.environment!=='TEST'||
    receipt.kind!=='UNSIGNED_LOCAL_READ_ONLY_PROBE_RECEIPT'||receipt.testOnly!==true||
    !GIT.test(receipt.sourceSha)||!OCI.test(receipt.imageDigest)||
    !SHA.test(receipt.serverSpkiSha256)||!SHA.test(receipt.receiptSha256)||
    !bounded(receipt.workerId)||!bounded(receipt.runId)||
    !UUID.test(receipt.acceptanceId)||!UUID.test(receipt.challengeId)||
    ![receipt.transportNonceDigest,receipt.runtimeEnvelopeDigest,receipt.transportSignatureDigest].every(v=>SHA.test(v))||
    !utc(receipt.verifiedAt)||
    !['tls13PinnedPeerVerified','freshTransportNonceSignatureVerified',
      'independentRuntimeClaimSignaturesVerified'].every(k=>receipt[k]===true)||
    ![...flags,'independentExternalAcceptanceVerified'].every(k=>receipt[k]===false)||
    pins.sourceSha!==receipt.sourceSha||pins.imageDigest!==receipt.imageDigest||
    pins.serverSpkiSha256!==receipt.serverSpkiSha256)deny();
 const {receiptSha256,...value}=receipt;
 if(digest(value)!==receiptSha256)deny();
 return Object.freeze({localReceiptIntegrityVerified:true,
  independentExternalAcceptanceVerified:false,buildExecutionAuthorized:false,
  partnerArtifactApproved:false});
}
