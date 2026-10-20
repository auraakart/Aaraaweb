import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Exercise the real migrated route components against the existing isolated
// fixture API, including the details exposed through queue selection.
const routes = [
  { key: 'helpdesk', title: 'Helpdesk operations', ready: 'Lift maintenance follow-up' },
  { key: 'privacy', title: 'Privacy request operations', ready: 'Request a copy of account data' },
  { key: 'facilities', title: 'Facilities operations', ready: 'Operations summary' },
  { key: 'documents', title: 'Society document repository', ready: 'Community maintenance policy' },
  { key: 'occupancy', title: 'Move-in & move-out', ready: 'MOVE OUT', detail: 'Operational handover evidence' },
  { key: 'finance', title: 'Finance workspace', ready: 'INV-2026-09-001' },
  { key: 'governance', title: 'Governance workspace', ready: 'September committee review', detail: 'Reviewed maintenance, collections and resident communications.' },
]

for (const route of routes) {
  for (const dark of [false, true]) {
    for (const scale of [1, 2]) {
      test(`V4.99.3 compact ${route.key} dark=${dark} scale=${scale}`, async ({ page }, testInfo) => {
        const runtimeErrors = []
        page.on('pageerror', error => runtimeErrors.push(error.message))
        // Zooming 640 CSS pixels by 2 exercises the same 320px reflow with
        // doubled content; the independent unzoomed case uses a real 320px viewport.
        await page.setViewportSize({ width: 320 * scale, height: 900 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(`/migrations.html?route=${route.key}`)
        await expect(page.getByRole('heading', { level: 1, name: route.title, exact: true })).toBeVisible()
        await expect(page.getByText(route.ready, { exact: false }).first()).toBeVisible()
        if (route.detail) {
          await page.getByRole('button').filter({ hasText: route.ready }).first().click()
          await expect(page.getByText(route.detail, { exact: true })).toBeVisible()
        }
        await page.evaluate(({ dark, scale }) => {
          document.documentElement.dataset.adminTheme = dark ? 'dark' : 'light'
          document.documentElement.style.zoom = String(scale)
        }, { dark, scale })
        await expect(page.getByRole('main')).toHaveCount(1)
        const layout = await page.evaluate(() => ({
          viewport: innerWidth,
          scroll: document.documentElement.scrollWidth,
          overflowing: [...document.querySelectorAll('main *')].flatMap(el => {
            const box = el.getBoundingClientRect()
            if (box.width === 0 || (box.right <= innerWidth + 1 && box.left >= -1)) return []
            return [{ tag: el.tagName, text: el.textContent?.slice(0, 70),
              right: Math.round(box.right), width: Math.round(box.width),
              style: el.getAttribute('style'), className: el.className }]
          }).slice(0, 15),
        }))
        expect(layout.scroll, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewport)
        const controls = page.getByRole('main').locator(
          'button:enabled:visible, input:enabled:visible, select:enabled:visible, textarea:enabled:visible, a[href]:visible',
        )
        expect(await controls.count()).toBeGreaterThan(1)
        const first = controls.first()
        await first.focus()
        await expect(first).toBeFocused()
        await page.keyboard.press('Tab')
        expect(await page.evaluate(() => {
          const active = document.activeElement
          return active instanceof HTMLElement && !!active.closest('main') &&
            active !== document.body && active.getBoundingClientRect().width > 0
        })).toBe(true)
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
        expect(axe.violations).toEqual([])
        expect(runtimeErrors).toEqual([])
        if (route.key === 'finance') {
          expect(await page.evaluate(() => window.financeRequests.filter(request => request.method !== 'GET'))).toEqual([])
        }
        await page.screenshot({
          path: testInfo.outputPath(`v4.99.3-${route.key}-${dark ? 'dark' : 'light'}-${scale}x.png`),
          fullPage: true,
        })
      })
    }
  }
}
