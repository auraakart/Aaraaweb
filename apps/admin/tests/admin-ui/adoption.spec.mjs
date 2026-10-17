import {test,expect} from '@playwright/test'

const preview={entityType:'BUILDING',totalRows:1,validRows:1,invalidRows:0,duplicateRows:0,normalizedRows:[{name:'Alpha'}],issues:[]}
const count=async(page,n)=>expect.poll(()=>page.evaluate(()=>window.adoption.requests.length)).toBe(n)
const reply=async(page,index,value,status=200)=>page.evaluate(({index,value,status})=>window.adoption.reply(index,value,status),{index,value,status})
const plan=async(page,index,name)=>page.evaluate(({index,name})=>window.adoption.reply(index,window.adoption.plan(name)),{index,name})

for(const patch of [{societyId:'society-two',societyName:'Second society'},{sessionId:'session-two'}]){
  test(`onboarding discards old context results: ${Object.keys(patch)[0]}`,async({page})=>{
    await page.goto('/adoption.html?mode=onboarding');await count(page,1)
    await page.evaluate(patch=>window.adoption.switchSession(patch),patch);await count(page,2)
    await plan(page,1,'Current');await expect(page.getByRole('heading',{name:'Current setup'})).toBeVisible()
    await plan(page,0,'Former');await expect(page.getByRole('heading',{name:'Former setup'})).toHaveCount(0)
    await page.evaluate(()=>window.adoption.switchSession({role:'AUDITOR'}))
    await expect(page.getByRole('heading',{name:'Society administration required'})).toBeVisible()
    await expect(page.getByText('Current records')).toHaveCount(0)
  })
}
test('failed onboarding refresh clears previous progress and supports recovery',async({page})=>{
  await page.goto('/adoption.html?mode=onboarding');await count(page,1);await plan(page,0,'Previous')
  await expect(page.getByRole('heading',{name:'Previous setup'})).toBeVisible();await page.getByRole('button',{name:'Refresh',exact:true}).click();await count(page,2)
  await reply(page,1,{message:'Setup temporarily unavailable'},503)
  await expect(page.getByRole('alert')).toHaveText('Setup temporarily unavailable')
  await expect(page.getByRole('heading',{name:'Previous setup'})).toHaveCount(0)
  await expect(page.getByRole('heading',{name:'Setup progress'})).toHaveCount(0)
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await count(page,3);await plan(page,2,'Recovered')
  await expect(page.getByRole('heading',{name:'Recovered setup'})).toBeVisible()
})
test('import freezes source during preview and drops results after society switch',async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name\nAlpha')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1)
  await expect(page.getByLabel('Entity type')).toBeDisabled();await expect(page.getByLabel('CSV data',{exact:true})).toBeDisabled()
  await page.evaluate(()=>window.adoption.switchSession({sessionId:'next-session',societyId:'next-society'}));await reply(page,0,preview)
  await expect(page.getByLabel('CSV data',{exact:true})).toHaveValue('')
  await expect(page.getByRole('region',{name:'Migration preview result'})).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
  await page.getByLabel('CSV data',{exact:true}).fill('name\nBeta');await page.getByRole('button',{name:'Preview validation'}).click();await count(page,2);await reply(page,1,preview)
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeEnabled()
})
test('a completed old-session batch cannot trigger a new-session refresh',async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name\nAlpha')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1);await reply(page,0,preview)
  await page.getByRole('button',{name:'Create dry-run batch'}).click();await count(page,2)
  await page.evaluate(()=>window.adoption.switchSession({sessionId:'replaced-login'}));await reply(page,1,{id:'old-batch',status:'DRY_RUN'})
  await expect(page.getByLabel('CSV data',{exact:true})).toHaveValue('')
  expect(await page.evaluate(()=>window.adoption.created)).toBe(0)
  await expect(page.getByText('Dry-run migration batch created.',{exact:true})).toHaveCount(0)
})
for(const [csv,message] of [['name,Name\nAlpha,Beta','CSV contains duplicate column headers.'],['name\nAlpha,Beta','CSV row 2 contains more values than column headers.']]){
  test(`CSV rejects ambiguity before any API request: ${message}`,async({page})=>{
    await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill(csv);await page.getByRole('button',{name:'Preview validation'}).click()
    await expect(page.getByText(message,{exact:true})).toBeVisible();expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(0)
  })
}
test('quoted CSV reaches preview intact and creates only one dry-run batch',async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill('name,notes\r\n"Alpha,Beta","line one\nline two"')
  await page.getByRole('button',{name:'Preview validation'}).click();await count(page,1)
  expect(await page.evaluate(()=>window.adoption.requests[0].body.rows)).toEqual([{name:'Alpha,Beta',notes:'line one\nline two',__source_row:'2'}])
  await reply(page,0,preview);await page.getByRole('button',{name:'Create dry-run batch'}).click();await count(page,2)
  await reply(page,1,{id:'batch',status:'DRY_RUN'});await expect(page.getByText('Dry-run migration batch created.',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>window.adoption.created)).toBe(1);await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
})
