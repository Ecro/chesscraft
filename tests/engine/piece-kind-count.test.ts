import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { loadContentSet } from '@content/load'
import { contentWith } from '../helpers/content'
import { cloneValid } from '../content/fixtures/valid-set'
import type { ContentSet } from '@content/load'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * PLAN Phase 4 — `piece_kind_count_at_most` (ADR-005, SPEC AC-007).
 *
 * A condition that can observe the ABSENCE of a piece kind. Neither existing
 * mechanism can:
 *
 * - `piece_count_at_most` counts a side's whole army with no kind filter, and
 *   its `n` is `positive()`, so it cannot express zero at all.
 * - `forEach` iterates the pieces that EXIST, so zero matching subjects produce
 *   zero bindings and the effect never fires — the absent case in its purest
 *   form, and the reason "you lose when your pawns are gone" was unauthorable.
 *
 * The n=0 row is therefore the whole point of the entry, and the `forEach`
 * contrast below is what makes that claim a measurement rather than an
 * assertion.
 */

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

/** A rule card that wins for the mover when the opponent is down to `n` of a kind. */
function withKindCard(n: number, pieceId = 'piece.pawn'): ContentSet {
  return contentWith((src) => {
    src.ruleCards.push({
      id: 'rule.kind-probe',
      nameKey: 'rule.kind-probe.name',
      textKey: 'rule.kind-probe.text',
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_kind_count_at_most', side: 'opponent', pieceId, n },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    })
    src.presets[0]!.ruleCardIds.push('rule.kind-probe')
  })
}

/**
 * White plays one quiet rook move on an empty file, so the ply ends without
 * changing anybody's piece counts — the condition is the only thing that can
 * decide the outcome.
 */
function playQuietPly(content: ContentSet, blackPawns: SquareId[]): GameState {
  const before = createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements: [
      at('a1', 'piece.king'),
      at('f6', 'piece.king', 'black'),
      ...blackPawns.map((sq) => at(sq, 'piece.pawn', 'black')),
    ],
    ruleCardId: 'rule.kind-probe',
    held: { white: [] },
    captured: { white: [] },
  })
  const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'a1' && a.to === 'a2')
  if (!move) throw new Error('a1->a2 is not legal — the fixture is wrong, not the engine')
  return apply(before, move, content)
}

// ---------------------------------------------------------------------------
// AC-007 — the golden table
// ---------------------------------------------------------------------------

/**
 * Mirrored from `specs/SPEC-movement-lock-8x8-and-rule-cards.machine.yaml`,
 * AC-007 `golden_table`, which is the SSOT.
 *
 * It is mirrored rather than loaded because the harness's `load_golden_table`
 * helper is pytest-only (`[fail:tooling] spec-machine-binding-is-pytest-only`,
 * count 4) and this project has no YAML parser in its dependency tree — adding
 * one to read four booleans would cost more than it saves. If a row changes in
 * the yaml, it must be changed here too; that duplication is the known price.
 */
const GOLDEN: Array<{ n: number; remaining: number; expected: boolean }> = [
  { n: 0, remaining: 0, expected: true },
  { n: 0, remaining: 1, expected: false },
  { n: 1, remaining: 1, expected: true },
  { n: 1, remaining: 2, expected: false },
]

const PAWN_SQUARES: SquareId[] = ['b5', 'c5']

describe('AC-007: piece_kind_count_at_most', () => {
  for (const row of GOLDEN) {
    it(`n=${row.n} with ${row.remaining} of the kind remaining → ${row.expected}`, () => {
      const content = withKindCard(row.n)
      const after = playQuietPly(content, PAWN_SQUARES.slice(0, row.remaining))
      const fired = after.result?.kind === 'win' && after.result.winner === 'white'
      expect(fired, `the condition should evaluate ${row.expected}`).toBe(row.expected)
    })
  }

  it('counts only the named kind, not the side’s whole army', () => {
    // The discriminator against `piece_count_at_most`: black has plenty of
    // material and zero pawns, so a whole-army count would be false here and
    // the kind-filtered one must be true.
    const content = withKindCard(0)
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [
        at('a1', 'piece.king'),
        at('f6', 'piece.king', 'black'),
        at('b5', 'piece.rook', 'black'),
        at('c5', 'piece.knight', 'black'),
        at('d5', 'piece.queen', 'black'),
      ],
      ruleCardId: 'rule.kind-probe',
      held: { white: [] },
      captured: { white: [] },
    })
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'a1' && a.to === 'a2')
    if (!move) throw new Error('a1->a2 is not legal — the fixture is wrong, not the engine')
    const after = apply(before, move, content)

    expect(after.result, 'four black pieces, none of them a pawn — the clause still fires').toEqual({
      kind: 'win',
      winner: 'white',
      reason: 'win_action',
    })
  })

  it('reads the side it names — `mover` counts the mover’s own kind', () => {
    const content = contentWith((src) => {
      src.ruleCards.push({
        id: 'rule.kind-self',
        nameKey: 'rule.kind-self.name',
        textKey: 'rule.kind-self.text',
        effects: [
          {
            trigger: 'end_of_ply',
            condition: { kind: 'piece_kind_count_at_most', side: 'mover', pieceId: 'piece.pawn', n: 0 },
            actions: [{ kind: 'win', side: 'opponent' }],
          },
        ],
      })
      src.presets[0]!.ruleCardIds.push('rule.kind-self')
    })
    const before = createPosition({
      content,
      presetId: 'preset.default',
      seed: 1,
      sideToMove: 'white',
      placements: [at('a1', 'piece.king'), at('f6', 'piece.king', 'black'), at('b5', 'piece.pawn', 'black')],
      ruleCardId: 'rule.kind-self',
      held: { white: [] },
      captured: { white: [] },
    })
    const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'a1' && a.to === 'a2')
    const after = apply(before, move!, content)

    // White (the mover) has no pawns; black's pawn is irrelevant to `mover`.
    expect(after.result?.kind, 'the mover’s own pawn count is what `mover` means').toBe('win')
    expect((after.result as { winner: Side }).winner).toBe('black')
  })
})

// ---------------------------------------------------------------------------
// Why the entry exists — the two mechanisms that cannot say this
// ---------------------------------------------------------------------------

describe('ADR-005: neither existing mechanism can observe absence', () => {
  it('a forEach-quantified effect cannot fire when nothing matches', () => {
    // Zero matching subjects produce zero bindings, so the effect never runs.
    // This is the measurement behind ADR-005's claim, not a restatement of it:
    // the SAME card fires when one pawn exists and is silent when none do.
    const content = contentWith((src) => {
      src.ruleCards.push({
        id: 'rule.foreach-probe',
        nameKey: 'rule.foreach-probe.name',
        textKey: 'rule.foreach-probe.text',
        effects: [
          {
            trigger: 'end_of_ply',
            forEach: { kind: 'piece', pieceId: 'piece.pawn', side: 'opponent' },
            condition: { kind: 'always' },
            actions: [{ kind: 'win', side: 'mover' }],
          },
        ],
      })
      src.presets[0]!.ruleCardIds.push('rule.foreach-probe')
    })
    const run = (pawns: SquareId[]): GameState => {
      const before = createPosition({
        content,
        presetId: 'preset.default',
        seed: 1,
        sideToMove: 'white',
        placements: [
          at('a1', 'piece.king'),
          at('f6', 'piece.king', 'black'),
          ...pawns.map((sq) => at(sq, 'piece.pawn', 'black')),
        ],
        ruleCardId: 'rule.foreach-probe',
        held: { white: [] },
        captured: { white: [] },
      })
      const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'a1' && a.to === 'a2')
      return apply(before, move!, content)
    }

    expect(run(['b5']).result?.kind, 'one pawn: the quantifier binds and the effect fires').toBe('win')
    expect(run([]).result, 'zero pawns: no binding, so the effect is silent — absence is unobservable').toBeNull()
  })

  it('leaves `piece_count_at_most` exactly as it was — n=0 is still refused', () => {
    // ADR-005 rejected relaxing the existing condition. Pinned so a later
    // "simplification" that merges the two is caught here.
    const src = cloneValid()
    src.ruleCards.push({
      id: 'rule.zero-probe',
      nameKey: 'rule.zero-probe.name',
      textKey: 'rule.zero-probe.text',
      effects: [
        {
          trigger: 'end_of_ply',
          condition: { kind: 'piece_count_at_most', side: 'opponent', n: 0 },
          actions: [{ kind: 'win', side: 'mover' }],
        },
      ],
    })
    src.presets[0]!.ruleCardIds.push('rule.zero-probe')

    const result = loadContentSet(src)
    expect(result.ok, 'n=0 on the whole-army count must stay a validation error').toBe(false)
  })
})
