import { useEffect, useState } from 'react'
import type { ContentSet } from '@content/load'
import { paintedSquares } from '@engine/effects'
import { apply, describeRejection, legalActions, pendingDraftSide } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, type MatchResult, type Side, type SquareId, squareId } from '@engine/types'
import { translate } from './i18n'

/**
 * Hot-seat play plus the match lifecycle around it (PLAN Phase 2).
 *
 * Everything on screen is derived from `legalActions`, the content set and the
 * i18n bundle. This component names no piece, no card and no square type, so a
 * new one authored in the editor renders and plays with no change here (ADR-011).
 *
 * What Phase 2 added is the part that made the rest reachable. `App` used to
 * render this with no seed, so the `seed = 1` default applied forever: AC-004's
 * determinism held perfectly and was the only behaviour any player could ever
 * observe — one rule card, one pair of drafts, for every match anyone would play.
 * The seed now enters through an injected provider (ADR-024) rather than a
 * `Math.random()` call in the body, which is what keeps the determinism suite
 * able to pin it through the same code path a player takes.
 */

/**
 * What the board draws for a piece.
 *
 * `iconKey` is optional and its ABSENT case is the common one, not an edge:
 * every document written before schema v4 lacks it, and so does every piece an
 * author creates until the editor grows the control in Phase 9. The fallback is
 * the first grapheme of the translated name — a monogram, never the whole word
 * (which is what the board used to render, at 12px, inside the square) and
 * never a blank square.
 */
function pieceGlyph(def: { iconKey?: string | undefined; nameKey: string }): string {
  if (def.iconKey) return translate(def.iconKey)
  const name = translate(def.nameKey)
  // `translate` returns the KEY when it cannot resolve one, so a piece with no
  // locale entry would otherwise put the first letter of `piece.foo.name` — a
  // bare `p` — on the board, indistinguishable from a real glyph.
  if (name === def.nameKey) return '?'
  return [...name][0] ?? '?'
}

/** A 31-bit non-negative seed — the default when no generator is injected. */
const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/**
 * The end-of-match sentence.
 *
 * Exported because the reason code is the one place an engine identifier can
 * reach a player: `state.result.reason` is `'king_capture' | 'win_action' |
 * 'material_cap'`, and rendering it directly — which is what this file did
 * before Phase 2 — prints `king_capture` on screen at the end of every match.
 */
export function resultLabel(result: MatchResult): string {
  const reason = translate(`ui.result.reason.${result.reason}`)
  if (result.kind !== 'win') return `${translate('ui.result.draw')} — ${reason}`
  return `${translate(`ui.side.${result.winner}`)} ${translate('ui.result.win')} — ${reason}`
}

export function MatchHost({
  content,
  presetId,
  newSeed = randomSeed,
  onHome,
  onProgressChange,
}: {
  content: ContentSet
  presetId: string
  newSeed?: () => number
  onHome?: () => void
  onProgressChange?: (inProgress: boolean) => void
}) {
  // Seed and match move together — a seed without the match it produced would
  // let the two drift, and the seed on screen is the one a player copies.
  const [{ seed, match }, setPlay] = useState<{ seed: number; match: Match }>(() => {
    const s = newSeed()
    return { seed: s, match: createMatch({ content, presetId, seed: s }) }
  })
  const [selected, setSelected] = useState<SquareId | null>(null)
  const [pendingCard, setPendingCard] = useState<{ cardId: string; targets: SquareId[] } | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const state = currentState(match)
  const legal = legalActions(state, content)
  const drafting = pendingDraftSide(state)
  const phase = state.result ? 'result' : drafting ? 'draft' : 'play'
  const painted = paintedSquares(state, content)

  /**
   * Whether there is a match here worth not destroying.
   *
   * Measured in APPLIED ACTIONS, not plies: a draft pick does not advance the
   * ply counter, so `plyCount > 0` reports "nothing to lose" for a match where
   * both players have already chosen their skill cards — which is exactly the
   * state a mis-tap hurts most. `states.length > 1` means something happened.
   */
  const inProgress = match.states.length > 1 && !state.result

  // App owns the nav that unmounts this component, so it has to know.
  useEffect(() => onProgressChange?.(inProgress), [inProgress, onProgressChange])

  const startNew = () => {
    // Two children share one phone and this button sits beside the board. A
    // mis-tap used to discard the position, both hands and the ply count with
    // no undo — `undo` steps one ply, it cannot bring a match back.
    if (inProgress && !window.confirm(translate('ui.confirm.discard'))) return
    const s = newSeed()
    setPlay({ seed: s, match: createMatch({ content, presetId, seed: s }) })
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setCopyState('idle')
  }

  const push = (action: Action) => {
    setPlay((p) => ({ seed: p.seed, match: { states: [...p.match.states, apply(currentState(p.match), action, content)] } }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
  }

  const doUndo = () => {
    setPlay((p) => ({ seed: p.seed, match: undo(p.match) }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
  }

  const copySeed = () => {
    // Reporting success unconditionally is worse than not offering the button:
    // on an insecure context or an older mobile browser `clipboard` is
    // undefined, and a child taps it, reads the success label and shares nothing.
    const write = navigator.clipboard?.writeText(String(seed))
    if (!write) return setCopyState('failed')
    write.then(
      () => setCopyState('copied'),
      () => setCopyState('failed'),
    )
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
        {/* The machine value lives on the attribute and the words on screen are
            translated. That split is what lets the e2e suite keep asserting a
            stable value while a player reads their own language. */}
        <span data-testid="phase" data-phase={phase}>
          {translate(`ui.phase.${phase}`)}
        </span>
        <span data-testid="side-to-move" data-side={state.sideToMove}>
          {translate(`ui.side.${state.sideToMove}`)}
        </span>
        <span>
          {translate('ui.status.ply')} {state.plyCount}
        </span>
        <button data-testid="undo" onClick={doUndo}>
          {translate('ui.action.undo')}
        </button>
      </div>

      {/* ADR-024's replay clause. A seed the product never shows is an internal
          detail; shown and copyable, it is how one player hands another the
          exact match they just played. */}
      <div className="seed">
        <span data-testid="match-seed" title={translate('ui.seed.hint')}>
          {translate('ui.seed.label')} {seed}
        </span>
        <button data-testid="copy-seed" data-copy-state={copyState} onClick={copySeed}>
          {translate(
            copyState === 'copied' ? 'ui.seed.copied' : copyState === 'failed' ? 'ui.seed.copy-failed' : 'ui.seed.copy',
          )}
        </button>
        <button data-testid="new-match" onClick={startNew}>
          {translate('ui.action.new-match')}
        </button>
        {onHome && (
          <button
            data-testid="go-home"
            onClick={() => {
              if (inProgress && !window.confirm(translate('ui.confirm.discard'))) return
              onHome()
            }}
          >
            {translate('ui.action.home')}
          </button>
        )}
      </div>

      {/* AC-004's display clause: the drawn rule card stays on screen for the
          whole match, not shown once at the start and forgotten. */}
      <div className="card rule" data-testid="rule-card" data-rule={state.ruleCardId ?? ''}>
        <strong>{rule ? translate(rule.nameKey) : translate('ui.rule.none')}</strong>
        {rule && <span>{translate(rule.textKey)}</span>}
      </div>

      {state.result && (
        <div className="result-panel">
          <p className="result" data-testid="result" data-winner={state.result.kind === 'win' ? state.result.winner : ''}>
            {resultLabel(state.result)}
          </p>
          <button data-testid="rematch" onClick={startNew}>
            {translate('ui.action.rematch')}
          </button>
        </div>
      )}

      {phase === 'draft' && drafting && (
        <div className="draft" data-testid="draft-offer" data-side={drafting}>
          <p>
            {translate(`ui.side.${drafting}`)} — {translate('ui.draft.prompt')}
          </p>
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

      {/* Coordinates moved off the squares and onto the edge. In the square they
          competed with the piece for a 60px box on a phone, which is why they
          were 9px and unreadable anyway. */}
      <div className="board-frame">
        <ol className="rank-rail" data-testid="board-ranks">
          {ranks.map((r) => (
            <li key={r}>{r + 1}</li>
          ))}
        </ol>
        <div className="board" data-testid="board" style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)` }}>
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const sq = squareId(file, rank)
            const piece = state.board.get(sq)
            // The checker (#41). Shipped as a dead token in Phase 1 — the colour
            // existed in three cascade layers and no square ever asked for it.
            const parity = (file + rank) % 2
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
                data-parity={parity}
                data-legal={reachable.has(sq)}
                data-selected={selected === sq}
                title={type ? `${translate(type.nameKey)} — ${translate(type.textKey)}` : sq}
                onClick={() => clickSquare(sq)}
              >
                <span className="piece">{def ? pieceGlyph(def) : ''}</span>
              </button>
            )
          }),
        )}
        </div>
        <ol className="file-rail" data-testid="board-files">
          {files.map((f) => (
            <li key={f}>{String.fromCharCode(97 + f)}</li>
          ))}
        </ol>
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
          <span className="tray-label" data-side={side}>
            {translate(`ui.side.${side}`)}
          </span>
          {state.drafts[side].held.length === 0 && <span className="empty">{translate('ui.tray.empty')}</span>}
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
                  {spent ? ` ${translate('ui.card.spent')}` : ''}
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
