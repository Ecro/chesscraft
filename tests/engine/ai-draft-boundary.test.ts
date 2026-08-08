import { describe, expect, it } from 'vitest'
import { wouldRevealDraft } from '@engine/ai/search'
import { SECOND_DRAFT_AFTER_TURNS, apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import type { ContentSet } from '@content/load'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * The ADR-008 information boundary, asserted DIFFERENTIALLY.
 *
 * `wouldRevealDraft` exists to tell the search "do not expand this child — it
 * holds offers nobody has seen". It is documented as mirroring `bumpTurns`
 * exactly, and a mirror is only worth anything while it agrees: every way the
 * two can disagree is a leak or a needless truncation, and neither shows up as
 * a failure anywhere else.
 *
 * So these tests never assert the predicate's value directly. They ask the
 * ENGINE what happened — did a second offer really get drawn on this ply? — and
 * require the predicate to have said the same thing. A test that asserted
 * `toBe(true)` would pass just as happily against a predicate hard-coded to
 * true, which is the shape of check that let this defect live.
 */

const base = shippedContent()

/**
 * A room that gives white its own card, on top of what it deals everyone.
 *
 * The card is MOVED out of the shared list rather than invented, because
 * `skillPoolFor` appends a loadout card only when the room does not already
 * deal it — a card in both places is deduplicated, and the disagreement this
 * file is about would then be unreachable. Every id here is real content.
 */
function contentWithWhiteLoadout(cardId: string): ContentSet {
  const preset = base.presets.get(BUNDLED_PRESET_ID)!
  const withLoadout = {
    ...preset,
    skillCardIds: preset.skillCardIds.filter((id) => id !== cardId),
    loadout: { white: { pieceId: 'piece.knight', replaces: 'piece.knight', skillCardId: cardId } },
  }
  return { ...base, presets: new Map(base.presets).set(BUNDLED_PRESET_ID, withLoadout) }
}

/**
 * White one completed turn short of its second draft, with the shared pool
 * filtered down to a chosen size.
 *
 * `everOffered` is what does the filtering: whatever is listed there is spent
 * for this side, so the pool that remains is exactly what is left over.
 */
function atBoundary(content: ContentSet, opts: { poolLeft: number; held?: string[] }): GameState {
  const preset = content.presets.get(BUNDLED_PRESET_ID)!
  const held = opts.held ?? []
  const shared = preset.skillCardIds.filter((id) => !held.includes(id))
  const burn = shared.slice(0, Math.max(0, shared.length - opts.poolLeft))

  const state = createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 11,
    sideToMove: 'white',
    held: { white: held, black: [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'c3', pieceId: 'piece.rook', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
  return {
    ...state,
    drafts: {
      ...state.drafts,
      white: {
        ...state.drafts.white,
        completedTurns: SECOND_DRAFT_AFTER_TURNS - 1,
        draftIndex: 1,
        offers: null,
        everOffered: [...burn, ...held],
      },
    },
  }
}

/** Closes white's turn and reports whether a second offer was actually drawn. */
function offersDrawnOnClose(state: GameState, content: ContentSet): { predicted: boolean; actual: boolean } {
  const closing = legalActions(state, content).find((a) => a.kind === 'move')
  expect(closing, 'the fixture needs a move to close the turn with').toBeDefined()
  const predicted = wouldRevealDraft(state, closing!, content)
  const after = apply(state, closing!, content)
  return { predicted, actual: (after.drafts.white.offers?.length ?? 0) > 0 }
}

describe('wouldRevealDraft agrees with what the engine actually draws', () => {
  it('agrees when the room has no loadout and the pool is comfortable', () => {
    const state = atBoundary(base, { poolLeft: 6 })
    const { predicted, actual } = offersDrawnOnClose(state, base)
    expect(actual, 'the fixture must really draw — otherwise this proves nothing').toBe(true)
    expect(predicted).toBe(actual)
  })

  it('agrees when the pool is too small to fill an offer', () => {
    // Two left cannot fill a three-card offer, so `bumpTurns` draws nothing —
    // the absent case that has its own recorded failure
    // ([fail:design] empty-collection-is-not-absent).
    const state = atBoundary(base, { poolLeft: 2 })
    const { predicted, actual } = offersDrawnOnClose(state, base)
    expect(actual).toBe(false)
    expect(predicted).toBe(actual)
  })

  it('agrees at the boundary the side’s own loadout card decides', () => {
    /*
     * The case the predicate used to get wrong, and the reason it is worth a
     * test at all. `skillPoolFor` appends the side's own loadout card to that
     * side's pool; reading `preset.skillCardIds` directly undercounts by one.
     * With exactly two of the shared cards left, the pool is one short of an
     * offer by the shared list and exactly an offer with the loadout card —
     * so the two readings disagree here and nowhere else.
     *
     * The direction of the old failure is the bad one: the predicate said
     * "nothing is revealed", the engine drew three cards, and the search walked
     * into a child holding offers nobody had seen.
     */
    const content = contentWithWhiteLoadout('skill.volley')
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    expect(preset.skillCardIds, 'the loadout card must NOT be in the shared pool').not.toContain('skill.volley')

    const state = atBoundary(content, { poolLeft: 2 })
    const { predicted, actual } = offersDrawnOnClose(state, content)
    expect(actual, 'two shared cards plus the loadout card is exactly one offer').toBe(true)
    expect(predicted).toBe(actual)
  })
})
