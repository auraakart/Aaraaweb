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
