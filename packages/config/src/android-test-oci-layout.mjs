import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {lstat,readFile,readdir,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {verifyIndependentTestOciAttestation} from './android-test-oci-provenance.mjs';

const sha=/^[0-9a-f]{64}$/;
const digest=/^sha256:([0-9a-f]{64})$/;
const exact=(x,fields)=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype&&
 Object.keys(x).sort().join(',')===fields.slice().sort().join(',');
const fail=m=>{throw new Error(m);};
const hash=x=>createHash('sha256').update(x).digest('hex');
const MAX_MANIFEST=256*1024,MAX_CONFIG=2*1024*1024,MAX_LAYER=128*1024*1024;
const MAX_LAYERS=8,MAX_TOTAL=512*1024*1024;
const json=bytes=>{
 let result;
 try{result=JSON.parse(bytes.toString('utf8'));}catch{fail('Invalid OCI JSON');}
 if(!result||typeof result!=='object'||Array.isArray(result))fail('Invalid OCI object');
 return result;
};
async function regular(path,max){
 const s=await lstat(path);
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size<1||s.size>max)
  fail('Untrusted OCI blob path or size');
 const h=createHash('sha256');let size=0;
 for await(const chunk of createReadStream(path)){
  size+=chunk.length;
  if(size>max)fail('OCI blob exceeded configured bound');
  h.update(chunk);
 }
 const after=await lstat(path);
 if(s.ino!==after.ino||s.dev!==after.dev||s.size!==after.size||
    s.mtimeMs!==after.mtimeMs||s.ctimeMs!==after.ctimeMs||s.mode!==after.mode)
  fail('OCI blob changed during verification');
 return {sha256:h.digest('hex'),size};
}
async function safeDir(path){
 const s=await lstat(path);
 if(!s.isDirectory()||s.isSymbolicLink()||await realpath(path)!==path)
  fail('OCI layout directory is not canonical');
}
function descriptor(item,media,limit){
 if(!exact(item,['mediaType','digest','size'])||item.mediaType!==media||
    !digest.test(item.digest)||!Number.isSafeInteger(item.size)||
    item.size<1||item.size>limit)fail('Invalid OCI descriptor');
 return item.digest.slice(7);
}
/**
 * Check real on-disk OCI v1 single-image layout bytes against a separately
 * pinned, DSSE-signed image claim. Never contacts registry, extracts tar,
 * starts container, or grants build execution.
 */
export async function verifyPinnedTestOciImageLayout(root,envelope,operatorPolicy,{now=Date.now(),architecture='amd64'}={}){
 const signed=verifyIndependentTestOciAttestation(envelope,operatorPolicy,{now});
 if(!['amd64','arm64'].includes(architecture))fail('Unknown approved OCI platform');
 if(typeof root!=='string'||!isAbsolute(root)||resolve(root)!==root||
    root.includes('\\')||root.length>1024||root==='/'||
    await realpath(root)!==root)fail('Untrusted OCI layout root');
 await safeDir(root);await safeDir(join(root,'blobs'));await safeDir(join(root,'blobs','sha256'));
 const expectedRoot=['blobs','index.json','oci-layout'];
 if((await readdir(root)).sort().join(',')!==expectedRoot.join(','))
  fail('Unexpected OCI layout root contents');
 if((await readdir(join(root,'blobs'))).join(',')!=='sha256')
  fail('Unexpected OCI blob algorithm');
 const layout=join(root,'oci-layout'),indexFile=join(root,'index.json');
 const layoutStat=await regular(layout,128);
 const layoutBytes=await readFile(layout);
 if(layoutStat.sha256!==hash(layoutBytes)||!exact(json(layoutBytes),['imageLayoutVersion'])||
    json(layoutBytes).imageLayoutVersion!=='1.0.0')fail('Untrusted OCI layout version');
 const indexStat=await regular(indexFile,MAX_MANIFEST);
 const indexBytes=await readFile(indexFile);
 if(indexStat.sha256!==hash(indexBytes))fail('OCI index changed after hashing');
 const index=json(indexBytes);
 if(!exact(index,['schemaVersion','manifests'])||index.schemaVersion!==2||
    !Array.isArray(index.manifests)||index.manifests.length!==1)
  fail('Only one pinned OCI image manifest is accepted');
 const entry=index.manifests[0];
 if(!exact(entry,['mediaType','digest','size','platform'])||
    !exact(entry.platform,['architecture','os'])||
    entry.platform.os!=='linux'||entry.platform.architecture!==architecture)
  fail('Unexpected OCI image platform');
 const id=descriptor({mediaType:entry.mediaType,digest:entry.digest,size:entry.size},
  'application/vnd.oci.image.manifest.v1+json',MAX_MANIFEST);
 if(entry.digest!==operatorPolicy.imageDigest)
  fail('OCI index selected a different signed image digest');
 const manifestPath=join(root,'blobs','sha256',id);
 const manifestStat=await regular(manifestPath,MAX_MANIFEST);
 if(manifestStat.sha256!==id||manifestStat.size!==entry.size)
  fail('OCI image manifest digest differs from pinned claim');
 const manifest=json(await readFile(manifestPath));
 if(!exact(manifest,['schemaVersion','mediaType','config','layers'])||
    manifest.schemaVersion!==2||
    manifest.mediaType!=='application/vnd.oci.image.manifest.v1+json'||
    !Array.isArray(manifest.layers)||manifest.layers.length<1||
    manifest.layers.length>MAX_LAYERS)fail('Invalid OCI image manifest');
 const configId=descriptor(manifest.config,'application/vnd.oci.image.config.v1+json',MAX_CONFIG);
 const layerIds=manifest.layers.map(x=>descriptor(x,'application/vnd.oci.image.layer.v1.tar+gzip',MAX_LAYER));
 const expected=[id,configId,...layerIds];
 if(new Set(expected).size!==expected.length)
  fail('OCI descriptor digest reused in distinct roles');
 const all=await readdir(join(root,'blobs','sha256'));
 if(all.length!==expected.length||all.some(x=>!sha.test(x))||
   all.sort().join(',')!==expected.sort().join(','))
  fail('OCI blob set differs from exact reviewed manifest');
 let total=manifestStat.size;
 for(const desc of [manifest.config,...manifest.layers]){
  total+=desc.size;
  if(total>MAX_TOTAL)fail('Excessive OCI image size');
  const name=desc.digest.slice(7);
  const result=await regular(join(root,'blobs','sha256',name),
   desc===manifest.config?MAX_CONFIG:MAX_LAYER);
  if(result.sha256!==name||result.size!==desc.size)
   fail('OCI config/layer bytes differ from content-addressed descriptor');
 }
 const configBytes=await readFile(join(root,'blobs','sha256',configId));
 const config=json(configBytes);
 const labels=config.config?.Labels;
 if(config.os!=='linux'||config.architecture!==architecture||
    !labels||typeof labels!=='object'||Array.isArray(labels)||
    labels['org.opencontainers.image.revision']!==operatorPolicy.sourceSha)
  fail('OCI image configuration differs from signed source/platform');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  workerId:signed.workerId,runId:signed.runId,
  imageDigest:signed.imageDigest,sourceSha:signed.sourceSha,
  attestorKeyId:signed.attestorKeyId,ociLayoutManifestBytesVerified:true,
  configAndCompressedLayerDigestVerified:true,
  signedClaimBoundToLocalImage:true,verifiedLayerCount:layerIds.length,
  totalVerifiedBlobBytes:total,
  // Offline layout file hashes do not certify registry ownership or live
  // process image identity; neither creates execution permission.
  registryDigestVerified:false,runtimeImageAttested:false,
  imageRunningOnAuthenticatedWorker:false,
  runtimeTransportAuthenticated:false,
  immutableMountVerified:false,singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
