import { describe, expect, it } from 'vitest'
import { bundledContentSource } from '@content/sets/bundled'
import { PIXEL_SPRITES } from '@ui/art/pixels'
import { artRegistry } from '@ui/art/registry'
import { outlineShare, subBlockDetail, tintShare } from '../../scripts/sprite-metrics.ts'

/**
 * The two properties that decide whether raising the grid was worth anything, enforced on
 * the twelve sprites a player actually sees at board size (PLAN-art-grid-resolution).
 *
 * **Neither is visible to `gates.ts`, and each cost a round of work to learn.**
 *
 * `gates.ts` reads a sprite's characters — shape, palette, run count, and the best tone the
 * sprite offers against each background. All of that is satisfied perfectly by art drawn at
 * 12x12 and mechanically doubled, which is exactly what the first delegated pass produced:
 * every feature two cells wide, every outline `oo`, rows in identical pairs. It cleared
 * every existing gate and delivered nothing the migration had not already done.
 * `subBlockDetail` is what tells the two apart — a doubled sprite scores 0%.
 *
 * Then optimising for that produced the opposite failure. One-cell outlines are 1.4 device
 * pixels at the size this board draws a mark, so they antialias into a blend AND stop being
 * a large enough share of the ink for the rendered probe's 10th percentile to land on them.
 * Nine board squares failed `e2e/art-rendered-contrast.spec.ts` while
 * `tests/ui/art-contrast.test.ts` stayed green — `measured-the-artifact-not-the-rendering`
 * exactly. `outlineShare` is the character-level proxy for that, and the floor is set where
 * the pre-migration sheet sat (41-59% for these pieces; the untouched controls still run
 * `bomb` 42.6%, `portal` 36.6%, `shrine` 64.9%).
 *
 * **The two pull in opposite directions on purpose.** Detail belongs in the interior; mass
 * belongs on the silhouette. A sprite that satisfies only one of them is the failure mode
 * the other exists to catch, and this file is the only place that says so to a future
 * author who is about to redraw one of these.
 *
 * Scoped to the twelve BUNDLED PIECE sprites deliberately. Cards and painted squares are
 * only ever drawn at ~26px where this detail is invisible, and the spare pool is left at
 * migrated quality by ADR-003 — asserting over the whole sheet would fail for art nobody
 * claimed was refined.
 */

/**
 * The sprites this file measures: every `piece`-surface art id the bundled content claims.
 *
 * **Derived, never listed.** A hardcoded roster is false-green by construction — add a
 * bundled piece, or repoint an existing one's `artKey` at an unrefined sprite, and the old
 * names all still resolve, every assertion still passes, and the sprite a player actually
 * sees goes unmeasured. That is the same shape as `[fail:test] all-positive-fixture-hides-overcounting`,
 * and the first version of this file had it: a `toHaveLength(12)` on a literal array,
 * described in its own comment as pinning the set.
 *
 * Reading it out of the registry and the content set instead means the roster tracks the
 * game. The cost is that this file now fails when someone adds a bundled piece without
 * refining its art — which is exactly the notification that was missing.
 */
const REFINED = (() => {
  // `ContentSource` is the pre-validation shape, so `pieces` is loosely typed here — narrow
  // to the one field this needs rather than casting the whole record.
  const pieces = (bundledContentSource.pieces ?? []) as ReadonlyArray<{ artKey?: string }>
  const claimed = new Set(pieces.flatMap((p) => (p.artKey ? [p.artKey] : [])))
  const names = [...artRegistry.entries()].flatMap(([id, entry]) =>
    entry.kind === 'pixel' && entry.surface === 'piece' && claimed.has(id) ? [entry.sprite] : [],
  )
  return [...new Set(names)].sort()
})()

/** Below this a sprite is a doubled 12x12 drawing rather than a 24x24 one. */
const DETAIL_MIN = 20

/** Below this the rendered gate starts failing, measured rather than guessed. */
const OUTLINE_MIN = 35

/** Below this the two armies stop being told apart by the art (ADR-007). */
const TINT_MIN = 30

const rowsOf = (name: string) => PIXEL_SPRITES[name as keyof typeof PIXEL_SPRITES] as unknown as string[]

describe('the refined piece sprites use the resolution they were given', () => {
  it('measures every bundled piece, derived from the content set rather than listed', () => {
    // Not `toHaveLength(12)` on a literal: that number is what the game currently ships,
    // and asserting it against a hardcoded roster proves only that the roster is the
    // length of itself. This asserts the DERIVATION found something and that every name
    // it found resolves — so adding a bundled piece grows the set and starts measuring it.
    expect(REFINED.length, 'no bundled piece art was found — the derivation is broken').toBeGreaterThanOrEqual(12)
    for (const name of REFINED) expect(rowsOf(name), `${name} is not in the sheet`).toBeTruthy()
  })

  it.each(REFINED)('%s carries detail below the 2x2 block a doubled sprite cannot', (name) => {
    const detail = subBlockDetail(rowsOf(name))
    expect(detail, `${name} is ${detail.toFixed(1)}% sub-block detail — a doubled 12x12 sprite scores 0%`).toBeGreaterThanOrEqual(
      DETAIL_MIN,
    )
  })

  it.each(REFINED)('%s keeps enough outline mass to survive rasterisation', (name) => {
    const share = outlineShare(rowsOf(name))
    expect(share, `${name} is ${share.toFixed(1)}% outline — the rendered gate fails below ~30%`).toBeGreaterThanOrEqual(
      OUTLINE_MIN,
    )
  })

  it.each(REFINED)('%s stays recolourable enough to tell the two armies apart', (name) => {
    const tint = tintShare(rowsOf(name))
    expect(tint, `${name} is ${tint.toFixed(1)}% tinted cells`).toBeGreaterThanOrEqual(TINT_MIN)
  })

  it('rejects a doubled sprite — proving the detail metric can fail', () => {
    // The exact artefact that passed every other gate: one cell becomes a 2x2 block.
    const doubled = rowsOf('king').flatMap((row) => {
      const wide = [...row].flatMap((c) => [c, c]).join('')
      return [wide, wide]
    })
    expect(subBlockDetail(doubled)).toBe(0)
  })

  it('rejects a sprite whose outline was thinned away — proving the mass metric can fail', () => {
    // Replace the outline with tint: shape and palette both still legal, and the rendered
    // gate would go red while `art-contrast.test.ts` stayed green.
    const thinned = rowsOf('king').map((row) => row.replace(/o/g, '$'))
    expect(outlineShare(thinned)).toBe(0)
    expect(outlineShare(rowsOf('king'))).toBeGreaterThan(OUTLINE_MIN)
  })
})
