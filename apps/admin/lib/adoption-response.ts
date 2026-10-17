export type OnboardingStep={id:string;title:string;description:string;href:string;state:'READY'|'IN_PROGRESS'|'REVIEW';evidence:string;blockers:string[];nextActions:string[]}
export type OnboardingPlan={status:'ACTION_REQUIRED'|'REPOSITORY_REVIEW_REQUIRED';repositoryReady:boolean;readySteps:number;totalSteps:number;blockingStepIds:string[];activation:{eligibleResidents:number;activatedResidents:number;activationPercent:number|null};steps:OnboardingStep[];evaluatedAt:string;productionizationClaim:false;boundary:string}
export type MigrationEntity='BUILDING'|'UNIT'|'RESIDENT'|'VEHICLE'|'PARKING'|'WORKFORCE'|'VENDOR'|'OPENING_BALANCE'
export type MigrationPreview={entityType:MigrationEntity;totalRows:number;validRows:number;invalidRows:number;duplicateRows:number;normalizedRows:Record<string,string>[];issues:{row:number;field?:string;code:string;message:string}[]}
type MigrationBatch={id:string;status:string;entityType:MigrationEntity;checksum:string;idempotentReplay:boolean}

const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v)
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const text=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0
const strings=(v:unknown):v is string[]=>Array.isArray(v)&&v.every(text)

/** Validate the reported contract; readiness and authorization remain server-owned. */
export function readOnboardingPlan(value:unknown):OnboardingPlan{
  const invalid=()=>new Error('Setup checks returned incomplete or inconsistent information. Refresh to try again.')
  if(!record(value)||
      !['ACTION_REQUIRED','REPOSITORY_REVIEW_REQUIRED'].includes(String(value.status))||
      typeof value.repositoryReady!=='boolean'||
      value.productionizationClaim!==false||
      !count(value.readySteps)||
      !count(value.totalSteps)||
      value.totalSteps<1||
      !Array.isArray(value.steps)||
      value.totalSteps!==value.steps.length||
      value.readySteps>value.totalSteps||
      !strings(value.blockingStepIds)||
      !text(value.boundary)||
      !text(value.evaluatedAt)||
      !Number.isFinite(Date.parse(value.evaluatedAt)))throw invalid()
  const ids=new Set<string>()
  for(const step of value.steps){
    if(!record(step)||
      !text(step.id)||
      ids.has(step.id)||
      !text(step.title)||
      !text(step.description)||
      !text(step.evidence)||
      !text(step.href)||
      !/^\/[a-z][a-z0-9/-]*$/i.test(step.href)||
      !['READY','IN_PROGRESS','REVIEW'].includes(String(step.state))||
      !strings(step.blockers)||
      !strings(step.nextActions))throw invalid()
    ids.add(step.id)
  }
  if(value.readySteps!==value.steps.filter(step=>step.state==='READY').length||
      new Set(value.blockingStepIds).size!==value.blockingStepIds.length||
      value.blockingStepIds.some(id=>!ids.has(id))||
      value.repositoryReady!==(value.blockingStepIds.length===0)||
      value.status!==(value.repositoryReady?'REPOSITORY_REVIEW_REQUIRED':'ACTION_REQUIRED'))throw invalid()
  const activation=value.activation
  if(!record(activation)||!count(activation.eligibleResidents)||!count(activation.activatedResidents)||activation.activatedResidents>activation.eligibleResidents)throw invalid()
  const percent=activation.activationPercent
  if(activation.eligibleResidents===0?percent!==null:typeof percent!=='number'||
      !Number.isFinite(percent)||
      percent<0||
      percent>100||
      Math.abs(percent-Math.round(activation.activatedResidents/activation.eligibleResidents*1000)/10)>0.000001)throw invalid()
  return value as OnboardingPlan
}

export function readMigrationPreview(value:unknown,entity:MigrationEntity,total:number):MigrationPreview{
  const invalid=()=>new Error('Import preview returned incomplete or inconsistent information. Preview the source again before creating a batch.')
  if(!record(value)||
      value.entityType!==entity||
      !count(value.totalRows)||
      value.totalRows!==total||
      total<1||
      total>10000||
      !count(value.validRows)||
      !count(value.invalidRows)||
      value.validRows+value.invalidRows!==total||
      !count(value.duplicateRows)||
      value.duplicateRows>value.invalidRows||
      !Array.isArray(value.normalizedRows)||
      value.normalizedRows.length!==total||
      value.normalizedRows.some(row=>!record(row)||
      Object.values(row).some(v=>typeof v!=='string'))||
      !Array.isArray(value.issues))throw invalid()
  const invalidRows=new Set<number>(),duplicates=new Set<number>()
  for(const issue of value.issues){
    if(!record(issue)||
      !count(issue.row)||
      issue.row<1||
      issue.row>total||
      !['REQUIRED','INVALID','DUPLICATE'].includes(String(issue.code))||
      !text(issue.message)||
      issue.field!==undefined&&typeof issue.field!=='string')throw invalid()
    invalidRows.add(issue.row)
    if(issue.code==='DUPLICATE')duplicates.add(issue.row)
  }
  if(invalidRows.size!==value.invalidRows||duplicates.size!==value.duplicateRows)throw invalid()
  return value as MigrationPreview
}

export function readMigrationBatch(value:unknown,entity:MigrationEntity):MigrationBatch{
  if(!record(value)||
      !text(value.id)||
      value.entityType!==entity||
      !text(value.checksum)||
      !/^[a-f0-9]{64}$/i.test(value.checksum)||
      typeof value.idempotentReplay!=='boolean'||
      !['PREVIEWED','READY','COMMITTED','ROLLED_BACK','FAILED'].includes(String(value.status))||
      !value.idempotentReplay&&!['PREVIEWED','READY'].includes(String(value.status)))throw new Error('Batch creation could not be confirmed. Review existing batches before another attempt.')
  return value as MigrationBatch
}
