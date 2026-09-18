import { performance } from 'node:perf_hooks';
import { writeFile } from 'node:fs/promises';

const base=(process.env.AARAAGATE_PERF_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
const accessToken=process.env.AARAAGATE_PERF_ACCESS_TOKEN??'aaraagate-perf-access-token-local-ci';
const output=process.env.AARAAGATE_PERF_OUTPUT??'/tmp/aaraagate-performance-summary.json';

const scenarios=[
  {name:'health-live',path:'/api/v1/health/live',requests:160,concurrency:16,warmup:16,p95Ms:400,minRps:20,headers:{}},
  {name:'health-ready',path:'/api/v1/health/ready',requests:120,concurrency:12,warmup:12,p95Ms:750,minRps:10,headers:{}},
  {name:'auth-contexts',path:'/api/v1/auth/contexts',requests:160,concurrency:16,warmup:16,p95Ms:900,minRps:10,headers:{Authorization:`Bearer ${accessToken}`}},
];

const percentile=(values,p)=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return sorted[index];
};

async function hit(scenario){
  const started=performance.now();
  let status=0;
  try{
    const response=await fetch(`${base}${scenario.path}`,{headers:{Accept:'application/json',...scenario.headers}});
    status=response.status;
    await response.arrayBuffer();
    return {ok:response.ok,status,ms:performance.now()-started};
  }catch(error){
    return {ok:false,status,ms:performance.now()-started,error:error instanceof Error?error.message:String(error)};
  }
}

async function runScenario(scenario){
  for(let i=0;i<scenario.warmup;i+=1){
    const result=await hit(scenario);
    if(!result.ok)throw new Error(`${scenario.name} warmup failed with status ${result.status}: ${result.error??'HTTP failure'}`);
  }

  const durations=[];
  let failures=0;
  let cursor=0;
  const started=performance.now();

  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=scenario.requests)return;
      const result=await hit(scenario);
      durations.push(result.ms);
      if(!result.ok)failures+=1;
    }
  }

  await Promise.all(Array.from({length:scenario.concurrency},()=>worker()));
  const elapsedMs=performance.now()-started;
  const success=scenario.requests-failures;
  const rps=(scenario.requests/(elapsedMs/1000));
  const summary={
    name:scenario.name,
    requests:scenario.requests,
    concurrency:scenario.concurrency,
    successes:success,
    failures,
    errorRate:failures/scenario.requests,
    elapsedMs:Number(elapsedMs.toFixed(2)),
    rps:Number(rps.toFixed(2)),
    p50Ms:Number(percentile(durations,50).toFixed(2)),
    p95Ms:Number(percentile(durations,95).toFixed(2)),
    p99Ms:Number(percentile(durations,99).toFixed(2)),
    maxMs:Number(Math.max(...durations).toFixed(2)),
    thresholds:{p95Ms:scenario.p95Ms,minRps:scenario.minRps,maxErrorRate:0},
  };

  const problems=[];
  if(summary.failures>0)problems.push(`${summary.failures} request(s) failed`);
  if(summary.p95Ms>scenario.p95Ms)problems.push(`p95 ${summary.p95Ms}ms > ${scenario.p95Ms}ms`);
  if(summary.rps<scenario.minRps)problems.push(`throughput ${summary.rps} rps < ${scenario.minRps} rps`);
  return {summary,problems};
}

const results=[];
const failures=[];
for(const scenario of scenarios){
  const result=await runScenario(scenario);
  results.push(result.summary);
  for(const problem of result.problems)failures.push(`${scenario.name}: ${problem}`);
  console.log(JSON.stringify(result.summary));
}

const evidence={
  generatedAt:new Date().toISOString(),
  baseUrl:base,
  environment:'repository-ci-production-mode',
  claimBoundary:'Regression evidence only; not a production capacity or SLA certification.',
  scenarios:results,
  passed:failures.length===0,
  failures,
};
await writeFile(output,JSON.stringify(evidence,null,2));
if(failures.length){
  console.error('Performance regression gate failed:\n'+failures.map(x=>`- ${x}`).join('\n'));
  process.exit(1);
}
console.log(`Performance regression gate passed. Evidence: ${output}`);
