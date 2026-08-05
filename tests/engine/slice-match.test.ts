import { describe, expect, it } from 'vitest'
import { type ContentSet, loadContentSet } from '@content/load'
import { SLICE_PRESET_ID, loadSliceContent, sliceContentSource } from '@content/sets/slice'
import { PLY_CAP, apply, legalActions, pendingDraftSide } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import { rngFor } from '@engine/rng'
import type { GameState } from '@engine/types'

/**
 * PLAN Phase 3 exit criterion (b) — a full match is playable end-to-end using
 * only slice content, headlessly.
 *
 * The load-bearing assertion is not "a match finished". It is that the state
 * machine never reaches a position with no result and no legal action: that is
 * the shape a deadlock takes, and it is invisible to any test that only drives
 * a scripted line.
 */

/** The slice with its skill pool cut to one offer's worth — see the G-8 test. */
function smallPoolContent(): ContentSet {
  const source = structuredClone(sliceContentSource)
  const preset = source.presets[0] as { skillCardIds: string[] }
  preset.skillCardIds = preset.skillCardIds.slice(0, 3)
  const result = loadContentSet(source)
  if (!result.ok) throw new Error(`small-pool source is invalid: ${JSON.stringify(result.errors, null, 2)}`)
  return result.set
}

function playOut(seed: number): { states: number; final: GameState } {
  const content = loadSliceContent()
  let state = currentState(createMatch({ content, presetId: SLICE_PRESET_ID, seed }))
  const rng = rngFor(seed, 'agent')
  let plies = 0

  while (!state.result) {
    const legal = legalActions(state, content)
    // Deadlock guard — an unfinished match must always have something to do.
    expect(legal.length, `no legal action at ply ${state.plyCount} (seed ${seed})`).toBeGreaterThan(0)
    state = apply(state, legal[Math.floor(rng() * legal.length)]!, content)
    plies += 1
    expect(plies, `seed ${seed} did not terminate`).toBeLessThanOrEqual(PLY_CAP * 2 + 8)
  }
  return { states: plies, final: state }
}

describe('a match played with slice content only', () => {
  it('reaches a result from every seed, within the ply bound', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const { final } = playOut(seed)
      expect(final.result).not.toBeNull()
      expect(final.plyCount).toBeLessThanOrEqual(PLY_CAP)
      expect(['king_capture', 'win_action', 'material_cap']).toContain(
        final.result!.kind === 'win' ? final.result!.reason : 'material_cap',
      )
    }
  })

  it('draws a rule card and opens a first offer of three to each side', () => {
    const content = loadSliceContent()
    const state = currentState(createMatch({ content, presetId: SLICE_PRESET_ID, seed: 3 }))
    expect(state.ruleCardId).toBe('rule.beacon-rush')
    expect(state.drafts.white.offers).toHaveLength(3)
    expect(state.drafts.black.offers).toHaveLength(3)
  })

  it('does not stall on the sixth turn when the pool cannot fill a second offer', () => {
    // A preset whose skill pool is smaller than two offers is legal content, so
    // this absent case is reachable from valid input. All three cards go out in
    // the first offer, leaving the AC-006 second draft nothing disjoint to
    // deal. The engine must open NO second offer — not an empty one, which
    // would still gate board play and freeze the match with no legal action.
    const content = smallPoolContent()
    let state = currentState(createMatch({ content, presetId: SLICE_PRESET_ID, seed: 11 }))

    while (pendingDraftSide(state)) {
      const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
      state = apply(state, picks[0]!, content)
    }

    // Shuffle each king between its home square and the rank in front of it for
    // six turns a side, well clear of the beacon squares.
    const shuffle: Record<'white' | 'black', [string, string]> = { white: ['d1', 'd2'], black: ['d6', 'd5'] }
    for (let turn = 0; turn < 12; turn += 1) {
      const side = state.sideToMove
      const [home, out] = shuffle[side]
      const from = state.board.has(home) ? home : out
      const to = from === home ? out : home
      const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
      expect(action, `king cannot shuffle ${from}->${to} at ply ${state.plyCount}`).toBeDefined()
      state = apply(state, action!, content)

      expect(legalActions(state, content).length, `stalled at ply ${state.plyCount}`).toBeGreaterThan(0)
    }

    expect(state.drafts.white.completedTurns).toBeGreaterThanOrEqual(5)
    expect(state.drafts.black.completedTurns).toBeGreaterThanOrEqual(5)
    expect(state.drafts.white.offers).toBeNull()
    expect(state.drafts.black.offers).toBeNull()
    expect(pendingDraftSide(state)).toBeNull()
  })

  it('opens a disjoint second offer to each side once the pool is large enough', () => {
    // The shipped preset carries six, which is the floor at which all four
    // draft picks of AC-005 + AC-006 exist at all.
    const content = loadSliceContent()
    let state = currentState(createMatch({ content, presetId: SLICE_PRESET_ID, seed: 11 }))
    const firstOffers = { white: [...state.drafts.white.offers!], black: [...state.drafts.black.offers!] }

    while (pendingDraftSide(state)) {
      const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
      state = apply(state, picks[0]!, content)
    }

    // Bound covers ten shuffle plies plus the two second-draft picks, which each
    // consume a step without advancing the turn count.
    const shuffle: Record<'white' | 'black', [string, string]> = { white: ['d1', 'd2'], black: ['d6', 'd5'] }
    for (let turn = 0; turn < 20; turn += 1) {
      const side = state.sideToMove
      if (state.drafts[side].offers) {
        const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
        state = apply(state, picks[0]!, content)
        continue
      }
      const [home, out] = shuffle[side]
      const from = state.board.has(home) ? home : out
      const to = from === home ? out : home
      const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
      state = apply(state, action!, content)
    }

    for (const side of ['white', 'black'] as const) {
      const draft = state.drafts[side]
      expect(draft.draftIndex, `${side} did not resolve a second draft`).toBe(2)
      expect(draft.held).toHaveLength(2)
      // AC-006 — the second card was never in the first offer.
      expect(firstOffers[side]).not.toContain(draft.held[1])
    }
  })
})
