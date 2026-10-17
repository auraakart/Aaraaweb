import {createHash,createPublicKey,verify as cryptoVerify} from 'node:crypto';

const sha256=/^[0-9a-f]{64}$/;
const gitSha=/^[0-9a-f]{40}$/;
const imageSha=/^sha256:[0-9a-f]{64}$/;
const worker=/^TEST_WORKER_[A-Z0-9_]{3,48}$/;
const run=/^TEST_RUN_[A-Z0-9_]{3,48}$/;
const builder=/^TEST_ATTESTOR_[A-Z0-9_]{3,48}$/;
const keys=['schemaVersion','environment','subject','imageDigest','sourceSha','workerId','runId','builderId','nonce','issuedAt','expiresAt'];
const policyKeys=['imageDigest','sourceSha','workerId','runId','builderId','nonce','attestorPublicKeyPem','workerPublicKeyPem'];
const exact=(x,expected)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
  Object.getPrototypeOf(x)===Object.prototype&&
  Object.keys(x).sort().join(',')===expected.slice().sort().join(',');
const fail=(msg)=>{throw new Error(msg);};
const b64url=(s)=>{
 if(typeof s!=='string'||s.length<1||s.length>8192||!/^[A-Za-z0-9_-]+$/.test(s))fail('Invalid URL-safe attestation base64');
 const b=Buffer.from(s,'base64url');
 if(b.toString('base64url')!==s)fail('Noncanonical attestation base64');
 return b;
};
const utc=(s)=>{
 if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(s))fail('Invalid attestation time');
 const time=Date.parse(s);
 if(!Number.isFinite(time)||new Date(time).toISOString().slice(0,19)!==s.slice(0,19))fail('Noncanonical attestation time');
 return time;
};
const spki=(key)=>{
 if(typeof key!=='string'||!key.startsWith('-----BEGIN PUBLIC KEY-----\n')||key.length>4096)fail('Missing pinned public key');
 let parsed;
 try{parsed=createPublicKey(key);}catch{fail('Invalid pinned public key');}
 if(parsed.asymmetricKeyType!=='ed25519')fail('Attestor must use Ed25519');
 return parsed;
};
const keyid=(key)=>createHash('sha256').update(key.export({type:'spki',format:'der'})).digest('hex');
const canonical=(v)=>{
 if(v===null||typeof v!=='object')return JSON.stringify(v);
 if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';
 if(Object.getPrototypeOf(v)!==Object.prototype)fail('Noncanonical attestation object');
 return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
};
// DSSE pre-authentication encoding (in-toto v1): exact lengths for domain separation.
export function testImageAttestationPAE(payloadType,payload){
 if(typeof payloadType!=='string'||!Buffer.isBuffer(payload))fail('Invalid DSSE PAE input');
 const t=Buffer.from(payloadType,'utf8');
 return Buffer.concat([Buffer.from('DSSEv1 '+t.length+' '),t,Buffer.from(' '+payload.length+' '),payload]);
}
/**
 * Independently signed OCI-image identity claim: a local cryptographic check,
 * NOT proof of an externally deployed runtime, OCI registry verification,
 * trusted delivery channel or build-dispatch authorization.
 * The trust policy MUST come from operator-pinned configuration, never a
 * partner or worker-provided payload.
 */
export function verifyIndependentTestOciAttestation(envelope,policy,{now=Date.now()}={}){
 if(!exact(policy,policyKeys)||!imageSha.test(policy.imageDigest)||!gitSha.test(policy.sourceSha)||
    !worker.test(policy.workerId)||!run.test(policy.runId)||!builder.test(policy.builderId)||
    !sha256.test(policy.nonce))fail('Missing independently pinned TEST image provenance policy');
 const attestor=spki(policy.attestorPublicKeyPem),workerKey=spki(policy.workerPublicKeyPem);
 if(keyid(attestor)===keyid(workerKey))fail('TEST image attestor cannot share the worker signing key');
 if(!exact(envelope,['payloadType','payload','signatures'])||
    envelope.payloadType!=='application/vnd.aaraagate.test-oci-image-claim+json'||
    !Array.isArray(envelope.signatures)||envelope.signatures.length!==1||
    !exact(envelope.signatures[0],['keyid','sig']))fail('Untrusted DSSE attestation envelope');
 const signatureInfo=envelope.signatures[0];
 if(signatureInfo.keyid!==keyid(attestor))fail('Unrecognized independent TEST attestor key ID');
 const bytes=b64url(envelope.payload),signature=b64url(signatureInfo.sig);
 if(bytes.length>8192||signature.length!==64)fail('Untrusted TEST image signature length');
 const pae=testImageAttestationPAE(envelope.payloadType,bytes);
 if(!cryptoVerify(null,pae,attestor,signature))fail('Invalid independent attestor signature');
 let stmt;
 try{stmt=JSON.parse(bytes.toString('utf8'));}catch{fail('Invalid attestation statement JSON');}
 if(!exact(stmt,keys)||Buffer.from(canonical(stmt),'utf8').compare(bytes)!==0)
  fail('Noncanonical independent attestation statement');
 if(stmt.schemaVersion!==1||stmt.environment!=='TEST'||stmt.subject!=='OCI_TEST_WORKER_IMAGE'||
    stmt.imageDigest!==policy.imageDigest||stmt.sourceSha!==policy.sourceSha||
    stmt.workerId!==policy.workerId||stmt.runId!==policy.runId||
    stmt.builderId!==policy.builderId||stmt.nonce!==policy.nonce)
  fail('Independent signed image identity differs from pinned worker scope');
 const issued=utc(stmt.issuedAt),expires=utc(stmt.expiresAt);
 if(!Number.isFinite(now)||issued<now-30000||issued>now+5000||expires<=now||
    expires<=issued||expires>issued+90000)
  fail('Stale or excessive independent TEST image assertion');
 return Object.freeze({schemaVersion:1,environment:'TEST',testOnly:true,
  workerId:stmt.workerId,runId:stmt.runId,sourceSha:stmt.sourceSha,
  imageDigest:stmt.imageDigest,attestorKeyId:keyid(attestor),
  signatureVerified:true,independentKeySeparated:true,nonceMatched:true,
  runtimeImageAttested:false,actualOciImageBytesVerified:false,
  runtimeTransportAuthenticated:false,registryDigestVerified:false,
  singleUseChallengeConsumed:false,buildExecutionAuthorized:false,
  artifactProduced:false,dispatchAllowed:false,
  requiresRegistryDigestAndLiveRunnerVerification:true});
}
