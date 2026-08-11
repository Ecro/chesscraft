import { expect, test } from '@playwright/test'

/**
 * No button's label is cut off (PLAN-button-label-truncation).
 *
 * `tests/ui/button-label-fit.test.ts` is the cheap half — it reads the stylesheet text and
 * proves the four rule shapes that cause clipping are absent. It cannot prove a label FITS,
 * and the PLAN says so (ADR-004). This is the half that measures.
 *
 * THE VIEWPORT IS THE POINT. The reported defect — the bottom of `놀러 가기` cut off — does
 * NOT reproduce at 390x844 or at any of the three viewports the Playwright projects use. It
 * needs a screen short enough that `.home`'s column overruns the shell, because only then does
 * the browser shrink its flex items (which it does BEFORE engaging `.home`'s own
 * `overflow-y: auto`), driving the button from its 70.8px natural height down onto the 44px
 * `min-height` floor — a 2px content box under a 28.8px line box. Measured at 360x560 with the
 * fix reverted: 52.2px and clipped. With the fix: 70.8px and not clipped.
 *
 * So a suite that only ever looks at tall phones cannot see this class of defect at all, which
 * is why `e2e/a11y.spec.ts` stayed green throughout — its floor is `>= 44px`, and 44px IS the
 * clipped state.
 */

/** Short enough that the home column overruns the shell — the condition the defect needs. */
const CRAMPED = { width: 360, height: 560 }

type Bad = { label: string; height: number; needed: number; vClip: boolean; hClip: boolean }

// An IIFE, not an arrow: `page.evaluate` given a STRING evaluates it as an expression, so a
// bare arrow would serialise as `undefined` and every sweep below would silently find nothing.
const SCAN = `(() => [...document.querySelectorAll('button')]
  .filter((b) => b.offsetParent !== null && b.textContent.trim().length > 0)
  .map((b) => {
    const cs = getComputedStyle(b)
    const r = b.getBoundingClientRect()
    const lh = parseFloat(cs.lineHeight) || 0
    const needed = lh + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) * 2
    return {
      label: b.textContent.trim().slice(0, 24),
      height: Math.round(r.height * 10) / 10,
      needed: Math.round(needed * 10) / 10,
      vClip: b.scrollHeight > b.clientHeight + 1,
      hClip: b.scrollWidth > b.clientWidth + 1,
    }
  })
  .filter((x) => x.vClip || x.hClip || x.height + 0.5 < x.needed))()`

async function reachHome(page: import('@playwright/test').Page) {
  await page.goto('/')
  const skip = page.getByRole('button', { name: '건너뛰기' })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  await expect(page.getByTestId('start-match')).toBeVisible()
}

test.describe('button labels are not clipped', () => {
  test.use({ viewport: CRAMPED })

  test('the home column overruns the shell here — otherwise this file measures nothing', async ({ page }) => {
    await reachHome(page)
    const overruns = await page.evaluate(() => {
      const home = document.querySelector('.home')!
      return home.scrollHeight > home.clientHeight
    })
    expect(
      overruns,
      'the home column no longer overruns at this viewport, so the shrink path is unreachable and ' +
        'every assertion below passes for the wrong reason — pick a shorter viewport',
    ).toBe(true)
  })

  test('start-match renders at its full natural height, not squeezed onto the min-height floor', async ({ page }) => {
    await reachHome(page)
    const m = await page.getByTestId('start-match').evaluate((b) => {
      const cs = getComputedStyle(b)
      const needed =
        parseFloat(cs.lineHeight) +
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) * 2
      return {
        height: b.getBoundingClientRect().height,
        needed,
        floor: parseFloat(cs.minHeight),
        clipped: b.scrollHeight > b.clientHeight,
      }
    })
    expect(m.clipped, 'the label is clipped').toBe(false)
    expect(m.height, 'the button was squeezed below the height its own text needs').toBeGreaterThanOrEqual(
      m.needed - 0.5,
    )
    // The floor is not the fit. Pinning this keeps the assertion above meaningful if the
    // tokens ever move: 44px was the clipped state, so landing ON the floor is the failure.
    expect(m.height).toBeGreaterThan(m.floor)
  })

  test('no visible button on any screen has a clipped label', async ({ page }) => {
    await reachHome(page)
    const seen: string[] = []
    const tabs = page.locator('.tabbar .tab')
    const count = await tabs.count()
    expect(count, 'no tabs found — the sweep would cover one screen').toBeGreaterThan(1)

    const bad: Array<{ where: string; found: Bad[] }> = []
    bad.push({ where: 'home', found: (await page.evaluate(SCAN)) as Bad[] })
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i)
      const where = (await tab.textContent())?.trim() ?? `tab-${i}`
      await tab.click()
      await page.waitForTimeout(300)
      seen.push(where)
      bad.push({ where, found: (await page.evaluate(SCAN)) as Bad[] })
    }

    expect(seen.length, 'the sweep visited no tab').toBeGreaterThan(1)
    expect(bad.filter((b) => b.found.length > 0)).toEqual([])
  })

  /**
   * The tab sweep above reaches four screens and misses the two families this change squeezed
   * hardest. `.match-tools` exists only during a match and `.build-steps` only inside the room
   * builder — both were moved to the 5px dense tier precisely because an 11px one would have
   * cost them too much label width, so they are the rules most likely to clip, and no tab click
   * ever renders either of them. Found by a cross-model reviewer, not by the sweep.
   */
  test('the match tools row — five to six 9px labels sharing one row', async ({ page }) => {
    await reachHome(page)
    await page.getByTestId('start-match').click()
    await expect(page.getByTestId('lobby')).toBeVisible()
    await page.getByTestId('lobby-start').click()
    await expect(page.getByTestId('board')).toBeVisible()

    const tools = await page.locator('.match-tools button').count()
    expect(tools, 'no match-tools buttons rendered — this test is measuring nothing').toBeGreaterThan(3)
    expect(await page.evaluate(SCAN)).toEqual([])

    // Two more dense-row buttons (haptics, seed) live behind the settings drawer.
    const settings = page.getByTestId('match-settings')
    if (await settings.isVisible().catch(() => false)) {
      await settings.click()
      await page.waitForTimeout(250)
      expect(await page.evaluate(SCAN)).toEqual([])
    }
  })

  test('the build steps strip — five 9px labels, one per step', async ({ page }) => {
    await reachHome(page)
    await page.getByTestId('tab-edit').click()
    // Whatever room the SHIPPED document happens to deal first — not a seeded fixture id.
    // A test that injects its own room measures a document no player has.
    const firstRoom = page.locator('[data-testid^="room-open-"]').first()
    await expect(firstRoom).toBeVisible()
    await firstRoom.click()

    const steps = await page.locator('.build-steps button').count()
    expect(steps, 'no build-steps buttons rendered — this test is measuring nothing').toBeGreaterThan(3)

    let visited = 0
    for (const step of ['board', 'pieces', 'place', 'cards', 'name']) {
      const tab = page.getByTestId(`room-step-${step}`)
      if (!(await tab.isVisible().catch(() => false))) continue
      await tab.click()
      await page.waitForTimeout(250)
      visited++
      expect(await page.evaluate(SCAN), `clipped label on build step "${step}"`).toEqual([])
    }
    expect(visited, 'no build step was opened — the loop matched nothing').toBeGreaterThan(3)
  })
})
