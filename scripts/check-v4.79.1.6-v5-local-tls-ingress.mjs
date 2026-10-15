import assert from 'node:assert/strict';
import {createServer as httpServer,request as httpRequest} from 'node:http';
import {createServer as httpsServer,request as httpsRequest} from 'node:https';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const hosts=['admin.aaraagate.in','white.partner.in','blue.partner.in'];
const serve=s=>new Promise((ok,no)=>s.listen(0,'127.0.0.1',()=>ok(s.address().port)).once('error',no));
const close=async s=>{if(s?.listening){s.closeAllConnections();await new Promise(ok=>s.close(ok));}};
const send=(port,host,ca,options={})=>new Promise((ok,no)=>{
 const req=httpsRequest({hostname:'127.0.0.1',port,servername:options.sni??host,
   method:options.method??'GET',path:options.path??'/',agent:false,
   ca,rejectUnauthorized:true,maxVersion:options.maxVersion??'TLSv1.3',
   headers:{host,...options.headers},timeout:3000},res=>{
  let body='';res.setEncoding('utf8');res.on('data',x=>body+=x);
  res.on('end',()=>ok({status:res.statusCode,body,headers:res.headers}));
 });
 req.on('error',no);req.on('timeout',()=>req.destroy(new Error('timeout')));
 req.end(options.body);
});
async function check(){
 const temp=mkdtempSync(join(tmpdir(),'aaraagate-tls13-test-'));
 const key=join(temp,'key.pem'),crt=join(temp,'cert.pem');let backend,proxy;
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
   '-keyout',key,'-out',crt,'-subj','/CN=white.partner.in',
   '-addext','subjectAltName=DNS:white.partner.in,DNS:blue.partner.in,DNS:admin.aaraagate.in'],
   {stdio:'ignore',timeout:7000});
  const ca=readFileSync(crt),observed=[];
  backend=httpServer((req,res)=>{
   observed.push({host:req.headers.host,xfh:req.headers['x-forwarded-host'],
    forwarded:req.headers.forwarded,origin:req.headers.origin});
   if(req.url==='/redirect'){
    res.writeHead(307,{location:'https://blue.partner.in/private'});res.end();
   }else res.end('host='+req.headers.host);
  });
  const port=await serve(backend);
  proxy=httpsServer({key:readFileSync(key),cert:ca,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'},(req,res)=>{
   const deny=(status,msg)=>{res.writeHead(status,{'cache-control':'no-store'});res.end(msg);};
   const host=req.headers.host;
   if(!hosts.includes(host)||!host||req.socket.servername!==host)return deny(421,'Bad Host');
   if(req.socket.getProtocol()!=='TLSv1.3')return deny(400,'Bad TLS');
   if(['forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto','x-real-ip',
     'x-original-host','x-original-url'].some(x=>req.headers[x]!==undefined))return deny(400,'Spoofed proxy header');
   if(!['GET','HEAD','POST'].includes(req.method))return deny(405,'Disallowed method');
   if((req.method==='POST'||req.headers.origin)&&req.headers.origin!=='https://'+host)
    return deny(403,'Origin mismatch');
   if(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))
    return deny(403,'Cross-site');
   // Transport-header test only; body streaming/Next SSR not part of this fixture.
   if(req.method==='POST'&&req.headers['content-length']!=='0')return deny(413,'Body unsupported in TEST');
   const target=httpRequest({hostname:'127.0.0.1',port,path:req.url,method:req.method,
    headers:{host,'x-forwarded-host':host,origin:req.headers.origin??'https://'+host},timeout:3000},up=>{
     const location=up.headers.location;
     if(location&&location.startsWith('https://')&&!location.startsWith('https://'+host+'/')){
      up.resume();return deny(502,'Foreign redirect');
     }
     res.writeHead(up.statusCode??502,{'cache-control':'no-store, private',
      'vary':'Host, Origin, Cookie','x-content-type-options':'nosniff',
      ...(location?{location}:{})});up.pipe(res);
    });
   target.on('error',()=>deny(502,'Upstream unavailable'));
   target.on('timeout',()=>target.destroy());target.end();
  });
  const tlsPort=await serve(proxy);
  for(const host of hosts){
   const x=await send(tlsPort,host,ca);
   assert.equal(x.status,200);assert.equal(x.body,'host='+host);
   assert.match(x.headers.vary,/Host/);
  }
  const baseline=observed.length;
  for(const [host,options,status] of [
   ['evil.partner.in',{sni:'white.partner.in'},421],
   ['blue.partner.in',{sni:'white.partner.in'},421],
   ['white.partner.in',{headers:{Forwarded:'host=evil.in'}},400],
   ['white.partner.in',{headers:{'X-Forwarded-Host':'evil.in'}},400],
   ['white.partner.in',{headers:{'X-Forwarded-For':'1.2.3.4'}},400],
   ['white.partner.in',{method:'POST'},403],
   ['white.partner.in',{headers:{Origin:'https://blue.partner.in'}},403],
   ['white.partner.in',{headers:{'Sec-Fetch-Site':'cross-site'}},403],
   ['white.partner.in',{method:'PUT'},405]
  ])assert.equal((await send(tlsPort,host,ca,options)).status,status);
  assert.equal(observed.length,baseline,'Forbidden requests must not touch upstream');
  assert.equal((await send(tlsPort,'white.partner.in',ca,{path:'/redirect'})).status,502);
  const post=await send(tlsPort,'blue.partner.in',ca,{method:'POST',headers:{
   origin:'https://blue.partner.in','Content-Length':'0'}});
  assert.equal(post.status,200);
  assert.equal(observed.at(-1).host,'blue.partner.in');
  assert.equal(observed.at(-1).xfh,'blue.partner.in');
  assert.equal(observed.at(-1).forwarded,undefined);
  await assert.rejects(send(tlsPort,'white.partner.in',undefined),/self.signed|certificate|verify/i);
  await assert.rejects(send(tlsPort,'white.partner.in',ca,{sni:'foreign.partner.in'}),/altname|certificate/i);
  await assert.rejects(send(tlsPort,'white.partner.in',ca,{maxVersion:'TLSv1.2'}),/tls|version|protocol|alert/i);
  return {testOnly:true,tls13:true,hostSniBound:true,fixedLoopbackUpstream:true,
   deniedClientRequestCases:9,remoteIngressAttested:false,actualNextProxied:false,
   productionActivated:false,dispatchAllowed:false};
 }finally{await close(proxy);await close(backend);rmSync(temp,{recursive:true,force:true});}
}
console.log('V5.4.22 local TLS ingress acceptance PASS '+JSON.stringify(await check()));
