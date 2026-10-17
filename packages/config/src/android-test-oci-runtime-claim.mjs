import {createHash,createPublicKey,verify as verifySignature} from 'node:crypto';
import {testImageAttestationPAE,verifyIndependentTestOciAttestation} from './android-test-oci-provenance.mjs';

const SHA=/^[0-9a-f]{64}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MOUNT=/^mnt:\[[1-9][0-9]{0,18}\]$/;
const PAYLOAD_TYPE='application/vnd.aaraagate.test-oci-runtime-process-claim+json';
const FIELDS=['schemaVersion','environment','subject','imageDigest','sourceSha','workerId','runId',
 'nonce','manifestDigest','acceptanceId','challengeId','containerId','mountNamespaceId',
 'rootfsReadOnly','sourceMountReadOnly','transportServerSpkiSha256','issuedAt','expiresAt'];
const POLICY_FIELDS=['observerPublicKeyPem','nonce','manifestDigest','acceptanceId',
 'challengeId','containerId','mountNamespaceId','transportServerSpkiSha256'];
const exact=(v,keys)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 Object.getPrototypeOf(v)===Object.prototype&&Object.keys(v).sort().join(',')===keys.slice().sort().join(',');
const fail=s=>{throw Error(s);};
const key=(pem)=>{
 if(typeof pem!=='string'||!pem.startsWith('-----BEGIN PUBLIC KEY-----\n')||pem.length>4096)
  fail('Missing independently pinned TEST runtime claim public key');
 let k;try{k=createPublicKey(pem);}catch{fail('Malformed TEST runtime public key');}
 if(k.asymmetricKeyType!=='ed25519')fail('TEST runtime claims require Ed25519');
 return k;
};
const keyid=k=>createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
const canonical=v=>{
 if(v===null||typeof v!=='object'){
  if(!['string','number','boolean'].includes(typeof v)&&v!==null)fail('Unsupported signed claim value');
  return JSON.stringify(v);
 }
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(v)!==Object.prototype)fail('Untrusted signed claim object');
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
};
const strictB64=s=>{
 if(typeof s!=='string'||s.length<1||s.length>8192||!/^[A-Za-z0-9_-]+$/.test(s))
  fail('Invalid runtime claim encoding');
 const b=Buffer.from(s,'base64url');
 if(b.toString('base64url')!==s)fail('Noncanonical runtime claim base64url');
 return b;
};
const clock=s=>{
 if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s))
  fail('Invalid runtime claim UTC timestamp');
 const v=Date.parse(s);
 if(!Number.isFinite(v)||new Date(v).toISOString()!==s)fail('Noncanonical runtime claim UTC time');
 return v;
};
/**
 * Verify two independent operator-pinned Ed25519 signatures on a bounded
 * runtime image/process *claim*, bound to a V5.5.36 signed image claim.
 * The payload's process/mount observations are not trusted measurements:
 * no remote process, namespace, mTLS peer or challenge store is contacted.
 * Never grant build-dispatch or release authority on this basis.
 */
export function verifyPinnedTestOciRuntimeClaim(imageEnvelope,imagePolicy,runtimeEnvelope,runtimePolicy,
 {now=Date.now()}={}){
 const image=verifyIndependentTestOciAttestation(imageEnvelope,imagePolicy,{now});
 if(!exact(runtimePolicy,POLICY_FIELDS)||!SHA.test(runtimePolicy.nonce)||
    runtimePolicy.nonce!==imagePolicy.nonce||
    !SHA.test(runtimePolicy.manifestDigest)||
    !UUID.test(runtimePolicy.acceptanceId)||!UUID.test(runtimePolicy.challengeId)||
    !SHA.test(runtimePolicy.containerId)||!MOUNT.test(runtimePolicy.mountNamespaceId)||
    !SHA.test(runtimePolicy.transportServerSpkiSha256))
  fail('Runtime claim lacks operator-pinned TEST scope');
 const observer=key(runtimePolicy.observerPublicKeyPem);
 const worker=key(imagePolicy.workerPublicKeyPem);
 const attestor=key(imagePolicy.attestorPublicKeyPem);
 const o=keyid(observer),w=keyid(worker),a=keyid(attestor);
 if(new Set([o,w,a]).size!==3)
  fail('Observer, worker and image attestor keys must be independently pinned');
 if(!exact(runtimeEnvelope,['payloadType','payload','signatures'])||
    runtimeEnvelope.payloadType!==PAYLOAD_TYPE||
    !Array.isArray(runtimeEnvelope.signatures)||runtimeEnvelope.signatures.length!==2)
  fail('Unrecognized TEST runtime evidence envelope');
 const bytes=strictB64(runtimeEnvelope.payload);
 if(bytes.length>4096)fail('Oversized TEST runtime statement');
 const sigs=runtimeEnvelope.signatures;
 if(!sigs.every(s=>exact(s,['keyid','sig']))||
    sigs[0].keyid!==o||sigs[1].keyid!==w)
  fail('Runtime observer and worker signatures must be ordered and pinned');
 const pae=testImageAttestationPAE(PAYLOAD_TYPE,bytes);
 for(const [i,k] of [[0,observer],[1,worker]]){
  const sig=strictB64(sigs[i].sig);
  if(sig.length!==64||!verifySignature(null,pae,k,sig))
   fail('Invalid pinned TEST runtime process signature');
 }
 let stmt;try{stmt=JSON.parse(bytes.toString('utf8'));}catch{fail('Invalid runtime statement JSON');}
 if(!exact(stmt,FIELDS)||Buffer.from(canonical(stmt),'utf8').compare(bytes)!==0)
  fail('Noncanonical or unsupported TEST runtime statement');
 if(stmt.schemaVersion!==1||stmt.environment!=='TEST'||
    stmt.subject!=='OCI_TEST_RUNTIME_PROCESS_CLAIM'||
    stmt.imageDigest!==image.imageDigest||stmt.sourceSha!==image.sourceSha||
    stmt.workerId!==image.workerId||stmt.runId!==image.runId||
    stmt.nonce!==runtimePolicy.nonce||
    stmt.manifestDigest!==runtimePolicy.manifestDigest||
    stmt.acceptanceId!==runtimePolicy.acceptanceId||
    stmt.challengeId!==runtimePolicy.challengeId||
    stmt.containerId!==runtimePolicy.containerId||
    stmt.mountNamespaceId!==runtimePolicy.mountNamespaceId||
    stmt.transportServerSpkiSha256!==runtimePolicy.transportServerSpkiSha256||
    stmt.rootfsReadOnly!==true||stmt.sourceMountReadOnly!==true)
  fail('Signed runtime claim differs from pinned image/process/mount challenge');
 const issued=clock(stmt.issuedAt),expires=clock(stmt.expiresAt);
 if(!Number.isFinite(now)||issued>now+5000||issued<now-30000||
    expires<=now||expires<=issued||expires>issued+60000)
  fail('Expired or excessive runtime process statement');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  workerId:image.workerId,runId:image.runId,sourceSha:image.sourceSha,
  imageDigest:image.imageDigest,manifestDigest:stmt.manifestDigest,
  workerKeyId:w,observerKeyId:o,attestorKeyId:a,
  signedImageClaimVerified:true,runtimeClaimSignaturesVerified:true,
  independentObserverAndWorkerKeysVerified:true,nonceBoundClaimVerified:true,
  processAndMountClaimsConsistent:true,
  // Authenticity of a claim is not runtime measurement or independently
  // authenticated transport. Claims cannot consume a challenge in storage.
  runtimeImageAttested:false,registryDigestVerified:false,
  imageRunningOnAuthenticatedWorker:false,remoteProcessMeasured:false,
  immutableMountVerified:false,runtimeTransportAuthenticated:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false
 });
}
