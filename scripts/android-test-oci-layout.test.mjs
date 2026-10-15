import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {testImageAttestationPAE} from '../packages/config/src/android-test-oci-provenance.mjs';
import {verifyPinnedTestOciImageLayout} from '../packages/config/src/android-test-oci-layout.mjs';

const hash=b=>createHash('sha256').update(b).digest('hex');
const canon=x=>x&&typeof x==='object'&&!Array.isArray(x)?
 '{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}':JSON.stringify(x);
const media='application/vnd.oci.image.manifest.v1+json';
const blobMedia='application/vnd.oci.image.layer.v1.tar+gzip';
const keyid=k=>createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
async function fixture(t,options={}){
 const root=await mkdtemp(join(tmpdir(),'aaraagate-v5537-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const blobs=join(root,'blobs','sha256');
 await mkdir(blobs,{recursive:true});
 const add=async(buf,mediaType)=>{
  const data=Buffer.isBuffer(buf)?buf:Buffer.from(buf);
  const id=hash(data);
  await writeFile(join(blobs,id),data);
  return {mediaType,digest:'sha256:'+id,size:data.length};
 };
 const key=generateKeyPairSync('ed25519'),workerKey=generateKeyPairSync('ed25519');
 const sourceSha='b'.repeat(40);
 const config={architecture:'amd64',os:'linux',config:{Labels:{
  'org.opencontainers.image.revision':options.wrongSource?'f'.repeat(40):sourceSha
 }}};
 const c=await add(JSON.stringify(config),'application/vnd.oci.image.config.v1+json');
 const l=await add(Buffer.from('mock gzip fixture bytes - not extracted'),blobMedia);
 const manifest={schemaVersion:2,mediaType:media,config:c,layers:[l]};
 const m=await add(JSON.stringify(manifest),media);
 await writeFile(join(root,'oci-layout'),JSON.stringify({imageLayoutVersion:'1.0.0'}));
 const index={schemaVersion:2,manifests:[{...m,platform:{
  os:'linux',architecture:options.wrongPlatform?'arm64':'amd64'
 }}]};
 await writeFile(join(root,'index.json'),JSON.stringify(index));
 const policy={imageDigest:m.digest,sourceSha,workerId:'TEST_WORKER_CI_01',
  runId:'TEST_RUN_CI_01',builderId:'TEST_ATTESTOR_QA_01',nonce:'c'.repeat(64),
  attestorPublicKeyPem:key.publicKey.export({type:'spki',format:'pem'}).toString(),
  workerPublicKeyPem:workerKey.publicKey.export({type:'spki',format:'pem'}).toString()};
 const statement={schemaVersion:1,environment:'TEST',subject:'OCI_TEST_WORKER_IMAGE',
  imageDigest:policy.imageDigest,sourceSha,workerId:policy.workerId,runId:policy.runId,
  builderId:policy.builderId,nonce:policy.nonce,
  issuedAt:new Date(Date.now()-1000).toISOString(),
  expiresAt:new Date(Date.now()+45000).toISOString()};
 const bytes=Buffer.from(canon(statement));
 const typ='application/vnd.aaraagate.test-oci-image-claim+json';
 const envelope={payloadType:typ,payload:bytes.toString('base64url'),
  signatures:[{keyid:keyid(key.publicKey),
   sig:sign(null,testImageAttestationPAE(typ,bytes),key.privateKey).toString('base64url')}]};
 const verify=(envelopeOverride=envelope,policyOverride=policy)=>
  verifyPinnedTestOciImageLayout(root,envelopeOverride,policyOverride);
 return {root,blobs,config,manifest,c,l,m,index,policy,envelope,verify};
}
test('V5.5.37 verifies real disk manifest/config/layer SHA against signed TEST OCI claim without dispatch',async t=>{
 const f=await fixture(t),r=await f.verify();
 assert.equal(r.ociLayoutManifestBytesVerified,true);
 assert.equal(r.configAndCompressedLayerDigestVerified,true);
 assert.equal(r.verifiedLayerCount,1);
 assert.equal(r.signedClaimBoundToLocalImage,true);
 for(const key of ['registryDigestVerified','runtimeImageAttested','imageRunningOnAuthenticatedWorker',
  'runtimeTransportAuthenticated','immutableMountVerified','singleUseChallengeConsumed',
  'buildExecutionAuthorized','artifactProduced','dispatchAllowed'])assert.equal(r[key],false,key);
 assert.ok(Object.isFrozen(r));
});
test('V5.5.37 rejects modified on-disk layer bytes even if sizes unchanged',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.blobs,f.l.digest.slice(7)),Buffer.from('mock gzip fixture bytes - not Extracted'));
 await assert.rejects(f.verify(),/differ|digest/i);
});
test('V5.5.37 rejects modified config bytes',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.blobs,f.c.digest.slice(7)),'{"changed":true}');
 await assert.rejects(f.verify(),/differ|digest/i);
});
test('V5.5.37 rejects mismatched signed image digest',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.verify(f.envelope,{...f.policy,imageDigest:'sha256:'+'a'.repeat(64)}));
});
test('V5.5.37 rejects foreign source label even with valid signed manifest bytes',async t=>{
 const f=await fixture(t,{wrongSource:true});
 await assert.rejects(f.verify(),/source|configuration/i);
});
test('V5.5.37 rejects unexpected OCI platform',async t=>{
 const f=await fixture(t,{wrongPlatform:true});
 await assert.rejects(f.verify(),/platform/i);
});
test('V5.5.37 rejects an extra OCI blob',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.blobs,'d'.repeat(64)),'unauthorized content');
 await assert.rejects(f.verify(),/blob set/i);
});
test('V5.5.37 rejects unexpected extra OCI layout files',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.root,'credentials.txt'),'do not read');
 await assert.rejects(f.verify(),/root contents/i);
});
test('V5.5.37 rejects symlinked layer paths and layout directories',async t=>{
 const f=await fixture(t);
 await rm(join(f.blobs,f.l.digest.slice(7)));
 await symlink(join(f.blobs,f.c.digest.slice(7)),join(f.blobs,f.l.digest.slice(7)));
 await assert.rejects(f.verify(),/path|size/i);
});
test('V5.5.37 rejects unsigned OCI manifest index replacement',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.root,'index.json'),JSON.stringify({schemaVersion:2,manifests:[]}));
 await assert.rejects(f.verify(),/manifest/i);
});
test('V5.5.37 rejects claimed second image/platform manifest',async t=>{
 const f=await fixture(t);
 await writeFile(join(f.root,'index.json'),JSON.stringify({...f.index,
  manifests:[...f.index.manifests,...f.index.manifests]}));
 await assert.rejects(f.verify(),/manifest/i);
});
test('V5.5.37 rejects a second signed claim for a foreign nonce',async t=>{
 const f=await fixture(t);
 await assert.rejects(f.verify(f.envelope,{...f.policy,nonce:'0'.repeat(64)}),/scope/i);
});
test('V5.5.37 rejects symlinked OCI root',async t=>{
 const f=await fixture(t),root2=f.root+'-alias';
 await symlink(f.root,root2);
 t.after(()=>rm(root2,{force:true}));
 await assert.rejects(verifyPinnedTestOciImageLayout(root2,f.envelope,f.policy),/root/i);
});
