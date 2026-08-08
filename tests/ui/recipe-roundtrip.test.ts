/**
 * AC-002 — every sentence the builder can express reads back as itself.
 *
 * The oracle is a metamorphic identity, not a golden table: `readSentence(write(s))
 * === s` must hold for every sentence, which is stated over the model's own inputs
 * and outputs and shares no code with either direction. A writer that drops the
 * quantifier, or a reader that ignores the second action, breaks it regardless of
 * how either is implemented — and that is precisely the silent-flattening failure
 * this repo already refused once (`CardRecipe.tsx`'s null-rather-than-flatten rule).
 *
 * The sweep is per-axis plus targeted combinations rather than the full
 * cross-product: 8 triggers x 11 conditions x 12 actions x 7 targets x 5
 * destinations x 2 negations x 2 quantifier states is ~150k sentences, and the
 * axes are independent by construction (each writes one JSON path). What is NOT
 * assumed independent — the things a combination test exists for — is enumerated
 * explicitly below: quantifier present/absent, one vs two actions, one vs two
 * condition leaves, negation alone vs inside a compound, and the actions whose
 * arity differs (two targets, a destination).
 */
import { describe, expect, it } from 'vitest'
import { bundledContentSource } from '@content/sets/bundled'
import { blankDraft, editorContext } from '@editor/draft'
import {
  type SlotId,
  optionsFor,
  readSentence,
  takesDestination,
  targetCount,
  writeSentence,
} from '@ui/CardRecipe'

const ctx = editorContext(bundledContentSource)

/** A blank card draft, with `effects` seeded the way the maker seeds it. */
function card(kind: 'ruleCard' | 'skillCard' = 'skillCard'): Record<string, unknown> {
  return blankDraft(kind) as Record<string, unknown>
}

/** Applies one slot edit and returns the draft, so edits chain readably. */
function set(draft: Record<string, unknown>, slot: SlotId, value: string): Record<string, unknown> {
  draft.effects = writeSentence(draft, slot, value, ctx)
  return draft
}

describe('AC-002 — the per-axis sweep', () => {
  it('round-trips every trigger option a rule card offers', () => {
    for (const when of optionsFor('when', 'ruleCard')) {
      const draft = set(card('ruleCard'), 'when', when)
      expect(readSentence(draft)?.when, when).toBe(when)
    }
  })

  it('round-trips every condition option, as a single leaf', () => {
    for (const cond of optionsFor('cond', 'skillCard')) {
      const draft = set(card(), 'cond', cond)
      const read = readSentence(draft)
      expect(read?.cond, cond).toEqual([{ kind: cond, not: false }])
      expect(read?.op, cond).toBe('')
    }
  })

  it('round-trips every action option, with whatever arity it carries', () => {
    for (const then of optionsFor('then', 'skillCard')) {
      const draft = set(card(), 'then', then)
      const read = readSentence(draft)
      expect(read, then).not.toBeNull()
      expect(read!.actions.length, then).toBe(1)
      expect(read!.actions[0]!.kind, then).toBe(then)
      // Arity is a property of the action, so the read model must report exactly
      // as many target slots as the action actually holds — not a fixed one.
      expect(read!.actions[0]!.targets.length, then).toBe(targetCount(then, ctx))
      expect(read!.actions[0]!.dest !== '', then).toBe(takesDestination(then, ctx))
    }
  })

  it('round-trips every target option on a single-target action', () => {
    for (const who of optionsFor('who', 'skillCard')) {
      const draft = set(set(card(), 'then', 'destroy_piece'), 'who', who)
      expect(readSentence(draft)?.actions[0]?.targets, who).toEqual([who])
    }
  })

  it('round-trips every destination option on a destination-bearing action', () => {
    for (const where of optionsFor('where', 'skillCard')) {
      const draft = set(set(card(), 'then', 'teleport_piece'), 'where', where)
      expect(readSentence(draft)?.actions[0]?.dest, where).toBe(where)
    }
  })
})

describe('AC-002 — the combinations that are not independent', () => {
  it('reads a brand-new card as an EMPTY sentence, not as a refusal', () => {
    // `blankDraft` seeds `effects: []`, and the old `readRecipe` returned null for
    // anything other than exactly one effect — so a brand-new card rendered the
    // "this was made in the detailed form" note. Under one screen the sentence IS
    // the editor, so nothing-said-yet must be a sentence with empty slots. Null is
    // reserved for the ADR-002 tail, which is a different claim entirely.
    const fresh = readSentence(card())
    expect(fresh).not.toBeNull()
    expect(fresh).toEqual({ when: '', each: '', op: '', cond: [], actions: [] })
  })

  it('round-trips the quantifier, and its ABSENT case is the default', () => {
    // The absent case first: a card that says something but names no quantifier
    // must report "no quantifier" as a state the model holds, not as missing
    // information. (Learned correction 2026-06-08.)
    expect(readSentence(set(card(), 'then', 'destroy_piece'))?.each).toBe('')

    for (const each of optionsFor('each', 'skillCard')) {
      const draft = set(card(), 'each', each)
      expect(readSentence(draft)?.each, each).toBe(each)
      // And clearing it returns to the absent case rather than to a leftover.
      expect(readSentence(set(draft, 'each', ''))?.each, each).toBe('')
    }
  })

  it('round-trips two actions, and removing the second returns to one', () => {
    const draft = set(set(card(), 'then', 'destroy_piece'), 'then2', 'freeze_piece')
    const both = readSentence(draft)
    expect(both?.actions.map((a) => a.kind)).toEqual(['destroy_piece', 'freeze_piece'])

    expect(readSentence(set(draft, 'then2', ''))?.actions.map((a) => a.kind)).toEqual(['destroy_piece'])
  })

  it('round-trips two condition leaves under both join operators', () => {
    for (const op of ['all', 'any'] as const) {
      const draft = set(set(set(card(), 'cond', 'piece_side'), 'cond2', 'on_own_rank'), 'op', op)
      const read = readSentence(draft)
      expect(read?.op, op).toBe(op)
      expect(read?.cond.map((c) => c.kind), op).toEqual(['piece_side', 'on_own_rank'])
    }
  })

  it('round-trips a negated leaf, alone and inside a compound', () => {
    const alone = set(set(card(), 'cond', 'piece_side'), 'not', 'on')
    expect(readSentence(alone)?.cond).toEqual([{ kind: 'piece_side', not: true }])

    const compound = set(set(set(alone, 'cond2', 'on_own_rank'), 'op', 'any'), 'not2', 'on')
    const read = readSentence(compound)
    expect(read?.op).toBe('any')
    expect(read?.cond).toEqual([
      { kind: 'piece_side', not: true },
      { kind: 'on_own_rank', not: true },
    ])

    // Un-negating is reachable — an optional flag with no way back makes its
    // absent case unreachable the moment it is used once.
    expect(readSentence(set(compound, 'not', ''))?.cond[0]).toEqual({ kind: 'piece_side', not: false })
  })

  it('round-trips a two-target action into two distinct slots', () => {
    expect(targetCount('swap_pieces', ctx)).toBe(2)
    const draft = set(set(set(card(), 'then', 'swap_pieces'), 'who', 'chosen_friendly'), 'whoB', 'chosen_enemy')
    expect(readSentence(draft)?.actions[0]?.targets).toEqual(['chosen_friendly', 'chosen_enemy'])
  })

  it('gives the SECOND action its own target, independent of the first', () => {
    const draft = set(
      set(set(set(card(), 'then', 'destroy_piece'), 'who', 'chosen_enemy'), 'then2', 'block_capture'),
      'who2',
      'self',
    )
    const read = readSentence(draft)
    expect(read?.actions[0]?.targets).toEqual(['chosen_enemy'])
    expect(read?.actions[1]?.targets).toEqual(['self'])
  })
})

describe('AC-002 — the window that opening a blank record newly makes reachable', () => {
  /**
   * Phase D.5. Making a brand-new card open as a sentence newly exposes an input
   * window that nothing could reach before: a record with NO trigger, edited
   * through a slot other than `when`. The old writer stamped `SKILL_TRIGGER` into
   * that gap, which was invisible while every card arrived from a template that
   * set `when` first — and which writes `on_play` onto a rule card, an event a
   * rule card's schema does not admit.
   *
   * The absent case IS the window here, so it is what these assert.
   */
  it('does not invent a trigger when a non-when slot is edited first', () => {
    for (const slot of ['cond', 'then', 'each'] as const) {
      const value = slot === 'cond' ? 'always' : slot === 'then' ? 'destroy_piece' : 'piece'
      const draft = set(card('ruleCard'), slot, value)
      expect(readSentence(draft)?.when, slot).toBe('')
      // And the absence is real in the record, not merely reported as empty.
      expect('trigger' in (draft.effects as Record<string, unknown>[])[0]!, slot).toBe(false)
    }
  })

  it('keeps a trigger the author DID choose across later edits to other slots', () => {
    const draft = set(set(card('ruleCard'), 'when', 'end_of_ply'), 'then', 'win')
    expect(readSentence(draft)?.when).toBe('end_of_ply')
    expect(readSentence(set(draft, 'cond', 'check_count_at_least'))?.when).toBe('end_of_ply')
  })
})

describe('AC-002 — parameters survive edits that do not change a kind', () => {
  it('keeps a ply count when only the target changes', () => {
    const draft = set(card(), 'then', 'freeze_piece')
    const action = () => ((draft.effects as { actions: Record<string, unknown>[] }[])[0]!.actions[0] as Record<string, unknown>)
    action().plies = 3

    set(draft, 'who', 'chosen_enemy')
    expect(action().plies).toBe(3)
  })

  it('keeps the first action untouched when the second one changes', () => {
    const draft = set(set(card(), 'then', 'freeze_piece'), 'then2', 'destroy_piece')
    const first = () => (draft.effects as { actions: Record<string, unknown>[] }[])[0]!.actions[0] as Record<string, unknown>
    first().plies = 2

    set(draft, 'then2', 'block_capture')
    expect(first().plies).toBe(2)
    expect(first().kind).toBe('freeze_piece')
  })
})

describe('AC-002 — re-choosing a value already chosen changes nothing', () => {
  /**
   * Found by the cross-model reviewer and reproduced before it was believed.
   *
   * A destination carries parameters (`square`; `df`/`dr`/`forward` on an offset),
   * they are edited in the very sheet that lists the destination options, and the
   * chosen option is marked as chosen — so re-tapping it is a natural "yes, that
   * one". The writer rebuilt it from the maker unconditionally, so that tap turned
   * `{offset, df: 2, dr: -1, forward: true}` into `{offset, df: 0, dr: 1}` with
   * nothing on screen to say so.
   *
   * Quantified over every axis that can be re-chosen, not just the one that failed:
   * the bug is "rebuild without comparing the kind", and the destination axis is
   * where it happened to carry a cost.
   */
  const dest = (draft: Record<string, unknown>) =>
    ((draft.effects as Array<{ actions: Array<Record<string, unknown>> }>)[0]!.actions[0]!.to) as Record<string, unknown>

  it('keeps an offset destination when the same destination is chosen again', () => {
    const draft = set(set(card(), 'then', 'teleport_piece'), 'where', 'offset')
    Object.assign(dest(draft), { df: 2, dr: -1, forward: true })
    const before = JSON.stringify(dest(draft))

    set(draft, 'where', 'offset')
    expect(JSON.stringify(dest(draft))).toBe(before)
  })

  it('keeps a square destination when the same destination is chosen again', () => {
    const draft = set(set(card(), 'then', 'teleport_piece'), 'where', 'square')
    dest(draft).square = 'c3'
    set(draft, 'where', 'square')
    expect(dest(draft).square).toBe('c3')
  })

  it('STILL rebuilds when the destination kind actually changes', () => {
    // The other side, so the guard cannot be satisfied by never writing at all.
    const draft = set(set(card(), 'then', 'teleport_piece'), 'where', 'offset')
    Object.assign(dest(draft), { df: 2, dr: -1 })
    set(draft, 'where', 'chosen_empty')
    expect(readSentence(draft)?.actions[0]?.dest).toBe('chosen_empty')
    expect('df' in dest(draft)).toBe(false)
  })

  it('keeps an action parameter when the same action is chosen again', () => {
    const draft = set(card(), 'then', 'freeze_piece')
    const action = () => (draft.effects as Array<{ actions: Array<Record<string, unknown>> }>)[0]!.actions[0]!
    action().plies = 3
    set(draft, 'then', 'freeze_piece')
    expect(action().plies).toBe(3)
  })

  it('keeps a condition parameter when the same condition is chosen again', () => {
    const draft = set(card(), 'cond', 'on_own_rank')
    const leaf = () => (draft.effects as Array<{ condition: Record<string, unknown> }>)[0]!.condition
    leaf().n = 4
    set(draft, 'cond', 'on_own_rank')
    expect(leaf().n).toBe(4)
  })
})

describe('AC-002 — the ADR-002 tail still refuses rather than flattens', () => {
  it('returns null for a record with two effects', () => {
    const draft = card()
    const one = writeSentence(draft, 'then', 'destroy_piece', ctx)
    draft.effects = [...one, ...structuredClone(one)]
    expect(readSentence(draft)).toBeNull()
  })

  it('returns null for a condition nested more than one level deep', () => {
    const draft = card()
    draft.effects = [
      {
        trigger: 'on_play',
        condition: { kind: 'all', of: [{ kind: 'any', of: [{ kind: 'always' }] }] },
        actions: [{ kind: 'destroy_piece', target: { kind: 'self' } }],
      },
    ]
    expect(readSentence(draft)).toBeNull()
  })

  it('returns null for more than two actions in one effect', () => {
    const draft = card()
    const action = { kind: 'destroy_piece', target: { kind: 'self' } }
    draft.effects = [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [action, action, action] },
    ]
    expect(readSentence(draft)).toBeNull()
  })
})
