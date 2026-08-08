import { describe, expect, it } from 'vitest'
import { CORNER_RADIUS, type Loop, layersOf, loopsOf, pathOf } from '@ui/art/smooth'
import { PIXEL_SPRITES, isSpriteName, runsOf } from '@ui/art/pixels'

/**
 * PLAN Phase 7 — the outline tracer, pinned on shapes whose answer is known by hand.
 *
 * `layersOf` is what the renderer calls, but its correctness lives in `loopsOf`: a boundary walk
 * that picks the wrong continuation where four edges meet at one grid vertex merges two regions
 * into a figure-eight, and the result still renders as *something*, which is the failure mode a
 * screenshot will not catch. The diagonal case below is that case.
 *
 * Every fixture here is a cell set small enough to reason about: a single cell has four corners,
 * an L has six, a ring has an outer loop and a hole, two diagonal cells are two loops. If a
 * future change to the walk breaks any of those, it breaks all of the sheet.
 */

const cells = (...pairs: Array<[number, number]>) => new Set(pairs.map(([x, y]) => `${x},${y}` as const))

/** A loop's vertices, normalised to start at its lexicographically smallest point. */
function normalise(loop: Loop): string {
  const idx = loop.reduce((best, p, i) => {
    const b = loop[best]!
    return p[0] < b[0] || (p[0] === b[0] && p[1] < b[1]) ? i : best
  }, 0)
  return [...loop.slice(idx), ...loop.slice(0, idx)].map(([x, y]) => `${x},${y}`).join(' ')
}

describe('loopsOf traces the boundary of a cell set', () => {
  it('gives a single cell one loop with four corners', () => {
    const loops = loopsOf(cells([3, 4]))
    expect(loops.length).toBe(1)
    expect(loops[0]!.length, 'a square has four corners').toBe(4)
    expect(normalise(loops[0]!)).toBe('3,4 4,4 4,5 3,5')
  })

  it('merges a straight run into one side rather than keeping every cell edge', () => {
    // Three cells in a row are a 3x1 rectangle: four corners, not twelve.
    const loops = loopsOf(cells([0, 0], [1, 0], [2, 0]))
    expect(loops.length).toBe(1)
    expect(loops[0]!.length).toBe(4)
    expect(normalise(loops[0]!)).toBe('0,0 3,0 3,1 0,1')
  })

  it('gives an L six corners', () => {
    const loops = loopsOf(cells([0, 0], [0, 1], [1, 1]))
    expect(loops.length).toBe(1)
    expect(loops[0]!.length, 'an L is a hexagon').toBe(6)
  })

  it('gives a ring two loops — its outside and its hole', () => {
    const ring = cells(
      [0, 0], [1, 0], [2, 0],
      [0, 1], /* hole */ [2, 1],
      [0, 2], [1, 2], [2, 2],
    )
    const loops = loopsOf(ring)
    expect(loops.length, 'an outer boundary and a hole').toBe(2)
    const sizes = loops.map((l) => l.length).sort()
    expect(sizes).toEqual([4, 4])
    // The hole runs the opposite way from the outside. Signed area distinguishes them, and it is
    // what lets one fill rule draw both without the caller labelling them.
    const area = (l: Loop) =>
      l.reduce((sum, p, i) => {
        const q = l[(i + 1) % l.length]!
        return sum + (p[0] * q[1] - q[0] * p[1])
      }, 0)
    const areas = loops.map(area)
    expect(Math.sign(areas[0]!) * Math.sign(areas[1]!), 'outer and hole wind the same way').toBe(-1)
  })

  it('keeps two diagonally-touching cells as TWO loops', () => {
    /*
     * The case that breaks a naive walk. Four boundary edges meet at the shared vertex (1,1);
     * following the wrong one joins both cells into a single self-touching loop that still
     * renders, so nothing downstream would report it.
     */
    const loops = loopsOf(cells([0, 0], [1, 1]))
    expect(loops.length, 'diagonal neighbours are two regions, not a figure-eight').toBe(2)
    expect(loops.every((l) => l.length === 4), 'each is a square').toBe(true)
  })

  it('finds every disjoint region, not just the first', () => {
    const loops = loopsOf(cells([0, 0], [5, 5], [11, 11]))
    expect(loops.length).toBe(3)
  })
})

describe('pathOf rounds corners without moving the shape', () => {
  it('emits one quadratic per corner and closes', () => {
    const d = pathOf(loopsOf(cells([3, 4]))[0]!)
    expect((d.match(/Q/g) ?? []).length, 'one curve per corner').toBe(4)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.startsWith('M')).toBe(true)
  })

  it('keeps every coordinate inside the cell it came from', () => {
    // Rounding pulls corners back along their own edges; it must never push outside the region,
    // or a mark would grow into its neighbour.
    const d = pathOf(loopsOf(cells([3, 4]))[0]!)
    const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(3)
    expect(Math.max(...nums)).toBeLessThanOrEqual(5)
  })

  it('clamps the radius on a one-cell side so the corner cannot swallow the edge', () => {
    // A radius of 0.3 on a 1-unit side is fine; a radius of 5 must clamp to a third of the side.
    const loop = loopsOf(cells([0, 0]))[0]!
    const wild = pathOf(loop, 5)
    const nums = [...wild.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...nums)).toBeLessThanOrEqual(1)
  })

  it('rounds by the radius it was given', () => {
    const loop = loopsOf(cells([0, 0], [1, 0], [2, 0]))[0]!
    const soft = pathOf(loop, CORNER_RADIUS)
    const hard = pathOf(loop, 0.01)
    expect(soft).not.toBe(hard)
  })
})

describe('layersOf covers the same cells the rect renderer did', () => {
  it('emits one layer per distinct character, in first-seen order', () => {
    const sprite = ['oo..........', 'oo..........', '..ss........', ...Array(9).fill('............')] as const
    const layers = layersOf(sprite)
    expect(layers.length).toBe(2)
    expect(layers[0]!.fill).toBe('#0e0f14') // `o`, the outline tone
    expect(layers[1]!.fill).toBe('#9aa2b4') // `s`
  })

  it('leaves the tint layer for the caller', () => {
    const sprite = ['$$..........', ...Array(11).fill('............')] as const
    expect(layersOf(sprite)[0]!.fill, 'a `$` cell must inherit the caller tint').toBeNull()
  })

  it('renders an unknown character loudly rather than dropping it', () => {
    const sprite = ['ZZ..........', ...Array(11).fill('............')] as const
    expect(layersOf(sprite)[0]!.fill).toBe('#ff00ff')
  })

  it('accounts for every non-transparent cell of every shipped sprite', () => {
    /*
     * The whole-sheet invariant, and the one that would catch a walk that silently dropped a
     * region: the set of characters the layer list covers must equal the set the rect renderer
     * draws. Compared as character sets rather than by geometry, because geometry is what this
     * change is deliberately altering.
     */
    const names = Object.keys(PIXEL_SPRITES).filter(isSpriteName)
    expect(names.length, 'no sprites to check').toBeGreaterThan(100)

    const missing: string[] = []
    for (const name of names) {
      const sprite = PIXEL_SPRITES[name]!
      const fromRuns = new Set(runsOf(sprite).map((r) => r.fill ?? 'tint'))
      const fromLayers = new Set(layersOf(sprite).map((l) => l.fill ?? 'tint'))
      if ([...fromRuns].sort().join('|') !== [...fromLayers].sort().join('|')) missing.push(name)
    }
    expect(missing, 'a colour present in the rect render is absent from the smooth render').toEqual([])
  })

  it('emits a non-empty path for every shipped sprite', () => {
    const names = Object.keys(PIXEL_SPRITES).filter(isSpriteName)
    const empty = names.filter((n) => layersOf(PIXEL_SPRITES[n]!).some((l) => l.d === ''))
    expect(empty).toEqual([])
  })
})
