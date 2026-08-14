import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { loadContentSet, type ContentSet } from '@content/load'
import { cloneValid, type ContentSource } from '../content/fixtures/valid-set'
import { exportContent, importContent } from '@editor/io'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * PLAN Phase 2 — the relocation lock (ADR-002, ADR-003, ADR-007).
 *
 * A piece a skill card relocated may not take the move the turn still owes.
 * The lock is a schema v12 per-card flag, resolved at ADR-001's settlement step
 * as a duration-one `forbid_movement` grant on every relocation subject's final
 * surviving square.
 *
 * `untilPly = plyCount + 1` looks off by one and is not: the card branch returns
 * without incrementing `plyCount` (`engine.ts:1132-1149`), so the grant is live
 * (`untilPly > plyCount`) exactly while the owed move is generated and expires
 * when that move increments the ply.
 */

// ---------------------------------------------------------------------------
// v12 fixture plumbing
// ---------------------------------------------------------------------------

/**
 * The reference fixture is `schemaVersion: 1`, so the loader INJECTS all three
 * skill-card flags and its injection spreads last — a v1 document therefore
 * cannot declare `lockRelocatedAfterPlay: true` at all. Testing the lock means
 * testing a real v12 document, so this upgrades the source rather than fighting
 * the normalizer.
 */
function v12Source(mutate?: (src: ContentSource) => void): ContentSource {
  const src = cloneValid()
  src.schemaVersion = 12
  for (const card of src.skillCards) {
    card.royalFollowUp ??= 'preserve'
    card.protectRelocatedAfterPlay ??= false
    card.lockRelocatedAfterPlay ??= false
  }
  mutate?.(src)
  return src
}

function v12Content(mutate?: (src: ContentSource) => void): ContentSet {
  const result = loadContentSet(v12Source(mutate))
  if (!result.ok) throw new Error(`v12 fixture is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  return result.set
}

/** Finds a skill card in a raw source by id, failing loudly rather than silently. */
function cardIn(src: ContentSource, id: string): Record<string, unknown> {
  const card = src.skillCards.find((c: { id: string }) => c.id === id)
  if (!card) throw new Error(`fixture has no ${id}`)
  return card as Record<string, unknown>
}

const SWAP = {
  id: 'skill.swap',
  nameKey: 'skill.swap.name',
  textKey: 'skill.swap.text',
  uses: 1,
  royalFollowUp: 'preserve',
  protectRelocatedAfterPlay: false,
  lockRelocatedAfterPlay: true,
  effects: [
    {
      trigger: 'on_play',
      condition: { kind: 'always' },
      actions: [{ kind: 'swap_pieces', a: { kind: 'chosen_friendly' }, b: { kind: 'chosen_friendly' } }],
    },
  ],
}

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })
const K_W = at('a3', 'piece.king')
const K_B = at('f3', 'piece.king', 'black')

function position(content: ContentSet, placements: Place[], held: string[]): GameState {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements,
    ruleCardId: null,
    held: { white: held },
    captured: { white: [] },
  })
}

function playCard(state: GameState, content: ContentSet, cardId: string, targets: SquareId[]): GameState {
  const action = legalActions(state, content).find(
    (a) =>
      a.kind === 'play_card' &&
      a.cardId === cardId &&
      a.targets.length === targets.length &&
      a.targets.every((t, i) => t === targets[i]),
  )
  if (!action) throw new Error(`${cardId} on [${targets.join(', ')}] is not legal — the fixture is wrong, not the engine`)
  return apply(state, action, content)
}

const movesFrom = (state: GameState, content: ContentSet, from: SquareId): string[] =>
  legalActions(state, content)
    .filter((a) => a.kind === 'move' && a.from === from)
    .map((a) => (a as { to: SquareId }).to)
    .sort()

// ---------------------------------------------------------------------------
// AC-001 / AC-002 — the lock itself
// ---------------------------------------------------------------------------

describe('AC-001: a teleported piece cannot take the move the turn owes', () => {
  const locked = v12Content((src) => {
    cardIn(src, 'skill.teleport').lockRelocatedAfterPlay = true
  })
  const unlocked = v12Content()

  const board: Place[] = [K_W, at('a1', 'piece.rook'), at('e1', 'piece.knight'), K_B]

  it('removes every move from the square the piece landed on', () => {
    const after = playCard(position(locked, board, ['skill.teleport']), locked, 'skill.teleport', ['a1', 'd4'])

    expect(after.board.get('d4')?.pieceId, 'the teleport landed').toBe('piece.rook')
    expect(movesFrom(after, locked, 'd4'), 'the relocated rook owes nothing this ply').toEqual([])
  })

  it('leaves every OTHER piece exactly as it was', () => {
    // The lock must be surgical. A blanket "no moves after a card" would also
    // pass the assertion above.
    const after = playCard(position(locked, board, ['skill.teleport']), locked, 'skill.teleport', ['a1', 'd4'])
    const control = playCard(position(unlocked, board, ['skill.teleport']), unlocked, 'skill.teleport', ['a1', 'd4'])

    expect(movesFrom(after, locked, 'e1'), 'the knight is untouched').toEqual(movesFrom(control, unlocked, 'e1'))
    expect(movesFrom(after, locked, 'a3'), 'the king is untouched').toEqual(movesFrom(control, unlocked, 'a3'))
  })

  it('does NOT lock when the card does not declare it', () => {
    // The discriminator for "the flag is read at all": same card, same play,
    // flag off. An implementation that locks unconditionally passes every other
    // test in this file.
    const after = playCard(position(unlocked, board, ['skill.teleport']), unlocked, 'skill.teleport', ['a1', 'd4'])
    expect(movesFrom(after, unlocked, 'd4').length, 'an unlocked relocation may still move').toBeGreaterThan(0)
  })

  it('expires with the ply — the lock does not reach the next turn', () => {
    const after = playCard(position(locked, board, ['skill.teleport']), locked, 'skill.teleport', ['a1', 'd4'])
    const grant = after.grants.find((g) => g.kind === 'forbid_movement' && g.square === 'd4')

    expect(grant, 'the lock is a forbid_movement grant on the final square').toBeDefined()
    expect(grant?.untilPly, 'live for the owed move, expired once the ply increments').toBe(after.plyCount + 1)
  })
})

describe('AC-002: both halves of a swap are locked', () => {
  const locked = v12Content((src) => {
    src.skillCards.push({ ...SWAP })
    src.presets[0]!.skillCardIds.push('skill.swap')
  })

  it('locks both endpoints, not just one', () => {
    const before = position(locked, [K_W, at('b2', 'piece.rook'), at('e5', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, locked, 'skill.swap', ['b2', 'e5'])

    expect(movesFrom(after, locked, 'b2'), 'first endpoint locked').toEqual([])
    expect(movesFrom(after, locked, 'e5'), 'second endpoint locked').toEqual([])
    expect(
      after.grants.filter((g) => g.kind === 'forbid_movement').map((g) => g.square).sort(),
      'one grant per endpoint',
    ).toEqual(['b2', 'e5'])
  })

  it('still leaves the rest of the army free to answer the owed move', () => {
    const before = position(locked, [K_W, at('b2', 'piece.rook'), at('e5', 'piece.knight'), K_B], ['skill.swap'])
    const after = playCard(before, locked, 'skill.swap', ['b2', 'e5'])

    expect(movesFrom(after, locked, 'a3').length, 'the king can still complete the turn').toBeGreaterThan(0)
    expect(legalActions(after, locked).some((a) => a.kind === 'end_turn'), 'no escape hatch is needed').toBe(false)
  })
})

// ---------------------------------------------------------------------------
// AC-004 — the escape hatch
// ---------------------------------------------------------------------------

describe('AC-004: locking the last mobile piece still ends the turn', () => {
  it('offers exactly end_turn when the lock leaves nothing to move', () => {
    // White owns one piece and the card relocates it. `createPosition` builds
    // royal-less sides on purpose (the editor preview does), and a side that
    // never had a royal does not lose for lacking one.
    const content = v12Content((src) => {
      cardIn(src, 'skill.teleport').lockRelocatedAfterPlay = true
    })
    const before = position(content, [at('a1', 'piece.rook'), at('f6', 'piece.rook', 'black')], ['skill.teleport'])
    const after = playCard(before, content, 'skill.teleport', ['a1', 'd4'])

    expect(legalActions(after, content), 'the forced pass, and nothing else').toEqual([{ kind: 'end_turn' }])
    const ended = apply(after, { kind: 'end_turn' }, content)
    expect(ended.plyCount, 'the pass advances the ply rather than stalling the match').toBe(after.plyCount + 1)
  })
})

// ---------------------------------------------------------------------------
// AC-012 — royals are never relocated, so they are never locked
// ---------------------------------------------------------------------------

describe('AC-012: a relocation card cannot reach a royal', () => {
  const content = v12Content((src) => {
    cardIn(src, 'skill.teleport').lockRelocatedAfterPlay = true
    src.skillCards.push({ ...SWAP })
    src.presets[0]!.skillCardIds.push('skill.swap')
  })
  const board: Place[] = [at('c1', 'piece.king'), at('a1', 'piece.rook'), K_B]

  it('never offers a royal square as a relocation target', () => {
    // The OUTERMOST of four royal guards, and the one that makes SPEC AC-012's
    // original wording ("plays the card naming that king") unconstructible:
    // `candidatesFor` drops royals from every choice slot (`engine.ts:293`), so
    // no play_card action naming c1 is ever generated.
    const before = position(content, board, ['skill.teleport', 'skill.swap'])
    const plays = legalActions(before, content).filter((a) => a.kind === 'play_card')

    expect(plays.length, 'the cards ARE offered — this is not a vacuous assertion').toBeGreaterThan(0)
    expect(
      plays.some((a) => (a as { targets: readonly SquareId[] }).targets.includes('c1')),
      'no offered play names the king',
    ).toBe(false)
  })

  it('leaves the king unmoved and unlocked when another piece is relocated', () => {
    const before = position(content, board, ['skill.teleport'])
    const after = playCard(before, content, 'skill.teleport', ['a1', 'd4'])

    expect(after.board.get('c1')?.pieceId, 'the king did not move').toBe('piece.king')
    expect(
      after.grants.some((g) => g.square === 'c1'),
      'and carries no grant of any kind',
    ).toBe(false)
    expect(movesFrom(after, content, 'c1').length, 'the king may still answer the owed move').toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Loader — the flag's grammar (ADR-002) and the v12 bump (ADR-007)
// ---------------------------------------------------------------------------

describe('ADR-002: the lock flag admits swap and refuses a card with no relocation', () => {
  it('accepts a card whose only relocation action is swap_pieces', () => {
    // v11's `protectRelocatedAfterPlay` grammar requires exactly one teleport
    // and rejects swap outright. Reusing it here would make the flag inert on
    // the very card the feature was asked for.
    const result = loadContentSet(
      v12Source((src) => {
        src.skillCards.push({ ...SWAP })
        src.presets[0]!.skillCardIds.push('skill.swap')
      }),
    )
    expect(result.ok, JSON.stringify(result.ok ? [] : result.errors, null, 2)).toBe(true)
  })

  it('rejects a card that declares the lock but relocates nothing', () => {
    // The absent case made explicit: a flag that silently does nothing is the
    // failure this repo has recorded eight times.
    const result = loadContentSet(
      v12Source((src) => {
        cardIn(src, 'skill.freeze').lockRelocatedAfterPlay = true
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(
      result.errors.some((e) => e.path.endsWith('lockRelocatedAfterPlay')),
      `the error must name the field: ${JSON.stringify(result.errors)}`,
    ).toBe(true)
  })
})

describe('ADR-007: the v12 bump normalizes without erasing v11 declarations', () => {
  it('injects lockRelocatedAfterPlay: false into a pre-v12 document', () => {
    const src = cloneValid() // schemaVersion 1
    const result = loadContentSet(src)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.set.skillCards.get('skill.teleport')?.lockRelocatedAfterPlay).toBe(false)
  })

  it('brings a v11 document up to v12 through the EDITOR import path too', () => {
    // D.5 window. `editor/io.ts` carried its own copy of the normalization and
    // the copy stopped at `<= 10`, so the v12 bump made every pre-v12 import
    // re-stamp the document to v12 while leaving the new field off — an import
    // that refuses the user's own file. The copy is gone (both paths now call
    // `normalizeSkillCard`), and this pins the version the round-trip suites do
    // not reach: v1 and v7 have fixtures, v11 had none.
    const src = cloneValid()
    src.schemaVersion = 11
    for (const card of src.skillCards) {
      card.royalFollowUp = 'preserve'
      card.protectRelocatedAfterPlay = false
    }
    const imported = importContent(exportContent(src))
    expect(imported.ok, JSON.stringify(imported.ok ? [] : imported.errors, null, 2)).toBe(true)
    if (!imported.ok) return

    expect(imported.source.schemaVersion, 'the import re-stamps to this build').toBe(12)
    for (const card of imported.source.skillCards) {
      expect((card as { lockRelocatedAfterPlay?: boolean }).lockRelocatedAfterPlay).toBe(false)
    }
  })

  it('preserves a v11 document’s declared protectRelocatedAfterPlay', () => {
    // The trap ADR-007 exists for: the `<= 10` branch spreads its defaults LAST,
    // so widening that predicate to `<= 11` instead of adding a second branch
    // would reset every v11 card's declarations with no validation error.
    const src = cloneValid()
    src.schemaVersion = 11
    for (const card of src.skillCards) {
      card.royalFollowUp = 'preserve-existing'
      card.protectRelocatedAfterPlay = false
    }
    const quake = cardIn(src, 'skill.teleport')
    quake.protectRelocatedAfterPlay = true

    const result = loadContentSet(src)
    expect(result.ok, JSON.stringify(result.ok ? [] : result.errors, null, 2)).toBe(true)
    if (!result.ok) return
    const loaded = result.set.skillCards.get('skill.teleport')
    expect(loaded?.protectRelocatedAfterPlay, 'a v11 declaration survives the bump').toBe(true)
    expect(loaded?.royalFollowUp, 'and so does its follow-up policy').toBe('preserve-existing')
    expect(loaded?.lockRelocatedAfterPlay, 'while the new field is filled in').toBe(false)
  })
})
