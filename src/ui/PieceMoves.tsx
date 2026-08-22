import type { Translate } from './i18n'
import { isValidTurnPair } from '../content/movement'

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
 * The straight grid remains unchanged while `MovementEditorState` adds ordered
 * turning rows beside it. The schema's `turning_slide` variant is deliberately
 * kept out of `PieceGrid`, so straight canonical output cannot be flattened into
 * a ray and the shared adapter can keep move and capture rows independent.
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

/** Which of a piece's two questions a cap, a cell or a tap belongs to. */
export type Axis = 'move' | 'capture'

/** The axis a `Cell` bit names. */
export const axisOf = (bit: Cell.Move | Cell.Capture): Axis => (bit === Cell.Move ? 'move' : 'capture')
export const REACH_VALUES = [1, 2, 'edge'] as const

export interface PieceGrid {
  /** `"df,dr"` -> what that offset does. Absent means `Cell.None`. */
  cells: Record<string, Cell>
  /** Direction -> what sliding that way does. */
  slides: Record<Dir8, Cell>
  /**
   * Cap per DIRECTION and per AXIS.
   *
   * It was a single scalar, then one cap per direction, and it is now one per
   * direction on each of the two axes — which is what `movePattern` has said all
   * along: `movement` and `attack` are separate arrays and each pattern in each
   * carries its own `maxDistance`. The editor was the narrower of the two.
   *
   * The middle version cost two review findings, and they are worth keeping
   * because they are the same defect wearing different clothes. With ONE cap per
   * direction, a tap on the capture grid had to either overwrite the cap — which
   * silently lengthened a MOVEMENT ray on a mode the child was not looking at —
   * or adopt it, which drew the square they DID tap as untouched while a square
   * they never tapped became the tip. Both are edits a child cannot see. There is
   * no third answer while one number has to serve two questions.
   *
   * A direction that does not slide on an axis still holds a value here; it is
   * simply never read.
   */
  reach: Record<Axis, Record<Dir8, Reach>>
  /** Whether the vectors mirror by the owning side's forward direction. */
  forward: boolean
}

/** The cap every sliding direction shares, across both axes, or null when they disagree. */
export function sharedReach(grid: PieceGrid): Reach | null {
  const caps = new Set<Reach>()
  for (const axis of ['move', 'capture'] as const) {
    const bit = axis === 'move' ? Cell.Move : Cell.Capture
    for (const d of DIRECTIONS) if ((grid.slides[d] & bit) !== 0) caps.add(grid.reach[axis][d])
  }
  return caps.size === 1 ? [...caps][0]! : null
}

/** Sets one cap on every direction of every axis — used by fixtures, not by the UI. */
export function withAllReach(grid: PieceGrid, reach: Reach): PieceGrid {
  const all = () => Object.fromEntries(DIRECTIONS.map((d) => [d, reach])) as Record<Dir8, Reach>
  return { ...grid, reach: { move: all(), capture: all() } }
}

type Pattern = { kind?: unknown; vectors?: unknown; maxDistance?: unknown; forward?: unknown }

const key = (df: number, dr: number) => `${df},${dr}`

export function blankGrid(): PieceGrid {
  return {
    cells: {},
    slides: { n: 0, ne: 0, e: 0, se: 0, s: 0, sw: 0, w: 0, nw: 0 },
    reach: {
      move: { n: 'edge', ne: 'edge', e: 'edge', se: 'edge', s: 'edge', sw: 'edge', w: 'edge', nw: 'edge' },
      capture: { n: 'edge', ne: 'edge', e: 'edge', se: 'edge', s: 'edge', sw: 'edge', w: 'edge', nw: 'edge' },
    },
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
type Buckets = { slides: Pattern[]; leap?: Pattern }

function bucketize(patterns: Pattern[]): Buckets | null {
  const out: Buckets = { slides: [] }
  for (const p of patterns) {
    if (p.kind === 'slide') {
      // Several are expected now, one per distinct cap. Refusing the second was
      // correct only while the grid held a single shared reach.
      out.slides.push(p)
    } else if (p.kind === 'step' || p.kind === 'jump') {
      if (out.leap) return null
      out.leap = p
    } else {
      return null
    }
  }
  return out
}

/**
 * The compass ray a cell sits on, or null when it sits on none.
 *
 * Half the grid is on no ray at all. A slide vector must be one of the eight
 * compass units — `DIR_BY_VECTOR` holds exactly those — so a knight-shaped
 * offset like `(1,2)` has no "and keeps going" to offer and never will: a
 * repeating knight vector is an explicit non-goal, and the engine would need a
 * different pattern shape for it. Those cells cycle through two states, not
 * three, and that asymmetry is a fact about the model rather than a choice this
 * control made.
 */
export function rayOf(df: number, dr: number): { dir: Dir8; distance: 1 | 2 | 3 } | null {
  if (df === 0 && dr === 0) return null
  if (df !== 0 && dr !== 0 && Math.abs(df) !== Math.abs(dr)) return null
  const distance = Math.max(Math.abs(df), Math.abs(dr))
  if (distance > 3) return null
  const dir = DIR_BY_VECTOR.get(key(Math.sign(df), Math.sign(dr)))
  return dir ? { dir, distance: distance as 1 | 2 | 3 } : null
}

/** What one cell shows, for one axis. `endless` is the ring cell of an uncapped ray. */
export type CellPaint =
  | { kind: 'none' }
  | { kind: 'leap' }
  | { kind: 'ray'; tip: boolean; endless: boolean }

const bit = (v: Cell, axis: Cell.Move | Cell.Capture) => (v & axis) !== 0

/**
 * What the cell at `(df, dr)` draws for one axis.
 *
 * A ray is a property of its DIRECTION, so every cell between the centre and the
 * cap draws as part of the trail rather than each holding its own value. That is
 * the whole point of putting the ray in the drawing: a lit cell means "this
 * square is reachable", which is exactly what the old split grid could not say.
 */
export function paintAt(grid: PieceGrid, axis: Cell.Move | Cell.Capture, df: number, dr: number): CellPaint {
  const ray = rayOf(df, dr)
  if (ray && bit(grid.slides[ray.dir], axis)) {
    const cap = grid.reach[axisOf(axis)][ray.dir]
    const reach = cap === 'edge' ? 3 : cap
    if (ray.distance <= reach) {
      return { kind: 'ray', tip: ray.distance === reach, endless: cap === 'edge' && ray.distance === 3 }
    }
  }
  if (bit((grid.cells[key(df, dr)] ?? Cell.None) as Cell, axis)) return { kind: 'leap' }
  return { kind: 'none' }
}

/**
 * One tap: none -> leap -> ray -> none, skipping `ray` where it cannot exist.
 *
 * Two things worth knowing before reading a test that looks surprising.
 *
 * 1. **Off-ray cells have two states, not three** — see `rayOf`. Tapping one
 *    twice returns it, rather than three times.
 * 2. **Tapping any cell of an existing ray clears the WHOLE ray on that axis**,
 *    not just that square. A cap belongs to a direction; there is no way to keep
 *    squares 1 and 3 of a ray while dropping 2, so "remove what is here" is the
 *    only honest answer to a tap and it is the one a child can undo by tapping
 *    again. Shortening is tap-to-clear then tap-tap on the new tip.
 * 3. **The other axis is never touched.** Each axis owns its own cap for each
 *    direction, so a tap here cannot move a ray on the mode the child is not
 *    looking at — see the note on `PieceGrid.reach` for the two review findings
 *    that bought that rule.
 */
export function cycleAt(grid: PieceGrid, axis: Cell.Move | Cell.Capture, df: number, dr: number): PieceGrid {
  const k = key(df, dr)
  const current = paintAt(grid, axis, df, dr)
  const ray = rayOf(df, dr)

  if (current.kind === 'ray') {
    const slides = { ...grid.slides, [ray!.dir]: (grid.slides[ray!.dir] & ~axis) as Cell }
    // A cap with no ray under it is a dead value. Leaving it behind is
    // invisible in play — nothing reads `reach` for a direction that does not
    // slide — and it makes two grids that draw identically compare unequal,
    // which is how a "tapping three times puts it back" test fails on code that
    // is behaving correctly.
    const axis_ = axisOf(axis)
    return {
      ...grid,
      slides,
      reach: { ...grid.reach, [axis_]: { ...grid.reach[axis_], [ray!.dir]: 'edge' as Reach } },
    }
  }

  const cells = { ...grid.cells }
  if (current.kind === 'none') {
    cells[k] = ((cells[k] ?? Cell.None) | axis) as Cell
    return { ...grid, cells }
  }

  // Was a leap. Off a ray there is nowhere further to go, so it turns off.
  const next = ((cells[k] ?? Cell.None) & ~axis) as Cell
  if (next === Cell.None) delete cells[k]
  else cells[k] = next
  if (!ray) return { ...grid, cells }

  // The tapped square's distance is the cap, on THIS axis only. Nothing about
  // the other axis is read or written here, which is the whole point of the cap
  // being per axis.
  const axis_ = axisOf(axis)
  const reach: Reach = ray.distance === 3 ? 'edge' : ray.distance
  return {
    ...grid,
    cells,
    slides: { ...grid.slides, [ray.dir]: (grid.slides[ray.dir] | axis) as Cell },
    reach: { ...grid.reach, [axis_]: { ...grid.reach[axis_], [ray.dir]: reach } },
  }
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

  const present = [
    ...moveBuckets.slides,
    moveBuckets.leap,
    ...(takeBuckets?.slides ?? []),
    takeBuckets?.leap,
  ].filter((p): p is Pattern => p !== undefined)
  if (present.length === 0) return blankGrid()

  // A capped leap is inert (the engine gives every non-slide `maxSteps = 1`),
  // so the control has no honest way to show one.
  for (const leap of [moveBuckets.leap, takeBuckets?.leap]) {
    if (leap && leap.maxDistance !== undefined) return null
  }

  const forwards = new Set(present.map((p) => p.forward === true))
  if (forwards.size > 1) return null

  const grid = blankGrid()
  grid.forward = forwards.has(true)

  /**
   * Paints every slide pattern, recording each direction's own cap.
   *
   * Refuses when one direction is claimed twice at two different caps — that is
   * a document saying a piece slides both two squares and to the edge the same
   * way, which the grid has no cell for and the engine would resolve by pattern
   * order rather than by anything a child could see.
   */
  const paintSlides = (patterns: Pattern[], value: Cell.Move | Cell.Capture): boolean => {
    const axis = axisOf(value)
    for (const pattern of patterns) {
      const reach = reachOf(pattern)
      if (reach === null) return false
      const vectors = vectorsOf(pattern)
      if (vectors.length === 0) return false
      for (const [df, dr] of vectors) {
        const dir = DIR_BY_VECTOR.get(key(df, dr))
        if (!dir) return false
        // Refused only when the SAME axis claims this direction twice at two
        // caps — the grid has one cell per direction per axis, so there is
        // nowhere to put the second answer. The two axes disagreeing is no
        // longer a refusal: it is a document `movePattern` always permitted and
        // the editor used to be too narrow to open.
        if ((grid.slides[dir] & value) !== 0 && grid.reach[axis][dir] !== reach) return false
        grid.slides[dir] = (grid.slides[dir] | value) as Cell
        grid.reach[axis][dir] = reach
      }
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

  if (!paintSlides(moveBuckets.slides, Cell.Move)) return null
  if (!paintCells(moveBuckets.leap, Cell.Move)) return null

  if (takeBuckets === undefined) {
    // A piece with no `attack` captures using its movement, so every move square
    // is also a capture square — the schema's default, and showing it as
    // move-only would misdescribe every bundled piece but the pawn.
    for (const k of Object.keys(grid.cells)) grid.cells[k] = Cell.Both
    for (const d of DIRECTIONS) {
      if (grid.slides[d] !== Cell.Move) continue
      grid.slides[d] = Cell.Both
      // The CAP has to be promoted with the direction, now that each axis owns
      // one. Leaving the capture cap at its default made the two axes disagree
      // about a ray neither the document nor the author had said anything about,
      // so `writeGrid` emitted an `attack` for a record that had none — a field
      // appearing out of a round-trip that was supposed to be a no-op.
      grid.reach.capture[d] = grid.reach.move[d]
    }
  } else {
    if (!paintSlides(takeBuckets.slides, Cell.Capture)) return null
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
    // Keyed by cap, because there is one slide pattern per cap now. Taking the
    // FIRST slide pattern — which is what this did — silently compared a
    // two-square ray against an edge ray and called them the same reach, which
    // would omit an `attack` that genuinely differs from the movement.
    slides: new Map(ps.filter((p) => p.kind === 'slide').map((p) => [String(p.maxDistance ?? 'edge'), p])),
    leap: ps.find((p) => p.kind !== 'slide'),
  })
  const x = bucket(a)
  const y = bucket(b)
  if (x.slides.size !== y.slides.size) return false
  for (const [cap, pattern] of x.slides) {
    if (!patternEqual(pattern, y.slides.get(cap))) return false
  }
  return patternEqual(x.leap, y.leap)
}

/** The straight-pattern half shared by the grid writer and turning adapter. */
function buildGridPatterns(grid: PieceGrid, axis: Cell.Move | Cell.Capture): Emitted[] {
  const sortVectors = (v: Array<[number, number]>) =>
    v.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const byReach = new Map<Reach, Array<[number, number]>>()
  for (const d of DIRECTIONS) {
    if (!has(grid.slides[d], axis)) continue
    const reach = grid.reach[axisOf(axis)][d]
    const group = byReach.get(reach) ?? []
    group.push([...DIRECTION_VECTORS[d]] as [number, number])
    byReach.set(reach, group)
  }
  const capOrder = (reach: Reach) => (reach === 'edge' ? Number.POSITIVE_INFINITY : reach)
  const slideGroups = [...byReach.entries()].sort((a, b) => capOrder(a[0]) - capOrder(b[0]))
  const cells = Object.entries(grid.cells)
    .filter(([, value]) => has(value, axis))
    .map(([k]) => k.split(',').map(Number) as [number, number])
  const out: Emitted[] = slideGroups.map(([reach, vectors]) => ({
    kind: 'slide',
    vectors: sortVectors(vectors),
    ...(reach === 'edge' ? {} : { maxDistance: reach }),
    ...(grid.forward ? { forward: true as const } : {}),
  }))
  if (cells.length > 0) {
    out.push({
      kind: 'step',
      vectors: sortVectors(cells),
      ...(grid.forward ? { forward: true as const } : {}),
    })
  }
  return out
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
  const movement = buildGridPatterns(grid, Cell.Move)
  if (movement.length === 0) return { ok: false, reason: 'no-move' }
  const attack = buildGridPatterns(grid, Cell.Capture)

  return {
    ok: true,
    movement,
    // No capture squares at all also omits `attack` — see the note above on why
    // that is not the same as "cannot capture".
    attack: attack.length === 0 || sameReach(movement, attack) ? undefined : attack,
  }
}

/** The compact editor's three supported total-distance caps. */
export type TurningReach = 2 | 3 | 'edge'
export const TURNING_REACH_VALUES = [2, 3, 'edge'] as const

export interface TurningRow {
  first: Dir8
  second: Dir8
  reach: TurningReach
}

export interface MovementEditorState {
  grid: PieceGrid
  turning: {
    move: TurningRow[]
    capture: TurningRow[]
  }
}

function directionOfVector(vector: unknown): Dir8 | null {
  if (!Array.isArray(vector) || vector.length !== 2 || typeof vector[0] !== 'number' || typeof vector[1] !== 'number') {
    return null
  }
  return DIR_BY_VECTOR.get(key(vector[0], vector[1])) ?? null
}

/** Converts one validated schema pattern into the row shape shared by both UIs. */
export function turningRowFromPattern(pattern: unknown): TurningRow | null {
  if (!pattern || typeof pattern !== 'object' || (pattern as Pattern).kind !== 'turning_slide') return null
  const vectors = vectorsOf(pattern as Pattern)
  if (vectors.length !== 2 || !isValidTurnPair(vectors[0]!, vectors[1]!)) return null
  const first = directionOfVector(vectors[0])
  const second = directionOfVector(vectors[1])
  if (!first || !second) return null
  const maxDistance = (pattern as Pattern).maxDistance
  let reach: TurningReach
  if (maxDistance === undefined) reach = 'edge'
  else if (maxDistance === 2 || maxDistance === 3) reach = maxDistance
  else return null
  return { first, second, reach }
}

export function turningPatternFromRow(row: TurningRow, forward = false): Record<string, unknown> {
  return {
    kind: 'turning_slide',
    vectors: [
      [...DIRECTION_VECTORS[row.first]],
      [...DIRECTION_VECTORS[row.second]],
    ],
    ...(row.reach === 'edge' ? {} : { maxDistance: row.reach }),
    ...(forward ? { forward: true } : {}),
  }
}

function splitMovementPatterns(patterns: unknown[]): { straight: Pattern[]; turning: TurningRow[] } | null {
  const straight: Pattern[] = []
  const turning: TurningRow[] = []
  for (const raw of patterns) {
    if (!raw || typeof raw !== 'object') return null
    const pattern = raw as Pattern
    if (pattern.kind === 'turning_slide') {
      const row = turningRowFromPattern(pattern)
      if (!row) return null
      turning.push(row)
    } else {
      straight.push(pattern)
    }
  }
  return { straight, turning }
}

function withoutCaptures(grid: PieceGrid): PieceGrid {
  const cells: Record<string, Cell> = {}
  for (const [k, value] of Object.entries(grid.cells)) {
    const next = (value & ~Cell.Capture) as Cell
    if (next !== Cell.None) cells[k] = next
  }
  const slides = { ...grid.slides }
  for (const direction of DIRECTIONS) slides[direction] = (slides[direction] & ~Cell.Capture) as Cell
  return { ...grid, cells, slides }
}

/**
 * Reads straight patterns through the established grid compiler and keeps
 * turning patterns in their own rows. An explicit attack with only turning
 * patterns must clear the grid's default capture promotion; an omitted attack
 * instead copies movement rows, matching the schema's fallback semantics.
 */
export function readMovementEditor(draft: Record<string, unknown>): MovementEditorState | null {
  const movement = draft.movement
  const attack = draft.attack
  if (!Array.isArray(movement)) return null
  if (attack !== undefined && (!Array.isArray(attack) || attack.length === 0)) return null

  const moveParts = splitMovementPatterns(movement)
  const attackParts = attack === undefined ? undefined : splitMovementPatterns(attack)
  if (!moveParts || attackParts === null) return null

  const allPatterns = [...movement, ...(attack ?? [])].filter(
    (pattern): pattern is Record<string, unknown> => Boolean(pattern) && typeof pattern === 'object',
  )
  const forwards = new Set(allPatterns.map((pattern) => pattern.forward === true))
  if (forwards.size > 1) return null

  const straightDraft: Record<string, unknown> = { movement: moveParts.straight }
  if (attackParts !== undefined && attackParts.straight.length > 0) straightDraft.attack = attackParts.straight
  let grid = readGrid(straightDraft)
  if (!grid) return null
  if (attackParts !== undefined && attackParts.straight.length === 0) grid = withoutCaptures(grid)
  grid.forward = forwards.has(true)

  return {
    grid,
    turning: {
      move: moveParts.turning,
      capture: attackParts === undefined ? moveParts.turning.map((row) => ({ ...row })) : attackParts.turning,
    },
  }
}

function sameWrittenPatterns(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false
  const counts = (patterns: unknown[]) => {
    const out = new Map<string, number>()
    for (const pattern of patterns) {
      const key = JSON.stringify(pattern)
      out.set(key, (out.get(key) ?? 0) + 1)
    }
    return out
  }
  const left = counts(a)
  const right = counts(b)
  if (left.size !== right.size) return false
  for (const [pattern, count] of left) if (right.get(pattern) !== count) return false
  return true
}

function canonicalTurningRows(rows: TurningRow[]): TurningRow[] {
  const reachOrder = (reach: TurningReach) => (reach === 'edge' ? Number.POSITIVE_INFINITY : reach)
  return rows.slice().sort(
    (a, b) =>
      DIRECTIONS.indexOf(a.first) - DIRECTIONS.indexOf(b.first) ||
      DIRECTIONS.indexOf(a.second) - DIRECTIONS.indexOf(b.second) ||
      reachOrder(a.reach) - reachOrder(b.reach),
  )
}

/** Compiles the shared piece/grant state, preserving independent attack rows. */
export function writeMovementEditor(state: MovementEditorState): WriteResult {
  const straightMovement = buildGridPatterns(state.grid, Cell.Move)
  const straightAttack = buildGridPatterns(state.grid, Cell.Capture)
  const turningMovement = canonicalTurningRows(state.turning.move).map((row) =>
    turningPatternFromRow(row, state.grid.forward),
  )
  const turningAttack = canonicalTurningRows(state.turning.capture).map((row) =>
    turningPatternFromRow(row, state.grid.forward),
  )
  const movement = [...straightMovement, ...turningMovement]
  if (movement.length === 0) return { ok: false, reason: 'no-move' }
  const attack = [...straightAttack, ...turningAttack]
  return {
    ok: true,
    movement,
    attack: attack.length === 0 || sameWrittenPatterns(movement, attack) ? undefined : attack,
  }
}

export function hasMovementEditorMoves(state: MovementEditorState): boolean {
  return hasMoves(state.grid) || state.turning.move.length > 0
}

export function hasMovementEditorTakes(state: MovementEditorState): boolean {
  return hasTakes(state.grid) || state.turning.capture.length > 0
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

  // A single word cannot describe a piece that slides two squares one way and
  // to the edge another. Saying one of them would be worse than saying neither,
  // because this line is offered to the author AS the record's description and
  // becomes player-facing the moment they accept it.
  const shared = sharedReach(grid)
  const reachWord = t(`ui.editor.piece.summary.reach.${shared ?? 'mixed'}`)
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

export function describeMovementEditor(t: Translate, editor: MovementEditorState): string {
  const turning = editor.turning.move.length
  if (turning === 0) return describeGrid(t, editor.grid)
  const turningLine = t('ui.editor.piece.summary.turning-summary')
    .replace('{turns}', String(turning))
    .replace('{takes}', String(editor.turning.capture.length))
  return hasMovementEditorMoves({ ...editor, turning: { ...editor.turning, move: [] } })
    ? `${describeGrid(t, editor.grid)} / ${turningLine}`
    : turningLine
}
