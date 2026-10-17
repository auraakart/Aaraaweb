import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test('domain owner can register and proof clears on partner switch', async ({ page }) => {
  await page.goto('/domains.html'); await expect(page.getByRole('heading', { name: 'portal.alpha.in', exact: true })).toBeVisible()
  await page.getByLabel('Domain hostname', { exact: true }).fill('extra.alpha.in'); await page.getByRole('button', { name: 'Register domain', exact: true }).click()
  await expect(page.getByLabel('DNS TXT record name')).toHaveValue('_aaraagate-challenge.extra.alpha.in')
  await expect(page.getByLabel('DNS TXT record value')).toHaveValue('aaraagate-domain-verification=' + 'a'.repeat(64))
  expect(await page.evaluate(() => Object.values(sessionStorage).some(value => value.includes('aaraagate-domain-verification=')))).toBe(false)
  await page.getByLabel('Partner workspace', { exact: true }).selectOption('22222222-2222-4222-8222-222222222222')
  await expect(page.getByRole('heading', { name: 'portal.beta.in', exact: true })).toBeVisible(); await expect(page.getByLabel('DNS TXT record value')).toHaveCount(0)
})
test('non-owner never requests domain enumeration or sees writes', async ({ page }) => {
  await page.goto('/domains.html?role=COMMERCIAL_ADMIN'); await expect(page.getByText('Partner owner access required', { exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.domainRequests)).some(value => value.path.endsWith('/domains'))).toBe(false)
  await expect(page.getByRole('button', { name: 'Register domain', exact: true })).toHaveCount(0)
})
test('stale domain read cannot restore data after logout', async ({ page }) => {
  await page.goto('/domains.html?stale'); await expect(page.getByLabel('Partner workspace', { exact: true })).toBeVisible()
  await page.evaluate(() => { sessionStorage.removeItem('aaraagate.partner.session'); window.dispatchEvent(new Event('storage')) })
  await expect(page.getByText('Sign in to continue', { exact: true })).toBeVisible(); await page.waitForTimeout(400)
  await expect(page.getByRole('heading', { name: 'portal.alpha.in', exact: true })).toHaveCount(0)
})
test('uncertain registration retries preserve idempotency key', async ({ page }) => {
  await page.goto('/domains.html?retry'); await page.getByLabel('Domain hostname', { exact: true }).fill('extra.alpha.in')
  await page.getByRole('button', { name: 'Register domain', exact: true }).click(); await expect(page.getByText('Connection lost', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Register domain', exact: true }).click(); await expect(page.getByLabel('DNS TXT record value')).toBeVisible()
  const writes = await page.evaluate(() => window.domainRequests.filter(value => value.body))
  expect(writes).toHaveLength(2); expect(writes[0].body.idempotencyKey).toBe(writes[1].body.idempotencyKey)
})
test('revoke requires reason and confirmation and carries current version', async ({ page }) => {
  await page.goto('/domains.html'); const revoke = page.getByRole('button', { name: 'Revoke portal.alpha.in', exact: true })
  await expect(revoke).toBeDisabled(); await page.getByLabel('Reason for revocation or proof replacement').fill('Ownership changed')
  await revoke.click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible()
  const write = (await page.evaluate(() => window.domainRequests.filter(value => value.body)))[0]
  expect(write.body.expectedVersion).toBe(1); expect(write.body.reason).toBe('Ownership changed')
})
test('domain denial removes mutation controls and page is accessible', async ({ page }) => {
  await page.goto('/domains.html?denied'); await expect(page.getByText('Domain management unavailable', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Register domain', exact: true })).toHaveCount(0)
  await page.goto('/domains.html'); await expect(page.getByRole('heading', { name: 'portal.alpha.in', exact: true })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
test('pending confirmation cannot mutate after logout', async ({ page }) => {
  await page.goto('/domains.html'); await page.getByLabel('Reason for revocation or proof replacement').fill('Ownership changed')
  await page.getByRole('button', { name: 'Revoke portal.alpha.in', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => { sessionStorage.removeItem('aaraagate.partner.session'); window.dispatchEvent(new Event('storage')) })
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('Sign in to continue', { exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.domainRequests)).some(value => value.body)).toBe(false)
})
test('DNS verification submits exact claim proof without implying routing activation', async ({ page }) => {
  await page.goto('/domains.html'); await page.getByLabel('DNS proof for portal.alpha.in', { exact: true }).fill('a'.repeat(64))
  await page.getByRole('button', { name: 'Verify portal.alpha.in', exact: true }).click()
  await expect(page.getByText('DNS proof verified', { exact: true })).toBeVisible()
  await expect(page.getByText('DNS proof recorded. Production routing remains inactive.', { exact: true })).toBeVisible()
  const write = (await page.evaluate(() => window.domainRequests.filter(value => value.body)))[0]
  expect(write.path).toContain('/33333333-3333-4333-8333-333333333333/verify'); expect(write.body.challenge).toBe('a'.repeat(64))
})
