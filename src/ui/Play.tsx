import { useState } from 'react'
import type { ContentSet } from '@content/load'
import { apply, legalActions, pendingDraftSide } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, squareId } from '@engine/types'

/**
 * The throwaway play harness (PLAN Phase 3). Phase 4 owns the real board, the
 * draft screens and the card tray; this exists only to prove a match made of
 * slice content is playable without any code path outside the vocabulary.
 *
 * Every decision it makes comes from `legalActions` — it never asks the content
 * what a card does, so a new card needs no change here.
 */
export function Play({ content, presetId, seed = 1 }: { content: ContentSet; presetId: string; seed?: number }) {
  const [match, setMatch] = useState<Match>(() => createMatch({ content, presetId, seed }))
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingCard, setPendingCard] = useState<{ cardId: string; targets: string[] } | null>(null)

  const state = currentState(match)
  const legal = legalActions(state, content)
  const drafting = pendingDraftSide(state)
  const phase = state.result ? 'result' : drafting ? 'draft' : 'play'

  const push = (action: Action) => {
    setMatch((m) => ({ states: [...m.states, apply(currentState(m), action, content)] }))
    setSelected(null)
    setPendingCard(null)
  }

  const clickSquare = (sq: string) => {
    if (phase !== 'play') return

    if (pendingCard) {
      // Collect one target per choice slot. The legal-action list is the only
      // thing that knows how many a card wants, so the prefix match both
      // validates and terminates the collection.
      const targets = [...pendingCard.targets, sq]
      const matching = legal.filter(
        (a) => a.kind === 'play_card' && a.cardId === pendingCard.cardId && targets.every((t, i) => a.targets[i] === t),
      )
      const complete = matching.find((a) => a.kind === 'play_card' && a.targets.length === targets.length)
      if (complete) return push(complete)
      setPendingCard({ ...pendingCard, targets: matching.length > 0 ? targets : [] })
      return
    }

    if (selected) {
      const moveAction = legal.find((a) => a.kind === 'move' && a.from === selected && a.to === sq)
      if (moveAction) return push(moveAction)
    }
    setSelected(state.board.get(sq)?.side === state.sideToMove ? sq : null)
  }

  const hand = state.drafts[state.sideToMove]
  const rows = Array.from({ length: state.height }, (_, i) => state.height - 1 - i)
  const files = Array.from({ length: state.width }, (_, i) => i)

  return (
    <section>
      <p data-testid="phase">{phase}</p>
      <p data-testid="side-to-move">{state.sideToMove}</p>
      <p data-testid="rule-card">{state.ruleCardId ?? 'none'}</p>

      {state.result && (
        <p data-testid="result">
          {state.result.kind === 'win' ? state.result.winner : 'draw'} — {state.result.reason}
        </p>
      )}

      {phase === 'draft' && drafting && (
        <div data-testid="draft-offer">
          <p>{drafting}</p>
          {(state.drafts[drafting].offers ?? []).map((cardId) => (
            <button key={cardId} data-testid={`offer-${cardId}`} onClick={() => push({ kind: 'draft_pick', cardId })}>
              {cardId}
            </button>
          ))}
        </div>
      )}

      <div data-testid="board">
        {rows.map((rank) => (
          <div key={rank}>
            {files.map((file) => {
              const sq = squareId(file, rank)
              const piece = state.board.get(sq)
              return (
                <button
                  key={sq}
                  data-testid={`sq-${sq}`}
                  data-side={piece?.side ?? ''}
                  data-selected={selected === sq}
                  onClick={() => clickSquare(sq)}
                >
                  {piece ? piece.pieceId : ''}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div data-testid="hand">
        {hand.held.map((cardId) => {
          const card = content.skillCards.get(cardId)
          const spent = hand.used.filter((c) => c === cardId).length >= (card?.uses ?? 1)
          return (
            <button
              key={cardId}
              data-testid={`hand-${cardId}`}
              disabled={spent || phase !== 'play'}
              onClick={() => {
                setSelected(null)
                setPendingCard({ cardId, targets: [] })
              }}
            >
              {cardId}
              {spent ? ' (used)' : ''}
            </button>
          )
        })}
      </div>

      <button data-testid="undo" onClick={() => setMatch((m) => undo(m))}>
        undo
      </button>
    </section>
  )
}
