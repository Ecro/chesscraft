import { type Page, expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * PLAN Phase 6 — the checks that need a real layout.
 *
 * Every assertion here is one jsdom structurally cannot make: a touch target is
 * a measured box, a focus ring is a computed style, and a layout shift is two
 * bounding boxes a paint apart. Putting them in a component test would produce
 * green results about nothing.
 *
 * The editor is excluded on purpose and by name. `Edit.tsx` holds more controls
 * than the rest of the app combined and every one of them fails these checks
 * today — but Phase 9 rebuilds that screen, so fixing its markup now means
 * doing it twice. The exclusion is written into the selectors rather than left
 * implicit, so a reader can see what is NOT covered without diffing scopes.
 */

const NON_EDITOR = '#root :is(nav, .home, .coach, .rules, .play) :is(button, select, [role="button"])'

async function reach(page: Page, where: 'home' | 'match' | 'rules' | 'lobby' | 'onboarding') {
  await page.goto('/')
  // 'onboarding' clears the suite-wide "already seen" flag rather than skipping
  // past the screen. The first version of this helper dismissed the coach marks
  // unconditionally, so their buttons shipped unmeasured behind a green "every
  // interactive element" test — the same hole would open if this reached the
  // title screen and called it onboarding.
  if (where === 'onboarding') {
    await page.evaluate(() => window.localStorage.clear())
    await page.reload()
    return
  }
  if (where === 'lobby') await page.getByTestId('start-match').click()
  if (where === 'match') await startMatch(page)
  // From the tab bar, which is where it lives now — reachable from every screen
  // rather than from one button on the home screen.
  if (where === 'rules') await page.getByTestId('tab-dex').click()
}

/** WCAG 2.5.5 / Apple HIG. 24px is the AA floor; this audience is children. */
const MIN_TARGET = 44

// The lobby joined the list because it is a whole screen the redesign added,
// and an unmeasured screen is exactly how a 30px control ships.
for (const where of ['onboarding', 'home', 'lobby', 'match', 'rules'] as const) {
  test(`every interactive element on the ${where} screen is at least ${MIN_TARGET}px (#27)`, async ({ page }) => {
    await reach(page, where)

    const small = await page.locator(NON_EDITOR).evaluateAll(
      (els, min) =>
        els
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect()
            return { id: el.getAttribute('data-testid') ?? el.textContent?.trim().slice(0, 16), w: Math.round(r.width), h: Math.round(r.height) }
          })
          .filter((b) => b.w < min || b.h < min),
      MIN_TARGET,
    )
    expect(small).toEqual([])
  })
}

test('every focusable control shows a visible ring when tabbed to (#28)', async ({ page }) => {
  await reach(page, 'match')

  // Focus is driven with Tab, not `.focus()`. `:focus-visible` — the modern way
  // to ring on keyboard focus without ringing on every mouse click — does NOT
  // apply to programmatic focus in Chromium, so the first version of this test
  // would have failed against a correct, WCAG-compliant implementation forever.
  // Tabbing engages the real heuristic, so either `:focus` or `:focus-visible`
  // satisfies it and the implementer picks.
  // Identify the targets up front, then tab until every one has been VISITED —
  // not a fixed number of presses. Pressing Tab exactly `count` times assumes
  // the tab order contains those elements and nothing else; one extra focusable
  // stop (a checkbox-based toggle, say — and this phase adds two new controls)
  // exhausts the budget early and leaves the tail unchecked while still
  // reporting green.
  const targets = await page.locator(NON_EDITOR).evaluateAll((els) =>
    els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el, i) => {
      const id = el.getAttribute('data-testid') ?? `${el.tagName}#${i}`
      el.setAttribute('data-focus-probe', id)
      return id
    }),
  )
  expect(targets.length, "the selector must actually match the app's controls").toBeGreaterThan(4)

  const visited = new Set<string>()
  const naked = new Set<string>()
  // Cap generously: the tab order legitimately contains stops we do not own.
  for (let i = 0; i < targets.length * 3 && visited.size < targets.length; i++) {
    await page.keyboard.press('Tab')
    const seen = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const probe = el.getAttribute('data-focus-probe')
      if (!probe) return null
      const s = getComputedStyle(el)
      const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2
      const hasShadow = s.boxShadow !== 'none' && s.boxShadow !== ''
      return { probe, ringed: hasOutline || hasShadow }
    })
    if (!seen) continue
    visited.add(seen.probe)
    if (!seen.ringed) naked.add(seen.probe)
  }

  // Both halves matter: nothing unringed, and nothing skipped.
  expect([...naked]).toEqual([])
  expect([...targets].filter((t) => !visited.has(t)), 'never reached by Tab').toEqual([])
})

test('the board is a grid to a screen reader, square by square (#29)', async ({ page }) => {
  await reach(page, 'match')

  await expect(page.getByTestId('board')).toHaveAttribute('role', 'grid')

  const squares = page.locator('[data-testid^="sq-"]')
  const labelled = await squares.evaluateAll((els) =>
    els.map((el) => ({
      id: el.getAttribute('data-testid'),
      label: el.getAttribute('aria-label') ?? '',
      // Legal-move state must be conveyed by something other than a colour.
      legal: el.getAttribute('data-legal'),
      disabled: el.getAttribute('aria-disabled'),
    })),
  )
  expect(labelled.length).toBe(36)
  expect(labelled.filter((s) => s.label.trim() === '')).toEqual([])

  // Past the draft first: AC-005 gates every board action until both players
  // have picked, so a click on a square during the draft does nothing at all
  // and "no legal squares" would be a fixture bug, not a finding.
  for (let i = 0; i < 4; i++) {
    const offer = page.locator('[data-testid^="offer-"]').first()
    if ((await offer.count()) === 0) break
    await offer.click()
  }

  // Select a piece, then assert its legal destinations are exposed as readable
  // state. The first version fetched `data-legal` and never asserted on it,
  // leaving the one clause about non-visual exposure unfalsifiable.
  await page.getByTestId('sq-d2').click()
  const marked = await squares.evaluateAll((els) =>
    els
      .filter((el) => el.getAttribute('data-legal') === 'true')
      .map((el) => ({ id: el.getAttribute('data-testid'), described: el.getAttribute('aria-label') ?? '' })),
  )
  expect(marked.length, 'a selected pawn must have somewhere to go').toBeGreaterThan(0)
  for (const m of marked) expect(m.described, `${m.id} says nothing about being reachable`).toMatch(/\S/)
})

test('an illegal tap does not move the board (#15)', async ({ page }) => {
  await reach(page, 'match')
  // Both hands are full the moment the draft ends; poking the other side's card
  // is refused, and the refusal used to be inserted above the board.
  for (let i = 0; i < 4; i++) {
    const offer = page.locator('[data-testid^="offer-"]').first()
    if ((await offer.count()) === 0) break
    await offer.click()
  }

  // The precondition, asserted rather than assumed: the first measurement was
  // taken while the draft panel was still on screen, so the 225px the board
  // "moved" was that panel unmounting — a fixture artefact reported as a layout
  // shift. The board is only stable once the draft is done.
  await expect(page.getByTestId('phase')).toHaveAttribute('data-phase', 'play')

  // DOCUMENT-relative, not viewport-relative. `boundingBox()` is measured from
  // the viewport, and clicking a control near the bottom of the page makes the
  // browser scroll it into view — which moved the reported y by 242px while the
  // layout was in fact untouched. Scrolling is not a layout shift.
  const boardTop = () =>
    page.evaluate(() => {
      const r = document.querySelector('[data-testid="board"]')!.getBoundingClientRect()
      return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY) }
    })

  const before = await boardTop()
  await page.locator('[data-testid^="hand-black-"]').first().click()
  await expect(page.getByTestId('rejection')).toBeVisible()
  const after = await boardTop()

  expect(after).toEqual(before)
})

test('declares one colour scheme, and the browser paints its chrome to match', async ({ page }) => {
  /*
   * This used to assert that an explicit `data-theme` beat the OS preference in
   * BOTH directions — the half that had been missing since Phase 1, when the CSS
   * honoured the attribute and nothing ever set it.
   *
   * Chess Craft is single-theme (see the header of `tokens.css`): the bevels are
   * what give every control its shape and there is no light-theme value for "the
   * lit edge of a raised block". The toggle is gone and so is the attribute, so
   * the old assertion would pin a control no one can reach.
   *
   * What replaces it is the failure that IS still reachable in a single-theme
   * app, and the one a half-migration leaves behind: an OS in light mode
   * repainting the scrollbar, the overscroll gutter and every native control
   * white around a dark app. `color-scheme: dark` is what prevents that, and
   * asserting the token file contains the line would not — the question is
   * whether it reaches the document.
   */
  await reach(page, 'match')

  const scheme = () => page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.emulateMedia({ colorScheme: 'light' })
  expect(await scheme(), 'the app must declare its scheme, whatever the OS prefers').toBe('dark')
  const inLight = await background()

  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await scheme()).toBe('dark')
  // The palette is one palette. An OS preference that changed the app's own
  // colours would mean a second theme had crept back in unmaintained.
  expect(await background(), 'the palette must not follow the OS').toBe(inLight)
})

test('the board flips without renaming its squares (#13)', async ({ page }) => {
  await reach(page, 'match')

  const order = () =>
    page.locator('[data-testid^="sq-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  const before = await order()
  // Back out in the tools row, where the redesign put it: flipping the board is
  // something two children reach for constantly on a shared phone, and it spent
  // one cycle behind a settings drawer because the row could not hold five
  // wrapping controls. It can hold five now that they are 11px labels in a fixed
  // strip. ADR-018 only ever required the control to exist and to be the
  // players' to reach.
  await page.getByTestId('flip-board').click()
  const after = await order()

  // The WHOLE sequence reversed. Checking only the first element passes for any
  // reordering at all, including a flip that reverses ranks but not files.
  expect(after).toEqual([...before].reverse())
  // The square keeps its name — a flip is a view, not a re-coordinate. Every
  // other spec addresses squares by testid and would break otherwise.
  await expect(page.getByTestId('sq-a1')).toHaveCount(1)
  await expect(page.getByTestId('sq-f6')).toHaveCount(1)
})
