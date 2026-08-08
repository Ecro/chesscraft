import { PIXEL_PALETTE, type PixelSprite } from './pixels'

/**
 * Turns a pixel sprite into rounded outline paths, one per colour (PLAN Phase 7, ADR-001).
 *
 * The report was that the marks read as pixel art. Approach A — dropping `shape-rendering`
 * and letting the rasteriser antialias — was built, photographed at 26px and eliminated on
 * evidence: the rects are axis-aligned and a 12x12 cell lands on very nearly whole device
 * pixels, so there is almost no edge to soften. The blockiness is the GEOMETRY. Softening it
 * means changing the outline, which is what this module does.
 *
 * **Per colour, not per sprite.** A sprite is twelve rows of characters and each character
 * indexes a palette, so there is no single silhouette to trace — there are up to 25 regions
 * that happen to tile. Each colour's cells are traced independently and drawn back-to-front in
 * the sheet's own order, so neighbouring colours still meet exactly where they met before.
 *
 * **What is deliberately NOT changed:** `pixels.ts`, so the 125 committed sprites, the spare-pool
 * census and every constant in `gates.ts` (rect cap, sheet-wide compression floor) are untouched
 * and still describe the data they were derived from. This is a render change.
 *
 * **What this breaks, stated because it is not obvious.** `tests/ui/art-contrast.test.ts`
 * measures the sprite's CHARACTERS, and `e2e/art-contrast.spec.ts` says in its own header that
 * the rendered gate could move into the unit test "because the pixels are already numbers".
 * That is true of a `crispEdges` rect renderer and false of this one: once a boundary is a
 * curve, the pixels a player sees are no longer the characters the gate reads. The unit gate
 * still passes — it cannot fail on a render change — so it silently stops measuring what ships.
 * `e2e/art-rendered-contrast.spec.ts` is the replacement that measures the real thing:
 * rasterised at the three shipped sizes, composited over each real surface, percentile
 * separation. Do not delete it on the grounds that the unit test already covers contrast.
 */

/** How far a corner is pulled back, in grid units (one cell = 1). */
export const CORNER_RADIUS = 0.3

type Cell = `${number},${number}`
const key = (x: number, y: number): Cell => `${x},${y}`

/** A closed rectilinear loop, as integer grid vertices, without collinear points. */
export type Loop = ReadonlyArray<readonly [number, number]>

/**
 * The boundary loops of a cell set.
 *
 * Walked as directed unit edges with the interior kept on the LEFT, which is what makes an
 * outer boundary run one way and a hole inside it run the other — so a single fill rule draws
 * both correctly without the caller knowing which is which.
 *
 * The diagonal case is the one worth naming: two cells touching only at a corner produce four
 * edges meeting at one vertex, and a walk that picks the wrong continuation there merges two
 * regions into a figure-eight. Turning as sharply LEFT as possible at every vertex keeps each
 * loop hugging its own cells.
 */
export function loopsOf(cells: ReadonlySet<Cell>): Loop[] {
  // Directed boundary edges, interior on the left. For a cell (x,y) in a y-down grid:
  //   top edge    runs (x,y)   -> (x+1,y)     when (x, y-1) is outside
  //   right edge  runs (x+1,y) -> (x+1,y+1)   when (x+1, y) is outside
  //   bottom edge runs (x+1,y+1) -> (x,y+1)   when (x, y+1) is outside
  //   left edge   runs (x,y+1) -> (x,y)       when (x-1, y) is outside
  const edges = new Map<string, Array<readonly [number, number]>>()
  const add = (from: readonly [number, number], to: readonly [number, number]) => {
    const k = `${from[0]},${from[1]}`
    edges.set(k, [...(edges.get(k) ?? []), to])
  }

  for (const cell of cells) {
    const [x, y] = cell.split(',').map(Number) as [number, number]
    if (!cells.has(key(x, y - 1))) add([x, y], [x + 1, y])
    if (!cells.has(key(x + 1, y))) add([x + 1, y], [x + 1, y + 1])
    if (!cells.has(key(x, y + 1))) add([x + 1, y + 1], [x, y + 1])
    if (!cells.has(key(x - 1, y))) add([x, y + 1], [x, y])
  }

  const loops: Loop[] = []
  while (edges.size > 0) {
    const startKey = [...edges.keys()][0]!
    const start = startKey.split(',').map(Number) as [number, number]
    const points: Array<readonly [number, number]> = [start]
    let at = start
    let incoming: readonly [number, number] | null = null

    for (let guard = 0; guard < 4096; guard += 1) {
      const outs = edges.get(`${at[0]},${at[1]}`)
      if (!outs || outs.length === 0) break

      // Sharpest available LEFT turn relative to how we arrived. With one option this is a
      // no-op; with four edges at a shared corner it is what stops two regions merging.
      let pick = 0
      if (incoming && outs.length > 1) {
        const score = (to: readonly [number, number]) => {
          const dx = to[0] - at[0]
          const dy = to[1] - at[1]
          // cross > 0 is a left turn in a y-down grid.
          const cross = incoming![0] * dy - incoming![1] * dx
          const dot = incoming![0] * dx + incoming![1] * dy
          if (cross > 0) return 0 // left
          if (dot > 0) return 1 // straight
          if (cross < 0) return 2 // right
          return 3 // reverse
        }
        pick = outs.reduce((best, to, i) => (score(to) < score(outs[best]!) ? i : best), 0)
      }

      const to = outs[pick]!
      if (outs.length === 1) edges.delete(`${at[0]},${at[1]}`)
      else edges.set(`${at[0]},${at[1]}`, outs.filter((_, i) => i !== pick))

      incoming = [to[0] - at[0], to[1] - at[1]] as const
      at = to as [number, number]
      if (at[0] === start[0] && at[1] === start[1]) break
      points.push(at)
    }

    if (points.length >= 4) loops.push(dropCollinear(points))
  }
  return loops
}

/** Removes points that continue a straight run — a corner is what gets rounded. */
function dropCollinear(points: ReadonlyArray<readonly [number, number]>): Loop {
  const out: Array<readonly [number, number]> = []
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length]!
    const cur = points[i]!
    const next = points[(i + 1) % points.length]!
    const a = [cur[0] - prev[0], cur[1] - prev[1]]
    const b = [next[0] - cur[0], next[1] - cur[1]]
    if (a[0]! * b[1]! - a[1]! * b[0]! !== 0) out.push(cur)
  }
  return out
}

/**
 * One loop as an SVG path with its corners rounded.
 *
 * The radius is clamped to a third of each adjoining edge, so a one-cell region rounds
 * proportionally instead of collapsing and a long straight side keeps its length.
 */
export function pathOf(loop: Loop, radius = CORNER_RADIUS): string {
  if (loop.length < 3) return ''
  const n = loop.length
  const parts: string[] = []
  const at = (i: number) => loop[((i % n) + n) % n]!
  const round2 = (v: number) => Math.round(v * 1000) / 1000

  for (let i = 0; i < n; i += 1) {
    const prev = at(i - 1)
    const cur = at(i)
    const next = at(i + 1)
    const inLen = Math.hypot(cur[0] - prev[0], cur[1] - prev[1])
    const outLen = Math.hypot(next[0] - cur[0], next[1] - cur[1])
    const r = Math.min(radius, inLen / 3, outLen / 3)

    const fromDir = [(cur[0] - prev[0]) / inLen, (cur[1] - prev[1]) / inLen]
    const toDir = [(next[0] - cur[0]) / outLen, (next[1] - cur[1]) / outLen]
    const enter = [cur[0] - fromDir[0]! * r, cur[1] - fromDir[1]! * r] as const
    const leave = [cur[0] + toDir[0]! * r, cur[1] + toDir[1]! * r] as const

    if (i === 0) parts.push(`M${round2(enter[0])} ${round2(enter[1])}`)
    else parts.push(`L${round2(enter[0])} ${round2(enter[1])}`)
    // The corner itself is the control point, which is what makes the curve hug it.
    parts.push(`Q${round2(cur[0])} ${round2(cur[1])} ${round2(leave[0])} ${round2(leave[1])}`)
  }
  parts.push('Z')
  return parts.join('')
}

export interface SmoothLayer {
  /** Resolved colour, or null when the layer takes the caller's tint (`$`). */
  fill: string | null
  /** One path string covering every region of this colour, holes included. */
  d: string
}

/**
 * A sprite as rounded layers, in the sheet's own top-to-bottom, left-to-right first-seen order.
 *
 * Order matters: neighbouring colours share a boundary, and rounding pulls each side of that
 * shared boundary back by the same radius — which would leave a hairline of background between
 * them. Drawing in a stable order with each layer's own outline means the gap is symmetric and
 * sub-pixel at every shipped size rather than a seam that moves when the palette is reordered.
 */
export function layersOf(sprite: PixelSprite, radius = CORNER_RADIUS): SmoothLayer[] {
  const byChar = new Map<string, Set<Cell>>()
  const order: string[] = []
  sprite.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x]!
      if (ch === '.') continue
      if (!byChar.has(ch)) {
        byChar.set(ch, new Set())
        order.push(ch)
      }
      byChar.get(ch)!.add(key(x, y))
    }
  })

  const out: SmoothLayer[] = []
  for (const ch of order) {
    const d = loopsOf(byChar.get(ch)!)
      .map((loop) => pathOf(loop, radius))
      .filter((s) => s !== '')
      .join('')
    if (d === '') continue
    // Unknown characters stay magenta, exactly as the rect renderer made them — a typo in the
    // sheet must be as loud here as it was there.
    out.push({ fill: ch === '$' ? null : (PIXEL_PALETTE[ch] ?? '#ff00ff'), d })
  }
  return out
}
