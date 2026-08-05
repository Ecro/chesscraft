import { useState } from 'react'
import type { ContentSet } from '@content/load'
import { paintedSquares } from '@engine/effects'
import { apply, describeRejection, legalActions, pendingDraftSide } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, type Side, type SquareId, squareId } from '@engine/types'
import { translate } from './i18n'

/**
 * Hot-seat play (PLAN Phase 4).
 *
 * Everything on screen is derived from `legalActions`, the content set and the
 * i18n bundle. This component names no piece, no card and no square type, so a
 * new one authored in the editor renders and plays with no change here — the
 * property that lets Phase 6a extend the schema beside Phase 4 rather than
 * after it (ADR-011's reasoning).
 */
export function Play({ content, presetId, seed = 1 }: { content: ContentSet; presetId: string; seed?: number }) {
  const [match, setMatch] = useState<Match>(() => createMatch({ content, presetId, seed }))
  const [selected, setSelected] = useState<SquareId | null>(null)
  const [pendingCard, setPendingCard] = useState<{ cardId: string; targets: SquareId[] } | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)

  const state = currentState(match)
  const legal = legalActions(state, content)
  const drafting = pendingDraftSide(state)
  const phase = state.result ? 'result' : drafting ? 'draft' : 'play'
  const painted = paintedSquares(state, content)

  const push = (action: Action) => {
    setMatch((m) => ({ states: [...m.states, apply(currentState(m), action, content)] }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
  }

  // Squares the current selection can legally reach — the highlight, and the
  // only thing a click is allowed to act on.
  const reachable = new Set<SquareId>()
  if (pendingCard) {
    for (const a of legal) {
      if (a.kind !== 'play_card' || a.cardId !== pendingCard.cardId) continue
      if (!pendingCard.targets.every((t, i) => a.targets[i] === t)) continue
      const next = a.targets[pendingCard.targets.length]
      if (next) reachable.add(next)
    }
  } else if (selected) {
    for (const a of legal) if (a.kind === 'move' && a.from === selected) reachable.add(a.to)
  }

  const clickSquare = (sq: SquareId) => {
    if (phase !== 'play') return
    setRejection(null)

    if (pendingCard) {
      const targets = [...pendingCard.targets, sq]
      const matching = legal.filter(
        (a) => a.kind === 'play_card' && a.cardId === pendingCard.cardId && targets.every((t, i) => a.targets[i] === t),
      )
      const complete = matching.find((a) => a.kind === 'play_card' && a.targets.length === targets.length)
      if (complete) return push(complete)
      if (matching.length === 0) {
        setRejection(describeRejection(state, { kind: 'play_card', cardId: pendingCard.cardId, targets }, content))
        setPendingCard({ ...pendingCard, targets: [] })
        return
      }
      setPendingCard({ ...pendingCard, targets })
      return
    }

    if (selected) {
      const moveAction = legal.find((a) => a.kind === 'move' && a.from === selected && a.to === sq)
      if (moveAction) return push(moveAction)
    }
    setSelected(state.board.get(sq)?.side === state.sideToMove ? sq : null)
  }

  const clickCard = (side: Side, cardId: string) => {
    setSelected(null)
    if (phase !== 'play' || side !== state.sideToMove) {
      // AC-008 — say why. A dead click reads as a broken app, and poking the
      // other player's cards is the first thing a hot-seat player does.
      setPendingCard(null)
      setRejection(describeRejection(state, { kind: 'play_card', cardId, targets: [] }, content))
      return
    }
    setRejection(null)
    setPendingCard({ cardId, targets: [] })
  }

  const ranks = Array.from({ length: state.height }, (_, i) => state.height - 1 - i)
  const files = Array.from({ length: state.width }, (_, i) => i)
  const rule = state.ruleCardId ? content.ruleCards.get(state.ruleCardId) : undefined
  const legendTypes = [...new Map([...painted.values()].map((p) => [p.type.id, p.type])).values()]

  return (
    <section className="play">
      <div className="status">
        <span data-testid="phase">{phase}</span>
        <span data-testid="side-to-move">{state.sideToMove}</span>
        <span>ply {state.plyCount}</span>
        <button data-testid="undo" onClick={() => setMatch((m) => undo(m))}>
          되돌리기
        </button>
      </div>

      {/* AC-004's display clause: the drawn rule card stays on screen for the
          whole match, not shown once at the start and forgotten. */}
      <div className="card rule" data-testid="rule-card" data-rule={state.ruleCardId ?? ''}>
        <strong>{rule ? translate(rule.nameKey) : '규칙 없음'}</strong>
        {rule && <span>{translate(rule.textKey)}</span>}
      </div>

      {state.result && (
        <p className="result" data-testid="result" data-winner={state.result.kind === 'win' ? state.result.winner : ''}>
          {state.result.kind === 'win' ? `${state.result.winner} 승리` : '무승부'} — {state.result.reason}
        </p>
      )}

      {phase === 'draft' && drafting && (
        <div className="draft" data-testid="draft-offer" data-side={drafting}>
          <p>{drafting} — 스킬 카드를 한 장 고르세요</p>
          {(state.drafts[drafting].offers ?? []).map((cardId) => {
            const card = content.skillCards.get(cardId)
            return (
              <button
                key={cardId}
                className="card"
                data-testid={`offer-${cardId}`}
                data-card={cardId}
                onClick={() => push({ kind: 'draft_pick', cardId })}
              >
                <strong>{card ? translate(card.nameKey) : cardId}</strong>
                {card && <span>{translate(card.textKey)}</span>}
              </button>
            )
          })}
        </div>
      )}

      {rejection && (
        <p className="rejection" data-testid="rejection">
          {rejection}
        </p>
      )}

      <div className="board" data-testid="board" style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)` }}>
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const sq = squareId(file, rank)
            const piece = state.board.get(sq)
            const type = painted.get(sq)?.type
            const def = piece ? content.pieces.get(piece.pieceId) : undefined
            return (
              <button
                key={sq}
                className="square"
                data-testid={`sq-${sq}`}
                data-piece={piece?.pieceId ?? ''}
                data-side={piece?.side ?? ''}
                data-square-type={type?.id ?? ''}
                data-legal={reachable.has(sq)}
                data-selected={selected === sq}
                title={type ? `${translate(type.nameKey)} — ${translate(type.textKey)}` : sq}
                onClick={() => clickSquare(sq)}
              >
                <span className="coord">{sq}</span>
                <span className="piece">{def ? translate(def.nameKey) : ''}</span>
              </button>
            )
          }),
        )}
      </div>

      {/* AC-018's UI clause: painted types listed with their ability text, so
          both players can read what a marked square does. */}
      {legendTypes.length > 0 && (
        <ul className="legend" data-testid="square-legend">
          {legendTypes.map((type) => (
            <li key={type.id} data-square-type={type.id}>
              <strong>{translate(type.nameKey)}</strong> — {translate(type.textKey)}
            </li>
          ))}
        </ul>
      )}

      {/* AC-017 — both trays, always, with spent cards marked. Hot-seat is one
          screen, so hiding the opponent's hand would hide it from nobody. */}
      {(['white', 'black'] as const).map((side) => (
        <div key={side} className="tray" data-testid={`hand-${side}`} data-active={side === state.sideToMove}>
          <span className="tray-label">{side}</span>
          {state.drafts[side].held.length === 0 && <span className="empty">아직 없음</span>}
          {state.drafts[side].held.map((cardId) => {
            const card = content.skillCards.get(cardId)
            const spent = state.drafts[side].used.filter((c) => c === cardId).length >= (card?.uses ?? 1)
            return (
              <button
                key={cardId}
                className="card"
                data-testid={`hand-${side}-${cardId}`}
                data-card={cardId}
                data-used={spent}
                data-pending={pendingCard?.cardId === cardId}
                onClick={() => clickCard(side, cardId)}
              >
                <strong>
                  {card ? translate(card.nameKey) : cardId}
                  {spent ? ' (사용됨)' : ''}
                </strong>
                {card && <span>{translate(card.textKey)}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </section>
  )
}
