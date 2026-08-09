import { PIXEL_PALETTE, type PixelSprite, runsOf } from './pixels.ts'

/**
 * The rules a sprite has to obey, as one module both the suite and the
 * generator import (ADR-005 of PLAN-preset-content-expansion).
 *
 * These used to live as assertions inside `pixels.test.ts` and
 * `art-contrast.test.ts`, which was fine while every sprite was drawn by hand.
 * It stops being fine the moment a script produces candidates: a generator
 * carrying its own copy of "a fixed grid, palette-only, a fixed rect cap" drifts from
 * the suite's copy, and the drift is invisible until a sprite the generator
 * accepted fails CI. Sharing the module makes the drift impossible rather than
 * unlikely, which is why `sprite-generator.test.ts` asserts module IDENTITY and
 * not merely equivalent behaviour.
 *
 * Nothing in here reads the filesystem, so it is importable from the app, from a
 * jsdom test and from a plain node script alike. The colour VALUES the contrast
 * rules need are passed in — `tokens.css` stays the only place a colour is
 * named (ADR-021), and the two callers each read it their own way.
 */

/**
 * Every sprite is exactly this many rows of exactly this many characters.
 *
 * Raised 12 -> 24 by PLAN-art-grid-resolution. The migration was a lossless 2x block
 * expansion of all 209 committed tables (`scripts/upscale-sprites.ts`), so the silhouettes
 * were unchanged by it and only the detail BUDGET moved; the drawings that use that budget
 * are hand-refined separately. Every constant below that depends on the grid is derived
 * from this one rather than restated, because restating a value at six sites is an
 * edit that misses a site — which it did, three times, during that plan's review.
 */
export const SPRITE_SIZE = 24

/**
 * The most rects one sprite may compress to — a NOISE budget, five per row.
 *
 * **Its original justification is dead and the number outlived it.** This used to read "a
 * DOM cost per sprite: the board draws up to 36 of these at once", and that was true while
 * `Pix.tsx` emitted one `<rect>` per horizontal run. Since PLAN-capture-rules-and-art-fixes
 * Phase 7 it emits one rounded `<path>` per distinct colour, so a sprite's DOM cost is
 * bounded by the palette (at most 25 nodes) and has nothing to do with run count. What the
 * cap still measures, and measures well, is how BUSY a drawing is: a sprite that dithers
 * blows past it, and should have to argue for itself.
 *
 * Kept rather than retired (ADR-006 of PLAN-art-grid-resolution) because it is the only
 * per-sprite defence, and it would otherwise be dropped at the exact moment the grid gains
 * four times the room to be noisy in. The `5` is inherited from the 12x12 era rather than
 * re-derived from what noise costs today — recorded as debt; the trigger to revisit it is a
 * hand-refined sprite hitting the cap.
 *
 * **Derived from `SPRITE_SIZE`, not restated (ADR-002).** `runsOf` is row-wise, so a
 * k-times upscale multiplies runs by exactly k — the runs within a row are unchanged,
 * there are simply k times as many rows. A cap that stayed at 60 while the grid doubled
 * would reject 82 of the 125 committed sprites for getting no busier.
 */
export const RECT_CAP = 5 * SPRITE_SIZE

/**
 * The sheet-wide compression floor: `runs < pixels / SHEET_DIVISOR`.
 *
 * **Also derived, and for a sharper reason than symmetry (ADR-002).** A k-upscale takes
 * runs to k times and drawn pixels to k squared times, so the pixels-per-run ratio scales
 * by k and the floor has to scale with it. Left at the 12x12 value of 1.8, this gate does
 * not merely weaken at 24x24 — it dies: the upscaled form of the suite's own dither
 * fixture is 288 runs for 576 pixels, which clears a floor of 576/1.8 = 320 and is
 * rejected only by 576/3.6 = 160. The gate would admit the exact artefact it exists to
 * refuse.
 *
 * Written `(SPRITE_SIZE * 3) / 20` rather than the algebraically identical
 * `0.15 * SPRITE_SIZE` because the two are NOT identical in binary: `0.15 * 12` is
 * 1.7999999999999998, a hair below the literal `1.8` this replaces, which makes the floor
 * a hair stricter and the refactor no longer behaviour-preserving. `(12 * 3) / 20` is
 * bit-identical to `1.8`, and `(24 * 3) / 20` to `3.6`.
 */
export const SHEET_DIVISOR = (SPRITE_SIZE * 3) / 20

/** The two side tints must stay this far apart in luminance. */
export const PAIR_MIN = 2.75

/** What a sprite must clear against every background it can land on. */
export const BOARD_MIN = 3.3

/**
 * Which surfaces a mark of each kind can actually land on, as token names.
 *
 * Measuring every sprite against every board tone looks stricter and is simply
 * wrong: a square-type mark is only ever drawn on a PAINTED square, so gating it
 * against the plain checker rejects art for failing on a background it never
 * touches. Pieces are the case that needs all of them — a piece stands wherever
 * it is moved, so it meets the checker AND the painted stripe.
 */
export const SURFACES: Readonly<Record<'piece' | 'square' | 'card', readonly string[]>> = {
  piece: ['color-board-light', 'color-board-dark', 'color-board-painted'],
  square: ['color-board-painted'],
  // A card face, a dex tile, a hotbar slot and the rule bar. The recessed slot
  // and the raised panel are the two extremes of that set.
  card: ['color-sunken', 'color-surface', 'color-note'],
}

/** `.` is transparent and `$` takes the caller's tint; the rest index the palette. */
const KNOWN_CHARS = new Set([...Object.keys(PIXEL_PALETTE), '.', '$'])

/** Non-transparent cells. */
export function drawnPixels(rows: readonly string[]): number {
  return rows.join('').replace(/\./g, '').length
}

/** An all-transparent sprite — renders an empty box and looks like a layout bug. */
export function isBlank(rows: readonly string[]): boolean {
  return drawnPixels(rows) === 0
}

/**
 * How many horizontal runs this sprite merges to — a measure of how busy it is.
 *
 * Not a DOM cost any more: `Pix.tsx` draws one path per colour, not one rect per run. The
 * name is kept because `runsOf` is still what produces the number and renaming it would
 * churn every call site to no benefit. See `RECT_CAP` for the full story.
 */
export function rectCount(rows: readonly string[]): number {
  return runsOf(rows as PixelSprite).length
}

/**
 * Everything wrong with one sprite, named. Empty means it may ship.
 *
 * Returned as a list rather than thrown so a generator can score a whole batch
 * and a test can print every offender at once.
 */
export function spriteErrors(name: string, rows: readonly string[]): string[] {
  const out: string[] = []

  if (rows.length !== SPRITE_SIZE) {
    out.push(`${name}: ${rows.length} rows, needs ${SPRITE_SIZE}`)
  }
  rows.forEach((row, y) => {
    if (row.length !== SPRITE_SIZE) out.push(`${name} row ${y}: ${row.length} chars, needs ${SPRITE_SIZE}`)
  })

  const unknown = [...new Set(rows.join(''))].filter((ch) => !KNOWN_CHARS.has(ch))
  for (const ch of unknown) out.push(`${name} uses \`${ch}\`, which the palette does not know`)

  if (isBlank(rows)) out.push(`${name} draws nothing`)

  const rects = rectCount(rows)
  if (rects > RECT_CAP) out.push(`${name} needs ${rects} rects, over the cap of ${RECT_CAP}`)

  return out
}

/**
 * The sheet-wide aggregate.
 *
 * Deliberately separate from `spriteErrors`, because it is the one rule a single
 * sprite cannot satisfy on its own: a batch of individually-legal noisy sprites
 * breaks it globally. A generator should call this with the sheet SO FAR plus
 * its candidate, so the failure lands at generation time rather than at commit.
 */
export function sheetCompression(sheet: Iterable<readonly string[]>): { runs: number; pixels: number; ok: boolean } {
  let runs = 0
  let pixels = 0
  for (const rows of sheet) {
    runs += rectCount(rows)
    pixels += drawnPixels(rows)
  }
  return { runs, pixels, ok: runs < pixels / SHEET_DIVISOR }
}

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

/** Contrast ratio between two `#rrggbb` colours. */
export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Every distinct colour a sprite draws, with `$` resolved to a side's tint. */
export function tonesOf(rows: readonly string[], tint: string): string[] {
  const chars = new Set(rows.join('').replace(/\./g, ''))
  return [...chars].map((ch) => (ch === '$' ? tint : (PIXEL_PALETTE[ch] ?? '#ff00ff')))
}

/**
 * The best separation a sprite achieves against one background.
 *
 * EITHER end may carry it, and that is the cue-sandwich rule rather than a
 * loophole: a mark with a dark ring and a light body reads on both a dark and a
 * light background precisely because only one tone has to separate. Requiring
 * every tone to clear the bar would reject every drawing with shading in it.
 */
export function bestEdge(rows: readonly string[], tint: string, background: string): number {
  return Math.max(...tonesOf(rows, tint).map((tone) => ratio(tone, background)))
}

/**
 * Where this sprite fails to separate, named by background and tint.
 *
 * `backgrounds` and `tints` are resolved colours, not token names — the caller
 * owns reading `tokens.css`, so this module stays free of the filesystem.
 */
export function contrastErrors(
  name: string,
  rows: readonly string[],
  backgrounds: readonly string[],
  tints: readonly string[],
): string[] {
  const out: string[] = []
  for (const background of backgrounds) {
    for (const tint of tints) {
      const best = bestEdge(rows, tint, background)
      if (best < BOARD_MIN) {
        out.push(`${name} on ${background} (tint ${tint}): best edge ${best.toFixed(2)}:1, needs ${BOARD_MIN}:1`)
      }
    }
  }
  return out
}
