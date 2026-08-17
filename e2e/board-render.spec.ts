import { expect, test } from '@playwright/test'
import { bundledContentSource } from '../src/content/sets/bundled'
import { makeTranslate } from '../src/ui/i18n'
import { startMatch } from './nav'

/** Bundle-only: this spec drives the shipped content, which declares no overlay. */
const translate = makeTranslate()

/**
 * PLAN Phase 4's exit criterion, after real layout and paint.
 *
 * The component tests assert `textContent`, which is blind to two things a
 * browser is not: a coordinate injected through CSS `content:` on a pseudo
 * element (a normal way to label a compact board edge, and invisible to the DOM
 * text the jsdom test reads), and a glyph that renders but cannot be seen —
 * because its colour matches the square, or because the font has no such
 * character and paints tofu. Both are exactly the defects "renders a glyph, not
 * a blank square" and "no coordinate text in squares" exist to catch.
 */

/** Onboarding is dismissed suite-wide by the config's `storageState`. */
async function openBoard(page: import('@playwright/test').Page) {
  await page.goto('/')
  await startMatch(page)
}

test('every occupied square shows exactly one raster image after layout', async ({ page }) => {
  await openBoard(page)

  const occupied = page.locator('[data-testid^="sq-"]:not([data-piece=""])')
  const count = await occupied.count()
  expect(count).toBe(24) // the Los Alamos array

  // IDENTITY, not grapheme count. Counting looked discriminating until you check
  // the fixture: '왕' (king) and '성' (rook) are already one grapheme, so six of
  // these twenty-four squares would pass with the OLD name rendering untouched —
  // an incomplete edit to bundled.ts that missed those two entries would ship
  // behind a green test. The adjacent unit test had already learned this against
  // the slice fixture; the lesson did not get carried across, which is the whole
  // reason it is written down here.
  //
  // Since the redesign a piece is a bundled IMAGE, so the claim inverts: the
  // square must carry a drawing and no text at all. A grapheme here would mean the art
  // failed to resolve and the monogram fallback quietly caught it — which is
  // exactly the silent degradation `art-key.test.ts` exists to make loud.
  const declaresArt = (pieceId: string) => {
    const def = (bundledContentSource.pieces as Array<{ id: string; artKey?: string }>).find((p) => p.id === pieceId)
    if (!def) throw new Error(`no such piece in the bundle: ${pieceId}`)
    return Boolean(def.artKey)
  }

  for (let i = 0; i < count; i++) {
    const sq = occupied.nth(i)
    const id = await sq.getAttribute('data-testid')
    const pieceId = (await sq.getAttribute('data-piece')) ?? ''
    expect(declaresArt(pieceId), `${pieceId} declares no art`).toBe(true)
    // Post-layout, so this also fails for a sprite that is in the DOM and not
    // displayed — the half a textContent read cannot see.
    expect((await sq.innerText()).trim(), `${id} (${pieceId}) still renders text`).toBe('')
    expect(await sq.locator('.piece img.image-mark').count(), `${id} (${pieceId}) draws no raster art`).toBe(1)
  }
})

test('a piece stays legible on the checker\'s DARK square (#41)', async ({ page }) => {
  await openBoard(page)

  // The first version compared `color` to `backgroundColor` for inequality on
  // `.first()`. That could not fail — the side tokens never equalled the board
  // token — and it was vacuous on painted squares anyway, whose gradient leaves
  // `backgroundColor` transparent. The property this phase actually introduces
  // is a SECOND square colour, so what matters is whether a piece survives it.
  // EVERY occupied dark square, not `.first()`. The first version bound to a6 —
  // a rook — because it is first in DOM order, so the one glyph that could not
  // pass (the archer at e1/e6, an emoji that ignores `color`) was never sampled
  // and the defect would have shipped behind a green test.
  const probes = page.locator('[data-testid^="sq-"][data-parity="1"][data-square-type=""]:not([data-piece=""])')
  const n = await probes.count()
  expect(n).toBeGreaterThan(1)

  const ratios = await probes.evaluateAll((els) =>
    els.map((el) => {
    const parse = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const s = (v ?? 0) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!)
    }
      const piece = (el.querySelector('.piece') ?? el) as Element
      const st = getComputedStyle(piece)
      const bg = lum(parse(getComputedStyle(el).backgroundColor))
      const against = (c: string) => {
        const x = lum(parse(c))
        const [hi, lo] = x > bg ? [x, bg] : [bg, x]
        return (hi + 0.05) / (lo + 0.05)
      }
      // Phase 6a outlined the glyph, which changed what "legible" measures: the
      // eye reads the EDGE against the square, so the fill is free to carry hue
      // and the board is free to be a board. Measuring the bare fill — this
      // test's previous model — now under-reports every piece. The full
      // three-way constraint lives in `e2e/contrast.spec.ts`; this stays as a
      // guard on the dark square specifically.
      const outline = st.textShadow !== 'none' ? (st.textShadow.match(/rgba?\([^)]+\)/)?.[0] ?? '') : ''
      const ratio = Math.max(against(st.color), outline ? against(outline) : 0)
      return { id: el.getAttribute('data-testid'), piece: el.getAttribute('data-piece'), ratio }
    }),
  )
  // 3:1 is the non-text floor; a piece glyph is a graphical object at this size.
  for (const r of ratios) expect(r.ratio, `${r.id} (${r.piece})`).toBeGreaterThanOrEqual(3)
})

test('no square carries its coordinate, including through CSS content', async ({ page }) => {
  await openBoard(page)

  const leaks = await page.locator('[data-testid^="sq-"]').evaluateAll((els) =>
    els
      .map((el) => {
        const coord = (el.getAttribute('data-testid') ?? '').replace('sq-', '')
        const pseudo = ['::before', '::after']
          .map((p) => getComputedStyle(el, p).content)
          .join(' ')
        const text = `${(el as HTMLElement).innerText} ${pseudo}`
        return coord && text.includes(coord) ? coord : ''
      })
      .filter(Boolean),
  )
  expect(leaks).toEqual([])
})

test('the two square colours actually differ on screen (#41)', async ({ page }) => {
  await openBoard(page)
  const colours = await page.locator('[data-testid^="sq-"]').evaluateAll((els) => {
    const byParity: Record<string, string> = {}
    for (const el of els) {
      const p = el.getAttribute('data-parity') ?? ''
      byParity[p] = getComputedStyle(el).backgroundColor
    }
    return byParity
  })
  expect(Object.keys(colours).sort()).toEqual(['0', '1'])
  // Inequality was the first version and it passed at 1.27:1 — two different
  // strings describing a board a child reads as flat, which is the same defect
  // as the painted-square gradient (#42). The floor is a luminance step.
  const step = await page.evaluate((c: Record<string, string>) => {
    const parse = (s: string) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    const lum = (v: number[]) => {
      const f = (x: number) => {
        const s = (x ?? 0) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(v[0]!) + 0.7152 * f(v[1]!) + 0.0722 * f(v[2]!)
    }
    const a = lum(parse(c['0']!))
    const b = lum(parse(c['1']!))
    const [hi, lo] = a > b ? [a, b] : [b, a]
    return (hi + 0.05) / (lo + 0.05)
  }, colours)
  // Not 3:1. Measured trade-off: a 3:1 checker drives the tinted glyphs standing
  // on it under 3:1 themselves, and an unreadable piece beats an unreadable
  // board. Recorded for Phase 6 with the numbers.
  expect(step).toBeGreaterThanOrEqual(1.5)
})

test('the edge rails label the board the squares no longer do', async ({ page }) => {
  await openBoard(page)
  // `ContentSource.boards` is the raw pre-validation shape, so the dimensions
  // are read through a narrow cast rather than assumed on an unknown.
  const board = bundledContentSource.boards[0] as { width: number; height: number } | undefined
  expect(board, 'the bundle must ship a board').toBeTruthy()

  const files = (await page.getByTestId('board-files').innerText()).replace(/\s+/g, '')
  const ranks = (await page.getByTestId('board-ranks').innerText()).replace(/\s+/g, '')
  expect(files.length).toBe(board!.width)
  expect(ranks.length).toBe(board!.height)
})
