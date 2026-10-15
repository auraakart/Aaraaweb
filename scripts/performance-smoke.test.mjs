import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario, runBenchmark } from './performance-smoke.mjs';

const scenario={name:'fixture',path:'/',requests:4,concurrency:2,warmup:1,p95Ms:1000,minRps:0,headers:{}};
async function server(t,handler){
  const instance=createServer(handler);
  await new Promise(resolve=>instance.listen(0,'127.0.0.1',resolve));
  t.after(()=>{instance.closeAllConnections();return new Promise(resolve=>instance.close(resolve));});
  return `http://127.0.0.1:${instance.address().port}`;
}

test('healthy requests retain sample counts and thresholds',async t=>{
  const baseUrl=await server(t,(_req,res)=>res.end('{}'));
  const {summary,problems}=await runScenario(scenario,{baseUrl});
  assert.equal(summary.phase,'measured');
  assert.equal(summary.requests,4);
  assert.equal(summary.successes,4);
  assert.equal(summary.failures,0);
  assert.equal(summary.errorRate,0);
  assert.deepEqual(problems,[]);
});

for(const phase of ['headers','body'])test(`warmup deadline covers stalled ${phase} and persists failure while later scenarios run`,async t=>{
  const baseUrl=await server(t,(req,res)=>{
    if(req.url==='/healthy'){res.end('{}');return;}
    if(phase==='body'){res.writeHead(200,{'content-type':'application/json'});res.flushHeaders();res.write('{');}
  });
  const directory=await mkdtemp(join(tmpdir(),'aaraagate-perf-test-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const outputPath=join(directory,'evidence.json');
  const started=Date.now();
  const evidence=await runBenchmark({baseUrl,outputPath,requestTimeoutMs:150,
    benchmarkScenarios:[scenario,{...scenario,name:'later',path:'/healthy'}]});
  assert.ok(Date.now()-started<3000,'stalled response must terminate');
  assert.equal(evidence.passed,false);
  assert.equal(evidence.scenarios[0].phase,'warmup');
  assert.equal(evidence.scenarios[0].warmupFailures,1);
  assert.equal(evidence.scenarios[0].requests,0);
  assert.equal(evidence.scenarios[1].successes,4);
  assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),evidence);
});

test('measured stalls count as failures and do not block the worker pool',async t=>{
  let count=0;
  const baseUrl=await server(t,(_req,res)=>{if(++count===1)res.end('{}');});
  const {summary,problems}=await runScenario(scenario,{baseUrl,requestTimeoutMs:100});
  assert.equal(summary.requests,4);
  assert.equal(summary.failures,4);
  assert.equal(summary.successes,0);
  assert.equal(summary.errorRate,1);
  assert.ok(problems.includes('4 request(s) failed'));
});

test('HTTP denial during warmup records failure without starting measured traffic',async t=>{
  let count=0;
  const baseUrl=await server(t,(_req,res)=>{count++;res.writeHead(401);res.end();});
  const {summary,problems}=await runScenario(scenario,{baseUrl});
  assert.equal(count,1);
  assert.equal(summary.status,401);
  assert.equal(summary.phase,'warmup');
  assert.equal(summary.requests,0);
  assert.equal(problems.length,1);
});
