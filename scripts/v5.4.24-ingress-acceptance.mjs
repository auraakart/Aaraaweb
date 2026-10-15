import assert from 'node:assert/strict';
import {createHash, X509Certificate} from 'node:crypto';
import {request as httpsRequest} from 'node:https';
import {isIP} from 'node:net';

// No credentials, arbitrary URLs, custom client CA or production routing.
const HASH=/^[a-f0-9]{64}$/;
const LABEL=/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const validHost=value=>typeof value==='string'&&value.length<=253&&
 value===value.toLowerCase()&&value.split('.').length>=3&&
 value.split('.').every(label=>LABEL.test(label))&&!isIP(value)&&
 !value.includes('localhost')&&!/\.(local|internal|test|invalid|example)$/.test(value);
export function validateTestIngressPlan(plan){
 assert.ok(plan&&typeof plan==='object'&&!Array.isArray(plan),'Plan object required');
 const fields=['schemaVersion','testOnly','environment','hostname','approvedHost','approvedSpkiSha256','probeOnly'];
 assert.deepEqual(Object.keys(plan).sort(),fields.sort(),'Unknown or missing plan field');
 assert.equal(plan.schemaVersion,1,'Unknown acceptance plan');
 assert.equal(plan.testOnly,true,'Production probe forbidden');
 assert.equal(plan.environment,'ISOLATED_NONPRODUCTION','Nonproduction only');
 assert.equal(plan.probeOnly,true,'Read-only probe required');
 assert.ok(validHost(plan.hostname),'Invalid DNS name');
 assert.equal(plan.approvedHost,plan.hostname,'Operator-approved hostname required');
 assert.ok(plan.hostname.split('.').some(label=>['qa','sandbox','dev','staging','nonprod'].includes(label)),
  'Dedicated nonproduction DNS namespace required');
 assert.ok(typeof plan.approvedSpkiSha256==='string'&&HASH.test(plan.approvedSpkiSha256),'Approved SPKI SHA256 pin required');
 return Object.freeze({...plan});
}
function leafSpkiSha256(peer){
 if(!peer?.raw||!Buffer.isBuffer(peer.raw))throw Error('TLS certificate missing');
 const der=new X509Certificate(peer.raw).publicKey.export({type:'spki',format:'der'});
 return createHash('sha256').update(der).digest('hex');
}
// Injectable loopback fixture is only for deterministic tests, never CLI input.
export async function probeTestIngress(input,{testTransport}={}){
 const plan=validateTestIngressPlan(input);
 if(testTransport!==undefined){
  assert.equal(testTransport?.localFixtureOnly,true,'Non-fixture transport override forbidden');
  assert.equal(testTransport?.connectHost,'127.0.0.1','Only test loopback allowed');
  assert.ok(Number.isInteger(testTransport?.port)&&testTransport.port>0&&testTransport.port<65536);
  assert.ok(Buffer.isBuffer(testTransport?.ca)&&testTransport.ca.length>0);
 }
 const cases=[
  {label:'unauthenticated',headers:{},statuses:[200,302,307,401,403]},
  {label:'spoofed-forwarded-host',headers:{'x-forwarded-host':'wrong.qa.partner.in'},statuses:[400,403,404,421]},
  {label:'cross-host-origin',headers:{origin:'https://wrong.qa.partner.in'},statuses:[400,403,404,421]}
 ];
 const results=[];
 for(const check of cases){
  const answer=await new Promise((resolve,reject)=>{
   let settled=false;
   const fail=e=>{if(!settled){settled=true;reject(e);}};
   const req=httpsRequest({
    hostname:testTransport?.connectHost??plan.hostname,port:testTransport?.port??443,
    servername:plan.hostname,method:'GET',path:'/partner-host',agent:false,
    minVersion:'TLSv1.3',maxVersion:'TLSv1.3',rejectUnauthorized:true,timeout:7500,
    headers:{host:plan.hostname,accept:'text/html',...check.headers},
    ...(testTransport?{ca:testTransport.ca}:{})
   },res=>{
    try{
     const socket=res.socket;
     if(!socket.authorized||socket.getProtocol()!=='TLSv1.3')throw Error('Untrusted ingress or unsupported TLS');
     if(leafSpkiSha256(socket.getPeerCertificate(true))!==plan.approvedSpkiSha256)
      throw Error('Server SPKI fingerprint differs from reviewed pin');
     if(!check.statuses.includes(res.statusCode))throw Error('Unexpected '+check.label+' status '+res.statusCode);
     if(!/\bno-store\b/i.test(String(res.headers['cache-control']??'')))throw Error('Missing no-store');
     if(!/\bhost\b/i.test(String(res.headers.vary??'')))throw Error('Missing Host Vary');
     if(String(res.headers['x-content-type-options']??'').toLowerCase()!=='nosniff')throw Error('Missing nosniff');
     const location=res.headers.location;
     if(location!==undefined&&(
       typeof location!=='string'||
       (!(location.startsWith('/')&&!location.startsWith('//'))&&
        !location.startsWith('https://'+plan.hostname+'/'))
     ))throw Error('Unsafe cross-origin redirect');
     // Never save response bodies or Set-Cookie; bound bytes and discard data.
     let bytes=0;
     res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576)res.destroy(Error('Response too large'));});
     res.on('error',fail);
     res.on('end',()=>{if(!settled){settled=true;resolve({case:check.label,status:res.statusCode,verifiedTLS:true,bytesRead:bytes});}});
    }catch(e){res.destroy();fail(e);}
   });
   req.on('timeout',()=>req.destroy(Error('Timed-out TLS probe')));
   req.on('error',fail);
   req.end();
  });
  results.push(answer);
 }
 return Object.freeze({schemaVersion:1,environment:'ISOLATED_NONPRODUCTION',testOnly:true,
  hostname:plan.hostname,probePassed:true,results,
  externalOperatorAttested:false,remoteDeploymentOwnershipVerified:false,
  actualPartnerSessionAuthenticated:false,distributionAuthorized:false,
  productionRoutingAuthorized:false,stagingPromotionAuthorized:false,mainPromotionAuthorized:false});
}
