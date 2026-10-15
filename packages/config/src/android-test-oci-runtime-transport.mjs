import {createHash,createPublicKey,randomBytes,verify as verifySignature,X509Certificate} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {verifyIndependentTestOciAttestation} from './android-test-oci-provenance.mjs';
import {verifyPinnedTestOciRuntimeClaim} from './android-test-oci-runtime-claim.mjs';

const SHA=/^[0-9a-f]{64}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const MTLS_FIELDS=['endpoint','serverName','caPem','clientCertPem','clientKeyPem',
 'serverSpkiSha256','clientSpkiSha256'];
const REPLY_FIELDS=['schemaVersion','environment','requestNonce','runtimeEnvelope','signature'];
const exact=(x,keys)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join(',')===keys.slice().sort().join(',');
const fail=m=>{throw Error(m);};
const sha=b=>createHash('sha256').update(b).digest('hex');
const spki=raw=>sha(new X509Certificate(raw).publicKey.export({format:'der',type:'spki'}));
const canonical=x=>{
 if(x===null||typeof x!=='object')return JSON.stringify(x);
 if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(x)!==Object.prototype)fail('Untrusted TEST runtime transport JSON');
 return '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
};
const observerKey=pem=>{
 if(typeof pem!=='string'||!pem.startsWith('-----BEGIN PUBLIC KEY-----\n')||pem.length>4096)
  fail('Missing independent observer key');
 let key;try{key=createPublicKey(pem);}catch{fail('Invalid independent observer key');}
 if(key.asymmetricKeyType!=='ed25519')fail('Independent observer signature must be Ed25519');
 return key;
};
export function signedTestRuntimeTransportBytes(payload){
 if(!exact(payload,['schemaVersion','environment','requestNonce','runtimeEnvelope'])||
    payload.schemaVersion!==1||payload.environment!=='TEST'||!SHA.test(payload.requestNonce)||
    !exact(payload.runtimeEnvelope,['payloadType','payload','signatures']))
  fail('Untrusted runtime transport signature payload');
 return Buffer.from('aaraagate:v5.5.40:mtls-runtime-probe:v1\n'+canonical(payload),'utf8');
}
/**
 * REAL TLS 1.3 client-certificate HTTPS POST to a fixed read-only TEST
 * evidence endpoint, with a fresh random nonce and pinned TLS server SPKI.
 * The independently signed IMAGE claim and separately signed V5.5.39 runtime
 * claim must agree with protected operator policy. An observer additionally
 * signs this session's response nonce. NO code/build/artifact submission.
 * Does not verify a real remote container, independent key custody or consume
 * a persisted one-time challenge. Never grants execution authority.
 */
export async function probePinnedTestOciRuntimeEvidence(imageEnvelope,imagePolicy,
 runtimePolicy,transportPolicy,{now=Date.now()}={}){
 const image=verifyIndependentTestOciAttestation(imageEnvelope,imagePolicy,{now});
 if(!exact(transportPolicy,MTLS_FIELDS)||!SHA.test(transportPolicy.serverSpkiSha256)||
    !SHA.test(transportPolicy.clientSpkiSha256)||
    !exact(runtimePolicy,['observerPublicKeyPem','nonce','manifestDigest',
      'acceptanceId','challengeId','containerId','mountNamespaceId','transportServerSpkiSha256'])||
    runtimePolicy.nonce!==imagePolicy.nonce||
    runtimePolicy.transportServerSpkiSha256!==transportPolicy.serverSpkiSha256||
    !IMAGE.test(image.imageDigest)||
    typeof transportPolicy.serverName!=='string'||
    !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(transportPolicy.serverName)||
    transportPolicy.serverName.endsWith('.')||
    !['caPem','clientCertPem','clientKeyPem'].every(k=>
      typeof transportPolicy[k]==='string'&&transportPolicy[k].length>100&&
      transportPolicy[k].length<20000)||
    !transportPolicy.caPem.startsWith('-----BEGIN CERTIFICATE-----'))
  fail('Untrusted operator-pinned TEST runtime mTLS policy');
 let uri;try{uri=new URL(transportPolicy.endpoint);}catch{fail('Invalid runtime evidence URL');}
 if(typeof transportPolicy.endpoint!=='string'||
    transportPolicy.endpoint!==uri.href||uri.protocol!=='https:'||
    !uri.hostname||uri.username||uri.password||uri.hash||uri.search||
    uri.pathname!=='/v1/test-runner/runtime-evidence')
  fail('Runtime evidence endpoint must be canonical fixed-path HTTPS');
 if(spki(transportPolicy.clientCertPem)!==transportPolicy.clientSpkiSha256)
  fail('Client certificate differs from operator SPKI pin');
 const observer=observerKey(runtimePolicy.observerPublicKeyPem);
 const requestNonce=randomBytes(32).toString('hex');
 const payload={schemaVersion:1,environment:'TEST',purpose:'READ_ONLY_RUNTIME_CLAIM',
  requestNonce,workerId:image.workerId,runId:image.runId,imageDigest:image.imageDigest,
  sourceSha:image.sourceSha,manifestDigest:runtimePolicy.manifestDigest,
  acceptanceId:runtimePolicy.acceptanceId,challengeId:runtimePolicy.challengeId,
  containerId:runtimePolicy.containerId,mountNamespaceId:runtimePolicy.mountNamespaceId,
  serverSpkiSha256:transportPolicy.serverSpkiSha256,
  clientSpkiSha256:transportPolicy.clientSpkiSha256};
 const bytes=Buffer.from(canonical(payload),'utf8');
 if(bytes.length>4096)fail('Oversized TEST runtime evidence request');
 const raw=await new Promise((resolve,reject)=>{
  let connected=false,ended=false;
  const req=httpsRequest(uri,{
   method:'POST',agent:false,servername:transportPolicy.serverName,
   ca:transportPolicy.caPem,cert:transportPolicy.clientCertPem,key:transportPolicy.clientKeyPem,
   rejectUnauthorized:true,minVersion:'TLSv1.3',maxVersion:'TLSv1.3',
   timeout:7000,signal:AbortSignal.timeout(8500),
   headers:{'Content-Type':'application/json','Accept':'application/json',
    'Cache-Control':'no-store','Content-Length':String(bytes.length)},
   checkServerIdentity:(_name,cert)=>{
    const error=checkServerIdentity(transportPolicy.serverName,cert);if(error)return error;
    try{
     if(!cert.raw||spki(cert.raw)!==transportPolicy.serverSpkiSha256)
      return Error('TEST runtime server SPKI mismatch');
    }catch{return Error('Untrusted TEST runtime TLS server certificate');}
   }
  },res=>{
   if(!connected||res.statusCode!==200||
      res.headers['content-type']!=='application/json'||res.headers['content-encoding']||
      res.headers.location||
      (res.headers['content-length']!==undefined&&
       (!/^(?:0|[1-9][0-9]*)$/.test(res.headers['content-length'])||
        Number(res.headers['content-length'])>12288)))
    {req.destroy(Error('Untrusted runtime evidence response'));return;}
   const chunks=[];let received=0;
   res.on('data',chunk=>{
    received+=chunk.length;
    if(received>12288){req.destroy(Error('Oversized signed runtime response'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    if(ended)return;ended=true;
    if(res.headers['content-length']!==undefined&&
       Number(res.headers['content-length'])!==received)
     {reject(Error('Truncated TEST runtime evidence'));return;}
    resolve(Buffer.concat(chunks).toString('utf8'));
   });
   res.on('error',reject);
  });
  req.on('socket',socket=>socket.on('secureConnect',()=>{
   try{
    if(!socket.authorized||socket.getProtocol()!=='TLSv1.3'||
       !socket.getPeerCertificate(true).raw||
       spki(socket.getPeerCertificate(true).raw)!==transportPolicy.serverSpkiSha256)
     throw Error('TEST runtime TLS peer authorization mismatch');
    connected=true;
   }catch(e){req.destroy(e);}
  }));
  req.on('timeout',()=>req.destroy(Error('TEST runtime evidence timeout')));
  req.on('error',reject);req.end(bytes);
 });
 let response;try{response=JSON.parse(raw);}catch{fail('Malformed TEST runtime evidence JSON');}
 if(!exact(response,REPLY_FIELDS)||response.schemaVersion!==1||response.environment!=='TEST'||
    response.requestNonce!==requestNonce||
    typeof response.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(response.signature))
  fail('Runtime evidence missing fresh pinned transport challenge');
 const sig=Buffer.from(response.signature,'base64url');
 if(sig.length!==64||sig.toString('base64url')!==response.signature||
    !verifySignature(null,signedTestRuntimeTransportBytes({
     schemaVersion:response.schemaVersion,environment:response.environment,
     requestNonce:response.requestNonce,runtimeEnvelope:response.runtimeEnvelope
    }),observer,sig))
  fail('Invalid independently pinned runtime transport observer signature');
 const claim=verifyPinnedTestOciRuntimeClaim(
   imageEnvelope,imagePolicy,response.runtimeEnvelope,runtimePolicy,{now:Date.now()});
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  imageDigest:claim.imageDigest,sourceSha:claim.sourceSha,
  workerId:claim.workerId,runId:claim.runId,
  challengeId:runtimePolicy.challengeId,acceptanceId:runtimePolicy.acceptanceId,
  tls13PinnedPeerVerified:true,clientTlsCertificateConfigured:true,
  freshTransportNonceSignatureVerified:true,
  independentRuntimeClaimSignaturesVerified:true,
  // Stable digests for the V5.5.41 append-only PostgreSQL replay ledger.
  // Never persist the raw transport nonce or unbounded signed payload here.
  transportNonceDigest:sha(requestNonce),
  runtimeEnvelopeDigest:sha(Buffer.from(canonical(response.runtimeEnvelope),'utf8')),
  transportSignatureDigest:sha(sig),
  serverSpkiSha256:transportPolicy.serverSpkiSha256,
  verifiedAt:new Date().toISOString(),
  // TLS+signatures prove a fresh response from pinned fixture keys, NOT a
  // remotely measured process, trusted operator deployment or DB replay barrier.
  independentlyProvisionedWorkerVerified:false,remoteProcessMeasured:false,
  runtimeImageAttested:false,immutableMountVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false
 });
}
