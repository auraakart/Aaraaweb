import {test,expect} from '@playwright/test'

const preview={entityType:'BUILDING',totalRows:1,validRows:1,invalidRows:0,duplicateRows:0,normalizedRows:[{name:'Alpha'}],issues:[]}
const batch={id:'batch-one',status:'READY',entityType:'BUILDING',checksum:'a'.repeat(64),idempotentReplay:false}
const count=async(page,n)=>expect.poll(()=>page.evaluate(()=>window.adoption.requests.length)).toBe(n)
const reply=async(page,index,value)=>page.evaluate(({index,value})=>window.adoption.reply(index,value),{index,value})
const invalidPlans=[
  ['missing activation',{activation:null}],['missing steps',{steps:null}],['wrong total',{totalSteps:2}],['excess ready count',{readySteps:2}],['inconsistent ready count',{readySteps:1}],['unknown step',{blockingStepIds:['missing']}],['duplicate step',{steps:'duplicate'}],['invalid step state',{steps:'state'}],['external destination',{steps:'external'}],['activation overflow',{activation:{eligibleResidents:1,activatedResidents:2,activationPercent:200}}],['invalid activation percentage',{activation:{eligibleResidents:1,activatedResidents:0,activationPercent:50}}],['invalid timestamp',{evaluatedAt:'invalid'}],['contradictory readiness',{repositoryReady:true}],
]
for(const [name,patch]of invalidPlans)test(`onboarding rejects ${name} and recovers without a render crash`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/adoption.html?mode=onboarding');await count(page,1)
  await page.evaluate(patch=>{
    const plan=window.adoption.plan('Malformed')
    if(patch.steps==='duplicate')patch={...patch,steps:[plan.steps[0],plan.steps[0]],totalSteps:2}
    if(patch.steps==='state')patch={...patch,steps:[{...plan.steps[0],state:'ACCEPTED'}]}
    if(patch.steps==='external')patch={...patch,steps:[{...plan.steps[0],href:'//outside.invalid'}]}
    window.adoption.reply(0,{...plan,...patch})
  },patch)
  await expect(page.getByRole('alert')).toContainText('incomplete or inconsistent')
  await expect(page.getByRole('heading',{name:'Setup progress'})).toHaveCount(0)
  await expect(page.getByRole('link',{name:'Open authoritative workspace →'})).toHaveCount(0)
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await count(page,2)
  await page.evaluate(()=>window.adoption.reply(1,window.adoption.plan('Recovered')))
  await expect(page.getByRole('heading',{name:'Recovered setup'})).toBeVisible()
  expect(errors).toEqual([])
})
const invalidPreviews=[
  ['wrong entity',{entityType:'RESIDENT'}],['wrong row total',{totalRows:2}],['inconsistent row counts',{validRows:0}],['missing normalized rows',{normalizedRows:null}],['missing issues',{issues:null}],['non-string normalized value',{normalizedRows:[{amountPaise:10}]}],['out-of-range issue',{issues:[{row:2,code:'INVALID',message:'Wrong row'}]}],['unaccounted issue',{issues:[{row:1,code:'INVALID',message:'Unaccounted issue'}]}],['unaccounted invalid row',{validRows:0,invalidRows:1}],['impossible duplicate count',{duplicateRows:1}],
]
for(const [name,patch]of invalidPreviews)test(`import rejects ${name} before enabling batch creation`,async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message))
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name\nAlpha')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1)
  await reply(page,0,{...preview,...patch})
  await expect(page.getByText(/Import preview returned incomplete or inconsistent/)).toBeVisible()
  await expect(page.getByRole('region',{name:'Migration preview result'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(1)
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,2);await reply(page,1,preview)
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeEnabled();expect(errors).toEqual([])
})
for(const [name,patch]of [['missing identity',{id:''}],['wrong entity',{entityType:'RESIDENT'}],['missing checksum',{checksum:''}],['unrecognized status',{status:'DRY_RUN'}],['unproven replay',{idempotentReplay:'true'}],['unexpected fresh commit',{status:'COMMITTED'}]])test(`batch rejects ${name} without claiming success or refreshing another workspace`,async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name\nAlpha')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1);await reply(page,0,preview)
  await page.getByRole('button',{name:'Create dry-run batch'}).click();await count(page,2);await reply(page,1,{...batch,...patch})
  await expect(page.getByText('Batch creation could not be confirmed. Review existing batches before another attempt.',{exact:true})).toBeVisible()
  await expect(page.getByText('Dry-run migration batch created.',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
  expect(await page.evaluate(()=>window.adoption.created)).toBe(0)
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(2)
})
test('existing committed batch is reported as existing state rather than a new dry-run',async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name\nAlpha')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1);await reply(page,0,preview)
  await page.getByRole('button',{name:'Create dry-run batch'}).click();await count(page,2)
  await reply(page,1,{...batch,status:'COMMITTED',idempotentReplay:true})
  await expect(page.getByText('Matching batch found (COMMITTED). Review its recorded state before continuing.',{exact:true})).toBeVisible()
  await expect(page.getByText('Dry-run migration batch created.',{exact:true})).toHaveCount(0)
  expect(await page.evaluate(()=>window.adoption.created)).toBe(1)
})
test('preview validation errors identify the physical source line after blank and multiline records',async({page})=>{
  await page.goto('/adoption.html')
  await page.getByLabel('CSV data',{exact:true}).fill('name,notes\n\nAlpha,"first\nsecond"\n\nBeta,last')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1)
  await reply(page,0,{...preview,totalRows:2,validRows:1,invalidRows:1,normalizedRows:[{name:'Alpha'},{name:'Beta'}],issues:[{row:2,field:'code',code:'REQUIRED',message:'Code is required'}]})
  await expect(page.getByText('Source row 6 · code',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(1)
})
