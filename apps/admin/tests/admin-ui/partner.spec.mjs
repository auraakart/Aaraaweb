import { test,expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
test('partner portfolio switch retains exact scope and displays only role labels',async({page})=>{
 await page.goto('/partner.html');await expect(page.getByRole('heading',{name:'Society A',exact:true})).toBeVisible()
 await expect(page.getByText('Role assignment 1',{exact:true})).toBeVisible()
 await page.getByLabel('Partner workspace',{exact:true}).selectOption('22222222-2222-4222-8222-222222222222')
 await expect(page.getByRole('heading',{name:'Society B',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Society A',exact:true})).toHaveCount(0)
})
test('brand manager never requests member enumeration',async({page})=>{
 await page.goto('/partner.html?role=BRAND_MANAGER');await expect(page.getByRole('heading',{name:'Society A',exact:true})).toBeVisible()
 await expect(page.getByText('Your partner role does not allow member enumeration.')).toBeVisible()
 expect((await page.evaluate(()=>window.partnerRequests)).some(p=>p.endsWith('/members'))).toBe(false)
})
test('revoked discovery clears all commercial data',async({page})=>{
 await page.goto('/partner.html?revoked');await expect(page.getByText('No partner workspace available',{exact:true})).toBeVisible()
 expect((await page.evaluate(()=>window.partnerRequests)).some(p=>p.endsWith('/portfolio')||p.endsWith('/members'))).toBe(false)
})
test('late old-session response cannot repaint logged-out portal',async({page})=>{
 await page.goto('/partner.html?stale');await expect(page.getByLabel('Partner workspace',{exact:true})).toBeVisible()
 await page.evaluate(()=>{sessionStorage.removeItem('aaraagate.admin.session');window.dispatchEvent(new Event('storage'))})
 await expect(page.getByText('Sign in to continue',{exact:true})).toBeVisible();await page.waitForTimeout(400)
 await expect(page.getByRole('heading',{name:'Society A',exact:true})).toHaveCount(0)
})
test('partner workspace is accessible on mobile',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/partner.html');await expect(page.getByRole('heading',{name:'Society A',exact:true})).toBeVisible()
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
})
