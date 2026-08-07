import type { Translate } from './i18n'

/**
 * How a piece moves, as one grid you tap (Chess Craft redesign).
 *
 * The schema says a piece's movement is an array of `MovePattern`s, each with a
 * kind, a vector list, an optional distance cap and an optional forward mirror —
 * and the editor's original form said exactly that: add a pattern, pick its
 * kind, tick its squares, repeat. That is the right control for the schema and
 * the wrong one for a nine-year-old, whose question is "which squares can it go
 * to, and can it take there".
 *
 * So this is one 7x7 grid whose centre is the piece, each cell cycling
 * move -> capture -> both -> none, plus one choice of how it travels. It compiles down
 * to the same `movement` / `attack` arrays; nothing about the schema moved.
 *
 * ## It refuses to open rather than flatten
 *
 * A grid with one kind cannot represent every legal record — a piece with a
 * sliding rook pattern AND a jumping knight pattern is two patterns of two
 * kinds, which the bundled knight-honour rule grants and an author can write in
 * the detailed form below. Opening such a piece here and re-emitting it would
 * silently delete half of it. `readGrid` returns null for anything it cannot
 * round-trip, and the screen says so and steps out of the way.
 */

/** What one cell of the grid means. */
export const enum Cell {
  None = 0,
  Move = 1,
  Capture = 2,
  Both = 3,
}

/** Offsets the grid offers, centre outward. Matches the detailed form's grid. */
export const GRID_RANGE = [3, 2, 1, 0, -1, -2, -3] as const

/** How a piece travels along its vectors. One of the schema's three kinds. */
export type Travel = 'step' | 'slide' | 'jump'

export interface PieceGrid {
  /** `"df,dr"` -> what that offset does. Absent means `Cell.None`. */
  cells: Record<string, Cell>
  travel: Travel
  /** Whether the vectors mirror by the owning side's forward direction. */
  forward: boolean
}

type Pattern = { kind?: unknown; vectors?: unknown; maxDistance?: unknown; forward?: unknown }

const key = (df: number, dr: number) => `${df},${dr}`

function vectorsOf(pattern: Pattern | undefined): Array<[number, number]> {
  if (!Array.isArray(pattern?.vectors)) return []
  return (pattern.vectors as unknown[]).flatMap((v) =>
    Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number' ? [[v[0], v[1]] as [number, number]] : [],
  )
}

/** Whether every offset in a pattern fits the grid this control draws. */
function withinGrid(pattern: Pattern | undefined): boolean {
  return vectorsOf(pattern).every(([df, dr]) => Math.abs(df) <= 3 && Math.abs(dr) <= 3)
}

/**
 * Reads a record's movement into the grid, or null when it does not fit.
 *
 * Null is returned for: more than one movement or attack pattern, two different
 * travel kinds, a distance cap (the grid has no control for one), an offset off
 * the grid, and movement and attack disagreeing about `forward`. Every one of
 * those is authorable in the detailed form and none of them survives a
 * round-trip through this control.
 */
export function readGrid(draft: Record<string, unknown>): PieceGrid | null {
  const movement = (draft.movement as Pattern[] | undefined) ?? []
  const attack = draft.attack as Pattern[] | undefined

  if (movement.length > 1) return null
  if (attack !== undefined && attack.length !== 1) return null

  const move = movement[0]
  const take = attack?.[0]
  if (move?.maxDistance !== undefined || take?.maxDistance !== undefined) return null
  if (!withinGrid(move) || !withinGrid(take)) return null

  const kinds = new Set([move?.kind, take?.kind].filter((k) => k !== undefined))
  if (kinds.size > 1) return null
  const kind = [...kinds][0]
  if (kind !== undefined && kind !== 'step' && kind !== 'slide' && kind !== 'jump') return null

  const forwards = new Set([move?.forward === true, ...(take ? [take.forward === true] : [])])
  if (forwards.size > 1) return null

  const cells: Record<string, Cell> = {}
  for (const [df, dr] of vectorsOf(move)) cells[key(df, dr)] = Cell.Move
  // A piece with no `attack` captures using its movement, so every move square
  // is also a capture square — that is the schema's default, and showing it as
  // marking them move-only would misdescribe every bundled piece but the pawn.
  if (take === undefined) {
    for (const k of Object.keys(cells)) cells[k] = Cell.Both
  } else {
    for (const [df, dr] of vectorsOf(take)) {
      const k = key(df, dr)
      cells[k] = cells[k] === Cell.Move ? Cell.Both : Cell.Capture
    }
  }

  return { cells, travel: (kind as Travel | undefined) ?? 'step', forward: forwards.has(true) }
}

export type WriteResult =
  | { ok: true; movement: unknown[]; attack: unknown[] | undefined }
  /** `'no-move'` — nothing to walk on. The schema's `.min(1)` refuses it, and the
   *  validator's message names a field the child has never seen. */
  | { ok: false; reason: 'no-move' }

/**
 * Compiles the grid back into `movement` and `attack`.
 *
 * `attack` is OMITTED when the capture squares are exactly the move squares,
 * rather than written out as a duplicate array. Two reasons, and the second is
 * the load-bearing one: it is what the schema means by the field being optional,
 * and it keeps a piece authored here byte-comparable with the bundled pieces
 * that were written by hand.
 *
 * A piece with capture squares and no move squares cannot be expressed —
 * `movement` carries `.min(1)`. A piece with move squares and no capture squares
 * ALSO cannot be expressed as "never captures": omitting `attack` means captures
 * fall back to the movement. The screen says so rather than pretending.
 */
export function writeGrid(grid: PieceGrid): WriteResult {
  const moves: Array<[number, number]> = []
  const takes: Array<[number, number]> = []
  for (const [k, value] of Object.entries(grid.cells)) {
    const [df, dr] = k.split(',').map(Number) as [number, number]
    if (value === Cell.Move || value === Cell.Both) moves.push([df, dr])
    if (value === Cell.Capture || value === Cell.Both) takes.push([df, dr])
  }
  if (moves.length === 0) return { ok: false, reason: 'no-move' }

  const same =
    moves.length === takes.length &&
    moves.every(([df, dr]) => takes.some(([tf, tr]) => tf === df && tr === dr))

  const pattern = (vectors: Array<[number, number]>) => ({
    kind: grid.travel,
    vectors,
    ...(grid.forward ? { forward: true } : {}),
  })

  return {
    ok: true,
    movement: [pattern(moves)],
    // No capture squares at all also omits `attack` — see the note above on why
    // that is not the same as "cannot capture".
    attack: same || takes.length === 0 ? undefined : [pattern(takes)],
  }
}

/** The next value when a cell is tapped: move -> capture -> both -> none. */
export function cycle(value: Cell): Cell {
  return ((value + 1) % 4) as Cell
}

/**
 * A one-line summary of the grid, for the "this is how the dex will read" note.
 *
 * Assembled from `ui.*` keys with placeholders rather than written as a Korean
 * sentence here — AC-016 keeps player-facing wording in the locale bundle, and
 * this line is offered to the author as the record's description text, so it
 * becomes player-facing the moment they accept it.
 */
export function describeGrid(t: Translate, grid: PieceGrid): string {
  const values = Object.values(grid.cells)
  const moves = values.filter((v) => v === Cell.Move || v === Cell.Both).length
  const takes = values.filter((v) => v === Cell.Capture || v === Cell.Both).length
  return t(`ui.editor.piece.summary.${grid.travel}`)
    .replace('{moves}', String(moves))
    .replace('{takes}', String(takes))
}
