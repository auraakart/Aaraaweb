import { createHash, createPublicKey, randomBytes, verify as verifySignature, X509Certificate } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { androidBuildManifestDigest } from './android-build-contract.mjs';

const SHA=/^[0-9a-f]{64}$/, GIT=/^[0-9a-f]{40}$/;
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const RUN=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const REQUEST_KEYS=['schemaVersion','environment','nonce','workerId','runId','imageDigest',
 'acceptanceId','challengeId','consumptionId','manifestDigest','sourceSha','lockDigest','appRole',
 'clientCertificateSpkiSha256'];
const fail=message=>{throw new Error(message);};
const exact=(object,keys)=>object!==null&&typeof object==='object'&&!Array.isArray(object)&&
 Object.getPrototypeOf(object)===Object.prototype&&
 Object.keys(object).sort().join(',')===keys.slice().sort().join(',');
function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(value)!==Object.prototype)fail('Noncanonical TEST transport object');
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
const sha=data=>createHash('sha256').update(data).digest('hex');
const spki=cert=>sha(new X509Certificate(cert).publicKey.export({format:'der',type:'spki'}));
const strictPublicKey=p=>{
 if(typeof p!=='string'||!p.startsWith('-----BEGIN PUBLIC KEY-----\n'))fail('Missing independently trusted worker public key');
 const key=createPublicKey(p);
 if(key.asymmetricKeyType!=='ed25519')fail('Worker proof requires pinned Ed25519 key');
 return key;
};
export function testAndroidTransportSignedBytes(payload){
 if(!exact(payload,[...REQUEST_KEYS,'observedAt']))fail('Unrecognized TEST runner transport proof');
 return Buffer.from('aaraagate:v5.5.18:mtls-runner-identity:v1\n'+canonical(payload),'utf8');
}

/**
 * Performs a REAL mutual-TLS POST to a separately provisioned TEST runner's
 * identity-only endpoint. The request cannot dispatch a build, carry source,
 * trigger Flutter/Gradle or upload an artifact.
 *
 * The policy must be loaded from protected server-owned configuration:
 * endpoint, CA, server TLS name, server SPKI pin, client TLS cert/key and
 * pinned worker Ed25519 response key. Never accept HTTP/partner supplied
 * URLs, keys, certs or pins. Caller must supply previously persisted
 * single-use acceptance evidence (V5.5.15), not a self-asserted receipt.
 */
export async function probeAuthenticatedTestAndroidRunner(plan,acceptance,policy){
 const m=plan?.manifest;
 if(!plan||plan.testOnly!==true||plan.dispatchAllowed!==false||
    plan.requiresVersionReservation!==true||!m||m.schemaVersion!==1||
    m.buildMode!=='TEST'||!['RESIDENT','GUARD'].includes(m.appRole)||
    plan.appDirectory!=='apps/'+m.appRole.toLowerCase()||
    plan.manifestDigest!==androidBuildManifestDigest(m)||
    !GIT.test(m.sourceSha)||!SHA.test(m.lockDigest))
  fail('Invalid non-dispatchable TEST runner plan');
 if(!acceptance||acceptance.testOnly!==true||
    acceptance.status!=='SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION'||
    acceptance.serverReplayBarrierVerified!==true||
    acceptance.workerSignatureVerified!==true||
    acceptance.dispatchAllowed!==false||
    acceptance.artifactProduced!==false||
    !ID.test(acceptance.id)||!ID.test(acceptance.challengeId)||
    !ID.test(acceptance.consumptionId)||
    !WORKER.test(acceptance.workerId)||!RUN.test(acceptance.runId)||
    acceptance.manifestDigest!==plan.manifestDigest)
  fail('Missing accepted TEST worker identity and replay evidence');
 const allowed=['endpoint','serverName','caPem','clientCertPem','clientKeyPem',
  'serverSpkiSha256','clientSpkiSha256','workerPublicKeyPem','workerId','runId','imageDigest'];
 if(!exact(policy,allowed)||typeof policy.endpoint!=='string'||
    typeof policy.serverName!=='string'||
    !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(policy.serverName)||
    policy.serverName.endsWith('.')||
    !SHA.test(policy.serverSpkiSha256)||!SHA.test(policy.clientSpkiSha256)||
    !WORKER.test(policy.workerId)||!RUN.test(policy.runId)||!IMAGE.test(policy.imageDigest)||
    policy.workerId!==acceptance.workerId||policy.runId!==acceptance.runId||
    !['caPem','clientCertPem','clientKeyPem'].every(k=>
     typeof policy[k]==='string'&&policy[k].length>100&&policy[k].length<20000))
  fail('Missing independently trusted TEST mTLS transport configuration');
 let uri;
 try{uri=new URL(policy.endpoint);}catch{fail('Invalid TEST worker endpoint');}
 if(uri.protocol!=='https:'||uri.username||uri.password||uri.hash||uri.search||
    uri.pathname!=='/v1/test-runner/identity'||!uri.hostname||
    policy.endpoint!==uri.href)
  fail('TEST worker endpoint must be canonical fixed-path HTTPS');
 const key=strictPublicKey(policy.workerPublicKeyPem);
 if(spki(policy.clientCertPem)!==policy.clientSpkiSha256)
  fail('TEST client certificate differs from protected SPKI pin');

 const requestPayload={
  schemaVersion:1,environment:'TEST',nonce:randomBytes(32).toString('hex'),
  workerId:policy.workerId,runId:policy.runId,imageDigest:policy.imageDigest,
  acceptanceId:acceptance.id,challengeId:acceptance.challengeId,
  consumptionId:acceptance.consumptionId,manifestDigest:plan.manifestDigest,
  sourceSha:m.sourceSha,lockDigest:m.lockDigest,appRole:m.appRole,
  clientCertificateSpkiSha256:policy.clientSpkiSha256
 };
 const bytes=Buffer.from(canonical(requestPayload),'utf8');
 if(bytes.length>4096)fail('Oversized TEST identity request');
 const raw=await new Promise((resolve,reject)=>{
  let tlsVerified=false,done=false;
  const req=httpsRequest(uri,{
   method:'POST',agent:false,servername:policy.serverName,
   ca:policy.caPem,cert:policy.clientCertPem,key:policy.clientKeyPem,
   rejectUnauthorized:true,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',
   timeout:7000,headers:{
    'Content-Type':'application/json',
    'Accept':'application/json',
    'Cache-Control':'no-store',
    'Content-Length':String(bytes.length)
   },
   checkServerIdentity:(host,cert)=>{
    const error=checkServerIdentity(policy.serverName,cert);
    if(error)return error;
    try{
     if(!cert.raw||spki(cert.raw)!==policy.serverSpkiSha256)
      return new Error('TEST worker TLS server SPKI mismatch');
    }catch{return new Error('Invalid TEST worker TLS peer certificate');}
   }
  },res=>{
   if(!tlsVerified||res.statusCode!==200||
      !/^application\/json(?:\s*;|$)/i.test(String(res.headers['content-type']||''))||
      res.headers['content-encoding'])
    {req.destroy(new Error('Unauthenticated TEST runner identity response'));return;}
   let received=0;const chunks=[];
   res.on('data',chunk=>{
    received+=chunk.length;
    if(received>8192){req.destroy(new Error('Oversized TEST runner identity response'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{if(!done){done=true;resolve(Buffer.concat(chunks).toString('utf8'));}});
   res.on('error',reject);
  });
  req.on('socket',socket=>{
   socket.on('secureConnect',()=>{
    try{
     if(!socket.authorized||socket.getProtocol()!=='TLSv1.3'||
        !socket.getPeerCertificate(true).raw||
        spki(socket.getPeerCertificate(true).raw)!==policy.serverSpkiSha256)
      throw new Error('TEST worker TLS authorization, protocol or peer identity mismatch');
     tlsVerified=true;
    }catch(e){req.destroy(e);}
   });
  });
  req.on('timeout',()=>req.destroy(new Error('TEST runner identity timeout')));
  req.on('error',reject);
  req.end(bytes);
 });
 let proof;
 try{proof=JSON.parse(raw);}catch{fail('Malformed signed TEST runner transport response');}
 if(!exact(proof,['payload','signature'])||
    !exact(proof.payload,[...REQUEST_KEYS,'observedAt'])||
    typeof proof.signature!=='string'||
    !/^[A-Za-z0-9_-]{86}$/.test(proof.signature))
  fail('Unexpected TEST runner identity proof envelope');
 for(const k of REQUEST_KEYS){
  if(proof.payload[k]!==requestPayload[k])
   fail('TEST runner identity proof differs from pinned challenge');
 }
 const observed=proof.payload.observedAt;
 if(typeof observed!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(observed)||
    !Number.isFinite(Date.parse(observed))||
    Math.abs(Date.now()-Date.parse(observed))>30000)
  fail('TEST runner identity proof expired');
 const signature=Buffer.from(proof.signature,'base64url');
 if(signature.length!==64||signature.toString('base64url')!==proof.signature||
    !verifySignature(null,testAndroidTransportSignedBytes(proof.payload),key,signature))
  fail('TEST runner proof not signed by independently pinned worker identity');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,workerId:policy.workerId,
  runId:policy.runId,acceptanceId:acceptance.id,challengeId:acceptance.challengeId,
  manifestDigest:plan.manifestDigest,sourceSha:m.sourceSha,lockDigest:m.lockDigest,
  serverTlsAuthenticated:true,clientCertificatePresented:true,
  serverCertificateSpkiMatched:true,workerIdentitySignatureVerified:true,
  nonceBoundResponseVerified:true,runnerTransportAuthenticated:true,
  pinnedImageClaimMatched:true,runtimeImageAttested:false,
  serverMutualTlsPolicyAttested:false,immutableMountVerified:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false,
  signerVerified:false,archiveVerified:false,
  requiresRuntimeImageAndImmutableMountAttestation:true,
  requiresIndependentExecutionAndCompletionApproval:true
 });
}
