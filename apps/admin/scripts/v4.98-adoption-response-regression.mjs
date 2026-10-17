import assert from 'node:assert/strict'
import {readOnboardingPlan,readMigrationPreview,readMigrationBatch} from '../lib/adoption-response.ts'

const plan={status:'ACTION_REQUIRED',repositoryReady:false,readySteps:0,totalSteps:1,blockingStepIds:['residents'],activation:{eligibleResidents:3,activatedResidents:1,activationPercent:33.3},steps:[{id:'residents',title:'Residents',description:'Review residents',href:'/reports',state:'REVIEW',evidence:'Review required',blockers:['REVIEW'],nextActions:['Review']}],evaluatedAt:'2026-10-17T12:00:00Z',productionizationClaim:false,boundary:'Independent acceptance required'}
const preview={entityType:'BUILDING',totalRows:1,validRows:1,invalidRows:0,duplicateRows:0,normalizedRows:[{name:'Alpha'}],issues:[]}
const batch={id:'batch-one',status:'READY',entityType:'BUILDING',checksum:'a'.repeat(64),idempotentReplay:false}
assert.equal(readOnboardingPlan(plan),plan)
assert.equal(readMigrationPreview(preview,'BUILDING',1),preview)
assert.equal(readMigrationBatch(batch,'BUILDING'),batch)
for(const patch of [{activation:null},{steps:null},{totalSteps:2},{readySteps:2},{readySteps:1},{blockingStepIds:['missing']},{activation:{eligibleResidents:1,activatedResidents:2,activationPercent:200}},{activation:{eligibleResidents:3,activatedResidents:1,activationPercent:0}},{steps:[{...plan.steps[0],href:'//outside.invalid'}]},{repositoryReady:true},{evaluatedAt:'invalid'}])assert.throws(()=>readOnboardingPlan({...plan,...patch}),/incomplete or inconsistent/)
for(const patch of [{entityType:'RESIDENT'},{issues:null},{validRows:0},{normalizedRows:[]},{issues:[{row:2,code:'INVALID',message:'Wrong row'}]},{normalizedRows:[{amountPaise:10}]}])assert.throws(()=>readMigrationPreview({...preview,...patch},'BUILDING',1),/incomplete or inconsistent/)
for(const patch of [{id:''},{entityType:'RESIDENT'},{checksum:'invalid'},{status:'COMMITTED'},{idempotentReplay:'true'}])assert.throws(()=>readMigrationBatch({...batch,...patch},'BUILDING'),/could not be confirmed/)
const rejected={...preview,validRows:0,invalidRows:1,issues:[{row:1,field:'code',code:'REQUIRED',message:'Code required'}]}
assert.equal(readMigrationPreview(rejected,'BUILDING',1),rejected)
assert.equal(readMigrationBatch({...batch,status:'COMMITTED',idempotentReplay:true},'BUILDING').status,'COMMITTED')
console.log('V4.98 adoption response contracts: PASS (27 cases)')
