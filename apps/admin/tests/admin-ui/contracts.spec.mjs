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
  // The drawer's .open interaction state must never inherit a danger badge background.
  expect(colours.drawer.bg).toBe('rgb(20, 39, 48)')
  expect(colours.drawerLink.bg).toBe('rgb(12, 25, 33)')
  expect(colours.input.bg).toBe('rgb(20, 39, 48)')
  await expect(page.getByRole('button', { name: 'Save assignment' })).toBeEnabled()
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(axe.violations).toEqual([])
  await page.screenshot({ path: testInfo.outputPath('admin-core-dark-preview.png'), fullPage: true })
})


test('opt-in dark preview preserves legacy operational surfaces and status meaning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.evaluate(() => {
    document.documentElement.dataset.adminTheme = 'dark'
    const fixture = document.createElement('section')
    fixture.id = 'legacy-dark-surface-check'
    fixture.innerHTML = `
      <div class="panel"><button class="row">Household request</button></div>
      <div class="choices"><button>Choose reviewer</button></div>
      <div class="toolbar"><button>Apply filter</button></div>
      <div class="buttons"><button>Review request</button></div>
      <label>Reference <input aria-label="Legacy reference" value="AGR-2026"></label>
      <label>State <select aria-label="Legacy state"><option>Open</option></select></label>
      <span class="badge urgent">Urgent</span>
      <span class="badge in_progress">In progress</span>
      <span class="badge resolved">Resolved</span>
    `
    document.body.append(fixture)
  })
  const colours = await page.evaluate(() => {
    const resolve = selector => {
      const el = document.querySelector('#legacy-dark-surface-check ' + selector)
      if (!el) throw new Error('Missing legacy selector: ' + selector)
      const value = getComputedStyle(el)
      return { background: value.backgroundColor, color: value.color }
    }
    return {
      panel: resolve('.panel'),
      row: resolve('.row'),
      choice: resolve('.choices button'),
      input: resolve('input'),
      select: resolve('select'),
      urgent: resolve('.urgent'),
      inProgress: resolve('.in_progress'),
      resolved: resolve('.resolved'),
    }
  })
  for (const name of ['panel', 'row', 'choice', 'input', 'select']) {
    expect(colours[name].background).toBe('rgb(20, 39, 48)')
  }
  expect(colours.urgent.background).toBe('rgb(72, 40, 41)')
  expect(colours.inProgress.background).toBe('rgb(70, 55, 25)')
  expect(colours.resolved.background).toBe('rgb(23, 61, 71)')
  expect(colours.urgent.color).not.toBe(colours.inProgress.color)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Choose reviewer' }).click()
  await expect(page.getByRole('button', { name: 'Choose reviewer' })).toBeEnabled()
})

test('V4.99.3 mobile Admin navigation keeps role links visible by scrolling instead of wrapping', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('/')
  await page.evaluate(() => {
    const aside = document.createElement('aside')
    aside.className = 'sidebar'
    aside.innerHTML = '<nav class="nav" aria-label="Admin sections">' +
      ['Overview', 'Residents', 'Gates', 'Workforce', 'Marketplace', 'SOS', 'Helpdesk', 'Notices', 'Billing', 'Branding']
        .map((name, index) => '<button type="button"' + (index === 0 ? ' class="active" aria-current="page"' : '') + '>' + name + '</button>')
        .join('') + '</nav>'
    document.body.append(aside)
  })
  const nav = page.getByRole('navigation', { name: 'Admin sections' })
  const links = nav.getByRole('button')
  await expect(links).toHaveCount(10)
  await expect(nav.getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  const before = await nav.evaluate(el => ({ client: el.clientWidth, scroll: el.scrollWidth, wrap: getComputedStyle(el).flexWrap }))
  expect(before.scroll).toBeGreaterThan(before.client)
  expect(before.wrap).toBe('nowrap')
  const first = await links.first().boundingBox()
  const last = await links.last().boundingBox()
  expect(Math.abs(first.y - last.y)).toBeLessThan(8)
  await links.last().focus()
  expect(await nav.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(links.last()).toBeFocused()
})

for (const dark of [false, true]) {
  test(`V4.99.3 active Admin navigation is readable in dark=${dark}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 840 })
    await page.goto('/')
    await page.evaluate(darkMode => {
      document.documentElement.dataset.adminTheme = darkMode ? 'dark' : 'light'
      const aside = document.createElement('aside')
      aside.className = 'sidebar'
      aside.innerHTML = '<nav class="nav" aria-label="Admin sections"><button type="button" class="active" aria-current="page">Overview</button><button type="button">Residents</button></nav>'
      document.body.append(aside)
    }, dark)
    const active = page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Overview' })
    const colors = await active.evaluate(el => {
      const style = getComputedStyle(el)
      return { foreground: style.color, background: style.backgroundColor }
    })
    const luminance = cssColor => {
      const values = cssColor.match(/\d+/g)?.slice(0, 3).map(Number)
      if (!values || values.length !== 3) throw new Error('Unresolved active-navigation color: ' + cssColor)
      const linear = values.map(value => {
        const s = value / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
    }
    const a = luminance(colors.foreground), b = luminance(colors.background)
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
    await expect(active).toHaveAttribute('aria-current', 'page')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
