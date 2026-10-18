import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const routes=[
  {key:'helpdesk',title:'Helpdesk operations',ready:'Lift maintenance follow-up'},
  {key:'privacy',title:'Privacy request operations',ready:'Request a copy of account data'},
  {key:'facilities',title:'Facilities operations',ready:'Operations summary'},
  {key:'documents',title:'Society document repository',ready:'Community maintenance policy'},
  {key:'occupancy',title:'Move-in & move-out',ready:'MOVE OUT',openDetail:'MOVE OUT'},
  {key:'finance',title:'Finance workspace',ready:'INV-2026-09-001'},
  {key:'governance',title:'Governance workspace',ready:'September committee review',openDetail:'September committee review'},
]

for(const route of routes){
  for(const width of [360,768,1440]){
    test(`migrated ${route.key} route is responsive at ${width}px`,async({page},testInfo)=>{
      const apiFailures=[]
      const runtimeFailure=new Promise((_,reject)=>{
        page.once('pageerror',error=>reject(new Error(`Migration fixture ${route.key} runtime error: ${error.message}`)))
      })
      page.on('response',response=>{
        if(response.url().includes('/api/v1/')&&response.status()>=400){
          const url=new URL(response.url())
          apiFailures.push(`${response.status()} ${url.pathname}`)
        }
      })
      await page.setViewportSize({width,height:1100})
      await page.goto(`/migrations.html?route=${route.key}`)
      await Promise.race([
        expect(page.getByRole('heading',{level:1,name:route.title,exact:true})).toBeVisible({timeout:2000}),
        runtimeFailure,
      ])
      await expect(page.getByText(route.ready,{exact:false}).first()).toBeVisible()
      await page.waitForLoadState('networkidle')
      expect(apiFailures,`Unstubbed or failing API request(s) in ${route.key} migration fixture`).toEqual([])

      if(route.openDetail){
        const candidate=page.getByRole('button').filter({hasText:route.openDetail}).first()
        await candidate.click()
        if(route.key==='occupancy') await expect(page.getByText('Operational handover evidence',{exact:true})).toBeVisible()
        if(route.key==='governance') await expect(page.getByText('Reviewed maintenance, collections and resident communications.',{exact:true})).toBeVisible()
      }

      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('heading',{level:1})).toHaveCount(1)
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)

      const visibleButtons=await page.getByRole('button').all()
      for(const button of visibleButtons){
        if(await button.isVisible()){
          const box=await button.boundingBox()
          if(box) expect(box.height).toBeGreaterThanOrEqual(44)
        }
      }

      if(width===1440){
        const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()
        expect(results.violations).toEqual([])
      }

      await page.screenshot({path:testInfo.outputPath(`migration-${route.key}-${width}.png`),fullPage:true})
    })
  }
}


for (const route of [
  { key: 'helpdesk', heading: 'Helpdesk operations', content: 'Lift maintenance follow-up' },
  { key: 'finance', heading: 'Finance workspace', content: 'INV-2026-09-001' },
]) {
  test(`opt-in dark preview retains ${route.key} operator content and accessible surfaces`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/migrations.html?route=${route.key}`)
    await expect(page.getByRole('heading', { level: 1, name: route.heading })).toBeVisible()
    await expect(page.getByText(route.content, { exact: false }).first()).toBeVisible()
    await page.evaluate(() => { document.documentElement.dataset.adminTheme = 'dark' })
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(12, 25, 33)')
    const surfaces = await page.locator('main section').all()
    expect(surfaces.length).toBeGreaterThan(0)
    if (route.key === 'finance') {
      const receivables = page.getByRole('heading', { name: 'Receivables summary' }).locator('..')
      expect(await receivables.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 39, 48)')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`admin-dark-preview-${route.key}.png`), fullPage: true })
  })
}

 
// The dark palette is opt-in. This matrix checks remaining operational routes
// without enabling dark mode in production or altering the authorization paths.
for (const route of [
  { key: 'privacy', title: 'Privacy request operations', ready: 'Request a copy of account data' },
  { key: 'facilities', title: 'Facilities operations', ready: 'Operations summary' },
  { key: 'documents', title: 'Society document repository', ready: 'Community maintenance policy' },
  { key: 'occupancy', title: 'Move-in & move-out', ready: 'MOVE OUT' },
  { key: 'governance', title: 'Governance workspace', ready: 'September committee review' },
]) {
  test(`opt-in Admin dark preview preserves ${route.key} operational content, contrast and layout`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto(`/migrations.html?route=${route.key}`)
    await expect(page.getByRole('heading', { level: 1, name: route.title, exact: true })).toBeVisible()
    await expect(page.getByText(route.ready, { exact: false }).first()).toBeVisible()
    await page.evaluate(() => { document.documentElement.dataset.adminTheme = 'dark' })
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(12, 25, 33)')
    if (route.key === 'facilities') {
      const panel = page.getByRole('heading', { name: 'Operations summary' }).locator('..')
      expect(await panel.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(20, 39, 48)')
    }
    if (route.key === 'occupancy') {
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--warning-soft').trim())).toBe('#463719')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('main')).toHaveCount(1)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations).toEqual([])
    await page.screenshot({ path: testInfo.outputPath(`admin-dark-preview-${route.key}.png`), fullPage: true })
  })
}
