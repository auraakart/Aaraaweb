import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign,X509Certificate} from 'node:crypto';
import {createServer} from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {testImageAttestationPAE} from '../packages/config/src/android-test-oci-provenance.mjs';
import {verifyPinnedTestOciRegistryManifest} from '../packages/config/src/android-test-oci-registry.mjs';

const exec=promisify(execFile);
const sha=b=>createHash('sha256').update(b).digest('hex');
const canon=x=>x&&typeof x==='object'&&!Array.isArray(x)?
 '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}':JSON.stringify(x);
const keyid=k=>sha(k.export({type:'spki',format:'der'}));
const MEDIA='application/vnd.oci.image.manifest.v1+json';
let certDir,server,mode='valid',registry,manifestBytes;
async function openssl(...args){await exec('openssl',args,{cwd:certDir,timeout:10000,maxBuffer:8192});}
before(async()=>{
 certDir=await mkdtemp(join(tmpdir(),'aaraagate-v5538-tls-'));
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem',
  '-days','1','-subj','/CN=Aaraagate TEST Fixture CA');
 await openssl('req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr',
  '-subj','/CN=localhost');
 await writeFile(join(certDir,'server.ext'),'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n');
 await openssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key',
  '-CAcreateserial','-out','server.pem','-days','1','-extfile','server.ext');
 const cert=await readFile(join(certDir,'server.pem'),'utf8');
 const key=await readFile(join(certDir,'server.key'),'utf8');
 const caPem=await readFile(join(certDir,'ca.pem'),'utf8');
 const serverSpkiSha256=sha(new X509Certificate(cert).publicKey.export({type:'spki',format:'der'}));
 server=createServer({ca:caPem,cert,key,minVersion:'TLSv1.3'},(req,res)=>{
  if(req.method!=='GET'||!/\/v2\/aaraagate\/test\/manifests\/sha256:[0-9a-f]{64}$/.test(req.url))
   {res.writeHead(404).end();return;}
  if(mode==='redirect'){res.writeHead(302,{location:'https://untrusted.example/v2'}).end();return;}
  const bytes=mode==='tampered'?Buffer.from(manifestBytes.toString('utf8').replace('"layers"','"layerS"')):
    mode==='oversized'?Buffer.alloc(256*1024+1,65):manifestBytes;
  const digest='sha256:'+sha(manifestBytes);
  res.writeHead(200,{
   'content-type':mode==='bad-type'?'application/json':MEDIA,
   'docker-content-digest':mode==='bad-header'?'sha256:'+'0'.repeat(64):digest,
   ...(mode==='encoded'?{'content-encoding':'gzip'}:{}),
   'content-length':String(bytes.length)
  }).end(bytes);
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
 registry={caPem,serverSpkiSha256,serverName:'localhost'};
});
after(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
 if(certDir)await rm(certDir,{recursive:true,force:true});
});
async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5538-oci-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const blobs=join(root,'blobs','sha256');await mkdir(blobs,{recursive:true});
 const add=async(data,mediaType)=>{
  const buf=Buffer.isBuffer(data)?data:Buffer.from(data);
  const id=sha(buf);await writeFile(join(blobs,id),buf);
  return {mediaType,digest:'sha256:'+id,size:buf.length};
 };
 const sourceSha='b'.repeat(40);
 const config=await add(JSON.stringify({os:'linux',architecture:'amd64',config:{Labels:{
  'org.opencontainers.image.revision':sourceSha}}}),
  'application/vnd.oci.image.config.v1+json');
 const layer=await add('test gzip layer fixture; no execution or extraction',
  'application/vnd.oci.image.layer.v1.tar+gzip');
 const manifest=await add(JSON.stringify({schemaVersion:2,mediaType:MEDIA,config,layers:[layer]}),MEDIA);
 manifestBytes=await readFile(join(blobs,manifest.digest.slice(7)));
 await writeFile(join(root,'oci-layout'),JSON.stringify({imageLayoutVersion:'1.0.0'}));
 await writeFile(join(root,'index.json'),JSON.stringify({schemaVersion:2,manifests:[{
  ...manifest,platform:{architecture:'amd64',os:'linux'}}]}));
 const attestor=generateKeyPairSync('ed25519'),worker=generateKeyPairSync('ed25519');
 const imagePolicy={imageDigest:manifest.digest,sourceSha,
  workerId:'TEST_WORKER_CI_01',runId:'TEST_RUN_CI_01',
  builderId:'TEST_ATTESTOR_QA_01',nonce:'c'.repeat(64),
  attestorPublicKeyPem:attestor.publicKey.export({format:'pem',type:'spki'}).toString(),
  workerPublicKeyPem:worker.publicKey.export({format:'pem',type:'spki'}).toString()};
 const statement={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_WORKER_IMAGE',
  imageDigest:manifest.digest,sourceSha,workerId:imagePolicy.workerId,
  runId:imagePolicy.runId,builderId:imagePolicy.builderId,nonce:imagePolicy.nonce,
  issuedAt:new Date(Date.now()-1000).toISOString(),
  expiresAt:new Date(Date.now()+45000).toISOString()};
 const bytes=Buffer.from(canon(statement));
 const payloadType='application/vnd.aaraagate.test-oci-image-claim+json';
 const envelope={payloadType,payload:bytes.toString('base64url'),signatures:[{
  keyid:keyid(attestor.publicKey),
  sig:sign(null,testImageAttestationPAE(payloadType,bytes),attestor.privateKey).toString('base64url')}]};
 const registryPolicy={...registry,imageDigest:manifest.digest,
  endpoint:'https://127.0.0.1:'+server.address().port+'/v2/aaraagate/test/manifests/'+manifest.digest};
 return {root,envelope,imagePolicy,registryPolicy,
  probe:(policy=registryPolicy,claim=imagePolicy)=>verifyPinnedTestOciRegistryManifest(root,envelope,claim,policy)};
}
test('V5.5.38 checks pinned TLS registry GET bytes against verified local OCI and DSSE without authority',async t=>{
 mode='valid';const f=await fixture(t),result=await f.probe();
 assert.equal(result.registryTlsPeerPinned,true);
 assert.equal(result.registryManifestBytesMatchedSignedDigest,true);
 assert.equal(result.configAndCompressedLayerDigestVerified,true);
 assert.equal(result.registryManifestBytes,manifestBytes.length);
 for(const key of ['externalRegistryAttested','registryDigestVerified','remoteLayersVerified',
  'runtimeImageAttested','runtimeTransportAuthenticated','singleUseChallengeConsumed',
  'buildExecutionAuthorized','artifactProduced','dispatchAllowed'])assert.equal(result[key],false,key);
 assert.ok(Object.isFrozen(result));
});
for(const state of ['redirect','bad-type','bad-header','encoded','tampered','oversized'])
 test('V5.5.38 rejects TLS registry response '+state,async t=>{
  mode=state;const f=await fixture(t);await assert.rejects(f.probe());
 });
for(const [name,change] of [
 ['foreign digest',p=>{p.imageDigest='sha256:'+'0'.repeat(64);}],
 ['unpinned key',p=>{p.serverSpkiSha256='0'.repeat(64);}],
 ['HTTP downgrade',p=>{p.endpoint=p.endpoint.replace('https:','http:');}],
 ['redirectable URL',p=>{p.endpoint+='?redirect=true';}],
 ['arbitrary URL credentials',p=>{p.endpoint=p.endpoint.replace('https://','https://user:secret@');}],
 ['tag instead of digest',p=>{p.endpoint=p.endpoint.replace(/sha256:[0-9a-f]{64}$/,'latest');}],
 ['unknown policy key',p=>{p.dispatchAllowed=true;}],
 ['wrong TLS name',p=>{p.serverName='other.example';}]
])test('V5.5.38 fails closed on '+name,async t=>{
 mode='valid';const f=await fixture(t),policy={...f.registryPolicy};change(policy);
 await assert.rejects(f.probe(policy));
});
test('V5.5.38 rejects signed-claim mismatch before registry trust',async t=>{
 mode='valid';const f=await fixture(t);
 await assert.rejects(f.probe(f.registryPolicy,{...f.imagePolicy,nonce:'0'.repeat(64)}));
});
