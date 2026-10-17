import {test,expect} from '@playwright/test'
const modes=['console','audit','provider','partner']
const count=(page,n)=>expect.poll(()=>page.evaluate(()=>window.login.requests.length)).toBe(n)
const reply=(page,index,value,status=200)=>page.evaluate(({index,value,status})=>window.login.reply(index,value,status),{index,value,status})
const stored=page=>page.evaluate(()=>JSON.parse(sessionStorage.getItem(window.login.storageKey)??'null'))
async function begin(page,mode){
  await page.goto(`/login.html?mode=${mode}`)
  await page.getByLabel('Mobile number',{exact:true}).fill('+919000000001')
  await page.getByRole('button',{name:'Send OTP',exact:true}).click();await count(page,1)
}
async function verifying(page,mode){
  await begin(page,mode);await reply(page,0,{challengeId:'challenge-one'})
  await page.getByLabel('6-digit OTP',{exact:true}).fill('123456')
  await page.getByRole('button',{name:mode==='partner'?'Access partner workspace':'Verify securely',exact:true}).click();await count(page,2)
}
for(const mode of modes){
  test(`${mode} OTP request is single-flight and freezes the submitted number`,async({page})=>{
    await page.goto(`/login.html?mode=${mode}`);await page.getByLabel('Mobile number',{exact:true}).fill('+919000000001')
    await page.locator('form').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
    await count(page,1);await expect(page.getByLabel('Mobile number',{exact:true})).toBeDisabled()
    expect(await page.evaluate(()=>window.login.requests[0].body)).toEqual({phone:'+919000000001'})
    await reply(page,0,{challengeId:'challenge-one'});await expect(page.getByLabel('6-digit OTP',{exact:true})).toBeEnabled()
  })
  test(`${mode} late challenge cannot advance a changed sign-in`,async({page})=>{
    await begin(page,mode);await page.evaluate(()=>window.login.replace());await reply(page,0,{challengeId:'old-challenge'})
    await expect(page.getByText('Sign-in changed. Reopen this sign-in page before continuing.',{exact:true})).toBeVisible()
    await expect(page.getByLabel('6-digit OTP',{exact:true})).toHaveCount(0)
    expect((await stored(page)).sessionId).toBe('replacement')
  })
  test(`${mode} late verification cannot overwrite replacement credentials`,async({page})=>{
    await verifying(page,mode);await page.evaluate(()=>{window.login.replace();window.login.reply(1,window.login.verified())})
    await expect(page.getByText('Sign-in changed. Reopen this sign-in page before continuing.',{exact:true})).toBeVisible()
    expect((await stored(page)).sessionId).toBe('replacement')
    expect(page.url()).toContain('/login.html')
  })
  test(`${mode} verification from an unmounted form cannot authenticate`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message))
    await verifying(page,mode);await page.evaluate(()=>{window.login.unmount();window.login.reply(1,window.login.verified())})
    await page.evaluate(()=>new Promise(requestAnimationFrame))
    await expect(page.locator('#root')).toBeEmpty()
    expect(await stored(page)).toBeNull();expect(errors).toEqual([])
  })
  test(`${mode} rejected OTP can be explicitly corrected and verified again`,async({page})=>{
    await verifying(page,mode);await reply(page,1,{message:'OTP is incorrect'},400)
    await expect(page.getByText('OTP is incorrect',{exact:true})).toBeVisible()
    await expect(page.getByLabel('6-digit OTP',{exact:true})).toBeEnabled()
    await page.getByLabel('6-digit OTP',{exact:true}).fill('654321')
    await page.getByRole('button',{name:mode==='partner'?'Access partner workspace':'Verify securely',exact:true}).click();await count(page,3)
    expect(await page.evaluate(()=>window.login.requests[2].body)).toEqual({challengeId:'challenge-one',code:'654321'})
  })
  test(`${mode} normal OTP login preserves its dedicated session and destination`,async({page})=>{
    if(mode==='partner')await page.route('**/partners/members',route=>route.fulfill({contentType:'text/html',body:'<h1>Partner destination</h1>'}))
    await verifying(page,mode)
    if(mode==='partner'){
      await Promise.all([page.waitForURL('**/partners/members'),page.evaluate(()=>window.login.reply(1,window.login.verified()))])
      expect(await page.evaluate(()=>JSON.parse(sessionStorage.getItem('aaraagate.partner.session')).audience)).toBe('PARTNER')
      expect(await page.evaluate(()=>sessionStorage.getItem('aaraagate.admin.session'))).toBeNull()
    }else{
      await page.evaluate(()=>window.login.reply(1,window.login.verified()))
      await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()
      expect((await stored(page)).sessionId).toBe('accepted')
      if(mode==='provider')expect(await page.evaluate(()=>sessionStorage.getItem('aaraagate.admin.session'))).toBeNull()
    }
  })
}
for(const mode of ['console','audit','provider'])test(`${mode} context selection is single-flight and ignores a replaced login`,async({page})=>{
  await verifying(page,mode);await page.evaluate(()=>window.login.reply(1,window.login.verified(true)))
  const first=page.getByRole('button').filter({hasText:'First society'})
  await first.evaluate(button=>{button.click();button.click()});await count(page,3)
  await expect(page.getByRole('button').filter({hasText:'Second society'})).toBeDisabled()
  await page.evaluate(()=>{window.login.replace();window.login.reply(2,window.login.selected())})
  await expect(page.getByText('Sign-in changed. Reopen this sign-in page before continuing.',{exact:true})).toBeVisible()
  expect((await stored(page)).sessionId).toBe('replacement')
})
for(const status of [200,401])test(`provider restore ${status} preserves a replacement login`,async({page})=>{
  await page.goto('/login.html?mode=provider&restore=1');await count(page,1)
  await page.evaluate(status=>{window.login.replace();window.login.reply(0,{sessionId:'old-rotated',accessToken:'old-access',refreshToken:'old-refresh'},status)},status)
  await expect(page.getByText('Restoring provider session…',{exact:true})).toHaveCount(0)
  expect((await stored(page)).sessionId).toBe('replacement')
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
})
async function providerReady(page){
  await page.goto('/login.html?mode=provider&restore=1');await count(page,1)
  await reply(page,0,{sessionId:'rotated',accessToken:'rotated-access',refreshToken:'rotated-refresh'})
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible()
}
test('provider late logout preserves replacement storage and hides old workspace',async({page})=>{
  await providerReady(page);await page.getByRole('button',{name:'Sign out',exact:true}).click();await count(page,2)
  await page.evaluate(()=>{window.login.replace(true);window.login.reply(1,{ok:true})})
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
  expect((await stored(page)).sessionId).toBe('replacement')
})
test('provider normal logout uses its rotated identity and clears only its session',async({page})=>{
  await providerReady(page);await page.getByRole('button',{name:'Sign out',exact:true}).click();await count(page,2)
  expect(await page.evaluate(()=>window.login.requests[1].body)).toEqual({sessionId:'rotated',refreshToken:'rotated-refresh'})
  await reply(page,1,{ok:true});await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
  expect(await stored(page)).toBeNull()
})
test('provider focus invalidates an obsolete workspace without erasing replacement credentials',async({page})=>{
  await providerReady(page);await page.evaluate(()=>{window.login.replace();window.dispatchEvent(new Event('focus'))})
  await expect(page.getByRole('button',{name:'Sign out',exact:true})).toHaveCount(0)
  expect((await stored(page)).sessionId).toBe('replacement')
})
