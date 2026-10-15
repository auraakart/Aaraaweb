// Actual Next middleware, host-bound cookies and SSR accessed through a TEST-only TLS 1.3 loopback ingress.
// The API is a fixed local deterministic double; this is not deployed trusted-proxy acceptance.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createServer as httpsServer, request as httpsRequest } from 'node:https'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request as httpRequest } from 'node:http'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { sealHostCookie } from '../lib/partner-host-cookie.ts'

const host = 'portal.partner.in', key = randomBytes(32).toString('hex'), id = '11111111-1111-4111-8111-111111111111'
const session = { sessionId: '22222222-2222-4222-8222-222222222222', accessToken: randomBytes(32).toString('hex'), refreshToken: randomBytes(48).toString('hex'),
  expiresAt: new Date(Date.now() + 600000).toISOString(), refreshExpiresAt: new Date(Date.now() + 1200000).toISOString() }
let revoked = false, calls = 0
const api = createServer(async (request, response) => {
  calls++
  assert.equal(request.headers.host, host)
  assert.equal(request.headers.origin, `https://${host}`)
  assert.equal(request.headers['x-forwarded-host'], undefined)
  response.setHeader('Content-Type', 'application/json')
  if (revoked) { response.statusCode = 401; response.end('{}'); return }
  if (request.url === '/api/v1/auth/partner/host/session') {
    assert.equal(request.headers.authorization, `Bearer ${session.accessToken}`)
    response.end(JSON.stringify({ contextType: 'PARTNER_HOST', hostname: host, partnerId: id }))
  } else if (request.url === `/api/v1/partners/${id}/portfolio`) {
    response.end(JSON.stringify({ partner: { id, displayName: 'Partner One' }, societies: [{ id, name: 'Society One', status: 'ACTIVE' }], hasMore: false }))
  } else if (request.url === '/api/v1/auth/partner/host/otp/verify') {
    response.end(JSON.stringify({ verified: true, contextType: 'PARTNER', hostContext: { hostname: host, partnerId: id }, session }))
  } else if (request.url === '/api/v1/auth/refresh') {
    response.end(JSON.stringify(session))
  } else if (request.url === '/api/v1/auth/logout') {
    response.end('{"success":true}')
  } else { response.statusCode = 404; response.end('{}') }
})
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve))
const portProbe = createServer()
await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve))
const port = portProbe.address().port
await new Promise(resolve => portProbe.close(resolve))
const admin = fileURLToPath(new URL('../', import.meta.url))
const child = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/next/dist/bin/next', import.meta.url)), 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: admin, env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    AARAGATE_ENABLE_TEST_HOST_WEB: 'true', AARAGATE_PLATFORM_HOSTNAMES: '["admin.aaraagate.in"]', AARAGATE_HOST_WEB_COOKIE_KEY: key,
    AARAGATE_HOST_WEB_API_BASE_URL: `http://127.0.0.1:${api.address().port}` }, stdio: ['ignore', 'pipe', 'pipe'],
})
let logs = ''
child.stdout.on('data', chunk => { logs += chunk }); child.stderr.on('data', chunk => { logs += chunk })
// Ephemeral private CA used only by this TLS test client. Never committed.
const tlsDir=mkdtempSync(join(tmpdir(),'aaraagate-v5423-'));
const privateKey=join(tlsDir,'test.key'),certificate=join(tlsDir,'test.crt');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-sha256','-nodes',
  '-days','1','-keyout',privateKey,'-out',certificate,'-subj','/CN=portal.partner.in',
  '-addext','subjectAltName=DNS:portal.partner.in,DNS:other.partner.in,DNS:admin.aaraagate.in'],
  {timeout:10000,stdio:'ignore'});
const ca=readFileSync(certificate);
let forwardedToNext=0;
const ingress=httpsServer({
  key:readFileSync(privateKey),cert:ca,minVersion:'TLSv1.3',maxVersion:'TLSv1.3'
},(incoming,outgoing)=>{
  const reject=(status,message)=>{
    outgoing.writeHead(status,{'cache-control':'no-store, private','content-type':'text/plain'});
    outgoing.end(message);
  };
  const incomingHost=incoming.headers.host,method=incoming.method;
  if(!['portal.partner.in','other.partner.in','admin.aaraagate.in'].includes(incomingHost)||
     incoming.socket.servername!==incomingHost||
     incoming.socket.getProtocol()!=='TLSv1.3')return reject(421,'Invalid Host/SNI');
  if(['forwarded','x-forwarded-host','x-forwarded-for','x-forwarded-proto','x-real-ip','x-original-host'].some(name=>incoming.headers[name]!==undefined))
    return reject(400,'Forged proxy header');
  if(!['GET','HEAD','POST'].includes(method))return reject(405,'Unsupported method');
  if(incoming.headers.origin!==undefined&&incoming.headers.origin!=='https://'+incomingHost||
     method==='POST'&&incoming.headers.origin!=='https://'+incomingHost)
    return reject(403,'Incorrect origin');
  if(incoming.headers['sec-fetch-site']&&
     !['same-origin','none'].includes(incoming.headers['sec-fetch-site']))
    return reject(403,'Cross-site request');
  const declaredLength=incoming.headers['content-length'];
  if(declaredLength!==undefined&&(!/^\d+$/.test(declaredLength)||Number(declaredLength)>16384))
    return reject(413,'Oversized body');
  const parts=[];let bytes=0;
  incoming.on('data',chunk=>{
    bytes+=chunk.length;
    if(bytes>16384){incoming.destroy(new Error('Oversized TEST payload'));return;}
    parts.push(chunk);
  });
  incoming.on('end',()=>{
    const payload=Buffer.concat(parts);forwardedToNext++;
    // Fixed loopback target, never the browser Host.
    const next=httpRequest({
      hostname:'127.0.0.1',port,method,path:incoming.url,timeout:60000,
      headers:{
        Host:incomingHost,'X-Forwarded-Host':incomingHost,
        ...(incoming.headers.origin?{Origin:incoming.headers.origin}:{}),
        ...(incoming.headers['sec-fetch-site']?{'Sec-Fetch-Site':incoming.headers['sec-fetch-site']}:{}),
        ...(incoming.headers.cookie?{Cookie:incoming.headers.cookie}:{}),
        ...(incoming.headers['content-type']?{'Content-Type':incoming.headers['content-type']}:{}),
        'Content-Length':String(payload.length)
      }
    },reply=>{
      const location=reply.headers.location;
      if(location&&(location.startsWith('//')||
         location.startsWith('http:')||
         location.startsWith('https:')&&!location.startsWith('https://'+incomingHost+'/'))){
        reply.resume();return reject(502,'Cross-host redirect');
      }
      const safe={
        'cache-control':'no-store, private','vary':'Host, Origin, Cookie',
        'x-content-type-options':'nosniff','referrer-policy':'no-referrer'
      };
      for(const name of ['content-type','content-encoding','set-cookie','location']){
        if(reply.headers[name])safe[name]=reply.headers[name];
      }
      outgoing.writeHead(reply.statusCode??502,safe);
      reply.pipe(outgoing);
    });
    next.on('error',error=>{if(!outgoing.headersSent)reject(502,'Next unavailable');else outgoing.destroy(error);});
    next.on('timeout',()=>next.destroy(new Error('Next timeout')));
    next.end(payload);
  });
  incoming.on('error',()=>{if(!outgoing.headersSent)reject(413,'Invalid client body');else outgoing.destroy();});
});
await new Promise((resolve,reject)=>{
  ingress.once('error',reject);
  ingress.listen(0,'127.0.0.1',()=>{ingress.off('error',reject);resolve();});
});
const ingressPort=ingress.address().port;
const request = (path, headers = {}, body, {sni,trust=true,maxVersion}={}) => new Promise((resolve, reject) => {
  const targetHost=headers.host??host;
  const req=httpsRequest({
    hostname:'127.0.0.1',port:ingressPort,servername:sni??targetHost,
    method:body?'POST':'GET',path,agent:false,
    minVersion:'TLSv1.2',maxVersion:maxVersion??'TLSv1.3',
    ca:trust?ca:undefined,rejectUnauthorized:true,
    headers:{Host:targetHost,...headers},signal:AbortSignal.timeout(60000)
  },res=>{
    const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('error',reject);
    res.on('end',()=>resolve(new Response(Buffer.concat(chunks),{
      status:res.statusCode,headers:res.headers
    })));
  });
  req.on('error',reject);
  req.end(body?JSON.stringify(body):undefined);
});

try {
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error('Next startup timeout')), 30000)
    child.once('exit', code => { clearTimeout(deadline); reject(new Error(`Next exited ${code}`)) })
    child.stdout.on('data', chunk => { if (String(chunk).includes('Ready in')) { clearTimeout(deadline); resolve() } })
  })
  const cookie = sealHostCookie({ ...session, hostname: host, partnerId: id }, key)
  const landing = await request('/')
  assert.equal(landing.status, 307); assert.equal(landing.headers.get('location'), `https://${host}/partner-host`)
  const authenticated = await request('/partner-host', { cookie: `__Host-aaraagate-partner=${cookie}` })
  assert.equal(authenticated.status, 200, 'Authenticated raw Host SSR must succeed')
  const html = await authenticated.text()
  assert.match(html, /Society One/); assert.match(html, /Partner One/)
  assert.equal(html.includes(session.accessToken), false); assert.equal(html.includes(session.refreshToken), false)
  assert.match(authenticated.headers.get('cache-control'), /no-store/)
  for (const path of ['/partners', '/finance', '/_next/data/fake/finance.json']) assert.equal((await request(path)).status, 404)
  const before = calls, beforeProxy = forwardedToNext
  for (const headers of [{ 'x-forwarded-host': 'other.partner.in' }, { forwarded: `host=${host}` }, { origin: 'https://other.partner.in' }]) assert.equal((await request('/', headers)).status, 404)
  assert.equal(calls, before, 'Spoofed headers must fail before upstream I/O')
  assert.equal(forwardedToNext, beforeProxy, 'Spoofed requests must not reach real Next')
  // The TLS proxy must reject a different SNI, an untrusted CA and TLS 1.2.
  const mismatch = await request('/',{},undefined,{sni:'other.partner.in'})
  assert.equal(mismatch.status,421)
  await assert.rejects(request('/',{},undefined,{trust:false}),/self.signed|certificate|verify/i)
  await assert.rejects(request('/',{},undefined,{maxVersion:'TLSv1.2'}),/protocol|tls|alert|version/i)
  const foreign = await request('/partner-host', { host: 'other.partner.in', cookie: `__Host-aaraagate-partner=${cookie}` })
  assert.equal((await foreign.text()).includes('Society One'), false); assert.equal(calls, before)
  const platform = await request('/partner-host', { host: 'admin.aaraagate.in' }); assert.equal(platform.status, 404)
  const denied = await request('/partner-host/session', {}, { action: 'refresh' }); assert.equal(denied.status, 403)
  const verified = await request('/partner-host/session', { origin: `https://${host}`, 'content-type': 'application/json' }, { action: 'verify', challengeId: id, code: '123456' })
  assert.equal(verified.status, 200)
  const issued = verified.headers.get('set-cookie')
  for (const pattern of [/__Host-aaraagate-partner=/, /HttpOnly/i, /Secure/i, /SameSite=strict/i, /Path=\//]) assert.match(issued, pattern)
  assert.equal(/Domain=/i.test(issued), false); assert.deepEqual(await verified.json(), { success: true })
  const browserHeaders = { origin: `https://${host}`, 'content-type': 'application/json', cookie: `__Host-aaraagate-partner=${cookie}` }
  assert.equal((await request('/partner-host/session', browserHeaders, { action: 'refresh' })).status, 200)
  const logout = await request('/partner-host/session', browserHeaders, { action: 'logout' }); assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Max-Age=0/i)
  revoked = true
  const rejected = await request('/partner-host', { cookie: `__Host-aaraagate-partner=${cookie}` }); assert.equal((await rejected.text()).includes('Society One'), false)
  console.log('V5.4.23 actual Next SSR and host-bound cookie lifecycle behind local TLS 1.3 ingress: PASS')
} catch (error) { console.error(logs.slice(-5000)); throw error }
finally {
  child.kill('SIGTERM');
  ingress.closeAllConnections();
  await new Promise(resolve=>ingress.close(resolve));
  rmSync(tlsDir,{recursive:true,force:true});
  api.closeAllConnections();
  await new Promise(resolve=>api.close(resolve));
}
