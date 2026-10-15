import {createHash,randomUUID} from 'node:crypto';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Prisma} from '@prisma/client';
import {AppRole} from '../auth/auth.types';
import {canonicalLicenseJson} from './partner-license-lifecycle.service';
import {PartnerAndroidRunnerRuntimeProbeLedgerService}
 from './partner-android-runner-runtime-probe-ledger.service';

const id={societyId:randomUUID(),proposalId:randomUUID(),reservationId:randomUUID(),
 consumptionId:randomUUID(),acceptanceId:randomUUID(),challengeId:randomUUID(),
 claimId:randomUUID(),revisionId:randomUUID(),allocationId:randomUUID(),
 partnerId:randomUUID(),actorId:randomUUID()};
const worker='TEST_WORKER_CI_41',run='TEST_RUN_CI_41',image='sha256:'+'a'.repeat(64);
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const digest=(v:unknown)=>sha(canonicalLicenseJson(v));
const initial={schemaVersion:1,environment:'TEST',applicationId:'in.fixture.partner.resident',
 namespace:'in.fixture.partner.resident',appRole:'RESIDENT',label:'Test Resident',
 sourceSha:'b'.repeat(40),configDigest:'c'.repeat(64),
 apiOrigin:'https://test.fixture.in',signingProfile:'TEST_CI_ONLY'};
const revisionManifest={...initial,buildMode:'TEST',
 distributionId:id.proposalId,partnerId:id.partnerId,societyId:id.societyId,
 lockDigest:'d'.repeat(64)};
const manifestDigest=digest(revisionManifest);
const principal={userId:id.actorId,societyId:id.societyId,roles:[AppRole.SUPER_ADMIN]};
const input={grantId:randomUUID(),allocationId:id.allocationId,
 expectedGrantVersion:1,expectedOwnershipVersion:1,idempotencyKey:randomUUID(),
 revisionId:id.revisionId,expectedDigest:manifestDigest,versionCode:42,workerId:worker};
function fixture(){
 vi.stubEnv('AARAGATE_TEST_ANDROID_WORKER_ID',worker);
 vi.stubEnv('AARAGATE_TEST_ANDROID_RUNNER_IMAGE_SHA256',image);
 vi.stubEnv('AARAGATE_TEST_ANDROID_RUNTIME_SERVER_SPKI_SHA256','e'.repeat(64));
 const receipt={schemaVersion:1,environment:'TEST',testOnly:true,
  imageDigest:image,sourceSha:initial.sourceSha,workerId:worker,runId:run,
  challengeId:id.challengeId,acceptanceId:id.acceptanceId,
  tls13PinnedPeerVerified:true,clientTlsCertificateConfigured:true,
  freshTransportNonceSignatureVerified:true,independentRuntimeClaimSignaturesVerified:true,
  transportNonceDigest:'1'.repeat(64),runtimeEnvelopeDigest:'2'.repeat(64),
  transportSignatureDigest:'3'.repeat(64),serverSpkiSha256:'e'.repeat(64),
  verifiedAt:new Date().toISOString(),
  independentlyProvisionedWorkerVerified:false,remoteProcessMeasured:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false} as const;
 const proposal={id:id.proposalId,allocationId:id.allocationId,manifest:initial,
  digest:digest(initial),approval:{id:randomUUID(),revocation:null as unknown}};
 const revision={id:id.revisionId,manifest:revisionManifest,
  digest:manifestDigest,approval:{id:randomUUID()}};
 const booking={id:id.reservationId,proposalId:id.proposalId,
  versionCode:42,digest:manifestDigest,proposal,revision};
 const claim={id:id.claimId,actorId:id.actorId,
  expiresAt:new Date(Date.now()+55000),reservation:booking};
 const used={id:id.consumptionId,actorId:id.actorId,workerId:worker,
  manifestDigest,versionCode:42,sourceSha:initial.sourceSha,
  lockDigest:revisionManifest.lockDigest,claim};
 const challenge={id:id.challengeId,actorId:id.actorId,
  workerId:worker,runId:run,imageDigest:image,manifestDigest,
  consumptionId:id.consumptionId,expiresAt:new Date(Date.now()+55000),consumption:used};
 const acceptance={id:id.acceptanceId,actorId:id.actorId,
  workerId:worker,runId:run,imageDigest:image,sourceSha:initial.sourceSha,
  manifestDigest,expiresAt:new Date(Date.now()+50000),challenge};
 const tx={partnerAndroidRunnerEvidenceAcceptance:{findFirst:vi.fn().mockResolvedValue(acceptance)},
  partnerAndroidBuildRevision:{findFirst:vi.fn().mockResolvedValue({id:id.revisionId})},
  partnerAndroidRunnerRuntimeProbe:{create:vi.fn().mockResolvedValue({id:randomUUID()})}};
 const checkpoint=vi.fn().mockResolvedValue({checkpoint:'VALID'});
 const active=vi.fn(async(_p:unknown,_s:string,_i:unknown,
  callback:(t:typeof tx,s:{allocationId:string;partnerId:string})=>unknown)=>
   callback(tx,{allocationId:id.allocationId,partnerId:id.partnerId}));
 const svc=new PartnerAndroidRunnerRuntimeProbeLedgerService(
  {withActiveAllocation:active} as never,{checkpoint} as never);
 const probeOnce=vi.fn().mockImplementation(async()=>receipt);
 const record=(next=input,p=principal,probe=probeOnce)=>
  svc.record(p,id.societyId,id.proposalId,id.reservationId,
   id.consumptionId,id.acceptanceId,next,probe);
 return {receipt,proposal,revision,booking,used,claim,challenge,acceptance,
  tx,active,checkpoint,probeOnce,record};
}
afterEach(()=>vi.unstubAllEnvs());
describe('V5.5.41 internal append-only TEST runtime probe replay ledger',()=>{
 it('stores nonce/signature/envelope digests under accepted challenge and retains zero build authority',async()=>{
  const f=fixture(),res=await f.record();
  expect(res).toMatchObject({
   status:'RUNTIME_TEST_PROBE_LEDGERED_NO_EXECUTION',
   testOnly:true,dbReplayBarrierVerified:true,
   singleUseChallengeConsumed:false,runtimeImageAttested:false,
   independentlyProvisionedWorkerVerified:false,
   buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false});
  expect(f.checkpoint).toHaveBeenCalledOnce();
  expect(f.probeOnce).toHaveBeenCalledOnce();
  expect(f.active).toHaveBeenCalledOnce();
  const data=f.tx.partnerAndroidRunnerRuntimeProbe.create.mock.calls[0][0].data;
  expect(data).toMatchObject({
   acceptanceId:id.acceptanceId,challengeId:id.challengeId,actorId:id.actorId,
   imageDigest:image,sourceSha:initial.sourceSha,manifestDigest,
   transportNonceDigest:f.receipt.transportNonceDigest,
   runtimeEnvelopeDigest:f.receipt.runtimeEnvelopeDigest,
   transportSignatureDigest:f.receipt.transportSignatureDigest});
  expect(data).not.toHaveProperty('nonce');
  expect(data).not.toHaveProperty('dispatchAllowed');
 });
 it('does not make any network probe if commercial checkpoint fails',async()=>{
  const f=fixture();f.checkpoint.mockRejectedValue(new Error('ownership changed'));
  await expect(f.record()).rejects.toThrow(/ownership changed/);
  expect(f.probeOnce).not.toHaveBeenCalled();
  expect(f.active).not.toHaveBeenCalled();
 });
 it('denies absent operator SPKI policy without probing',async()=>{
  const f=fixture();vi.stubEnv('AARAGATE_TEST_ANDROID_RUNTIME_SERVER_SPKI_SHA256','');
  await expect(f.record()).rejects.toThrow(/Operator-pinned/);
  expect(f.probeOnce).not.toHaveBeenCalled();
 });
 it('denies foreign signer/server, replay digest and authority-claim mutation before DB',async()=>{
  for(const mutate of ([
   x=>({...x,serverSpkiSha256:'0'.repeat(64)}),
   x=>({...x,imageDigest:'sha256:'+'0'.repeat(64)}),
   x=>({...x,transportNonceDigest:'Z'.repeat(64)}),
   x=>({...x,buildExecutionAuthorized:true}),
   x=>({...x,singleUseChallengeConsumed:true}),
   x=>({...x,independentlyProvisionedWorkerVerified:true}),
   x=>({...x,verifiedAt:new Date(Date.now()-100000).toISOString()}),
   x=>({...x,rogueField:true})
  ] as Array<(x:Record<string,unknown>)=>unknown>)){
   const f=fixture();
   f.probeOnce.mockResolvedValue(mutate(f.receipt));
   await expect(f.record()).rejects.toThrow();
   expect(f.active).not.toHaveBeenCalled();
  }
 });
 it('denies stale and cross-tenant accepted challenge, source and revoked approvals',async()=>{
  const f=fixture();
  f.acceptance.expiresAt=new Date(Date.now()-1);
  await expect(f.record()).rejects.toThrow(/expired/);
  f.acceptance.expiresAt=new Date(Date.now()+50000);
  f.challenge.consumptionId=randomUUID();
  await expect(f.record()).rejects.toThrow(/changed/);
  f.challenge.consumptionId=id.consumptionId;
  f.proposal.approval.revocation={id:randomUUID()};
  await expect(f.record()).rejects.toThrow(/changed/);
  f.proposal.approval.revocation=null;
  f.used.sourceSha='0'.repeat(40);
  await expect(f.record()).rejects.toThrow(/changed/);
  expect(f.tx.partnerAndroidRunnerRuntimeProbe.create).not.toHaveBeenCalled();
 });
 it('rejects simultaneous/replayed acceptance and nonce digests via PostgreSQL UNIQUE',async()=>{
  const f=fixture();
  const duplicate=new Prisma.PrismaClientKnownRequestError('duplicate',{
   code:'P2002',clientVersion:'5.0.0'});
  f.tx.partnerAndroidRunnerRuntimeProbe.create.mockRejectedValue(duplicate);
  await expect(f.record()).rejects.toThrow(/already recorded/);
  expect(f.tx.partnerAndroidRunnerRuntimeProbe.create).toHaveBeenCalledOnce();
 });
 it('denies wrong user identity and revoked schema revision',async()=>{
  const f=fixture();
  f.acceptance.actorId=randomUUID();
  await expect(f.record()).rejects.toThrow(/expired or changed/);
  f.acceptance.actorId=id.actorId;
  (f.revision as {approval:unknown}).approval=null;
  await expect(f.record()).rejects.toThrow(/revision/);
 });
});
