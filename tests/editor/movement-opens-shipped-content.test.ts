// @vitest-environment jsdom
/**
 * What the movement grid can open, and what it must not quietly rewrite.
 *
 * Two questions, and the second is the one with a scar behind it. A grid that
 * REFUSES a record is safe — the editor is suppressed and the record is shown
 * read-only. A grid that ACCEPTS a record and re-serialises it differently is
 * not: the difference lands in the document the next time anything is saved,
 * and nothing in the app ever said so. `writeGrid` sorts vectors and groups
 * patterns, so "the same reach" and "the same bytes" are genuinely different
 * claims and this file asserts the second.
 *
 * Measured after the bishop was added: 19 pieces across the three sources
 * the app loads, 18 of which open. The one that does not is `piece.charger`
 * (`maxDistance: 3`), and it stays that way by design — the outermost ring cell
 * means "and keeps going", so a slide capped at exactly 3 has no encoding
 * (ADR-002). AC-006 pins the refusal SET rather than a count, so a second
 * exception is a failure rather than a drift nobody notices.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { sliceContentSource } from '@content/sets/slice'
import { gate6aContentSource } from '@content/sets/gate6a'
import { Cell, GRID_RANGE, paintAt, readGrid, writeGrid } from '../../src/ui/PieceMoves'
import { type PieceLike, reachOf } from '../helpers/reach'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

/** Every source the app loads. The COUNT is asserted — see the describe below. */
const SOURCES = [
  ['bundled', bundledContentSource],
  ['slice', sliceContentSource],
  ['gate6a', gate6aContentSource],
] as const

interface PieceRec {
  id: string
  movement: unknown[]
  attack?: unknown[]
}

const allPieces = (): Array<{ source: string; piece: PieceRec }> =>
  SOURCES.flatMap(([name, src]) =>
    ((src as unknown as { pieces: PieceRec[] }).pieces ?? []).map((piece) => ({ source: name, piece })),
  )

const movementOf = (p: PieceRec) => ({ movement: p.movement, attack: p.attack })

describe('AC-006 — the set of shipped pieces the grid cannot open is exactly one, and it is named', () => {
  it('sweeps every source the app loads', () => {
    // The premise of every assertion below. A prior failure in this repo came
    // from measuring against ONE source while the app loaded three, so the
    // count is asserted rather than assumed.
    expect(SOURCES.length).toBe(3)
    expect(allPieces().length, 'the fixture set shrank — re-measure before trusting the numbers').toBe(19)
  })

  it('refuses exactly piece.charger, and opens everything else', () => {
    const refused = allPieces()
      .filter(({ piece }) => readGrid(movementOf(piece) as unknown as Record<string, unknown>) === null)
      .map(({ piece }) => piece.id)
      .sort()
    expect(refused).toEqual(['piece.charger'])
  })

  it('names why the one refusal is refused, so the exception cannot be re-read as a bug', () => {
    const charger = allPieces().find(({ piece }) => piece.id === 'piece.charger')?.piece
    expect(charger, 'piece.charger left the bundle — AC-006 needs updating, not deleting').toBeTruthy()
    const slide = (charger!.movement as Array<{ kind: string; maxDistance?: number }>).find(
      (p) => p.kind === 'slide',
    )
    expect(slide?.maxDistance, 'the refusal is about a cap of exactly 3; if this changed, so did the reason').toBe(3)
  })
})

/**
 * Sorts a pattern list into a comparable shape: vectors as a sorted set, kinds
 * and caps and `forward` preserved. The one thing it deliberately throws away is
 * the ORDER the vectors were written in — see the describe below for why.
 */
function canonical(patterns: unknown): unknown {
  if (!Array.isArray(patterns)) return patterns
  return patterns
    .map((p) => {
      const q = p as { kind: string; vectors: Array<[number, number]>; maxDistance?: number; forward?: boolean }
      return {
        // `jump` and `step` are ONE kind as far as anything observable is
        // concerned: `reachFrom` gives every non-slide `maxSteps = 1` and
        // branches on nothing else, which is why `jump` was retired from the
        // authorable vocabulary while the schema kept accepting it. Four shipped
        // pieces still carry `jump` and re-serialise as `step`; treating that as
        // a semantic change would make this suite report a difference the game
        // cannot produce.
        kind: q.kind === 'jump' ? 'step' : q.kind,
        vectors: [...q.vectors].sort((a, b) => a[0] - b[0] || a[1] - b[1]),
        ...(q.maxDistance === undefined ? {} : { maxDistance: q.maxDistance }),
        ...(q.forward === undefined ? {} : { forward: q.forward }),
      }
    })
    .sort(
      (a, b) =>
        a.kind.localeCompare(b.kind) ||
        (a.maxDistance ?? 99) - (b.maxDistance ?? 99) ||
        // Tie-break on the first vector. Without it two patterns sharing a kind
        // AND a cap fall back to each side's incoming order — `writeGrid`'s
        // grouping order on one side, the document's hand-written order on the
        // other — and the comparison fails on correct code. `writeGrid` cannot
        // emit such a pair (one pattern per cap), but a hand-authored document
        // can, so this guards a false failure rather than a real one.
        (a.vectors[0]?.[0] ?? 0) - (b.vectors[0]?.[0] ?? 0) ||
        (a.vectors[0]?.[1] ?? 0) - (b.vectors[0]?.[1] ?? 0),
    )
}

describe('every piece the grid opens survives a round-trip', () => {
  /**
   * NOT byte-for-byte against the shipped document, and that is a finding rather
   * than a concession.
   *
   * `writeGrid` sorts vectors; the bundled content is hand-written in a human
   * order (`piece.king` ships `[1,0],[-1,0],[0,1]…` and compiles back as
   * `[-1,-1],[-1,0],[-1,1]…`). So opening a piece in the maker and saving it has
   * ALWAYS rewritten its vector order, long before this change — measured
   * 2026-08-09, and the PLAN's Phase 4 exit asked for an equality that was never
   * true of the code it was written against.
   *
   * Two properties are true, checkable, and are what the exit actually meant:
   *
   * 1. **Semantic identity** — the piece does the same thing. Same kinds, same
   *    vector SETS, same caps, same `forward`.
   * 2. **Idempotence** — byte-level, and this is the real stability claim: a
   *    second round-trip changes nothing. Without it a save could churn the
   *    document a little more every time it ran, which is the failure the
   *    byte-equality was reaching for.
   */
  it.each(
    allPieces()
      .filter(({ piece }) => readGrid(movementOf(piece) as unknown as Record<string, unknown>) !== null)
      .map(({ source, piece }) => [`${source}/${piece.id}`, piece] as const),
  )('%s', (_label, piece) => {
    const grid = readGrid(movementOf(piece) as unknown as Record<string, unknown>)
    expect(grid).not.toBeNull()
    const out = writeGrid(grid!)
    expect(out.ok, 'a grid read from shipped content must be writable').toBe(true)
    if (!out.ok) return

    expect(canonical(out.movement), 'the piece stopped doing what it shipped doing').toEqual(
      canonical(piece.movement),
    )
    expect(canonical(out.attack)).toEqual(canonical(piece.attack))

    const again = writeGrid(readGrid({ movement: out.movement, attack: out.attack } as Record<string, unknown>)!)
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.movement, 'a second save moved the bytes again').toEqual(out.movement)
    expect(again.attack).toEqual(out.attack)
  })

  it('the whole opening set is swept, not a shrinking subset', () => {
    // Guards the `it.each` above: it enumerates the pieces that CURRENTLY open,
    // so a regression that closes half of them would quietly shrink the table
    // instead of failing it. This is the row count that makes the sweep mean
    // something, and AC-006 pins which one is missing.
    const opens = allPieces().filter(
      ({ piece }) => readGrid(movementOf(piece) as unknown as Record<string, unknown>) !== null,
    )
    expect(opens.length).toBe(18)
  })
})

describe('ADR-008 — slides are grouped by cap, under a canonical order', () => {
  it('round-trips a piece that slides different distances in different directions', () => {
    // Unrepresentable before this change: `readGrid` refused any document whose
    // slide patterns disagreed about reach, because the grid held ONE cap.
    const mixed = {
      movement: [
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
        { kind: 'slide', vectors: [[1, 0]] },
      ],
    }
    const grid = readGrid(mixed as unknown as Record<string, unknown>)
    expect(grid, 'a per-direction cap must now open').not.toBeNull()
    const out = writeGrid(grid!)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.movement).toEqual(mixed.movement)
  })

  it('orders capped groups before the uncapped one, so the bytes are stable', () => {
    // The canonical order is the whole reason the round-trip above can be an
    // equality rather than a set comparison. Asserted directly so a change to it
    // fails here, where the rule is written, rather than in 17 unrelated rows.
    const grid = readGrid({
      movement: [
        { kind: 'slide', vectors: [[1, 0]] },
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
        { kind: 'slide', vectors: [[0, -1]], maxDistance: 1 },
      ],
    } as unknown as Record<string, unknown>)
    expect(grid).not.toBeNull()
    const out = writeGrid(grid!)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    const caps = (out.movement as Array<{ maxDistance?: number }>).map((p) => p.maxDistance)
    expect(caps, 'capped ascending, uncapped last').toEqual([1, 2, undefined])
  })
})

describe('AC-007 — the one piece the grid cannot open survives an unrelated edit', () => {
  it('keeps piece.charger byte-identical, and never disables the save', () => {
    const before = (bundledContentSource as unknown as { pieces: PieceRec[] }).pieces.find(
      (p) => p.id === 'piece.charger',
    )
    expect(before, 'the fixture lost piece.charger').toBeTruthy()

    let committed: unknown = null
    render(
      React.createElement(Edit, {
        source: structuredClone(bundledContentSource),
        onCommit: (next: unknown) => {
          committed = next
        },
      }),
    )
    fireEvent.click(screen.getByTestId('editor-tab-library'))
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    fireEvent.click(screen.getByTestId('library-open-piece.charger'))

    // The premise: this is the read-only path, not the grid path. If the grid
    // ever learns to draw a cap of 3 this assertion is what tells us to move
    // this test rather than delete it.
    expect(screen.queryByTestId('editor-readonly-moves'), 'charger opened in the grid — AC-006 changed').toBeTruthy()

    const save = screen.getByTestId('editor-save') as HTMLButtonElement
    expect(save.disabled, 'the save must not be blocked by a half this screen cannot draw').toBe(false)

    // An edit that has nothing to do with movement.
    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '돌격병' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    expect(screen.queryByTestId('editor-errors')?.textContent ?? '').toBe('')
    expect(committed, 'the save produced nothing').not.toBeNull()
    const after = (committed as { pieces: PieceRec[] }).pieces.find((p) => p.id === 'piece.charger')
    expect(after, 'the save dropped the record').toBeTruthy()
    expect(after!.movement, 'the movement half was rewritten by a rename').toEqual(before!.movement)
    expect(after!.attack).toEqual(before!.attack)
  })
})

/**
 * The grid's drawing and the engine's answer, compared for every shipped piece.
 *
 * This is the oracle the deleted engine preview used to carry in the app. ADR-032
 * made that panel a verification device rather than decoration — it called the
 * real `legalActions`, so it could not drift from match behaviour — and ADR-009
 * deleted it on the understanding that the role moved into the suite rather than
 * evaporating. This is that move, and it is a stronger check than the panel was:
 * the panel proved its OWN builder agreed with the engine, while this proves the
 * squares a child actually sees lit are the squares the piece can actually reach.
 */
describe('what the grid draws is what the engine does', () => {
  /** The squares the grid paints for one axis, as board ids around `origin`. */
  function painted(grid: NonNullable<ReturnType<typeof readGrid>>, axis: Cell.Move | Cell.Capture): string[] {
    const out: string[] = []
    for (const dr of GRID_RANGE) {
      for (const df of GRID_RANGE) {
        if (df === 0 && dr === 0) continue
        if (paintAt(grid, axis, df, dr).kind === 'none') continue
        out.push(`${String.fromCharCode(97 + 4 + df)}${5 + dr}`)
      }
    }
    return out.sort()
  }

  it.each(
    allPieces()
      .filter(({ piece }) => readGrid(movementOf(piece) as unknown as Record<string, unknown>) !== null)
      .map(({ source, piece }) => [`${source}/${piece.id}`, piece] as const),
  )('%s', (_label, piece) => {
    const grid = readGrid(movementOf(piece) as unknown as Record<string, unknown>)!
    const engine = reachOf(movementOf(piece) as PieceLike, { width: 9, height: 9, origin: 'e5' })

    // A piece whose reach leaves the +-3 window cannot be compared square for
    // square — the grid only has cells for what it can draw. Those are compared
    // on the INTERSECTION, and the premise is asserted so the row cannot pass by
    // comparing two empty sets.
    const inWindow = (sq: string) =>
      Math.abs(sq.charCodeAt(0) - 97 - 4) <= 3 && Math.abs(Number(sq.slice(1)) - 5) <= 3
    const engineMoves = engine.all.filter(inWindow).sort()
    const drawn = painted(grid, Cell.Move)

    expect(drawn.length + engineMoves.length, 'nothing to compare — this row proves nothing').toBeGreaterThan(0)
    expect(drawn, 'the grid lights squares the engine does not reach, or misses ones it does').toEqual(engineMoves)
  })
})
