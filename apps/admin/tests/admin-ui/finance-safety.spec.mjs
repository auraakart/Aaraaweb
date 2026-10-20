import { test, expect } from '@playwright/test'

const confirmation='I confirm this period close is irreversible and future accounting entries must use an open period.'
const writes=page=>page.evaluate(()=>window.financeRequests.filter(request=>request.method!=='GET'))

test('closing the real finance workspace requires explicit confirmation',async({page})=>{
  await page.goto('/migrations.html?route=finance')
  const close=page.getByRole('button',{name:'Close period',exact:true})
  await expect(close).toBeDisabled()
  expect(await writes(page)).toEqual([])
  await page.getByLabel(confirmation,{exact:true}).check()
  await expect(close).toBeEnabled()
  await close.click()
  await expect(close).toHaveCount(0)
  expect(await writes(page)).toEqual([{path:'/accounting/periods/period-1/close',method:'POST'}])
})

test('revoked finance authority reports denial without claiming a closed period',async({page})=>{
  await page.goto('/migrations.html?route=finance&close=denied')
  await page.getByLabel(confirmation,{exact:true}).check()
  await page.getByRole('button',{name:'Close period',exact:true}).click()
  await expect(page.getByText('Finance permission was revoked',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Close period',exact:true})).toBeVisible()
  expect(await writes(page)).toHaveLength(1)
})

test('read-only committee finance access exposes no close mutation',async({page})=>{
  await page.goto('/migrations.html?route=finance&role=COMMITTEE_MEMBER')
  await expect(page.getByText('Read-only finance access.',{exact:false})).toBeVisible()
  await expect(page.getByRole('button',{name:'Close period',exact:true})).toHaveCount(0)
  await expect(page.getByLabel(confirmation,{exact:true})).toHaveCount(0)
  expect(await writes(page)).toEqual([])
})

test('read-only payment inspection never exposes allocation authority',async({page})=>{
  await page.goto('/migrations.html?route=finance&role=COMMITTEE_MEMBER')
  await page.getByLabel('Payment ID',{exact:true}).fill('53aa5ce7-1dba-47ef-b939-e2385370c242')
  await page.getByRole('button',{name:'Inspect payment',exact:true}).click()
  await expect(page.getByText('No allocations yet.',{exact:true})).toBeVisible()
  await expect(page.locator('#payment-allocation').getByRole('button',{name:'Allocate',exact:true})).toHaveCount(0)
  expect(await writes(page)).toEqual([])
})
