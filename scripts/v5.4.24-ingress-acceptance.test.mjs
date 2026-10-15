import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,X509Certificate} from 'node:crypto';
import {createServer} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {probeTestIngress,validateTestIngressPlan} from './v5.4.24-ingress-acceptance.mjs';
const template={schemaVersion:1,testOnly:true,environment:'ISOLATED_NONPRODUCTION',
 hostname:'portal.qa.partner.in',approvedHost:'portal.qa.partner.in',
 approvedSpkiSha256:'a'.repeat(64),probeOnly:true};
test('refuse production, unapproved destinations, arbitrary URLs and credentials',()=>{
 for(const mutate of [
  p=>{p.hostname='127.0.0.1';p.approvedHost=p.hostname;},
  p=>{p.hostname='portal.partner.in';p.approvedHost=p.hostname;},
  p=>{p.hostname='portal.qa.partner.in:443';p.approvedHost=p.hostname;},
  p=>{p.hostname='qa.localhost';p.approvedHost=p.hostname;},
  p=>p.approvedHost='another.qa.partner.in',
  p=>p.approvedSpkiSha256='bogus',
  p=>p.environment='PRODUCTION',p=>p.testOnly=false,p=>p.probeOnly=false,
  p=>p.url='https://localhost',p=>p.accessToken='secret'
 ]){
  const plan={...template};mutate(plan);
  assert.throws(()=>validateTestIngressPlan(plan));
 }
});
test('real TLS13 socket pins SPKI and denies spoofed host/origin',async t=>{
 const temp=mkdtempSync(join(tmpdir(),'aaraagate-v5424-'));
 t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const key=join(temp,'key.pem'),cert=join(temp,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-sha256',
  '-days','1','-keyout',key,'-out',cert,'-subj','/CN=portal.qa.partner.in',
  '-addext','subjectAltName=DNS:portal.qa.partner.in'],{timeout:7000,stdio:'ignore'});
 const ca=readFileSync(cert);
 const hash=createHash('sha256').update(new X509Certificate(ca).publicKey.export({type:'spki',format:'der'})).digest('hex');
 const observed=[];
 const server=createServer({key:readFileSync(key),cert:ca,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(req,res)=>{
  observed.push({host:req.headers.host,method:req.method,path:req.url,headers:req.headers});
  res.setHeader('cache-control','no-store, private');
  res.setHeader('vary','Host, Origin, Cookie');
  res.setHeader('x-content-type-options','nosniff');
  if(req.headers['x-forwarded-host'])res.statusCode=400;
  else if(req.headers.origin)res.statusCode=403;
  res.end('test fixture');
 });
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',resolve).once('error',reject));
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
 const transport={localFixtureOnly:true,connectHost:'127.0.0.1',port:server.address().port,ca};
 const result=await probeTestIngress({...template,approvedSpkiSha256:hash},{testTransport:transport});
 assert.equal(result.probePassed,true);
 assert.deepEqual(result.results.map(x=>x.status),[200,400,403]);
 assert.equal(result.remoteDeploymentOwnershipVerified,false);
 assert.equal(result.productionRoutingAuthorized,false);
 assert.equal(result.actualPartnerSessionAuthenticated,false);
 assert.equal(observed.length,3);
 assert.ok(observed.every(x=>x.host===template.hostname&&x.path==='/partner-host'&&x.method==='GET'&&
  x.headers.authorization===undefined&&x.headers.cookie===undefined));
 await assert.rejects(probeTestIngress({...template,approvedSpkiSha256:'f'.repeat(64)},{testTransport:transport}),/pin/i);
 await assert.rejects(probeTestIngress({...template,approvedSpkiSha256:hash},{testTransport:{...transport,connectHost:'10.0.0.1'}}));
});
