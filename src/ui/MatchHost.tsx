import { useEffect, useRef, useState } from 'react'
import type { ContentSet } from '@content/load'
import { paintedSquares } from '@engine/effects'
import { apply, describeRejection, legalActions, pendingDraftSide } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, type MatchResult, type Side, type SquareId, squareId } from '@engine/types'
import { translate } from './i18n'
import { browserStorage } from '@editor/storage'
import { DEFAULT_SETTINGS, type Settings, loadSettings, saveSettings } from './settings'
import { type SoundEvent, hapticsSupported, play } from './sound'

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
  if (def.iconKey) {
    const icon = translate(def.iconKey)
    // Falls THROUGH to the monogram when the key does not resolve, rather than
    // returning it. `translate` echoes an unresolved key, so the bare version
    // of this branch painted `piece.foo.icon` across the square — the exact
    // thing the `nameKey` branch below has guarded against since Phase 4, and
    // the exact thing `iconOf` guards for the other three content kinds. A
    // typo'd `iconKey` reaches this through an imported document today, and
    // through the editor once Phase 9 grows the control.
    if (icon !== def.iconKey) return icon
  }
  const name = translate(def.nameKey)
  // `translate` returns the KEY when it cannot resolve one, so a piece with no
  // locale entry would otherwise put the first letter of `piece.foo.name` — a
  // bare `p` — on the board, indistinguishable from a real glyph.
  if (name === def.nameKey) return '?'
  return [...name][0] ?? '?'
}

/**
 * The mark for anything that carries an `iconKey` (schema v5).
 *
 * Returns `''` rather than a placeholder when a card or square declares none:
 * an icon is a second channel beside the name, and inventing a glyph for
 * content that did not ask for one would make every unmarked card look like it
 * meant the same thing. The piece board is the one place a fallback is right —
 * a square with nothing in it is not a piece.
 */
function iconOf(def: { iconKey?: string | undefined } | undefined): string {
  if (!def?.iconKey) return ''
  const icon = translate(def.iconKey)
  // `translate` echoes the key when it cannot resolve one, which would paint
  // the raw key string across a card face.
  return icon === def.iconKey ? '' : icon
}

/**
 * Which feedback an applied action earns.
 *
 * Exported and pure so the end-of-match branches can be asserted without
 * playing a match out. The first version collapsed both endings into `'win'`
 * because `result` is merely truthy for either — a draw buzzed and sang exactly
 * like a victory, and nothing tested it.
 */
export function eventFor(
  action: Action,
  before: { board: ReadonlyMap<SquareId, unknown> },
  after: { result: { kind: 'win' | 'draw' } | null },
): SoundEvent {
  if (after.result) return after.result.kind === 'draw' ? 'draw' : 'win'
  if (action.kind === 'draft_pick') return 'draft'
  // A move onto an occupied square is a capture, and should not sound like a step.
  if (action.kind === 'move' && before.board.has(action.to)) return 'capture'
  return 'move'
}

/**
 * What a screen reader is told about a square (#29).
 *
 * Legal-move state is IN the label, not only in `data-legal` and a green
 * outline: a player who cannot see the outline otherwise has no way to know
 * where a selected piece may go, which is the whole of the criterion.
 */
function squareLabel(
  sq: string,
  def: { nameKey: string } | undefined,
  piece: { side: string } | undefined,
  type: { nameKey: string } | undefined,
  reachable: boolean,
): string {
  const parts = [sq]
  if (def && piece) parts.push(`${translate(`ui.side.${piece.side}`)} ${translate(def.nameKey)}`)
  else parts.push(translate('ui.board.empty'))
  if (type) parts.push(translate(type.nameKey))
  if (reachable) parts.push(translate('ui.board.reachable'))
  return parts.join(', ')
}

/** `a1` -> 0, `f6` -> 5. The engine's squareId is a letter then a 1-based rank. */
const fileOf = (sq: string) => sq.charCodeAt(0) - 97
const rankOf = (sq: string) => Number(sq.slice(1)) - 1

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
  // ADR-018: one shared board, flipped by hand. Not an automatic rotation and
  // not a hand-off screen — the two players are looking at the same thing.
  const [flipped, setFlipped] = useState(false)
  // Both hands start open. A tray that remembered being shut across matches
  // would hide a card a player just drafted, which is the one thing the tray
  // exists to show (AC-017).
  const [openTrays, setOpenTrays] = useState<Record<Side, boolean>>({ white: true, black: true })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState<Settings>(() => {
    const storage = browserStorage()
    return storage ? loadSettings(storage) : DEFAULT_SETTINGS
  })
  /**
   * The action that produced the current state.
   *
   * Kept because the engine gives pieces no instance identity — the board is a
   * map keyed by square — so a tween derived from diffing two board maps
   * animates SQUARES, and a piece fades out and in instead of sliding. This is
   * the only record of what moved where. Cleared whenever the state it
   * describes stops being the present one.
   */
  const [lastMove, setLastMove] = useState<{ from: SquareId; to: SquareId } | null>(null)

  const toggle = (key: keyof Settings) => {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    const storage = browserStorage()
    if (storage) saveSettings(storage, next)
  }

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
    setLastMove(null)
    setPlay({ seed: s, match: createMatch({ content, presetId, seed: s }) })
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setCopyState('idle')
  }

  const push = (action: Action) => {
    // Derived from the render's state only to choose the SOUND — the worst case
    // there is the wrong tone. The state itself is recomputed inside the
    // updater, so a second action dispatched in the same tick cannot apply to
    // the pre-first-action board.
    const next = apply(state, action, content)
    // Chosen from what actually happened, not from the action's name: a move
    // onto an occupied square is a capture, and it should not sound like a step.
    play(eventFor(action, state, next), settings)
    setLastMove(action.kind === 'move' ? { from: action.from, to: action.to } : null)
    setPlay((p) => ({
      seed: p.seed,
      match: { states: [...p.match.states, apply(currentState(p.match), action, content)] },
    }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
  }

  const doUndo = () => {
    play('undo', settings)
    // The highlight describes a move that no longer happened.
    setLastMove(null)
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
        play('illegal', settings)
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

  /**
   * Drag, on pointer events rather than HTML5 drag-and-drop.
   *
   * `draggable` + dragstart/drop was the first implementation and it is dead on
   * the platform this product is for: iOS Safari does not dispatch those events
   * for a touch gesture on a generic element, and Android is inconsistent. The
   * e2e still passed, because Playwright's `dragTo` synthesises mouse events —
   * a test certifying a gesture no finger can perform. Pointer events cover
   * mouse, touch and stylus with one path, and a real drag exercises it.
   */
  const dragFrom = useRef<SquareId | null>(null)

  const beginDrag = (sq: SquareId) => {
    // Not while a card is choosing its targets: `reachable` belongs to the card
    // then, and setting `selected` here left a highlight on a square the player
    // never chose once the card resolved.
    if (pendingCard || phase !== 'play') return
    if (state.board.get(sq)?.side !== state.sideToMove) return
    dragFrom.current = sq
    setSelected(sq)
  }

  const endDrag = (sq: SquareId) => {
    const from = dragFrom.current
    dragFrom.current = null
    // Same square means a tap, and `onClick` already owns that.
    if (!from || from === sq) return
    const moveAction = legal.find((a) => a.kind === 'move' && a.from === from && a.to === sq)
    if (moveAction) push(moveAction)
  }

  const clickCard = (side: Side, cardId: string) => {
    setSelected(null)
    if (phase !== 'play' || side !== state.sideToMove) {
      // AC-008 — say why. A dead click reads as a broken app, and poking the
      // other player's cards is the first thing a hot-seat player does.
      setPendingCard(null)
      play('illegal', settings)
      setRejection(describeRejection(state, { kind: 'play_card', cardId, targets: [] }, content))
      return
    }
    setRejection(null)
    setPendingCard({ cardId, targets: [] })
  }

  const ranks = Array.from({ length: state.height }, (_, i) => (flipped ? i : state.height - 1 - i))
  const files = Array.from({ length: state.width }, (_, i) => (flipped ? state.width - 1 - i : i))
  const rule = state.ruleCardId ? content.ruleCards.get(state.ruleCardId) : undefined
  const legendTypes = [...new Map([...painted.values()].map((p) => [p.type.id, p.type])).values()]

  return (
    // `data-drafting` rather than a `:has(.draft-scrim)` selector. `:has()` is
    // Chrome 105 / Safari 15.4, and the audience for this app is children on
    // whatever phone the household already had — on an older WebView the rule
    // silently never matches and the tools row becomes unreachable behind the
    // sheet again, with no test in a modern CI browser able to see it. The
    // component already knows the phase, so the fact does not need inferring
    // from the DOM.
    <section className="play" data-drafting={phase === 'draft'}>
      {/* Whose turn it is, as the loudest thing on the screen after the board.
          It used to be one grey chip among four, the same size and weight as
          the phase and the ply count — on a hot-seat game where the ONLY thing
          two players need from the chrome is which of them moves next. The
          board's own frame carries the same colour, so the answer is visible
          without looking away from the position. */}
      <div className="status" data-turn={state.sideToMove}>
        {/* The machine value lives on the attribute and the words on screen are
            translated. That split is what lets the e2e suite keep asserting a
            stable value while a player reads their own language. */}
        {/* `aria-live`, because the turn is the one value on this screen that
            CHANGES and matters. React swaps the text inside the same node, and
            a screen reader announces nothing for that unless the region is
            live — so a non-visual player had to re-navigate here after every
            move to learn it was their turn. `polite` rather than `assertive`:
            it should not cut off whatever the player is currently reading. */}
        <span
          className="turn"
          data-testid="side-to-move"
          data-side={state.sideToMove}
          role="status"
          aria-live="polite"
        >
          {translate(`ui.side.${state.sideToMove}`)} {translate('ui.status.turn')}
        </span>
        <span data-testid="phase" data-phase={phase}>
          {translate(`ui.phase.${phase}`)}
        </span>
        <span>
          {translate('ui.status.ply')} {state.plyCount}
        </span>
        <button data-testid="undo" onClick={doUndo}>
          {translate('ui.action.undo')}
        </button>
      </div>

      {/* AC-004's display clause: the drawn rule card stays on screen for the
          whole match, not shown once at the start and forgotten. */}
      <div className="card rule" data-testid="rule-card" data-rule={state.ruleCardId ?? ''}>
        {iconOf(rule) && (
          <span className="rule-icon" aria-hidden="true">
            {iconOf(rule)}
          </span>
        )}
        <div className="rule-body">
          <strong>{rule ? translate(rule.nameKey) : translate('ui.rule.none')}</strong>
          {rule && <span>{translate(rule.textKey)}</span>}
        </div>
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

      {/* Lifted out of the document flow (#43). Three offers stacked above the
          board cost ~230px there and pushed the board off the phone; over a
          dimmed board they cost nothing, and the player can still see the
          position the card is being chosen for. */}
      {phase === 'draft' && drafting && (
        <div className="draft-scrim">
          {/* `role="dialog"` WITHOUT `aria-modal`, and the omission is the
              honest part: this sheet deliberately does not trap — the scrim
              dims and passes pointers through so a player is never stuck in a
              draft — so claiming modality to assistive tech would describe a
              containment that does not exist. The role plus a label is what is
              true: a named region holding a pending choice. */}
          <div
            className="draft"
            data-testid="draft-offer"
            data-side={drafting}
            role="dialog"
            aria-label={translate('ui.draft.prompt')}
          >
            <p className="draft-prompt">
              {translate(`ui.side.${drafting}`)} — {translate('ui.draft.prompt')}
            </p>
            <div className="draft-cards">
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
                    <span className="card-icon" aria-hidden="true">
                      {iconOf(card)}
                    </span>
                    <strong>{card ? translate(card.nameKey) : cardId}</strong>
                    {card && <span>{translate(card.textKey)}</span>}
                  </button>
                )
              })}
            </div>
          </div>
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
      <div className="board-frame" data-turn={state.sideToMove}>
        <ol className="rank-rail" data-testid="board-ranks">
          {ranks.map((r) => (
            <li key={r}>{r + 1}</li>
          ))}
        </ol>
          <div
          className="board"
          data-testid="board"
          role="grid"
          aria-label={translate('ui.board.label')}
          style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)` }}
        >
        {/* `role="grid"` owns `row`, which owns `gridcell` — the middle level
            was missing, so the squares were 36 cells with no row or column
            context and a screen reader read them as a flat run. `flatMap` is
            now a `map` over ranks with a row wrapper at `display: contents`,
            which keeps every square a direct grid item so the layout is
            unchanged. */}
        {ranks.map((rank) => (
          <div key={rank} className="board-row" role="row">
          {files.map((file) => {
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
                data-last={lastMove?.from === sq ? 'from' : lastMove?.to === sq ? 'to' : undefined}
                style={
                  lastMove?.to === sq
                    ? ({
                        '--land-dx': `${(fileOf(lastMove.from) - file) * 100}%`,
                        '--land-dy': `${(rankOf(lastMove.from) - rank) * -100}%`,
                      } as React.CSSProperties)
                    : undefined
                }
                onPointerDown={() => beginDrag(sq)}
                onPointerUp={() => endDrag(sq)}
                data-legal={reachable.has(sq)}
                data-selected={selected === sq}
                role="gridcell"
                aria-label={squareLabel(sq, def, piece, type, reachable.has(sq))}
                // `aria-selected`, not `aria-pressed`: the explicit gridcell role
                // overrides the native button role, and `aria-pressed` is a
                // button-family state a gridcell does not support, so the
                // selection would simply never have been announced.
                aria-selected={selected === sq}
                title={type ? `${translate(type.nameKey)} — ${translate(type.textKey)}` : sq}
                onClick={() => clickSquare(sq)}
              >
                {/* What this square DOES, drawn on it. The stripe alone said
                    only "something happens here", and the five bundled types
                    range from promotion to destruction. Marked aria-hidden
                    because `squareLabel` already names the type in words. */}
                {iconOf(type) && (
                  <span className="square-mark" data-occupied={Boolean(piece)} aria-hidden="true">
                    {iconOf(type)}
                  </span>
                )}
                <span className="piece">{def ? pieceGlyph(def) : ''}</span>
              </button>
            )
          })}
          </div>
        ))}
        </div>
        <ol className="file-rail" data-testid="board-files">
          {files.map((f) => (
            <li key={f}>{String.fromCharCode(97 + f)}</li>
          ))}
        </ol>
      </div>

      {/* AC-017 — both trays, always, with spent cards marked. Hot-seat is one
          screen, so hiding the opponent's hand would hide it from nobody. */}
      {(['white', 'black'] as const).map((side) => (
        <div
          key={side}
          className="tray"
          data-testid={`hand-${side}`}
          data-active={side === state.sideToMove}
          data-open={openTrays[side]}
        >
          {/* The label IS the toggle. A separate chevron would be a second
              44px target for a strip that is already only one line tall, and
              the trays sit below the board so collapsing one cannot reflow it. */}
          <button
            type="button"
            className="tray-label"
            data-testid={`tray-toggle-${side}`}
            data-side={side}
            aria-expanded={openTrays[side]}
            onClick={() => setOpenTrays((t) => ({ ...t, [side]: !t[side] }))}
          >
            {translate(`ui.side.${side}`)}
          </button>
          {state.drafts[side].held.length === 0 && <span className="empty">{translate('ui.tray.empty')}</span>}
          {/* The cards stay MOUNTED when a tray is collapsed. ADR-018 keeps
              AC-017's model — "both hands, one board, both trays always
              visible" — and the first version of this unmounted them, so a tap
              on the opponent's label hid their hand, and a player who left
              their own tray shut could not play a card on their own turn
              because the button did not exist. Collapsing now condenses to
              icons (see `.tray[data-open='false'] .card-body`), which buys the
              vertical room #16 asked for without taking the information the
              ADR protects. */}
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
                // The name has to live HERE, not only in `.card-body`. A
                // collapsed tray sets that body to `display: none`, which takes
                // it out of the accessibility tree, and the icon beside it is
                // `aria-hidden` — so the button was left with no accessible
                // name at all. Condensing must cost prose, never identity.
                aria-label={card ? translate(card.nameKey) : cardId}
                onClick={() => clickCard(side, cardId)}
              >
                <span className="card-icon" aria-hidden="true">
                  {iconOf(card)}
                </span>
                <span className="card-body">
                  <strong>
                    {card ? translate(card.nameKey) : cardId}
                    {spent ? ` ${translate('ui.card.spent')}` : ''}
                  </strong>
                  {card && <span>{translate(card.textKey)}</span>}
                </span>
                </button>
              )
            })}
        </div>
      ))}

      {/* AC-018's UI clause: painted types listed with their ability text, so
          both players can read what a marked square does. */}
      {legendTypes.length > 0 && (
        <ul className="legend" data-testid="square-legend">
          {legendTypes.map((type) => (
            // The icon belongs HERE most of all. A child sees a badge in a
            // square's corner and comes to this list to find out what it means
            // — and until now the list showed the name and the prose and not
            // the badge, so the one screen built to decode the mark omitted the
            // mark. `title` does not fire on touch and the aria-label is
            // screen-reader-only, so this list is the only visual cross-
            // reference a sighted player has.
            <li key={type.id} data-square-type={type.id}>
              {iconOf(type) && (
                <span className="legend-icon" aria-hidden="true">
                  {iconOf(type)}
                </span>
              )}
              <strong>{translate(type.nameKey)}</strong> — {translate(type.textKey)}
            </li>
          ))}
        </ul>
      )}

      {/* ADR-024's replay clause plus the per-match settings. Below the board on
          purpose: a seed, two toggles and three navigation controls are things a
          player reaches for between matches, and above the board they outranked
          the position every turn. */}
      <div className="match-tools">
        <span data-testid="match-seed" title={translate('ui.seed.hint')}>
          {translate('ui.seed.label')} {seed}
        </span>
        <button data-testid="copy-seed" data-copy-state={copyState} onClick={copySeed}>
          {translate(
            copyState === 'copied' ? 'ui.seed.copied' : copyState === 'failed' ? 'ui.seed.copy-failed' : 'ui.seed.copy',
          )}
        </button>
        {/* Sound and haptics behind one affordance — what Phase 4's and Phase 5's
            reviews both deferred. The theme control is NOT in here: it lives in
            App's nav and is reachable from home, the rules screen and the editor
            too, so moving it into a match's tools row would take it away from
            three of the four screens. */}
        <button
          data-testid="match-settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((o) => !o)}
        >
          {translate('ui.action.settings')}
        </button>
        {settingsOpen && (
          <span className="match-settings-panel">
            <button data-testid="sound-toggle" data-on={settings.sound} onClick={() => toggle('sound')}>
              {translate(settings.sound ? 'ui.sound.on' : 'ui.sound.off')}
            </button>
            {hapticsSupported() && (
              <button data-testid="haptics-toggle" data-on={settings.haptics} onClick={() => toggle('haptics')}>
                {translate(settings.haptics ? 'ui.haptics.on' : 'ui.haptics.off')}
              </button>
            )}
          </span>
        )}
        <button data-testid="flip-board" data-flipped={flipped} onClick={() => setFlipped((f) => !f)}>
          {translate('ui.action.flip')}
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
    </section>
  )
}
