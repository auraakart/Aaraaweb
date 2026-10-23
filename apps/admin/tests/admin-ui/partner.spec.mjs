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


test('operational overview shows permitted metrics and switches exact partner scope',async({page})=>{
 await page.goto('/partner.html?operations')
 await expect(page.getByRole('heading',{name:'Society A',exact:true})).toBeVisible()
 await expect(page.getByText('Open maintenance work',{exact:true})).toBeVisible()
 await expect(page.getByText('Outstanding receivables',{exact:true})).toHaveCount(0)
 await page.getByLabel('Partner portfolio',{exact:true}).selectOption('22222222-2222-4222-8222-222222222222')
 await expect(page.getByRole('heading',{name:'Society B',exact:true})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Society A',exact:true})).toHaveCount(0)
 expect((await new AxeBuilder({page}).analyze()).violations).toEqual([])
})
test('commercial membership without society grants reveals no operational metrics',async({page})=>{
 await page.goto('/partner.html?operations&noSocietyAccess')
 await expect(page.getByText('No authorised operational summaries',{exact:true})).toBeVisible()
 await expect(page.getByText('Open maintenance work',{exact:true})).toHaveCount(0)
})


test('partner branding saves a draft then publishes with an explicit reason',async({page})=>{
 await page.goto('/partner.html?branding');
 await expect(page.getByRole('heading',{name:'Partner branding and readiness'})).toBeVisible();
 await expect(page.getByText('No published partner brand',{exact:false})).toBeVisible();
 await page.getByLabel('Display name',{exact:true}).fill('Partner A Presentation');
 await page.getByRole('button',{name:'Save immutable draft'}).click();
 await expect(page.getByRole('button',{name:'Publish revision 1'})).toBeDisabled();
 await page.getByLabel('Publication reason',{exact:true}).fill('Reviewed partner presentation');
 page.once('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'Publish revision 1'}).click();
 await expect(page.getByText('Brand: Published revision 1',{exact:true})).toBeVisible();
 await page.evaluate(()=>{sessionStorage.removeItem('aaraagate.partner.session');sessionStorage.removeItem('aaraagate.admin.session');window.dispatchEvent(new Event('storage'))});
 await expect(page.getByRole('heading',{name:'Partner presentation',exact:true})).toHaveCount(0);
});
