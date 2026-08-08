import type { Translate } from './i18n'

/**
 * How a piece moves, as two questions instead of one.
 *
 * The schema says a piece's movement is an array of `MovePattern`s, each with a
 * kind, a vector list, an optional distance cap and an optional forward mirror.
 * The first version of this control drew ONE 7x7 grid and put a `step/slide/jump`
 * picker underneath it, which made the grid ambiguous: with `slide` selected, a
 * single lit cell compiled to a pattern with no `maxDistance`, and the engine
 * expands that to the board edge (`engine.ts:121`). So a lit cell did not denote
 * a reachable square — painting `(1,0)`, `(2,0)` and `(3,0)` produced exactly the
 * same piece as painting `(1,0)` alone, and a rook read back as four lit cells
 * around the centre, indistinguishable on screen from a king.
 *
 * The axes are therefore split (ADR-027). Sliding is eight direction toggles
 * with one shared reach cap; the grid holds only bounded leap destinations and
 * always compiles to `kind: 'step'`. Both controls carry the same
 * move -> capture -> both -> none cycle (ADR-028), so a piece that slides forward
 * and takes diagonally is authorable here rather than in the detailed form.
 *
 * Nothing about the schema moved: a piece compiles to at most two patterns per
 * array, and `movement` was always `z.array(movePattern).min(1)`.
 *
 * ## It still refuses to open rather than flatten
 *
 * Two slide patterns with different reach caps, a cap other than 1 or 2, a slide
 * along a vector that is not one of the eight directions, a leap outside the
 * grid — none of those survive a round-trip through this control, so `readGrid`
 * returns null and the screen points at the detailed form. What it no longer
 * refuses is the interesting case: a piece with a sliding pattern AND a leaping
 * one is now two patterns this model holds natively.
 *
 * `kind: 'jump'` is ACCEPTED into the grid and re-emitted as `'step'`. The engine
 * gives both `maxSteps = 1` and branches on nothing else, so the two are
 * indistinguishable in play; a single-step move has no square in between for a
 * jump to jump over. The record's bytes change, its behaviour does not, and
 * AC-005 pins the difference that way round deliberately.
 */

/** What one cell of the grid, or one slide direction, means. */
export const enum Cell {
  None = 0,
  Move = 1,
  Capture = 2,
  Both = 3,
}

/** Offsets the grid offers, centre outward. Matches the detailed form's grid. */
export const GRID_RANGE = [3, 2, 1, 0, -1, -2, -3] as const

/** The eight directions a piece can slide along, in compass order. */
export const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
export type Dir8 = (typeof DIRECTIONS)[number]

export const DIRECTION_VECTORS: Readonly<Record<Dir8, readonly [number, number]>> = {
  n: [0, 1],
  ne: [1, 1],
  e: [1, 0],
  se: [1, -1],
  s: [0, -1],
  sw: [-1, -1],
  w: [-1, 0],
  nw: [-1, 1],
}

/**
 * How far a slide carries. One value for every enabled direction (ADR-029).
 *
 * `1` overlaps the adjacent grid cell — the same destination, reachable two
 * ways. That is deliberate: it costs nothing the preview does not immediately
 * show, and dropping it would keep refusing every existing record capped at one
 * square for no gain.
 */
export type Reach = 1 | 2 | 'edge'
export const REACH_VALUES = [1, 2, 'edge'] as const

export interface PieceGrid {
  /** `"df,dr"` -> what that offset does. Absent means `Cell.None`. */
  cells: Record<string, Cell>
  /** Direction -> what sliding that way does. */
  slides: Record<Dir8, Cell>
  /** Shared cap for every enabled direction. */
  reach: Reach
  /** Whether the vectors mirror by the owning side's forward direction. */
  forward: boolean
}

type Pattern = { kind?: unknown; vectors?: unknown; maxDistance?: unknown; forward?: unknown }

const key = (df: number, dr: number) => `${df},${dr}`

export function blankGrid(): PieceGrid {
  return {
    cells: {},
    slides: { n: 0, ne: 0, e: 0, se: 0, s: 0, sw: 0, w: 0, nw: 0 },
    reach: 'edge',
    forward: false,
  }
}

function vectorsOf(pattern: Pattern | undefined): Array<[number, number]> {
  if (!Array.isArray(pattern?.vectors)) return []
  return (pattern.vectors as unknown[]).flatMap((v) =>
    Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' ? [[v[0], v[1]] as [number, number]] : [],
  )
}

const DIR_BY_VECTOR = new Map<string, Dir8>(DIRECTIONS.map((d) => [key(...DIRECTION_VECTORS[d]), d]))

/**
 * Splits an array into its slide bucket and its leap bucket.
 *
 * `'step'` and `'jump'` share the leap bucket because the engine cannot tell
 * them apart. Null means the array holds something this control cannot depict:
 * an unknown kind, or two patterns competing for the same bucket.
 */
type Buckets = { slide?: Pattern; leap?: Pattern }

function bucketize(patterns: Pattern[]): Buckets | null {
  const out: Buckets = {}
  for (const p of patterns) {
    if (p.kind === 'slide') {
      if (out.slide) return null
      out.slide = p
    } else if (p.kind === 'step' || p.kind === 'jump') {
      if (out.leap) return null
      out.leap = p
    } else {
      return null
    }
  }
  return out
}

/** The reach a slide pattern declares, or null when the control has no value for it. */
function reachOf(pattern: Pattern | undefined): Reach | null {
  if (!pattern) return null
  const cap = pattern.maxDistance
  if (cap === undefined) return 'edge'
  if (cap === 1 || cap === 2) return cap
  return null
}

/**
 * Reads a record's movement into the grid, or null when it does not fit.
 *
 * Every rejection below is authorable in the detailed form and none of them
 * survives a round-trip through this control. What is NOT a rejection any more:
 * two patterns of different kinds, a `maxDistance` of 1 or 2, and `movement`
 * disagreeing with `attack` about which kind it uses.
 */
export function readGrid(draft: Record<string, unknown>): PieceGrid | null {
  const movement = (draft.movement as Pattern[] | undefined) ?? []
  const attack = draft.attack as Pattern[] | undefined
  if (!Array.isArray(movement)) return null
  if (attack !== undefined && (!Array.isArray(attack) || attack.length === 0)) return null

  const moveBuckets = bucketize(movement)
  const takeBuckets = attack === undefined ? undefined : bucketize(attack)
  if (!moveBuckets || takeBuckets === null) return null

  const present = [moveBuckets.slide, moveBuckets.leap, takeBuckets?.slide, takeBuckets?.leap].filter(
    (p): p is Pattern => p !== undefined,
  )
  if (present.length === 0) return blankGrid()

  // A capped leap is inert (the engine gives every non-slide `maxSteps = 1`),
  // so the control has no honest way to show one.
  for (const leap of [moveBuckets.leap, takeBuckets?.leap]) {
    if (leap && leap.maxDistance !== undefined) return null
  }

  const reaches = new Set<Reach | null>()
  for (const slide of [moveBuckets.slide, takeBuckets?.slide]) {
    if (slide) reaches.add(reachOf(slide))
  }
  if (reaches.has(null)) return null
  if (reaches.size > 1) return null
  const reach = (reaches.size === 1 ? [...reaches][0] : 'edge') as Reach

  const forwards = new Set(present.map((p) => p.forward === true))
  if (forwards.size > 1) return null

  const grid = blankGrid()
  grid.reach = reach
  grid.forward = forwards.has(true)

  const paintSlide = (pattern: Pattern | undefined, value: Cell): boolean => {
    if (!pattern) return true
    const vectors = vectorsOf(pattern)
    if (vectors.length === 0) return false
    for (const [df, dr] of vectors) {
      const dir = DIR_BY_VECTOR.get(key(df, dr))
      if (!dir) return false
      grid.slides[dir] = (grid.slides[dir] | value) as Cell
    }
    return true
  }

  const paintCells = (pattern: Pattern | undefined, value: Cell): boolean => {
    if (!pattern) return true
    const vectors = vectorsOf(pattern)
    if (vectors.length === 0) return false
    for (const [df, dr] of vectors) {
      if (Math.abs(df) > 3 || Math.abs(dr) > 3) return false
      if (df === 0 && dr === 0) return false
      const k = key(df, dr)
      grid.cells[k] = ((grid.cells[k] ?? Cell.None) | value) as Cell
    }
    return true
  }

  if (!paintSlide(moveBuckets.slide, Cell.Move)) return null
  if (!paintCells(moveBuckets.leap, Cell.Move)) return null

  if (takeBuckets === undefined) {
    // A piece with no `attack` captures using its movement, so every move square
    // is also a capture square — the schema's default, and showing it as
    // move-only would misdescribe every bundled piece but the pawn.
    for (const k of Object.keys(grid.cells)) grid.cells[k] = Cell.Both
    for (const d of DIRECTIONS) if (grid.slides[d] === Cell.Move) grid.slides[d] = Cell.Both
  } else {
    if (!paintSlide(takeBuckets.slide, Cell.Capture)) return null
    if (!paintCells(takeBuckets.leap, Cell.Capture)) return null
  }

  return grid
}

export type WriteResult =
  | { ok: true; movement: unknown[]; attack: unknown[] | undefined }
  /** `'no-move'` — nothing to walk on. The schema's `.min(1)` refuses it, and the
   *  validator's message names a field the child has never seen. */
  | { ok: false; reason: 'no-move' }

const has = (value: Cell, axis: Cell.Move | Cell.Capture): boolean => (value & axis) !== 0

interface Emitted {
  kind: 'slide' | 'step'
  vectors: Array<[number, number]>
  maxDistance?: 1 | 2
  forward?: true
}

function vectorsEqual(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  if (a.length !== b.length) return false
  const bs = new Set(b.map(([df, dr]) => key(df, dr)))
  return a.every(([df, dr]) => bs.has(key(df, dr)))
}

function patternEqual(a: Emitted | undefined, b: Emitted | undefined): boolean {
  if (!a || !b) return a === b
  return a.maxDistance === b.maxDistance && a.forward === b.forward && vectorsEqual(a.vectors, b.vectors)
}

/**
 * Whether two emitted arrays describe the same reach.
 *
 * Compared per KIND BUCKET, never by array position. With one pattern per array
 * an index comparison happened to work; with a `[slide, step]` pair it silently
 * mis-detects equality whenever the two arrays were built in a different order,
 * and it would do so on exactly the multi-pattern pieces this control exists to
 * open.
 */
function sameReach(a: Emitted[], b: Emitted[]): boolean {
  const bucket = (ps: Emitted[]) => ({
    slide: ps.find((p) => p.kind === 'slide'),
    leap: ps.find((p) => p.kind !== 'slide'),
  })
  const x = bucket(a)
  const y = bucket(b)
  return patternEqual(x.slide, y.slide) && patternEqual(x.leap, y.leap)
}

/**
 * Compiles the grid back into `movement` and `attack`.
 *
 * `attack` is OMITTED when the capture reach is exactly the move reach, rather
 * than written out as a duplicate array. Two reasons, and the second is the
 * load-bearing one: it is what the schema means by the field being optional, and
 * it keeps a piece authored here byte-comparable with the bundled pieces that
 * were written by hand.
 *
 * A piece with capture squares and no move squares cannot be expressed —
 * `movement` carries `.min(1)`. A piece with move squares and no capture squares
 * ALSO cannot be expressed as "never captures": omitting `attack` means captures
 * fall back to the movement. The screen says so rather than pretending.
 */
export function writeGrid(grid: PieceGrid): WriteResult {
  const sortVectors = (v: Array<[number, number]>) =>
    v.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])

  const build = (axis: Cell.Move | Cell.Capture): Emitted[] => {
    const dirs = DIRECTIONS.filter((d) => has(grid.slides[d], axis)).map(
      (d) => [...DIRECTION_VECTORS[d]] as [number, number],
    )
    const cells = Object.entries(grid.cells)
      .filter(([, v]) => has(v, axis))
      .map(([k]) => k.split(',').map(Number) as [number, number])

    const out: Emitted[] = []
    if (dirs.length > 0) {
      out.push({
        kind: 'slide',
        vectors: sortVectors(dirs),
        ...(grid.reach === 'edge' ? {} : { maxDistance: grid.reach }),
        ...(grid.forward ? { forward: true as const } : {}),
      })
    }
    if (cells.length > 0) {
      out.push({
        kind: 'step',
        vectors: sortVectors(cells),
        ...(grid.forward ? { forward: true as const } : {}),
      })
    }
    return out
  }

  const movement = build(Cell.Move)
  if (movement.length === 0) return { ok: false, reason: 'no-move' }
  const attack = build(Cell.Capture)

  return {
    ok: true,
    movement,
    // No capture squares at all also omits `attack` — see the note above on why
    // that is not the same as "cannot capture".
    attack: attack.length === 0 || sameReach(movement, attack) ? undefined : attack,
  }
}

/** The next value when a cell or a direction is tapped: move -> capture -> both -> none. */
export function cycle(value: Cell): Cell {
  return ((value + 1) % 4) as Cell
}

/** Whether the grid names anywhere to walk — the pre-save hint, computed live. */
export function hasMoves(grid: PieceGrid): boolean {
  return (
    DIRECTIONS.some((d) => has(grid.slides[d], Cell.Move)) ||
    Object.values(grid.cells).some((v) => has(v, Cell.Move))
  )
}

/** Whether the grid names anywhere to capture that the move squares do not already cover. */
export function hasTakes(grid: PieceGrid): boolean {
  return (
    DIRECTIONS.some((d) => has(grid.slides[d], Cell.Capture)) ||
    Object.values(grid.cells).some((v) => has(v, Cell.Capture))
  )
}

/**
 * A one-line summary of the grid, for the "this is how the dex will read" note.
 *
 * Assembled from `ui.*` keys with placeholders rather than written as a Korean
 * sentence here — AC-016 keeps player-facing wording in the locale bundle, and
 * this line is offered to the author as the record's description text, so it
 * becomes player-facing the moment they accept it.
 *
 * It counts DIRECTIONS for the slide half and SQUARES for the leap half. The
 * previous version counted lit cells for both, which under a `slide` travel kind
 * was a number with no meaning — four lit cells were not four moves.
 */
export function describeGrid(t: Translate, grid: PieceGrid): string {
  const dirs = DIRECTIONS.filter((d) => grid.slides[d] !== Cell.None).length
  const moves = Object.values(grid.cells).filter((v) => has(v, Cell.Move)).length
  const takeDirs = DIRECTIONS.filter((d) => has(grid.slides[d], Cell.Capture)).length
  const takeCells = Object.values(grid.cells).filter((v) => has(v, Cell.Capture)).length

  const reachWord = t(`ui.editor.piece.summary.reach.${grid.reach}`)
  const fill = (k: string) =>
    t(k)
      .replace('{dirs}', String(dirs))
      .replace('{reach}', reachWord)
      .replace('{moves}', String(moves))
      .replace('{takes}', String(takeDirs + takeCells))

  if (dirs > 0 && moves > 0) return fill('ui.editor.piece.summary.both')
  if (dirs > 0) return fill('ui.editor.piece.summary.slide')
  return fill('ui.editor.piece.summary.hop')
}
