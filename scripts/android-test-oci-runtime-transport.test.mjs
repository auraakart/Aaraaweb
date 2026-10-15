import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,X509Certificate} from 'node:crypto';
import {createServer} from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testImageAttestationPAE} from '../packages/config/src/android-test-oci-provenance.mjs';
import {probePinnedTestOciRuntimeEvidence,signedTestRuntimeTransportBytes}
 from '../packages/config/src/android-test-oci-runtime-transport.mjs';

const exec=promisify(execFile);
const sha=b=>createHash('sha256').update(b).digest('hex');
const kid=k=>sha(k.export({type:'spki',format:'der'}));
const pub=pair=>pair.publicKey.export({type:'spki',format:'pem'}).toString();
const uuid=n=>n.repeat(8)+'-'+n.repeat(4)+'-4'+n.repeat(3)+'-8'+n.repeat(3)+'-'+n.repeat(12);
const canon=v=>v&&typeof v==='object'&&!Array.isArray(v)?
 '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}':JSON.stringify(v);
const imageType='application/vnd.aaraagate.test-oci-image-claim+json';
const runtimeType='application/vnd.aaraagate.test-oci-runtime-process-claim+json';
let dir,server,tls,mode='valid',current,calls=0,seen=[],cached;
async function openssl(...args){await exec('openssl',args,{cwd:dir,timeout:10000,maxBuffer:8192});}
function signed(typ,claim,keys){
 const bytes=Buffer.from(canon(claim));
 return {payloadType:typ,payload:bytes.toString('base64url'),signatures:keys.map(key=>({
  keyid:kid(key.publicKey),
  sig:sign(null,testImageAttestationPAE(typ,bytes),key.privateKey).toString('base64url')
 }))};
}
function fixture(){
 const attestor=generateKeyPairSync('ed25519');
 const worker=generateKeyPairSync('ed25519');
 const observer=generateKeyPairSync('ed25519');
 const times={issuedAt:new Date(Date.now()-1000).toISOString(),
  expiresAt:new Date(Date.now()+49000).toISOString()};
 const imagePolicy={imageDigest:'sha256:'+'a'.repeat(64),sourceSha:'b'.repeat(40),
  workerId:'TEST_WORKER_LIVE_40',runId:'TEST_RUN_LIVE_40',builderId:'TEST_ATTESTOR_LIVE_40',
  nonce:'c'.repeat(64),attestorPublicKeyPem:pub(attestor),workerPublicKeyPem:pub(worker)};
 const runtimePolicy={nonce:imagePolicy.nonce,manifestDigest:'d'.repeat(64),
  acceptanceId:uuid('1'),challengeId:uuid('2'),containerId:'e'.repeat(64),
  mountNamespaceId:'mnt:[4026532001]',
  transportServerSpkiSha256:tls.serverSpkiSha256,observerPublicKeyPem:pub(observer)};
 const imageClaim={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_WORKER_IMAGE',
  imageDigest:imagePolicy.imageDigest,sourceSha:imagePolicy.sourceSha,
  workerId:imagePolicy.workerId,runId:imagePolicy.runId,builderId:imagePolicy.builderId,
  nonce:imagePolicy.nonce,...times};
 const runtimeClaim={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_RUNTIME_PROCESS_CLAIM',
  imageDigest:imagePolicy.imageDigest,sourceSha:imagePolicy.sourceSha,
  workerId:imagePolicy.workerId,runId:imagePolicy.runId,nonce:imagePolicy.nonce,
  manifestDigest:runtimePolicy.manifestDigest,acceptanceId:runtimePolicy.acceptanceId,
  challengeId:runtimePolicy.challengeId,containerId:runtimePolicy.containerId,
  mountNamespaceId:runtimePolicy.mountNamespaceId,
  transportServerSpkiSha256:tls.serverSpkiSha256,
  rootfsReadOnly:true,sourceMountReadOnly:true,...times};
 const imageEnvelope=signed(imageType,imageClaim,[attestor]);
 const runtimeEnvelope=signed(runtimeType,runtimeClaim,[observer,worker]);
 const transportPolicy={...tls,endpoint:'https://127.0.0.1:'+server.address().port+
  '/v1/test-runner/runtime-evidence'};
 return {imageEnvelope,imagePolicy,runtimePolicy,transportPolicy,runtimeEnvelope,
  observer,worker,runtimeClaim};
}
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'aaraagate-v5540-mtls-'));
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem',
  '-days','1','-subj','/CN=TEST Runtime CA');
 for(const name of ['server','client']){
  await openssl('req','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr',
   '-subj','/CN='+(name==='server'?'localhost':'TEST Read Only Client'));
  await writeFile(join(dir,name+'.ext'),name==='server'?
   'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':
   'extendedKeyUsage=clientAuth\n');
  await openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key',
   '-CAcreateserial','-out',name+'.pem','-days','1','-extfile',name+'.ext');
 }
 const caPem=await readFile(join(dir,'ca.pem'),'utf8'),
  clientCertPem=await readFile(join(dir,'client.pem'),'utf8'),
  clientKeyPem=await readFile(join(dir,'client.key'),'utf8'),
  serverCertPem=await readFile(join(dir,'server.pem'),'utf8'),
  serverKeyPem=await readFile(join(dir,'server.key'),'utf8');
 tls={caPem,clientCertPem,clientKeyPem,serverName:'localhost',
  serverSpkiSha256:sha(new X509Certificate(serverCertPem).publicKey.export({type:'spki',format:'der'})),
  clientSpkiSha256:sha(new X509Certificate(clientCertPem).publicKey.export({type:'spki',format:'der'}))};
 server=createServer({ca:caPem,cert:serverCertPem,key:serverKeyPem,
  requestCert:true,rejectUnauthorized:true,minVersion:'TLSv1.3'},async(req,res)=>{
  calls++;
  if(!req.socket.authorized||req.method!=='POST'||req.url!=='/v1/test-runner/runtime-evidence')
   {res.writeHead(403).end();return;}
  if(mode==='redirect'){res.writeHead(307,{location:'https://evil.test/'}).end();return;}
  let body='';for await(const c of req)body+=c;
  let request;try{request=JSON.parse(body);}catch{res.writeHead(400).end();return;}
  seen.push(request.requestNonce);
  const f=current;
  const inner=mode==='bad-runtime'?signed(runtimeType,
    {...f.runtimeClaim,containerId:'0'.repeat(64)},[f.observer,f.worker]):f.runtimeEnvelope;
  const payload={schemaVersion:1,environment:'TEST',requestNonce:
   mode==='foreign-nonce'?'0'.repeat(64):request.requestNonce,runtimeEnvelope:inner};
  let signature=sign(null,signedTestRuntimeTransportBytes(payload),f.observer.privateKey).toString('base64url');
  if(mode==='bad-signature')signature='A'.repeat(86);
  if(mode==='foreign-observer'){
   const rogue=generateKeyPairSync('ed25519');
   signature=sign(null,signedTestRuntimeTransportBytes(payload),rogue.privateKey).toString('base64url');
  }
  const response=mode==='bad-json'?'not-json':JSON.stringify({...payload,signature});
  if(mode==='replay'&&cached){
   res.writeHead(200,{'content-type':'application/json'}).end(cached);return;
  }
  cached=response;
  res.writeHead(200,{'content-type':mode==='bad-type'?'text/plain':'application/json',
   ...(mode==='encoded'?{'content-encoding':'gzip'}:{})}).end(response);
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(dir)await rm(dir,{recursive:true,force:true});
});
const probe=(policyUpdate=()=>{},fixtureUpdate=()=>{})=>{
 const f=fixture();current=f;fixtureUpdate(f);
 const p={...f.transportPolicy};policyUpdate(p);
 return probePinnedTestOciRuntimeEvidence(f.imageEnvelope,f.imagePolicy,f.runtimePolicy,p);
};
test('V5.5.40 read-only local mTLS runtime claim probe verifies fresh nonce; no authority',async()=>{
 mode='valid';seen=[];cached=null;
 const receipt=await probe();
 assert.equal(receipt.tls13PinnedPeerVerified,true);
 assert.equal(receipt.freshTransportNonceSignatureVerified,true);
 assert.equal(receipt.independentRuntimeClaimSignaturesVerified,true);
 assert.match(receipt.transportNonceDigest,/^[0-9a-f]{64}$/);
 assert.match(receipt.runtimeEnvelopeDigest,/^[0-9a-f]{64}$/);
 assert.match(receipt.transportSignatureDigest,/^[0-9a-f]{64}$/);
 assert.equal(receipt.serverSpkiSha256,tls.serverSpkiSha256);
 assert.ok(Number.isFinite(Date.parse(receipt.verifiedAt)));
 for(const x of ['independentlyProvisionedWorkerVerified','remoteProcessMeasured',
  'runtimeImageAttested','immutableMountVerified','singleUseChallengeConsumed',
  'buildExecutionAuthorized','artifactProduced','dispatchAllowed'])assert.equal(receipt[x],false,x);
 assert.ok(Object.isFrozen(receipt));
 const again=await probe();assert.equal(again.dispatchAllowed,false);
 assert.equal(seen.length,2);assert.notEqual(seen[0],seen[1]);
});
for(const state of ['redirect','foreign-nonce','bad-signature','foreign-observer',
 'bad-runtime','bad-json','bad-type','encoded'])
 test('V5.5.40 rejects remote '+state,async()=>{
  mode=state;cached=null;await assert.rejects(probe());
 });
test('V5.5.40 rejects previously signed response replay under fresh nonce',async()=>{
 mode='valid';cached=null;await probe();mode='replay';
 await assert.rejects(probe());
});
for(const [name,change] of [
 ['TLS server SPKI',p=>p.serverSpkiSha256='0'.repeat(64)],
 ['TLS hostname',p=>p.serverName='evil.test'],
 ['TLS client SPKI',p=>p.clientSpkiSha256='0'.repeat(64)],
 ['untrusted CA',p=>p.caPem=p.caPem.replace('CERTIFICATE','CERTIFICA3E')],
 ['HTTP downgrade',p=>p.endpoint=p.endpoint.replace('https:','http:')],
 ['arbitrary path',p=>p.endpoint=p.endpoint.replace('/runtime-evidence','/execute')],
 ['arbitrary query',p=>p.endpoint+='?dispatch=true'],
 ['URL credentials',p=>p.endpoint=p.endpoint.replace('https://','https://user:secret@')],
 ['extra policy authority',p=>p.dispatchAllowed=true]
])test('V5.5.40 refuses '+name,async()=>{
 mode='valid';cached=null;await assert.rejects(probe(change));
});
test('V5.5.40 rejects runtime operator policy drift',async()=>{
 mode='valid';cached=null;await assert.rejects(probe(()=>{},f=>{
  f.runtimePolicy={...f.runtimePolicy,challengeId:uuid('3')};
 }));
});
