import {test,expect} from '@playwright/test'
const stored=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('aaraagate.admin.session')??'null'))
const pending=(page,suffix)=>expect.poll(()=>page.evaluate(suffix=>window.auth.requests.filter(item=>item.path.endsWith(suffix)).length,suffix)).toBe(1)
const ready=async page=>{await pending(page,'/auth/refresh');await page.evaluate(()=>window.auth.ready());await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()}
for(const mode of ['console','audit']){
  for(const status of [200,401])test(`${mode} late restore ${status} cannot replace or erase a newer login`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(`/auth.html?mode=${mode}`);await pending(page,'/auth/refresh')
    await page.evaluate(status=>{window.auth.replace();window.auth.reply('/api/v1/auth/refresh',{sessionId:'old-rotated',accessToken:'old-rotated-access',refreshToken:'old-rotated-refresh'},status)},status)
    await expect(page.getByText(/Restoring secure/)).toHaveCount(0)
    expect((await stored(page)).sessionId).toBe('replacement')
    await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
    expect(errors).toEqual([])
  })
  test(`${mode} late logout cannot clear replacement storage or keep old workspace visible`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await page.goto(`/auth.html?mode=${mode}`);await ready(page)
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await pending(page,'/auth/logout')
    await page.evaluate(()=>{window.auth.replace(true);window.auth.reply('/api/v1/auth/logout',{ok:true})})
    await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
    expect((await stored(page)).sessionId).toBe('replacement');expect(errors).toEqual([])
  })
  test(`${mode} focus invalidates an old workspace without deleting the new login`,async({page})=>{
    await page.goto(`/auth.html?mode=${mode}`);await ready(page)
    await page.evaluate(()=>{window.auth.replace();window.dispatchEvent(new Event('focus'))})
    await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
    expect((await stored(page)).sessionId).toBe('replacement')
  })
  test(`${mode} normal logout uses its owned rotated credentials and clears local state`,async({page})=>{
    await page.goto(`/auth.html?mode=${mode}`);await ready(page)
    await page.getByRole('button',{name:'Sign out',exact:true}).click();await pending(page,'/auth/logout')
    expect(await page.evaluate(()=>window.auth.requests.find(item=>item.path.endsWith('/auth/logout')).body)).toEqual({sessionId:'rotated',refreshToken:'rotated-refresh'})
    await page.evaluate(()=>window.auth.reply('/api/v1/auth/logout',{ok:true}))
    await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
    expect(await stored(page)).toBeNull()
  })
}
