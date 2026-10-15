import {readFileSync} from 'node:fs';
import {probeTestIngress,validateTestIngressPlan} from './v5.4.24-ingress-acceptance.mjs';

// Manual, unauthenticated read-only probe; NEVER part of automatic CI.
try{
 if(process.argv.length!==3)
  throw Error('Usage: node scripts/v5.4.24-run-ingress-probe.mjs <reviewed-test-plan.json>');
 if(!['test','development'].includes(process.env.NODE_ENV??''))
  throw Error('Only test/development may run this probe');
 if(process.env.AARAGATE_V5_INGRESS_PROBE_CONFIRM!=='I_APPROVE_READ_ONLY_TEST_PROBE')
  throw Error('Explicit TEST-only probe approval is missing');
 const filename=process.argv[2];
 if(typeof filename!=='string'||filename.length>1024||filename.startsWith('-'))
  throw Error('Invalid local plan file');
 const plan=validateTestIngressPlan(JSON.parse(readFileSync(filename,'utf8')));
 if(process.env.AARAGATE_V5_APPROVED_TEST_HOST!==plan.hostname)
  throw Error('Operator-approved TEST hostname does not match the plan');
 const result=await probeTestIngress(plan);
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){
 console.error('V5.4.24 TEST ingress probe rejected: '+error.message);
 process.exitCode=1;
}
