import { expect, test } from '@playwright/test'
import { startMatch } from './nav'

/**
 * PLAN Phase 6 — the three-way contrast constraint, measured on screen.
 *
 * Three items arrived here from three separate reviews, and they are one piece
 * of work rather than three: the painted-square fill (#42), the piece glyphs,
 * and the checker all compete for the same axis. Phase 4 measured the trade —
 * a dark square at #b8ab90 gives a 1.97:1 checker and drops the tinted glyphs to
 * ≈2.9:1 — and chose piece legibility, leaving the checker weak and #42 open.
 * An outline on the glyph is what decouples them: once a piece carries its own
 * contrast, the board is free to be a board.
 *
 * So this file asserts all three at once. Any future change to one of those
 * colours has to keep the other two above their floors or this goes red, which
 * is the only way the table stops being a comment that drifts.
 */

const AA_NON_TEXT = 3 // WCAG 1.4.11 — a glyph and a square are graphical objects.

async function contrastProbe(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    // Tokens come back as authored — `#5e7f3f`, not `rgb(94,127,63)`. The first
    // version fed hex to an rgb-only parser, which pulled the DIGITS out of the
    // hex and measured [5,7,3]. Both forms are handled now.
    const parse = (c: string) => {
      const hex = c.trim().match(/^#([0-9a-f]{6})$/i)
      if (hex) return [0, 2, 4].map((i) => Number.parseInt(hex[1]!.slice(i, i + 2), 16))
      return (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
    }
    const lum = (v: number[]) => {
      const f = (x: number) => {
        const s = (x ?? 0) / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(v[0]!) + 0.7152 * f(v[1]!) + 0.0722 * f(v[2]!)
    }
    const ratio = (a: string, b: string) => {
      const [x, y] = [lum(parse(a)), lum(parse(b))]
      const [hi, lo] = x > y ? [x, y] : [y, x]
      return (hi + 0.05) / (lo + 0.05)
    }
    const root = getComputedStyle(document.documentElement)
    const token = (n: string) => root.getPropertyValue(n).trim()

    const light = token('--color-board-light')
    const dark = token('--color-board-dark')
    const painted = token('--color-board-painted')

    /*
     * The outline is DRAWN INTO the art now, not applied as a text-shadow.
     *
     * A piece used to be a text glyph wearing a `text-shadow` ring, and this
     * probe read the ring out of the computed style. A piece is a sprite, and
     * every sprite in the sheet is drawn against `o` — the palette's outline
     * tone — so the ring is a set of `<rect>`s inside the SVG. Read from the
     * DOM rather than from the token, because "the token exists" and "the mark
     * on this square actually carries it" are different claims and only the
     * second one is what the eye gets.
     */
    const piece = document.querySelector('.square[data-piece]:not([data-piece=""]) .piece svg.pix')
    const fills = piece ? [...piece.querySelectorAll('rect')].map((r) => getComputedStyle(r).fill) : []
    const outlineToken = token('--color-outline')
    const outlineColour = fills.some((f) => ratio(f, outlineToken) < 1.05) ? outlineToken : ''

    /**
     * What the eye actually gets from a glyph on a square.
     *
     * An outlined glyph does not present its fill to the background — it
     * presents its EDGE. So the effective contrast is the better of the two,
     * and measuring only the fill (which the first version of this file did,
     * while computing the outline and discarding it) makes the checker target
     * and the hue-based side separation mutually unsatisfiable: hitting a 3:1
     * checker with bare fills forces both side colours toward near-black,
     * which is exactly the distinction ADR-021 exists to protect.
     */
    const effective = (fill: string, square: string) =>
      Math.max(ratio(fill, square), outlineColour ? ratio(outlineColour, square) : 0)

    return {
      checker: ratio(light, dark),
      paintedVsLight: ratio(painted, light),
      paintedVsDark: ratio(painted, dark),
      // The SPRITE tints, not the chrome's side colours. Those are what a piece
      // is actually painted in; the `--color-side-*` family dresses the turn bar
      // and the player cards, which are text on a panel rather than a graphical
      // object on a board.
      pieceOnLight: effective(token('--pix-tint-white'), light),
      pieceOnDark: effective(token('--pix-tint-white'), dark),
      blackOnLight: effective(token('--pix-tint-black'), light),
      blackOnDark: effective(token('--pix-tint-black'), dark),
      // The sides must still be distinguishable FROM EACH OTHER, or an outline
      // that rescues both ratios has quietly made every piece look the same.
      // The design mock's pair was 1.02:1 — hue alone, the exact thing ADR-007
      // forbids — and this is the assertion that caught it.
      sideVsSide: ratio(token('--pix-tint-white'), token('--pix-tint-black')),
      hasOutline: outlineColour !== '',
    }
  })
}

/*
 * One theme, so one test. It used to run twice, once per `data-theme`; Chess
 * Craft is single-theme (see the header of `tokens.css`) and looping over two
 * values of an attribute nothing reads would have measured the same palette
 * twice and reported it as double the coverage.
 */
test(`the board, its painted squares and its pieces all clear ${AA_NON_TEXT}:1`, async ({ page }) => {
    await page.goto('/')
    await startMatch(page)

    const m = await contrastProbe(page)

    // #42 — the fill has to do the work, not the 1px border it was leaning on.
    expect(m.paintedVsLight, `painted vs light square (${m.paintedVsLight.toFixed(2)}:1)`).toBeGreaterThanOrEqual(
      AA_NON_TEXT,
    )
    // The checker, freed by the glyph outline. Phase 4 could only reach 1.59:1.
    expect(m.checker, `checker (${m.checker.toFixed(2)}:1)`).toBeGreaterThanOrEqual(AA_NON_TEXT)
    // And the pieces must survive both squares they can stand on.
    expect(m.hasOutline, 'the glyph needs its own contrast for the above to be possible').toBe(true)
    // An outline strong enough to rescue both sides could also flatten the
    // difference between them. ADR-021's whole point is that hue alone must not
    // carry it, so the two side colours keep their own separation.
    expect(m.sideVsSide, `the two sides against each other (${m.sideVsSide.toFixed(2)}:1)`).toBeGreaterThanOrEqual(1.4)
    for (const [name, value] of [
      ['white piece on a light square', m.pieceOnLight],
      ['white piece on a dark square', m.pieceOnDark],
      ['black piece on a light square', m.blackOnLight],
      ['black piece on a dark square', m.blackOnDark],
    ] as const) {
      expect(value, `${name} (${value.toFixed(2)}:1)`).toBeGreaterThanOrEqual(AA_NON_TEXT)
    }
})
