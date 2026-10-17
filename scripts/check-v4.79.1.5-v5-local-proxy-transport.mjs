import assert from 'node:assert/strict';
import {createServer,request as httpRequest} from 'node:http';

// This is a localhost-only HTTP transport acceptance harness. It does not
// configure a live ingress or bypass the runtime's direct-Host policy.
// Incoming Host selects only an allowlisted presentation, never an upstream,
// user, partner membership, or authorization principal.
const allowed=Object.freeze(['admin.aaraagate.in','white.partner.in','blue.partner.in']);
const maxBytes=32*1024;
const canonical=host=>typeof host==='string'&&host.length<=253&&
 host===host.toLowerCase()&&host.split('.').length>1&&
 host.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s));

export function makeTestIngress(upstreamPort){
 assert.ok(Number.isInteger(upstreamPort)&&upstreamPort>0&&upstreamPort<65536);
 return createServer(async(req,res)=>{
  const reject=(status,reason)=>{
   res.writeHead(status,{'content-type':'text/plain','cache-control':'no-store',
    'x-content-type-options':'nosniff'});
   res.end(reason);
  };
  try{
   const host=req.headers.host;
   if(!canonical(host)||!allowed.includes(host))return reject(421,'Unknown raw Host');
   if(['forwarded','x-forwarded-host','x-forwarded-proto','x-forwarded-for',
    'x-real-ip','x-original-host','x-original-url'].some(k=>req.headers[k]!==undefined))
    return reject(400,'Untrusted client forwarding header');
   const method=req.method;
   if(!['GET','HEAD','POST'].includes(method))return reject(405,'Method not allowed in TEST');
   const origin=req.headers.origin;
   if(origin!==undefined&&(typeof origin!=='string'||origin!=='https://'+host)||
       method==='POST'&&origin!=='https://'+host)
    return reject(403,'Origin mismatch');
   const site=req.headers['sec-fetch-site'];
   if(site!==undefined&&!['same-origin','none'].includes(site))return reject(403,'Cross-site');
   const declared=req.headers['content-length'];
   if(declared!==undefined&&(!/^[0-9]+$/.test(declared)||Number(declared)>maxBytes))
    return reject(413,'Oversized content');
   const chunks=[];let bytes=0;
   for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>maxBytes)return reject(413,'Oversized stream');
    chunks.push(chunk);
   }
   const body=Buffer.concat(chunks);
   // Always a fixed loopback target. Never use incoming Host or client URL
   // to determine the upstream address. All client proxy identity headers
   // were rejected above and cannot reach the backend.
   const reply=await new Promise((resolve,rejectUp)=>{
    const upstream=httpRequest({
     hostname:'127.0.0.1',port:upstreamPort,path:req.url,method,
     timeout:4000,headers:{
      host,'x-forwarded-host':host,
      ...(origin?{origin}:{}),
      ...(site?{'sec-fetch-site':site}:{}),
      ...(req.headers.cookie?{cookie:req.headers.cookie}:{}),
      ...(req.headers.accept?{accept:req.headers.accept}:{}),
      ...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{}),
      'content-length':String(body.length)
     }
    },response=>{
     const data=[];let size=0;
     response.on('data',chunk=>{
      size+=chunk.length;
      if(size>maxBytes){response.destroy(new Error('Oversized upstream response'));return;}
      data.push(chunk);
     });
     response.on('error',rejectUp);
     response.on('end',()=>resolve({
      code:response.statusCode??502,
      data:Buffer.concat(data),
      cookie:response.headers['set-cookie'],
      type:response.headers['content-type'],
      location:response.headers.location
     }));
    });
    upstream.on('error',rejectUp);
    upstream.on('timeout',()=>upstream.destroy(new Error('TEST upstream timed out')));
    upstream.end(body);
   });
   const headers={'cache-control':'no-store, private','vary':'Host, Origin, Cookie',
    'x-content-type-options':'nosniff','referrer-policy':'no-referrer'};
   if(reply.cookie)headers['set-cookie']=reply.cookie;
   if(reply.type)headers['content-type']=reply.type;
   // Only same-origin HTTPS or relative redirects may propagate.
   if(reply.location){
    if(!reply.location.startsWith('/')&&
       !reply.location.startsWith('https://'+host+'/'))return reject(502,'Unsafe redirect');
    headers.location=reply.location;
   }
   res.writeHead(reply.code,headers);
   res.end(method==='HEAD'?undefined:reply.data);
  }catch{
   if(!res.headersSent)reject(502,'Fixed TEST upstream unavailable');
   else res.destroy();
  }
 });
}
async function openLoopback(server){
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});
 });
 return server.address().port;
}
async function close(server){
 if(!server.listening)return;
 server.closeAllConnections();
 await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
function send(port,path,host,options={}){
 return new Promise((resolve,reject)=>{
  const headers={...(host?{Host:host}:{}),...(options.headers??{})};
  const req=httpRequest({hostname:'127.0.0.1',port,method:options.method??'GET',
   path,headers,timeout:3000},res=>{
    let body='';
    res.setEncoding('utf8');
    res.on('data',chunk=>body+=chunk);
    res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));
   });
  req.on('timeout',()=>req.destroy(new Error('Request timed out')));
  req.on('error',reject);
  req.end(options.body??undefined);
 });
}
async function verifyLocalHostIngress(){
 const observed=[];
 const upstream=createServer((req,res)=>{
  observed.push({host:req.headers.host,xfh:req.headers['x-forwarded-host'],
   forwarded:req.headers.forwarded,xff:req.headers['x-forwarded-for'],
   xproto:req.headers['x-forwarded-proto'],origin:req.headers.origin,
   cookie:req.headers.cookie,method:req.method});
  const host=req.headers.host;
  if(req.headers['x-forwarded-host']!==host||req.headers.forwarded!==undefined||
     req.headers['x-forwarded-for']!==undefined||
     req.headers['x-forwarded-proto']!==undefined)
   {res.writeHead(400);res.end('Untrusted forwarding');return;}
  if(req.method==='POST'&&req.headers.origin!=='https://'+host)
   {res.writeHead(403);res.end('Bad origin');return;}
  if(host==='white.partner.in'&&req.headers.cookie==='session=white')res.end('white-context');
  else if(host==='blue.partner.in'&&req.headers.cookie==='session=white')res.end('no-blue-session');
  else if(host==='white.partner.in'&&req.url==='/redirect'){
   res.writeHead(307,{location:'https://blue.partner.in/partner-host'});res.end();
  }else res.end('ok:'+host);
 });
 let ingress;try{
  const upstreamPort=await openLoopback(upstream);
  ingress=makeTestIngress(upstreamPort);
  const port=await openLoopback(ingress);
  const white=await send(port,'/partner-host','white.partner.in',{headers:{Cookie:'session=white',Origin:'https://white.partner.in'}});
  assert.equal(white.status,200);assert.equal(white.body,'white-context');
  assert.equal(white.headers['cache-control'],'no-store, private');
  assert.match(white.headers.vary,/Host/);
  const blue=await send(port,'/partner-host','blue.partner.in',{headers:{Cookie:'session=white',Origin:'https://blue.partner.in'}});
  assert.equal(blue.status,200);assert.equal(blue.body,'no-blue-session');
  assert.equal((await send(port,'/partner-host','admin.aaraagate.in')).body,'ok:admin.aaraagate.in');
  const initial=observed.length;
  for(const [label,host,options,status] of [
   ['different host','evil.partner.in',{},421],
   ['host injection','white.partner.in:443',{},421],
   ['comma host','white.partner.in,evil.in',{},421],
   ['spoofed Forwarded','white.partner.in',{headers:{Forwarded:'host=evil.in'}},400],
   ['spoofed XFH','white.partner.in',{headers:{'X-Forwarded-Host':'evil.in'}},400],
   ['spoofed XFP','white.partner.in',{headers:{'X-Forwarded-Proto':'https'}},400],
   ['spoofed XFF','white.partner.in',{headers:{'X-Forwarded-For':'10.0.0.1'}},400],
   ['wrong Origin','white.partner.in',{headers:{Origin:'https://blue.partner.in'}},403],
   ['cross-site','white.partner.in',{headers:{'Sec-Fetch-Site':'cross-site'}},403],
   ['missing mutation Origin','white.partner.in',{method:'POST',body:'x'},403],
   ['unsafe method','white.partner.in',{method:'PUT'},405],
   ['oversized body','white.partner.in',{method:'POST',headers:{Origin:'https://white.partner.in'},body:'x'.repeat(maxBytes+1)},413]
  ]){
   const result=await send(port,'/partner-host',host,options);
   assert.equal(result.status,status,label);
  }
  assert.equal(observed.length,initial,'Rejected requests must not reach upstream');
  const accepted=await send(port,'/partner-host','white.partner.in',{
   method:'POST',headers:{Origin:'https://white.partner.in','Sec-Fetch-Site':'same-origin'},
   body:'{"intent":"TEST"}'
  });
  assert.equal(accepted.status,200);
  const sent=observed.at(-1);
  assert.equal(sent.host,'white.partner.in');
  assert.equal(sent.xfh,sent.host);
  assert.equal(sent.origin,'https://white.partner.in');
  assert.equal(sent.xff,undefined);
  assert.equal(sent.forwarded,undefined);
  const redirect=await send(port,'/redirect','white.partner.in');
  assert.equal(redirect.status,502,'Cross-partner redirects must not propagate');
  assert.equal(observed.at(-1).host,'white.partner.in');
  return Object.freeze({allowedHosts:allowed.length,negativeIngressCases:12,
   fixedUpstream:true,realLoopbackHttpTransport:true,actualPublicTlsVerified:false,
   trustedDeploymentVerified:false,partnerRoutingActivated:false,releaseAuthorized:false});
 }finally{
  if(ingress)await close(ingress);
  await close(upstream);
 }
}
const result=await verifyLocalHostIngress();
console.log('V5.4.21 local TEST reverse-proxy boundary acceptance PASS '+JSON.stringify(result));
