import type { ContentSet } from '@content/load'
import { apply, legalActions } from '@engine/engine'
import { createMatch, currentState, type Match } from '@engine/match'
import type { GameState } from '@engine/types'

/**
 * A match whose opening drafts are already resolved, so board actions are
 * unblocked (AC-005 gates them until each side has picked).
 */
export function startedMatch(content: ContentSet, seed = 1, presetId = 'preset.default'): Match {
  let match = createMatch({ content, presetId, seed })
  for (let guard = 0; guard < 8; guard += 1) {
    const state = currentState(match)
    const picks = legalActions(state, content).filter((a) => a.kind === 'draft_pick')
    if (picks.length === 0) break
    match = { ...match, states: [...match.states, apply(state, picks[0]!, content)] }
  }
  return match
}

export function startedState(content: ContentSet, seed = 1): GameState {
  return currentState(startedMatch(content, seed))
}

/** Applies a move by algebraic squares, failing loudly when it is not legal. */
export function move(state: GameState, content: ContentSet, from: string, to: string): GameState {
  const action = legalActions(state, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
  if (!action) throw new Error(`no legal move ${from}->${to} for ${state.sideToMove} at ply ${state.plyCount}`)
  return apply(state, action, content)
}
