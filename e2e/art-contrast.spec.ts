import { readFileSync, readdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

/**
 * PLAN Phase 4 — the gate the illustrated batch has to clear.
 *
 * Today the two armies separate by hue AND weight AND lightness, and
 * `tokens.css` records the measurements that justify the board's palette on
 * that basis. Raster illustration inherits none of it: once a piece is a
 * picture, the whole safeguard lives in what the picture happens to look like.
 * Roughly one in twelve boys reads red/green poorly, and a chess board is the
 * worst possible place to learn that about yourself — so "the two sides differ
 * in LUMINANCE, not only in hue" stops being a palette property and becomes a
 * property of 43 generated files that nothing would otherwise check.
 *
 * Both thresholds below are read or cited, never invented. The pair figure is
 * the 2.75:1 `tokens.css` records for the two sides against each other; the
 * board figure is the 3.30:1 it records for the checker. 3.30 rather than
 * WCAG's 3:1 non-text floor on purpose: art scoring 3.1:1 would pass WCAG and
 * still be worse than what ships today, and the standing rule for this area is
 * that neither of the two numbers may be improved by regressing the other.
 *
 * Measured in the BROWSER because the browser already decodes WebP. Doing it in
 * Node would mean an image-decoding dependency for a repo whose entire runtime
 * is react + zod.
 */

const ART_DIR = 'src/ui/art'
const PAIR_MIN = 2.75
const BOARD_MIN = 3.3

/**
 * Tones for one token family, across every theme block `tokens.css` defines.
 *
 * Read rather than hard-coded, so re-toning the board re-runs this gate instead
 * of leaving it asserting against a palette that no longer ships.
 */
function tones(...names: string[]): string[] {
  const css = readFileSync('src/ui/tokens.css', 'utf8')
  const found = names.flatMap((name) =>
    [...css.matchAll(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))].map((m) => m[1]!.toLowerCase()),
  )
  expect(found.length, `no tones found for ${names.join(', ')} — the token names changed`).toBeGreaterThan(1)
  return [...new Set(found)]
}

/**
 * Which surfaces a given asset can actually land on, from its filename prefix.
 *
 * This is the correction to the obvious version of this gate, and it is not a
 * detail. Measuring every asset against every board tone looks stricter and is
 * simply wrong: a square-type mark is only ever drawn on a PAINTED square — the
 * violet stripe — so gating it against the plain checker rejects art for failing
 * on a background it never touches. Being wrong in the strict direction is still
 * wrong; it would have this gate reject the batch for the wrong reason and teach
 * everyone to raise the threshold's exceptions rather than the art's contrast.
 *
 * Pieces are the case that needs both: a piece stands wherever it is moved, so
 * it meets the checker AND the painted stripes.
 *
 * The prefix is load-bearing, so an unclassified file is a failure rather than
 * a skip — otherwise the batch of 43 lands one badly-named file and silently
 * exempts it.
 */
function surfacesFor(file: string): string[] {
  const board = () => tones('board-light', 'board-dark')
  const painted = () => tones('board-painted-a', 'board-painted-b')
  const card = () => tones('surface', 'surface-sunken')

  if (file.startsWith('piece-')) return [...board(), ...painted()]
  if (file.startsWith('square-')) return painted()
  if (file.startsWith('card-')) return card()
  throw new Error(`${file}: art filename must start with piece- / square- / card- so this gate knows what it sits on`)
}

/**
 * The CSS px size the asset is measured at, per prefix.
 *
 * Measuring at the asset's NATIVE 192px was the original mistake: fine detail
 * that is real in the file can be gone by the time the browser has scaled it to
 * a square on a phone, so the gate reported contrast the player never sees.
 * Every wrapper's font-size is a fixed px in `styles.css` and `MarkBody` sizes
 * the image at `1.15em`, so the rendered box is computable rather than guessed.
 *
 * The **primary** size, not the smallest. A square mark also appears at ~13.8px
 * as a corner badge once a piece stands on it, and no reasonable illustration
 * carries its own 3.3:1 outline at that size — which is exactly why
 * `.square-mark[data-occupied='true'] img` declares a ring in CSS pixels, so it
 * does not shrink with the art. Demanding the asset carry the badge unaided
 * would reject every usable asset while the real rendering is fine: a false
 * gate, the same class of error as measuring against the wrong surface. The
 * badge's ring is asserted separately, below.
 */
function renderPxFor(file: string): number {
  if (file.startsWith('piece-')) return Math.round(26 * 1.15) // .square .piece
  if (file.startsWith('square-')) return Math.round(24 * 1.15) // .square-mark
  return Math.round(16 * 1.15) // .legend-icon — the smallest card-ish wrapper
}

function artFiles(): string[] {
  return readdirSync(ART_DIR)
    .filter((f) => f.endsWith('.webp'))
    .sort()
}

/**
 * The luminance profile of an image's opaque pixels, measured by the browser.
 *
 * Three numbers, not one, and the reason is the design this board already uses.
 * `tokens.css` records that a glyph's OUTLINE carries its contrast while the
 * fill is free to carry hue — "the eye reads the glyph's edge against the
 * square" — and the move dot goes further with a deliberate black-on-white
 * sandwich, so that whatever the square is, one of the two tones separates from
 * it. A mean flattens exactly that: a cream mark with a near-black ring
 * averages to "cream" and scores as invisible on a light background it in fact
 * reads perfectly well against.
 *
 * So `dark`/`light` are the 10th and 90th percentiles — what the mark's darkest
 * and lightest substantial regions actually are. Percentiles rather than
 * min/max because a handful of stray antialiased pixels are not something a
 * player can see, and a gate satisfied by three pixels is not a gate.
 *
 * `mean` is kept for the side-pair comparison, where overall lightness IS the
 * question being asked.
 *
 * Opaque-only throughout: these are cut-out marks, and averaging the
 * transparent surround would drag every measurement toward one value.
 */
type Profile = { mean: number; dark: number; light: number }

async function luminanceOf(page: Page, url: string, sizePx: number, bgHex: string): Promise<Profile> {
  return page.evaluate(
    async ({ src, size, bg }) => {
      const img = new Image()
      img.src = src
      await img.decode()

      // Drawn at the size it RENDERS at, not at its native resolution. The
      // browser's own downscale is part of what the player sees, and detail
      // that does not survive it is detail the gate must not credit.
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, size, size)
      const { data } = ctx.getImageData(0, 0, size, size)

      const channel = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      const rgb = Number.parseInt(bg.slice(1), 16)
      const bgc = [(rgb >> 16) & 255, (rgb >> 8) & 255, rgb & 255]

      const lums: number[] = []
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]! / 255
        // Below ~9% opacity a pixel is not something anyone can see, so it is
        // not evidence either way. Everything above it counts — COMPOSITED over
        // the background it will actually sit on. Measuring uncomposited RGB
        // scored a half-opacity dark edge as near-black when what it renders as
        // is halfway to the square underneath, which is how an asset could
        // clear the gate on an outline nobody can see.
        if (a < 0.094) continue
        const r = data[i]! * a + bgc[0]! * (1 - a)
        const g = data[i + 1]! * a + bgc[1]! * (1 - a)
        const b = data[i + 2]! * a + bgc[2]! * (1 - a)
        lums.push(0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b))
      }
      if (lums.length === 0) throw new Error(`${src} has no visible pixels at ${size}px`)

      lums.sort((a, b) => a - b)
      const at = (q: number) => lums[Math.min(lums.length - 1, Math.floor(q * lums.length))]!
      return {
        mean: lums.reduce((a, b) => a + b, 0) / lums.length,
        dark: at(0.1),
        light: at(0.9),
      }
    },
    { src: url, size: sizePx, bg: bgHex },
  )
}

function luminanceOfHex(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)

test('every art asset separates from every surface it can land on', async ({ page }) => {
  await page.goto('/')
  const files = artFiles()
  expect(files.length, `no art in ${ART_DIR} — the registry has nothing to gate`).toBeGreaterThan(0)

  const failures: string[] = []
  for (const file of files) {
    const size = renderPxFor(file)
    for (const hex of surfacesFor(file)) {
      // Re-measured per surface: compositing means the profile depends on what
      // is behind it, which is the whole point of the fix.
      const p = await luminanceOf(page, `/${ART_DIR}/${file}`, size, hex)
      const bg = luminanceOfHex(hex)
      // EITHER end may carry it. That is the cue-sandwich rule, not a loophole:
      // a mark with a dark ring and a light body reads on both a dark and a
      // light background precisely because only one end has to separate.
      // Requiring both would reject the one design that survives two themes.
      const best = Math.max(ratio(p.dark, bg), ratio(p.light, bg))
      if (best < BOARD_MIN) {
        failures.push(`${file} vs ${hex} @${size}px: best edge is ${best.toFixed(2)}:1 (needs ${BOARD_MIN}:1)`)
      }
    }
  }

  expect(failures, failures.join('\n')).toEqual([])
})

test('the two sides of a piece separate from each other by luminance, not only hue', async ({ page }) => {
  const files = artFiles()
  const bases = [...new Set(files.filter((f) => /-white\.webp$|-black\.webp$/.test(f)).map((f) => f.replace(/-(white|black)\.webp$/, '')))]

  // Skipped, not silently passed. A vacuous green here would read as "the sided
  // art was checked" for as long as there is none, which is the entire window
  // in which someone might add some.
  test.skip(bases.length === 0, `no sided art in ${ART_DIR} yet — the batch (ADR-002/ADR-004) has not landed`)

  await page.goto('/')
  const failures: string[] = []
  for (const base of bases) {
    // `mean` here, not the percentiles: the question is whether the two armies
    // differ in overall lightness, and both will share the same outline. Both
    // composited over the SAME mid grey, so the difference measured is the art
    // and not the backgrounds.
    const size = renderPxFor(`${base}-white.webp`)
    const white = await luminanceOf(page, `/${ART_DIR}/${base}-white.webp`, size, '#808080')
    const black = await luminanceOf(page, `/${ART_DIR}/${base}-black.webp`, size, '#808080')
    const r = ratio(white.mean, black.mean)
    if (r < PAIR_MIN) failures.push(`${base}: sides are ${r.toFixed(2)}:1 apart (needs ${PAIR_MIN}:1)`)
  }
  expect(failures, failures.join('\n')).toEqual([])
})

test('the gate rejects a pair that differs in hue alone — proving it can fail', async ({ page }) => {
  await page.goto('/')

  /*
   * The failure mode this whole file exists for, made concrete: two fills a
   * generator would happily produce as "a red army and a green army", equally
   * bright. They look like two armies to most people and like one army to a
   * red/green-deficient player. If the gate cannot reject THIS, it cannot
   * reject anything, and a green Phase 4 would mean nothing.
   *
   * Built as data URIs rather than committed fixtures: an asset in the art
   * directory would be picked up by the two tests above and gate itself.
   */
  const fill = (color: string) =>
    `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/></svg>`).toString('base64')}`

  const paintedHex = tones('board-painted-a')[0]!
  const red = await luminanceOf(page, fill('#c14b4b'), 28, paintedHex)
  const green = await luminanceOf(page, fill('#4b8f4b'), 28, paintedHex)

  expect(ratio(red.mean, green.mean), 'the two fixture fills are not actually equal-luminance — pick better ones').toBeLessThan(PAIR_MIN)

  // And the surface rule rejects them too: a flat fill has no edge, so both
  // percentiles sit on the fill and neither can rescue it against a background
  // of similar lightness. This is what stops the percentile relaxation above
  // from becoming a way for any art to pass.
  const painted = luminanceOfHex(paintedHex)
  expect(Math.max(ratio(red.dark, painted), ratio(red.light, painted))).toBeLessThan(BOARD_MIN)
})

test('the occupied corner badge keeps a ring, which the asset cannot carry at that size', async ({ page }) => {
  /*
   * `.square-mark[data-occupied='true']` declares its legibility ring with
   * `text-shadow`, which is a TEXT property and does nothing to a replaced
   * element — so when the mark became an image the badge shipped with no ring
   * at all, in the most common state there is (a piece standing on a painted
   * square). The `drop-shadow` rule is the fix; this asserts it is live rather
   * than trusting a stylesheet to have been loaded and matched.
   *
   * The state is forced rather than played into: reaching it for real needs a
   * specific move onto a specific square, and what is under test here is the
   * CSS rule, not the route to it.
   */
  await page.goto('/')
  await page.getByTestId('coach-skip').click()
  await page.getByTestId('start-match').click()
  await page.getByTestId('board').waitFor()

  const filter = await page.locator('.square-mark img').first().evaluate((el) => {
    el.closest('.square-mark')!.setAttribute('data-occupied', 'true')
    return getComputedStyle(el).filter
  })

  expect(filter, 'the corner badge art has no ring — text-shadow does not apply to <img>').not.toBe('none')
  expect(filter).toContain('drop-shadow')
})
