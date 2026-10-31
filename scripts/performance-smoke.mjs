import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { operationalPerformance } from './lib/operational-performance-contract.mjs';
import { pathToFileURL } from 'node:url';

const base=(process.env.AARAAGATE_PERF_BASE_URL??'http://127.0.0.1:3000').replace(/\/$/,'');
const accessToken=process.env.AARAAGATE_PERF_ACCESS_TOKEN??'aaraagate-perf-access-token-local-ci';
const output=process.env.AARAAGATE_PERF_OUTPUT??'/tmp/aaraagate-performance-summary.json';

const operationsHeaders={Authorization:`Bearer ${process.env.AARAAGATE_PERF_OPERATIONS_ACCESS_TOKEN??operationalPerformance.accessToken}`};

export const scenarios=[
  {name:'occupancy-list-5k',path:'/api/v1/occupancy-lifecycle',requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:operationsHeaders},
  {name:'occupancy-readiness-5k',path:`/api/v1/occupancy-lifecycle/${operationalPerformance.requestId}/readiness`,requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:operationsHeaders},
  {name:'document-management-2k',path:'/api/v1/documents/management',requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:operationsHeaders},
  {name:'document-published-2k',path:'/api/v1/documents/published',requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:operationsHeaders},
  {name:'health-live',path:'/api/v1/health/live',requests:160,concurrency:16,warmup:16,p95Ms:400,minRps:20,headers:{}},
  {name:'health-ready',path:'/api/v1/health/ready',requests:120,concurrency:12,warmup:12,p95Ms:750,minRps:10,headers:{}},
  {name:'auth-contexts',path:'/api/v1/auth/contexts',requests:160,concurrency:16,warmup:16,p95Ms:900,minRps:10,headers:{Authorization:`Bearer ${accessToken}`}},
  {name:'finance-readiness-100k',path:'/api/v1/accounting/finance-operations/operational-readiness',requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:{Authorization:`Bearer ${accessToken}`}},
  {name:'treasurer-control-100k',path:'/api/v1/accounting/finance-operations/treasurer-control-centre',requests:24,concurrency:4,warmup:4,p95Ms:2500,minRps:1.5,headers:{Authorization:`Bearer ${accessToken}`}},
];

const percentile=(values,p)=>{
  if(!values.length)return 0;
  const sorted=[...values].sort((a,b)=>a-b);
  const index=Math.min(sorted.length-1,Math.max(0,Math.ceil((p/100)*sorted.length)-1));
  return sorted[index];
};

async function hit(scenario,baseUrl,requestTimeoutMs){
  const started=performance.now();
  let status=0;
  try{
    const response=await fetch(`${baseUrl}${scenario.path}`,{headers:{Accept:'application/json',...scenario.headers},signal:AbortSignal.timeout(requestTimeoutMs)});
    status=response.status;
    await response.arrayBuffer();
    return {ok:response.ok,status,ms:performance.now()-started};
  }catch(error){
    return {ok:false,status,ms:performance.now()-started,error:error instanceof Error?error.message:String(error)};
  }
}

export async function runScenario(scenario,{baseUrl=base,requestTimeoutMs=10000}={}){
  if(!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<1)throw new Error('Invalid request deadline');
  const warmupStarted=performance.now();
  for(let i=0;i<scenario.warmup;i+=1){
    const result=await hit(scenario,baseUrl,requestTimeoutMs);
    if(!result.ok)return {
      summary:{name:scenario.name,phase:'warmup',warmupCompleted:i,warmupFailures:1,
        requests:0,successes:0,failures:0,requestTimeoutMs,
        elapsedMs:Number((performance.now()-warmupStarted).toFixed(2)),status:result.status},
      problems:[`warmup failed with status ${result.status}`],
    };
  }

  const durations=[];
  let failures=0;
  let cursor=0;
  const started=performance.now();

  async function worker(){
    while(true){
      const index=cursor++;
      if(index>=scenario.requests)return;
      const result=await hit(scenario,baseUrl,requestTimeoutMs);
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
    phase:'measured',
    requestTimeoutMs,
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

export async function runBenchmark({baseUrl=base,outputPath=output,benchmarkScenarios=scenarios,requestTimeoutMs=10000,queryPlanPath=null,rateBudget=null,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),quotaClock=()=>performance.now()}={}){
  const results=[];
  const failures=[];
  const cooldowns=[];
  let budgetUsed=0,windowStarted=quotaClock();
  if(rateBudget&&(!Number.isSafeInteger(rateBudget.limit)||rateBudget.limit<1||!Number.isFinite(rateBudget.windowMs)||rateBudget.windowMs<1))throw new Error('Invalid benchmark rate budget');
  for(const scenario of benchmarkScenarios){
    // All current authenticated scenarios share the API's per-client bucket.
    // Wait outside measured traffic instead of disabling quotas or retrying 429s.
    const usesApiBucket=scenario.path.startsWith('/api/v1/')&&!scenario.path.startsWith('/api/v1/health');
    if(rateBudget&&usesApiBucket){
      const cost=scenario.warmup+scenario.requests;
      if(cost>rateBudget.limit)throw new Error('A measured scenario exceeds the benchmark rate budget');
      if(quotaClock()-windowStarted>=rateBudget.windowMs){budgetUsed=0;windowStarted=quotaClock();}
      if(budgetUsed+cost>rateBudget.limit){
        const waitMs=Math.max(0,rateBudget.windowMs-(quotaClock()-windowStarted))+50;
        cooldowns.push({beforeScenario:scenario.name,waitMs:Math.ceil(waitMs)});
        console.log(JSON.stringify({benchmarkCooldown:true,beforeScenario:scenario.name,waitMs:Math.ceil(waitMs)}));
        await pause(waitMs);budgetUsed=0;windowStarted=quotaClock();
      }
      if(budgetUsed===0)windowStarted=quotaClock();
      budgetUsed+=cost;
    }
    const result=await runScenario(scenario,{baseUrl,requestTimeoutMs});
    results.push(result.summary);
    for(const problem of result.problems)failures.push(`${scenario.name}: ${problem}`);
    console.log(JSON.stringify(result.summary));
  }

  let operationalQueryEvidence=null;
  if(queryPlanPath){
    try{
      const plans=JSON.parse(await readFile(queryPlanPath,'utf8'));
      if(!Number.isSafeInteger(plans.requestCount)||plans.requestCount<1||!Number.isSafeInteger(plans.documentCount)||plans.documentCount<1||!Array.isArray(plans.requestPlan)||!plans.requestPlan.length||!Array.isArray(plans.documentPlan)||!plans.documentPlan.length)throw new Error('Invalid query evidence');
      operationalQueryEvidence=plans;
    }catch{
      failures.push('operational-query-evidence: required query plans are missing or invalid');
    }
  }
  const evidence={
    generatedAt:new Date().toISOString(),
    baseUrl,
    environment:'repository-ci-production-mode',
    claimBoundary:'Regression evidence only; not a production capacity or SLA certification.',
    scenarios:results,
    ...(rateBudget?{rateLimitPacing:{...rateBudget,cooldowns}}:{}),
    ...(queryPlanPath?{operationalQueryEvidence}:{}),
    passed:failures.length===0,
    failures,
  };
  await writeFile(outputPath,JSON.stringify(evidence,null,2));
  if(failures.length){
    console.error('Performance regression gate failed:\n'+failures.map(x=>`- ${x}`).join('\n'));
    return evidence;
  }
  console.log(`Performance regression gate passed. Evidence: ${outputPath}`);

  return evidence;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const evidence=await runBenchmark({queryPlanPath:process.env.AARAAGATE_PERF_QUERY_PLAN_OUTPUT??'/tmp/aaraagate-operational-query-plans.json',rateBudget:{limit:300,windowMs:60_000}});
  if(!evidence.passed)process.exitCode=1;
}
