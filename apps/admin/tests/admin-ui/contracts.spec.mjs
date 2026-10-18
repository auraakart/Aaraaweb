import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

test.beforeEach(async ({ page }) => { await page.goto('/') })

test('native form semantics, refs, errors and pending submission', async ({ page }) => {
  const assignee = page.getByRole('textbox', { name: 'Assignee', exact: true })
  await page.getByRole('button', { name: 'Save assignment', exact: true }).click()
  await expect(page.getByText('Submissions: 0')).toBeVisible()
  await assignee.fill('Reviewer')
  await page.getByRole('textbox', { name: 'Internal note' }).fill('Keep this value on error')
  await page.getByRole('button', { name: 'Validate reviewer' }).click()
  await expect(assignee).toBeFocused()
  await expect(assignee).toHaveAttribute('aria-invalid', 'true')
  const descriptions = await assignee.getAttribute('aria-describedby')
  expect(descriptions.split(' ')).toHaveLength(3)
  for (const id of descriptions.split(' ')) expect(await page.evaluate(id => !!document.getElementById(id), id)).toBe(true)
  await expect(page.getByText('Submissions: 0')).toBeVisible()
  await page.getByRole('button', { name: 'Save assignment', exact: true }).dblclick()
  await expect(page.getByText('Submissions: 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Saving assignment…' })).toBeDisabled()
  await page.getByRole('button', { name: 'Finish request' }).click()
  await expect(page.getByRole('textbox', { name: 'Internal note' })).toBeFocused()
  await expect(page.getByRole('textbox', { name: 'Internal note' })).toHaveValue('Keep this value on error')
  await page.getByRole('button', { name: 'Focus priority' }).click()
  await expect(page.getByRole('combobox', { name: 'Priority', exact: true })).toBeFocused()
})

test('loading and failure suppress stale content and readiness', async ({ page }) => {
  await expect(page.getByRole('region', { name: 'Failed readiness' }).getByText('READY', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Loading readiness' }).getByText('READY', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Unknown readiness' })).toContainText('Readiness unavailable')
  await page.getByLabel('Preview state').selectOption('loading')
  await expect(page.getByRole('region', { name: 'Selected ticket' })).toHaveAttribute('aria-busy', 'true')
  await expect(page.getByRole('button', { name: 'Save assignment' })).toHaveCount(0)
  await expect(page.getByText('No matching tickets')).toHaveCount(0)
  await page.getByLabel('Preview state').selectOption('error')
  await expect(page.getByRole('alert').first()).toContainText('Queue unavailable')
  await page.getByRole('button', { name: 'Retry queue' }).click()
  await expect(page.getByRole('button', { name: 'Save assignment', exact: true })).toBeVisible()
  await page.getByLabel('Preview state').selectOption('empty')
  await expect(page.getByText('No matching tickets')).toBeVisible()
  await expect(page.getByText('Select a ticket', { exact: true })).toBeVisible()
})

test('keyboard selection and destructive confirmation stay controlled by the caller', async ({ page }) => {
  const ticket = page.getByRole('button', { name: 'Ticket B with a long description for narrow screens' })
  await ticket.focus()
  await page.keyboard.press('Enter')
  await expect(ticket).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Selected ticket' })).toContainText('Ticket B with a long description')
  const danger = page.getByRole('button', { name: 'Execute erasure' })
  await expect(danger).toBeDisabled()
  await page.getByLabel('I reviewed the erasure plan').check()
  await danger.focus()
  await page.keyboard.press('Space')
  await expect(page.getByText('Erasure requested')).toBeVisible()
  await expect(danger).toBeDisabled()
  await expect(page.getByRole('list', { name: 'Activity history' }).getByRole('listitem').first()).toContainText('Assigned')
  await expect(page.getByText('Not recorded', { exact: true })).toBeVisible()
  await expect(page.getByText('Unmapped state', { exact: true })).toBeVisible()
})

for (const width of [360, 768, 1440]) {
  test(`accessible and responsive at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(results.violations).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    for (const button of await page.getByRole('button').all()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(48)
    await page.screenshot({ path: testInfo.outputPath(`admin-ui-${width}.png`), fullPage: true })
  })
}

test('focus, reduced motion and 200 percent scale preserve usable content', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const button = page.getByRole('button', { name: 'Save assignment', exact: true })
  await button.focus()
  expect(await button.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid')
  expect(await button.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  // CSS zoom exercises doubled layout size; the 360px case independently covers narrow reflow.
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('textbox', { name: 'Assignee', exact: true }).fill('Zoom reviewer')
  await button.click()
  await expect(page.getByText('Submissions: 1')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('admin-ui-200-percent.png'), fullPage: true })
})

test('legacy operational controls and navigation honor reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Exercise the existing application classes, including standalone workspaces.
  await page.evaluate(() => {
    const fixture = document.createElement('div')
    fixture.innerHTML = '<nav class="nav"><button>Operational navigation</button></nav><div class="actions"><button>Operational action</button></div><div class="notice">Notice preview</div><aside class="managementNavPanel open"><div class="managementNavLinks"><a href="#workspace">Workspace link</a></div></aside>'
    document.body.append(fixture)
  })
  for (const selector of ['.nav button', '.actions button', '.notice', '.managementNavPanel', '.managementNavLinks a']) {
    const item = page.locator(selector).last()
    expect(await item.evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s')
  }
  const navigation = page.getByRole('button', { name: 'Operational navigation' })
  await navigation.hover()
  expect(await navigation.evaluate(el => getComputedStyle(el).transform)).toBe('none')
  expect((await navigation.boundingBox()).height).toBeGreaterThanOrEqual(48)
})


test('opt-in admin dark preview keeps shared and legacy surfaces legible without changing workflows', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 960, height: 900 })
  await page.evaluate(() => { document.documentElement.dataset.adminTheme = 'dark' })
  await expect(page.getByRole('heading', { name: 'Admin component reference' })).toBeVisible()
  const colours = await page.evaluate(() => {
    const computed = selector => {
      const element = document.querySelector(selector)
      if (!element) throw new Error('Missing admin fixture selector: ' + selector)
      const s = getComputedStyle(element)
      return { bg: s.backgroundColor, text: s.color }
    }
    const drawer = document.createElement('aside')
    drawer.className = 'managementNavPanel open'
    drawer.innerHTML = '<div class="managementNavHeader"><strong>Workspaces</strong></div><div class="managementNavLinks"><a href="#workspace">Helpdesk</a></div>'
    document.body.append(drawer)
    return {
      body: computed('body'),
      queue: computed('[aria-label="Prioritized queue"]'),
      drawer: computed('.managementNavPanel'),
      drawerLink: computed('.managementNavLinks a'),
      input: computed('input:not([type="checkbox"])'),
      action: computed('button[type="submit"]'),
    }
  })
  expect(colours.body.bg).toBe('rgb(12, 25, 33)')
  expect(colours.queue.bg).toBe('rgb(20, 39, 48)')
  expect(colours.drawer.bg).toBe('rgb(20, 39, 48)')
  expect(colours.drawerLink.bg).toBe('rgb(12, 25, 33)')
  expect(colours.input.bg).toBe('rgb(20, 39, 48)')
  await expect(page.getByRole('button', { name: 'Save assignment' })).toBeEnabled()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('admin-core-dark-preview.png'), fullPage: true })
})
