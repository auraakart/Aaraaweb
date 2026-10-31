import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runScenario, runBenchmark, scenarios } from './performance-smoke.mjs';

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

test('missing required query plans persist failure evidence after HTTP measurements',async t=>{
  const baseUrl=await server(t,(_req,res)=>res.end('{}'));
  const directory=await mkdtemp(join(tmpdir(),'aaraagate-perf-plans-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const outputPath=join(directory,'evidence.json');
  const evidence=await runBenchmark({baseUrl,outputPath,benchmarkScenarios:[scenario],queryPlanPath:join(directory,'missing.json')});
  assert.equal(evidence.passed,false);assert.equal(evidence.scenarios[0].successes,4);
  assert.match(evidence.failures[0],/query plans are missing or invalid/);
  assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),evidence);
});

test('valid query plans accompany endpoint evidence without changing measured samples',async t=>{
  const baseUrl=await server(t,(_req,res)=>res.end('{}'));
  const directory=await mkdtemp(join(tmpdir(),'aaraagate-perf-plans-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const queryPlanPath=join(directory,'plans.json');
  const plans={requestCount:5000,documentCount:2000,requestPlan:[{Plan:{}}],documentPlan:[{Plan:{}}]};
  await writeFile(queryPlanPath,JSON.stringify(plans));
  const evidence=await runBenchmark({baseUrl,outputPath:join(directory,'evidence.json'),benchmarkScenarios:[scenario],queryPlanPath});
  assert.equal(evidence.passed,true);assert.deepEqual(evidence.operationalQueryEvidence,plans);
});

test('operational benchmark retains separate role credentials and existing finance gates',()=>{
  const operations=scenarios.filter(row=>row.name.startsWith('occupancy-')||row.name.startsWith('document-'));
  assert.equal(operations.length,4);
  const finance=scenarios.filter(row=>row.name.endsWith('100k'));
  assert.equal(finance.length,2);
  assert.notEqual(operations[0].headers.Authorization,finance[0].headers.Authorization);
  for(const row of finance){assert.equal(row.p95Ms,2500);assert.equal(row.minRps,1.5);}
});

test('shared client quota is respected by cooling down outside measured traffic',async t=>{
  let clock=0,window=0,count=0;
  const baseUrl=await server(t,(_req,res)=>{
    const current=Math.floor(clock/1000);if(current!==window){window=current;count=0;}
    if(++count>4){res.writeHead(429);res.end();return;}res.end('{}');
  });
  const directory=await mkdtemp(join(tmpdir(),'aaraagate-perf-quota-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const first={...scenario,path:'/api/v1/fixture',requests:3,concurrency:1};
  const evidence=await runBenchmark({baseUrl,outputPath:join(directory,'evidence.json'),benchmarkScenarios:[first,{...first,name:'second'}],rateBudget:{limit:4,windowMs:1000},quotaClock:()=>clock,pause:async ms=>{clock+=ms;}});
  assert.equal(evidence.passed,true);assert.deepEqual(evidence.scenarios.map(row=>row.successes),[3,3]);
  assert.deepEqual(evidence.rateLimitPacing.cooldowns,[{beforeScenario:'second',waitMs:1050}]);
});

test('an actual rate-limit denial remains a benchmark failure without retry',async t=>{
  let calls=0;
  const baseUrl=await server(t,(_req,res)=>{calls++;res.writeHead(429);res.end();});
  const result=await runScenario(scenario,{baseUrl});
  assert.equal(result.summary.status,429);assert.equal(calls,1);assert.equal(result.problems.length,1);
});
