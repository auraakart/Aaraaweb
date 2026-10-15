import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import { createHash,generateKeyPairSync,sign,X509Certificate } from 'node:crypto';
import { createServer } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { androidBuildManifestDigest } from '../packages/config/src/android-build-contract.mjs';
import { probeAuthenticatedTestAndroidRunner,testAndroidTransportSignedBytes } from '../packages/config/src/android-test-mtls-transport.mjs';

const exec=promisify(execFile);
const sha=data=>createHash('sha256').update(data).digest('hex');
const uuid=n=>n.repeat(8)+'-'+n.repeat(4)+'-4'+n.repeat(3)+'-8'+n.repeat(3)+'-'+n.repeat(12);
let dir,server,policy,mode='valid',calls=0,signKey;
function plan(role='RESIDENT'){
 const m={schemaVersion:1,buildMode:'TEST',appRole:role,
  sourceSha:'a'.repeat(40),lockDigest:'b'.repeat(64)};
 return {manifest:m,manifestDigest:androidBuildManifestDigest(m),appDirectory:'apps/'+role.toLowerCase(),
  testOnly:true,dispatchAllowed:false,requiresVersionReservation:true};
}
function acceptance(p){
 return {id:uuid('1'),challengeId:uuid('2'),consumptionId:uuid('3'),
  status:'SIGNED_TEST_EVIDENCE_ACCEPTED_NO_EXECUTION',workerSignatureVerified:true,
  serverReplayBarrierVerified:true,testOnly:true,dispatchAllowed:false,
  artifactProduced:false,manifestDigest:p.manifestDigest,workerId:policy.workerId,
  runId:policy.runId};
}
async function openssl(...args){await exec('openssl',args,{cwd:dir,timeout:10000,maxBuffer:8192});}
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'aaraagate-v5518-mtls-'));
 await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem',
  '-days','1','-subj','/CN=TEST Fixture CA');
 for(const name of ['server','client']){
  await openssl('req','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr',
   '-subj','/CN='+(name==='server'?'localhost':'TEST Fixture Client'));
  await writeFile(join(dir,name+'.ext'),name==='server'?
   'subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n':
   'extendedKeyUsage=clientAuth\n');
  await openssl('x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key',
   '-CAcreateserial','-out',name+'.pem','-days','1','-extfile',name+'.ext');
 }
 const caPem=await readFile(join(dir,'ca.pem'),'utf8');
 const clientCertPem=await readFile(join(dir,'client.pem'),'utf8');
 const clientKeyPem=await readFile(join(dir,'client.key'),'utf8');
 const serverCertPem=await readFile(join(dir,'server.pem'),'utf8');
 const serverKeyPem=await readFile(join(dir,'server.key'),'utf8');
 const serverSpkiSha256=sha(new X509Certificate(serverCertPem).publicKey.export({type:'spki',format:'der'}));
 const clientSpkiSha256=sha(new X509Certificate(clientCertPem).publicKey.export({type:'spki',format:'der'}));
 const kp=generateKeyPairSync('ed25519');signKey=kp.privateKey;
 const workerPublicKeyPem=kp.publicKey.export({format:'pem',type:'spki'}).toString();
 server=createServer({ca:caPem,cert:serverCertPem,key:serverKeyPem,requestCert:true,
  rejectUnauthorized:true,minVersion:'TLSv1.3'},async(req,res)=>{
  calls++;
  if(!req.socket.authorized || !req.socket.getPeerCertificate().raw){
   res.writeHead(403).end();return;
  }
  if(mode==='redirect'){res.writeHead(302,{location:'https://elsewhere.test/'}).end();return;}
  let body='';for await(const chunk of req)body+=chunk;
  if(req.method!=='POST'||req.url!=='/v1/test-runner/identity'){res.writeHead(404).end();return;}
  let data;try{data=JSON.parse(body);}catch{res.writeHead(400).end();return;}
  if(mode==='badjson'){res.writeHead(200,{'content-type':'application/json'}).end('not json');return;}
  const payload={...data,observedAt:new Date().toISOString()};
  if(mode==='wrongnonce')payload.nonce='0'.repeat(64);
  if(mode==='wrongworker')payload.workerId='TEST_WORKER_FOREIGN';
  let signature=sign(null,testAndroidTransportSignedBytes(payload),signKey).toString('base64url');
  if(mode==='invalidsignature')signature='A'.repeat(86);
  const response=JSON.stringify({payload,signature});
  res.writeHead(200,{'content-type':'application/json'}).end(response);
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
 policy={endpoint:'https://127.0.0.1:'+server.address().port+'/v1/test-runner/identity',
  serverName:'localhost',caPem,clientCertPem,clientKeyPem,
  serverSpkiSha256,clientSpkiSha256,workerPublicKeyPem,
  workerId:'TEST_WORKER_FIXTURE_01',runId:'TEST_RUN_FIXTURE_01',imageDigest:'sha256:'+'f'.repeat(64)};
});
after(async()=>{await new Promise(resolve=>server?.close(resolve));if(dir)await rm(dir,{recursive:true,force:true});});
const call=(role='RESIDENT',change=()=>{})=>{
 const p=plan(role),a=acceptance(p),trusted={...policy};
 change(p,a,trusted);
 return probeAuthenticatedTestAndroidRunner(p,a,trusted);
};
test('V5.5.18 Resident accepts local pinned TLSv1.3/mTLS and signed non-dispatchable worker nonce',async()=>{
 mode='valid';
 const result=await call();
 assert.equal(result.serverTlsAuthenticated,true);
 assert.equal(result.runnerTransportAuthenticated,true);
 assert.equal(result.clientCertificatePresented,true);
 assert.equal(result.workerIdentitySignatureVerified,true);
 assert.equal(result.nonceBoundResponseVerified,true);
 assert.equal(result.runtimeImageAttested,false);
 assert.equal(result.dispatchAllowed,false);
 assert.equal(result.artifactProduced,false);
});
test('V5.5.18 Guard uses same pinned TEST mTLS identity and cannot dispatch',async()=>{
 mode='valid';const r=await call('GUARD');
 assert.equal(r.runnerTransportAuthenticated,true);
 assert.equal(r.dispatchAllowed,false);
});
for(const [name,change] of [
 ['unsigned acceptance',(p,a)=>{a.workerSignatureVerified=false;}],
 ['unconsumed replay',(p,a)=>{a.serverReplayBarrierVerified=false;}],
 ['forged accepted worker',(p,a)=>{a.workerId='TEST_WORKER_OTHER';}],
 ['wrong manifest',(p,a)=>{a.manifestDigest='0'.repeat(64);}],
 ['request dispatch',(p)=>{p.dispatchAllowed=true;}],
 ['HTTP endpoint',(p,a,t)=>{t.endpoint=t.endpoint.replace('https:','http:');}],
 ['redirectable path',(p,a,t)=>{t.endpoint=t.endpoint.replace('/identity','/execute');}],
 ['foreign server pin',(p,a,t)=>{t.serverSpkiSha256='0'.repeat(64);}],
 ['foreign client certificate pin',(p,a,t)=>{t.clientSpkiSha256='0'.repeat(64);}],
 ['foreign worker signer',(p,a,t)=>{t.workerPublicKeyPem=generateKeyPairSync('ed25519').publicKey.export({format:'pem',type:'spki'}).toString();}],
 ['unknown policy key',(p,a,t)=>{t.authorization='untrusted';}]
])test('V5.5.18 fails closed on '+name,async()=>{
 mode='valid';await assert.rejects(call('RESIDENT',change));
});
for(const failure of ['redirect','badjson','wrongnonce','wrongworker','invalidsignature'])
 test('V5.5.18 refuses remote '+failure,async()=>{
  mode=failure;await assert.rejects(call());
 });
