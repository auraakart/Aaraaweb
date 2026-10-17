import {createHash,X509Certificate} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {checkServerIdentity} from 'node:tls';
import {verifyPinnedTestOciImageLayout} from './android-test-oci-layout.mjs';

const SHA=/^[0-9a-f]{64}$/;
const IMAGE=/^sha256:[0-9a-f]{64}$/;
const MEDIA='application/vnd.oci.image.manifest.v1+json';
const MAX_MANIFEST=256*1024;
const fail=message=>{throw new Error(message);};
const exact=(value,fields)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype&&
 Object.keys(value).sort().join(',')===fields.slice().sort().join(',');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const spki=raw=>sha(new X509Certificate(raw).publicKey.export({type:'spki',format:'der'}));

/**
 * Read-only TEST OCI registry GET, pinned to an operator-owned CA, TLS name,
 * SPKI and the separately signed image digest. First re-checks actual local
 * OCI bytes with the V5.5.37 verifier. This is NOT a runtime-image or remote
 * worker attestation and NEVER grants dispatch/build/release authority.
 */
export async function verifyPinnedTestOciRegistryManifest(root,envelope,imagePolicy,registryPolicy,
 {now=Date.now(),architecture='amd64'}={}){
 const local=await verifyPinnedTestOciImageLayout(root,envelope,imagePolicy,{now,architecture});
 if(!exact(registryPolicy,['endpoint','serverName','caPem','serverSpkiSha256','imageDigest'])||
    !IMAGE.test(registryPolicy.imageDigest)||
    registryPolicy.imageDigest!==local.imageDigest||
    !SHA.test(registryPolicy.serverSpkiSha256)||
    typeof registryPolicy.serverName!=='string'||
    !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(registryPolicy.serverName)||
    registryPolicy.serverName.endsWith('.')||
    typeof registryPolicy.caPem!=='string'||
    registryPolicy.caPem.length<100||registryPolicy.caPem.length>20000||
    !registryPolicy.caPem.startsWith('-----BEGIN CERTIFICATE-----'))
  fail('Missing independently pinned TEST OCI registry policy');
 let url;
 try{url=new URL(registryPolicy.endpoint);}catch{fail('Invalid pinned OCI registry endpoint');}
 const path=/^\/v2\/([a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*){0,8})\/manifests\/(sha256:[0-9a-f]{64})$/;
 const match=path.exec(url.pathname);
 if(registryPolicy.endpoint!==url.href||url.protocol!=='https:'||
    url.username||url.password||url.search||url.hash||
    url.hostname.length>253||!match||match[2]!==local.imageDigest)
  fail('OCI registry URL must be canonical, digest-addressed, fixed-path HTTPS');

 const responseBytes=await new Promise((resolve,reject)=>{
  let peerVerified=false,completed=false;
  const req=httpsRequest(url,{
   method:'GET',agent:false,servername:registryPolicy.serverName,
   ca:registryPolicy.caPem,rejectUnauthorized:true,
   minVersion:'TLSv1.3',maxVersion:'TLSv1.3',timeout:7000,
   signal:AbortSignal.timeout(8500),
   headers:{Accept:MEDIA,'Cache-Control':'no-store','Accept-Encoding':'identity'},
   checkServerIdentity:(_host,cert)=>{
    const error=checkServerIdentity(registryPolicy.serverName,cert);
    if(error)return error;
    try{
     if(!cert.raw||spki(cert.raw)!==registryPolicy.serverSpkiSha256)
      return new Error('OCI registry server SPKI pin mismatch');
    }catch{return new Error('Untrusted OCI registry certificate');}
   }
  },res=>{
   if(!peerVerified||res.statusCode!==200||
      res.headers['content-type']!==MEDIA||
      res.headers['docker-content-digest']!==local.imageDigest||
      res.headers['content-encoding']||res.headers.location||
      (res.headers['content-length']!==undefined&&
        (!/^(?:0|[1-9][0-9]*)$/.test(res.headers['content-length'])||
         Number(res.headers['content-length'])>MAX_MANIFEST)))
    {req.destroy(new Error('Untrusted OCI registry manifest response'));return;}
   const chunks=[];let length=0;
   res.on('data',chunk=>{
    length+=chunk.length;
    if(length>MAX_MANIFEST){req.destroy(new Error('Oversized OCI registry manifest'));return;}
    chunks.push(chunk);
   });
   res.on('end',()=>{
    if(completed)return;
    completed=true;
    if(res.headers['content-length']!==undefined&&
       Number(res.headers['content-length'])!==length)
     {reject(new Error('Truncated OCI registry manifest'));return;}
    resolve(Buffer.concat(chunks));
   });
   res.on('error',reject);
  });
  req.on('socket',socket=>socket.on('secureConnect',()=>{
   try{
    if(!socket.authorized||socket.getProtocol()!=='TLSv1.3'||
       !socket.getPeerCertificate(true).raw||
       spki(socket.getPeerCertificate(true).raw)!==registryPolicy.serverSpkiSha256)
     throw new Error('OCI registry peer TLS identity mismatch');
    peerVerified=true;
   }catch(e){req.destroy(e);}
  }));
  req.on('timeout',()=>req.destroy(new Error('OCI registry probe timeout')));
  req.on('error',reject);
  req.end();
 });
 if(sha(responseBytes)!==local.imageDigest.slice(7))
  fail('Remote OCI registry manifest bytes differ from pinned signed image digest');
 return Object.freeze({
  schemaVersion:1,environment:'TEST',testOnly:true,
  workerId:local.workerId,runId:local.runId,sourceSha:local.sourceSha,
  imageDigest:local.imageDigest,attestorKeyId:local.attestorKeyId,
  ociLayoutManifestBytesVerified:local.ociLayoutManifestBytesVerified,
  configAndCompressedLayerDigestVerified:local.configAndCompressedLayerDigestVerified,
  registryTlsPeerPinned:true,registryManifestBytesMatchedSignedDigest:true,
  registryManifestContentAddressed:true,registryManifestBytes:responseBytes.length,
  // This verifies a registry HTTPS response, not independently provisioned
  // trust roots, registry deployment, remote layers, or a running worker.
  externalRegistryAttested:false,registryDigestVerified:false,
  remoteLayersVerified:false,runtimeImageAttested:false,
  imageRunningOnAuthenticatedWorker:false,runtimeTransportAuthenticated:false,
  immutableMountVerified:false,singleUseChallengeConsumed:false,
  buildExecutionAuthorized:false,artifactProduced:false,dispatchAllowed:false
 });
}
