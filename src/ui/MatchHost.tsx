import { useEffect, useRef, useState } from 'react'
import type { ContentSet } from '@content/load'
import { paintedSquares } from '@engine/effects'
import { apply, describeRejection, legalActions, pendingDraftSide } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, type Side, type SquareId, squareId } from '@engine/types'
import { type Translate, useTranslate } from './i18n'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'
import { type Settings, DEFAULT_SETTINGS } from './settings'
import { type SoundEvent, hapticsSupported, play } from './sound'
import { Result } from './Result'
import { Sheet } from './Sheet'

/**
 * Hot-seat play plus the match lifecycle around it.
 *
 * Everything on screen is derived from `legalActions`, the content set and the
 * i18n bundle. This component names no piece, no card and no square type, so a
 * new one authored in the editor renders and plays with no change here (ADR-011).
 *
 * ## What the Chess Craft redesign changed, and why
 *
 * **The screen does not scroll.** It used to: a status row, a rule card, two
 * trays and a legend stacked above and below the board, and on a 390x844 phone
 * the board itself was pushed off. Everything below is now sized to fit one
 * viewport, which is what forced the three changes after this one.
 *
 * **The opponent's hand condenses instead of collapsing.** AC-017 wants both
 * hands visible at all times — hot-seat is one screen, so hiding one hides it
 * from nobody. The old answer was a per-tray toggle, which meant a player could
 * shut their OWN tray and then be unable to play a card. The waiting player's
 * cards are now a strip of small marked tiles (spent ones dimmed) and the player
 * to move gets the five-slot hotbar. Both hands, always, and no control that can
 * take your own away.
 *
 * **The legend became a row of chips.** AC-018 wants each painted type on the
 * board listed with its ability text. A list of full sentences under the board
 * is what it used to be and it does not fit; a chip per type, opening the same
 * text in a sheet, keeps the text one tap away and reachable during the match.
 *
 * **The hand-off is announced, not enforced.** ADR-018 chose one shared board
 * over automatic rotation on the grounds that both players are looking at the
 * same thing, and the moment the phone changes hands is still worth marking —
 * a chip changing colour is easy to miss. It was briefly a full-screen curtain
 * you had to tap through, and that was too much for what it buys: it covered the
 * position two children were mid-argument about, and put a mandatory tap between
 * every single ply. What replaces it is a brief banner that names whose turn it
 * is, dismisses itself, and takes no pointer events — so the board is never
 * hidden and nothing is ever waiting on a tap.
 */

/**
 * What the board draws for a piece.
 *
 * The fallback chain is unchanged and still matters: the bundled set carries art
 * on every record, but `slice.ts` declares schema version 1 and `gate6a.ts`
 * declares 2, so "a piece with no mark at all" is not a hypothetical fixture. A
 * monogram — the first grapheme of the translated name — is the floor. Never a
 * blank square: a square with a piece on it that draws nothing is a lie.
 */
function pieceMark(t: Translate, def: { artKey?: string | undefined; iconKey?: string | undefined; nameKey: string }, side: Side | undefined): Mark {
  return resolveMark(t, def, { registry: artRegistry, side, fallback: 'monogram' })
}

/**
 * The mark for anything that is not a piece.
 *
 * Returns nothing rather than a placeholder when a card or square declares no
 * mark: an icon is a second channel beside the name, and inventing one for
 * content that did not ask would make every unmarked card look like it meant the
 * same thing. The piece board is the one place a fallback is right.
 */
function iconMark(t: Translate, def: { artKey?: string | undefined; iconKey?: string | undefined } | undefined): Mark {
  return resolveMark(t, def, { registry: artRegistry, fallback: 'none' })
}

/**
 * Which feedback an applied action earns.
 *
 * Exported and pure so the end-of-match branches can be asserted without playing
 * a match out. The first version collapsed both endings into `'win'` because
 * `result` is merely truthy for either — a draw buzzed and sang exactly like a
 * victory, and nothing tested it.
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
 * Legal-move state is IN the label, not only in `data-legal` and an outline: a
 * player who cannot see the outline otherwise has no way to know where a
 * selected piece may go, which is the whole of the criterion.
 */
function squareLabel(
  t: Translate,
  sq: string,
  def: { nameKey: string } | undefined,
  piece: { side: string } | undefined,
  type: { nameKey: string } | undefined,
  reachable: boolean,
): string {
  const parts = [sq]
  if (def && piece) parts.push(`${t(`ui.side.${piece.side}`)} ${t(def.nameKey)}`)
  else parts.push(t('ui.board.empty'))
  if (type) parts.push(t(type.nameKey))
  if (reachable) parts.push(t('ui.board.reachable'))
  return parts.join(', ')
}

/** `a1` -> 0, `f6` -> 5. The engine's squareId is a letter then a 1-based rank. */
const fileOf = (sq: string) => sq.charCodeAt(0) - 97
const rankOf = (sq: string) => Number(sq.slice(1)) - 1

/** A 31-bit non-negative seed — the default when no generator is injected. */
const randomSeed = () => Math.floor(Math.random() * 2 ** 31)

/** How long the rule banner sits on screen at the start of a match. */
const BANNER_MS = 3200

/**
 * How long the hand-off banner names the player whose turn it now is.
 *
 * Shorter than the rule banner: the rule is something to read once, and this is
 * a nudge you glance at. Long enough that a player looking down at the board
 * rather than the top of the screen still catches it on the way back up.
 */
const HAND_OFF_MS = 1600

/** What the detail sheet is currently showing. Content-agnostic on purpose. */
type Peek = { mark: Mark; name: string; kind: string; text: string }

/** How many hotbar slots the player to move sees, filled or not. */
const HOTBAR_SLOTS = 5

export function MatchHost({
  content,
  presetId,
  newSeed = randomSeed,
  names = { white: '', black: '' },
  settings,
  onSettingsChange,
  onHome,
  onEditRoom,
  onProgressChange,
}: {
  content: ContentSet
  presetId: string
  newSeed?: () => number
  /** Empty means "not named" — every screen falls back to the side's own word. */
  names?: Record<Side, string>
  /**
   * The player's preferences. Optional, and when it is absent this component
   * keeps its own — a `MatchHost` mounted on its own (in a unit test, or by a
   * future screen that has no settings of its own) is still a working board with
   * a working sound switch, rather than one that throws on first render.
   */
  settings?: Settings | undefined
  onSettingsChange?: ((next: Settings) => void) | undefined
  onHome?: () => void
  onEditRoom?: () => void
  onProgressChange?: (inProgress: boolean) => void
}) {
  // Bound to the ACTIVE document's overlay (ADR-020), not to the shipped bundle:
  // a piece a child renamed must render under the name they gave it.
  const t = useTranslate()
  // See the note on the prop: controlled when the parent passes one, local
  // otherwise. `settings ?? local` rather than syncing the two, because a
  // mirrored copy that drifts from its source is the failure this shape avoids.
  const [localSettings, setLocalSettings] = useState<Settings>(settings ?? DEFAULT_SETTINGS)
  const live = settings ?? localSettings
  const applySettings = (next: Settings) => {
    setLocalSettings(next)
    onSettingsChange?.(next)
  }
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
  // ADR-018: one shared board, flipped by hand. Not an automatic rotation.
  const [flipped, setFlipped] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  const [peek, setPeek] = useState<Peek | null>(null)
  /**
   * Whose turn a hand-off is announcing, or null when nothing is being said.
   *
   * Set by `push` when a ply passes the phone, and only then — an undo is a
   * player correcting their own move, and announcing a hand-off there would be
   * telling them to pass a board they just took back.
   */
  const [handOff, setHandOff] = useState<Side | null>(null)
  /** The rule drawn for this match, shown once and then dismissed on a timer. */
  const [banner, setBanner] = useState(true)
  /**
   * The move that produced the current state, for the landing animation.
   *
   * Held rather than derived, because `Match` keeps STATES and not the actions
   * between them — and the engine gives pieces no instance identity, so a tween
   * derived from diffing two board maps animates SQUARES and a piece fades out
   * and in instead of sliding. This is the only record of what moved where, and
   * it is cleared wherever the state it describes stops being the present one.
   */
  const [lastMove, setLastMove] = useState<{ from: SquareId; to: SquareId } | null>(null)

  const state = currentState(match)
  const legal = legalActions(state, content)
  const drafting = pendingDraftSide(state)
  const phase = state.result ? 'result' : drafting ? 'draft' : 'play'
  const painted = paintedSquares(state, content)

  /** The player's name if they gave one, else the side's own word. */
  const nameOf = (side: Side) => names[side].trim() || t(`ui.side.${side}`)

  /**
   * Whether there is a match here worth not destroying.
   *
   * Measured in APPLIED ACTIONS, not plies: a draft pick does not advance the
   * ply counter, so `plyCount > 0` reports "nothing to lose" for a match where
   * both players have already chosen their skill cards — which is exactly the
   * state a mis-tap hurts most.
   */
  const inProgress = match.states.length > 1 && !state.result

  // App owns the nav that unmounts this component, so it has to know.
  useEffect(() => onProgressChange?.(inProgress), [inProgress, onProgressChange])

  /**
   * The banner is on a timer, and the timer is keyed to the match.
   *
   * As an effect rather than a `setTimeout` in `startNew`, because the FIRST
   * match is created in a `useState` initialiser that never ran a start
   * function — so the hand-rolled version showed the banner forever on the one
   * match every player sees first. Re-running on `seed` covers the rematch, and
   * the cleanup covers unmounting mid-countdown.
   */
  useEffect(() => {
    if (!banner) return
    const id = setTimeout(() => setBanner(false), BANNER_MS)
    return () => clearTimeout(id)
  }, [banner, seed])

  /**
   * The hand-off banner clears itself.
   *
   * On a timer rather than on the next interaction, because the thing it marks
   * has already happened by the time it appears — waiting for a tap is what the
   * curtain did, and the tap was the problem. Keyed on the side so a second
   * hand-off restarts the countdown rather than inheriting the remainder of the
   * first one's.
   */
  useEffect(() => {
    if (!handOff) return
    const id = setTimeout(() => setHandOff(null), HAND_OFF_MS)
    return () => clearTimeout(id)
  }, [handOff, state.plyCount])

  const toggle = (key: 'sound' | 'haptics') => applySettings({ ...live, [key]: !live[key] })

  const startNew = () => {
    // Two children share one phone and this button sits beside the board. A
    // mis-tap used to discard the position, both hands and the ply count with no
    // undo — `undo` steps one ply, it cannot bring a match back.
    if (inProgress && !window.confirm(t('ui.confirm.discard'))) return
    const s = newSeed()
    setLastMove(null)
    setPlay({ seed: s, match: createMatch({ content, presetId, seed: s }) })
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setCopyState('idle')
    setHandOff(null)
    setPeek(null)
    setRuleOpen(false)
    setBanner(true)
  }

  const push = (action: Action) => {
    // Derived from the render's state only to choose the SOUND and the hand-off
    // announcement — the worst case there is the wrong tone. The state itself is recomputed
    // inside the updater, so a second action dispatched in the same tick cannot
    // apply to the pre-first-action board.
    const next = apply(state, action, content)
    play(eventFor(action, state, next), live)
    // Only a board action hands the phone over. A draft pick alternates the
    // DRAFTING side, which the sheet already names, so announcing it again
    // would talk over the one part of the match that is already a dialogue.
    const handedOver =
      action.kind !== 'draft_pick' && !next.result && !pendingDraftSide(next) && next.sideToMove !== state.sideToMove
    setLastMove(action.kind === 'move' ? { from: action.from, to: action.to } : null)
    // The rule banner has done its job once someone has acted on the rule. It
    // also has to go so the hand-off banner below it has somewhere to be — two
    // announcements stacked at the same coordinates is how the notice stack bug
    // happened one screen over.
    setBanner(false)
    setPlay((p) => ({
      seed: p.seed,
      match: { states: [...p.match.states, apply(currentState(p.match), action, content)] },
    }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setPeek(null)
    if (handedOver) setHandOff(next.sideToMove)
  }

  const doUndo = () => {
    play('undo', live)
    // The highlight describes a move that no longer happened.
    setLastMove(null)
    setPlay((p) => ({ seed: p.seed, match: undo(p.match) }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    // See the note on `handOff`: taking a move back is not a hand-off.
    setHandOff(null)
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
      if (!pendingCard.targets.every((target, i) => a.targets[i] === target)) continue
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
        (a) => a.kind === 'play_card' && a.cardId === pendingCard.cardId && targets.every((target, i) => a.targets[i] === target),
      )
      const complete = matching.find((a) => a.kind === 'play_card' && a.targets.length === targets.length)
      if (complete) return push(complete)
      if (matching.length === 0) {
        play('illegal', live)
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
   * for a touch gesture on a generic element. The e2e still passed, because
   * Playwright's `dragTo` synthesises mouse events — a test certifying a gesture
   * no finger can perform.
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

    /*
     * Tapping the armed card again disarms it.
     *
     * There was no way out of a pending card at all: the only exit was
     * completing it, and every square tap that did not match reset the targets
     * and left it armed. A card with no legal target anywhere — a spent one, a
     * revive with an empty graveyard — was a dead end you could not leave
     * without starting a new match. The card that armed it is the obvious thing
     * to press, and pressing it twice is how every hotbar in every game works.
     */
    if (pendingCard?.cardId === cardId) {
      setPendingCard(null)
      setRejection(null)
      return
    }

    /*
     * Refused BEFORE arming, not after.
     *
     * A spent card stays on screen deliberately (AC-017 — both hands visible,
     * with spent cards marked, so each player can see what the other used), but
     * visible is not playable. The old check only asked whose turn it was, so
     * the mover's own spent card armed itself and then matched nothing.
     * `legalActions` is the authority rather than the `used` list alone: a card
     * can also be unplayable because nothing on the board fits it, and that is
     * the same dead end from the player's side.
     */
    const playable = legal.some((a) => a.kind === 'play_card' && a.cardId === cardId)
    if (phase !== 'play' || side !== state.sideToMove || !playable) {
      // AC-008 — say why. A dead click reads as a broken app, and poking the
      // other player's cards is the first thing a hot-seat player does.
      setPendingCard(null)
      play('illegal', live)
      setRejection(describeRejection(state, { kind: 'play_card', cardId, targets: [] }, content))
      return
    }
    setRejection(null)
    setPendingCard({ cardId, targets: [] })
  }

  /** Opens the detail sheet for a card. The same sheet the dex screen uses. */
  const peekCard = (cardId: string, kindKey: string) => {
    const card = content.skillCards.get(cardId) ?? content.ruleCards.get(cardId)
    if (!card) return
    setPeek({ mark: iconMark(t, card), name: t(card.nameKey), kind: t(kindKey), text: t(card.textKey) })
  }

  const ranks = Array.from({ length: state.height }, (_, i) => (flipped ? i : state.height - 1 - i))
  const files = Array.from({ length: state.width }, (_, i) => (flipped ? state.width - 1 - i : i))
  const rule = state.ruleCardId ? content.ruleCards.get(state.ruleCardId) : undefined
  // Resolved once and reused for both the presence test and the body. Calling it
  // twice was correct (the function is pure) but says the two could differ.
  const ruleMark = iconMark(t, rule)
  const legendTypes = [...new Map([...painted.values()].map((p) => [p.type.id, p.type])).values()]

  /**
   * Whether a full-screen overlay currently owns the screen.
   *
   * `Result` is `position: absolute; inset: 0` inside `.play`, and z-index
   * changes paint order only — not tab order, not the accessibility tree, and
   * not what a locator matches. So everything it covered stayed live: a keyboard
   * or screen-reader user tabbed through five invisible controls at the result
   * screen and could fire the new-match button from a screen that never shows it.
   *
   * The set used to include the hand-off curtain, which is gone — a full-screen
   * cover demanding a tap between every ply was too much for what it bought.
   * The draft sheet is deliberately NOT in it either: it dims rather than owns,
   * #43 put the tools row back within reach during a draft on purpose, and its
   * scrim passes pointers through so a player is never trapped in one.
   */
  const overlayOwnsScreen = Boolean(state.result)

  const mover = state.sideToMove
  const waiter: Side = mover === 'white' ? 'black' : 'white'
  const hand = state.drafts[mover].held
  const spentIn = (side: Side, cardId: string) =>
    state.drafts[side].used.filter((c) => c === cardId).length >= (content.skillCards.get(cardId)?.uses ?? 1)

  return (
    // `data-drafting` rather than a `:has(.draft-scrim)` selector. `:has()` is
    // Chrome 105 / Safari 15.4, and the audience for this app is children on
    // whatever phone the household already had — on an older WebView the rule
    // silently never matches and the tools row becomes unreachable behind the
    // sheet again, with no test in a modern CI browser able to see it.
    <section className="play" data-drafting={phase === 'draft'} data-turn={mover}>
      {/* Whose turn it is, as the loudest thing on screen after the board. It
          used to be one grey chip among four, the same size and weight as the
          phase and the ply count — on a hot-seat game where the ONLY thing two
          players need from the chrome is which of them moves next. */}
      {/*
        Visible but unreachable while the result screen is up.

        The final position staying readable behind the summary is why `Result` is
        an overlay rather than an early return — two children argue about that
        position — so hiding it is not an option and `inert` is the one mechanism
        that makes a VISIBLE subtree unreachable. Where it is unsupported (a
        WebView older than Chrome 102 / Safari 15.5) the degradation is tab-order
        noise only: nothing behind the result screen can be ACTIVATED, because
        `clickSquare` and `clickCard` both early-return once `phase !== 'play'`
        and the tools row is unmounted above.

        The wrapper stays even though one overlay now uses it, because the
        alternative is repeating the decision on six siblings and forgetting the
        seventh.
      */}
      <div className="play-cover" {...(state.result ? { inert: '' } : {})}>
      <div className="turn-bar" data-turn={mover}>
        {/* The machine value lives on the attribute and the words on screen are
            translated. That split is what lets the e2e suite keep asserting a
            stable value while a player reads their own language.

            `aria-live`, because the turn is the one value on this screen that
            CHANGES and matters. React swaps the text inside the same node, and a
            screen reader announces nothing for that unless the region is live. */}
        <span className="turn" data-testid="side-to-move" data-side={mover} role="status" aria-live="polite">
          <span className="turn-chip" data-side={mover} aria-hidden="true" />
          {t('ui.status.whose-turn').replace('{name}', nameOf(mover))}
        </span>
        <span className="turn-right">
          <span data-testid="phase" data-phase={phase} className="ply">
            {state.plyCount}
            {t('ui.status.ply')}
          </span>
          <button data-testid="undo" onClick={doUndo}>
            {t('ui.action.undo')}
          </button>
        </span>
      </div>

      {/* AC-004's display clause: the drawn rule card stays on screen for the
          whole match, not shown once at the start and forgotten. The prose is
          behind a disclosure because it is a paragraph and the board needs the
          room — the NAME, which is what a player checks mid-match, is always up. */}
      <button
        type="button"
        className="rule-bar"
        data-testid="rule-card"
        data-rule={state.ruleCardId ?? ''}
        aria-expanded={ruleOpen}
        onClick={() => setRuleOpen((o) => !o)}
      >
        {ruleMark.kind !== 'none' && (
          <span className="rule-icon" aria-hidden="true">
            <MarkBody mark={ruleMark} />
          </span>
        )}
        <span className="rule-body">
          <span className="rule-kicker">{t('ui.rule.this-match')}</span>
          <strong>{rule ? t(rule.nameKey) : t('ui.rule.none')}</strong>
        </span>
        <span className="chevron" aria-hidden="true">
          {ruleOpen ? '▲' : '▼'}
        </span>
      </button>
      {ruleOpen && rule && <p className="rule-text">{t(rule.textKey)}</p>}

      <div className="play-body">
        {/* The waiting player: their name, what they have taken, and their hand
            condensed to marks. AC-017's "both trays always visible", at the size
            a one-screen layout can afford. */}
        <div className="foe-strip" data-testid={`hand-${waiter}`} data-side={waiter}>
          <span className="foe-name">{t('ui.status.waiting').replace('{name}', nameOf(waiter))}</span>
          <Taken state={state} side={waiter} content={content} t={t} />
          <span className="foe-cards">
            {state.drafts[waiter].held.map((cardId) => (
              <button
                key={cardId}
                type="button"
                className="foe-card"
                data-testid={`hand-${waiter}-${cardId}`}
                data-card={cardId}
                data-used={spentIn(waiter, cardId)}
                // Named, because the mark inside is `aria-hidden` and this is a
                // button. Condensing must cost prose, never identity.
                aria-label={t(content.skillCards.get(cardId)?.nameKey ?? cardId)}
                // Refuses, and says why (AC-008). Poking the other player's
                // cards is the first thing a hot-seat player does, and the
                // sentence they get back is what teaches them whose turn it is
                // — opening the card's dex entry instead would be helpful about
                // the wrong question. The entry is still one tap away from the
                // slot detail and from the dex screen.
                onClick={() => clickCard(waiter, cardId)}
              >
                <MarkBody mark={iconMark(t, content.skillCards.get(cardId))} />
              </button>
            ))}
            {state.drafts[waiter].held.length === 0 && <span className="empty">{t('ui.tray.empty')}</span>}
          </span>
        </div>

        {/* Coordinates moved off the squares and onto the edge. In the square
            they competed with the piece for a 60px box on a phone, which is why
            they were 9px and unreadable anyway. */}
        <div className="board-frame" data-turn={mover}>
          <ol className="rank-rail" data-testid="board-ranks">
            {ranks.map((r) => (
              <li key={r}>{r + 1}</li>
            ))}
          </ol>
          <div
            className="board"
            data-testid="board"
            role="grid"
            aria-label={t('ui.board.label')}
            style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)` }}
          >
            {/* `role="grid"` owns `row`, which owns `gridcell` — the middle level
                was missing, so the squares were 36 cells with no row or column
                context and a screen reader read them as a flat run. The row
                wrapper is `display: contents`, which keeps every square a direct
                grid item so the layout is unchanged. */}
            {ranks.map((rank) => (
              <div key={rank} className="board-row" role="row">
                {files.map((file) => {
                  const sq = squareId(file, rank)
                  const piece = state.board.get(sq)
                  const parity = (file + rank) % 2
                  const type = painted.get(sq)?.type
                  const def = piece ? content.pieces.get(piece.pieceId) : undefined
                  const typeMark = iconMark(t, type)
                  const isLegal = reachable.has(sq)
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
                      data-legal={isLegal}
                      // Which KIND of legal, so the cue can differ: an empty
                      // square you may step onto and an enemy you may take are
                      // not the same decision, and one white ring said both.
                      data-legal-kind={isLegal ? (piece ? 'capture' : 'move') : undefined}
                      data-selected={selected === sq}
                      role="gridcell"
                      aria-label={squareLabel(t, sq, def, piece, type, isLegal)}
                      // `aria-selected`, not `aria-pressed`: the explicit gridcell
                      // role overrides the native button role, and `aria-pressed`
                      // is a button-family state a gridcell does not support.
                      aria-selected={selected === sq}
                      onClick={() => clickSquare(sq)}
                    >
                      {/* What this square DOES, drawn on it. The stripe alone
                          said only "something happens here", and the bundled
                          types range from promotion to destruction. */}
                      {typeMark.kind !== 'none' && (
                        <span className="square-mark" data-occupied={Boolean(piece)} aria-hidden="true">
                          <MarkBody mark={typeMark} />
                        </span>
                      )}
                      <span className="piece">{def ? <MarkBody mark={pieceMark(t, def, piece?.side)} /> : ''}</span>
                      {/* The third side cue, and the reason `tokens.css` no
                          longer claims font weight as one: a sprite has no
                          weight. One side is tagged bottom-left and the other
                          top-right, so the two armies differ by a mark you can
                          LOCATE without resolving its colour. */}
                      {piece && <span className="side-tag" data-side={piece.side} aria-hidden="true" />}
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

        {/* One line, always present, holding whatever the board most recently
            refused or is waiting for. Always present because a line that appears
            only on an error reflows the board under the player's thumb at the
            exact moment they are being told they did something wrong. */}
        <p className="hint-bar" data-pending={Boolean(pendingCard)} {...(rejection ? { 'data-testid': 'rejection' } : {})} role="status">
          {rejection ?? (pendingCard ? t('ui.hint.choose-target') : t('ui.hint.tap-piece'))}
        </p>

        {/* AC-018's UI clause: every painted type on this board, with its ability
            text one tap away. A chip rather than a paragraph — see the header. */}
        {legendTypes.length > 0 && (
          <ul className="legend" data-testid="square-legend">
            {legendTypes.map((type) => {
              const mark = iconMark(t, type)
              return (
                <li key={type.id} data-square-type={type.id}>
                  <button
                    type="button"
                    onClick={() =>
                      setPeek({ mark, name: t(type.nameKey), kind: t('ui.dex.kind.square'), text: t(type.textKey) })
                    }
                  >
                    {mark.kind !== 'none' && (
                      <span className="legend-icon" aria-hidden="true">
                        <MarkBody mark={mark} />
                      </span>
                    )}
                    <strong>{t(type.nameKey)}</strong>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {/* The player to move: what they have taken, and their hand as slots. */}
        <div className="hotbar-block" data-testid={`hand-${mover}`} data-side={mover}>
          <div className="hotbar-head">
            <span className="hotbar-owner" data-side={mover}>
              {t('ui.hand.owner').replace('{name}', nameOf(mover))}
            </span>
            <Taken state={state} side={mover} content={content} t={t} />
          </div>
          <div className="hotbar">
            {Array.from({ length: Math.max(HOTBAR_SLOTS, hand.length) }, (_, i) => {
              const cardId = hand[i]
              if (!cardId) return <span key={`empty-${i}`} className="slot" data-empty="true" aria-hidden="true" />
              const card = content.skillCards.get(cardId)
              const spent = spentIn(mover, cardId)
              return (
                <button
                  key={cardId}
                  type="button"
                  className="slot"
                  data-testid={`hand-${mover}-${cardId}`}
                  data-card={cardId}
                  data-used={spent}
                  data-pending={pendingCard?.cardId === cardId}
                  aria-label={card ? t(card.nameKey) : cardId}
                  onClick={() => clickCard(mover, cardId)}
                >
                  <MarkBody mark={iconMark(t, card)} />
                </button>
              )
            })}
          </div>
          {/* What the card in play (or the first one held) actually does. The
              hotbar is marks only, and a mark a child has not learned yet is a
              guess — this is the line that teaches it, and it opens the full
              entry. */}
          <SlotDetail
            content={content}
            t={t}
            cardId={pendingCard?.cardId ?? hand[0]}
            onPeek={(id) => peekCard(id, 'ui.dex.kind.skill')}
          />
        </div>
      </div>

      </div>

      {/* UNMOUNTED, not hidden, and the difference is the duplicate test id.
          `Result` carries its own home button, so at the result screen `hidden`
          would still leave two `go-home` nodes in the document — a strict-mode
          locator matches both, visible or not. Nothing here is reachable behind
          an opaque overlay anyway. */}
      {!overlayOwnsScreen && (
      <div className="match-tools">
        <button data-testid="sound-toggle" data-on={live.sound} className={live.sound ? 'positive' : ''} onClick={() => toggle('sound')}>
          {t(live.sound ? 'ui.sound.on' : 'ui.sound.off')}
        </button>
        <button data-testid="flip-board" data-flipped={flipped} onClick={() => setFlipped((f) => !f)}>
          {t('ui.action.flip')}
        </button>
        <button data-testid="new-match" onClick={startNew}>
          {t('ui.action.new-match')}
        </button>
        {onHome && (
          <button
            data-testid="go-home"
            onClick={() => {
              if (inProgress && !window.confirm(t('ui.confirm.discard'))) return
              onHome()
            }}
          >
            {t('ui.action.home')}
          </button>
        )}
        <button className="ghost" data-testid="match-settings" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((o) => !o)}>
          {t('ui.action.settings')}
        </button>
      </div>
      )}

      {/* ADR-024's replay clause plus the settings that are not worth a slot in
          the row. Deliberately moved, NOT deleted: the seed is a reproducibility
          contract with an AC behind it, and removing it would settle a recorded
          decision by tidying. */}
      {settingsOpen && !overlayOwnsScreen && (
        <div className="match-settings-panel">
          {hapticsSupported() && (
            <button data-testid="haptics-toggle" data-on={live.haptics} onClick={() => toggle('haptics')}>
              {t(live.haptics ? 'ui.haptics.on' : 'ui.haptics.off')}
            </button>
          )}
          <span className="seed-row">
            <span data-testid="match-seed" title={t('ui.seed.hint')}>
              {t('ui.seed.label')} {seed}
            </span>
            <button data-testid="copy-seed" data-copy-state={copyState} onClick={copySeed}>
              {t(copyState === 'copied' ? 'ui.seed.copied' : copyState === 'failed' ? 'ui.seed.copy-failed' : 'ui.seed.copy')}
            </button>
          </span>
        </div>
      )}

      {/* Lifted out of the document flow (#43). Three offers stacked above the
          board cost ~230px there and pushed the board off the phone; over a
          dimmed board they cost nothing, and the player can still see the
          position the card is being chosen for. */}
      {phase === 'draft' && drafting && (
        <div className="draft-scrim">
          {/* `role="dialog"` WITHOUT `aria-modal`, and the omission is the honest
              part: this sheet deliberately does not trap — the scrim dims and
              passes pointers through so a player is never stuck in a draft — so
              claiming modality would describe a containment that does not exist. */}
          <div className="draft" data-testid="draft-offer" data-side={drafting} role="dialog" aria-label={t('ui.draft.prompt')}>
            <p className="draft-prompt">
              <span className="turn-chip" data-side={drafting} aria-hidden="true" />
              {nameOf(drafting)} — {t('ui.draft.prompt')}
            </p>
            <p className="hint">{t('ui.draft.hint')}</p>
            <div className="draft-cards">
              {(state.drafts[drafting].offers ?? []).map((cardId) => {
                const card = content.skillCards.get(cardId)
                return (
                  <button key={cardId} className="card" data-testid={`offer-${cardId}`} data-card={cardId} onClick={() => push({ kind: 'draft_pick', cardId })}>
                    <span className="card-icon" aria-hidden="true">
                      <MarkBody mark={iconMark(t, card)} />
                    </span>
                    <strong>{card ? t(card.nameKey) : cardId}</strong>
                    {card && <span>{t(card.textKey)}</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* The rule this match drew, said once and loudly. It is the one thing
          about a match that a player did not choose, and it used to arrive as a
          line of text in a card that was already on screen. */}
      {banner && rule && (
        <div className="rule-banner" data-testid="rule-banner" role="status">
          <span className="banner-icon" aria-hidden="true">
            <MarkBody mark={ruleMark} />
          </span>
          <span>
            <strong>{t(rule.nameKey)}</strong>
            <span>{t(rule.textKey)}</span>
          </span>
        </div>
      )}

      {/* The hand-off. A full-screen button, because at this moment the only
          correct interaction is "the other player takes the phone and taps", and
          anything else on screen is a chance to see a position that is not yours
          to see yet. */}
      {/*
        The hand-off, announced rather than enforced.

        `pointer-events: none` and no control of its own: it is not something to
        dismiss, it is something to notice. `role="status"` with `aria-live` is
        what carries the same information to a screen reader that the colour
        change carries to everyone else — which is the half the curtain was
        genuinely good at, kept without the full-screen cover or the tap.

        Suppressed while the rule banner is up so the two never stack; the rule
        is 3.2s at the start of a match and this is 1.6s from the first ply, so
        they only meet if someone moves very fast.
      */}
      {handOff && !banner && (
        <div className="turn-toast" data-testid="hand-off" data-side={handOff} role="status" aria-live="polite">
          <span className="turn-chip" data-side={handOff} aria-hidden="true" />
          <span>{t('ui.status.whose-turn').replace('{name}', nameOf(handOff))}</span>
        </div>
      )}

      {/* The end of the match, OVER the board rather than instead of it.
          Returning early and rendering only the summary was the first version,
          and it takes the final position off the screen — which is the one thing
          two children look at while arguing about what just happened. It also
          made the position unobservable to the specs that play a line out. */}
      {state.result && (
        <Result
          state={state}
          result={state.result}
          nameOf={nameOf}
          onRematch={startNew}
          onEditRoom={onEditRoom ?? (() => undefined)}
          onHome={onHome ?? (() => undefined)}
        />
      )}

      {peek && <PeekSheet peek={peek} onClose={() => setPeek(null)} />}
    </section>
  )
}

/**
 * What a side has taken, as a row of small marks.
 *
 * `captured` is keyed by the side that LOST the piece, so a side's own tally is
 * the other side's list — see the same note in `Result`.
 */
function Taken({
  state,
  side,
  content,
  t,
}: {
  state: { captured: Readonly<Record<Side, readonly string[]>> }
  side: Side
  content: ContentSet
  t: Translate
}) {
  const lostBy: Side = side === 'white' ? 'black' : 'white'
  const taken = state.captured[lostBy]
  if (taken.length === 0) return null
  return (
    // Named as a group and hidden item by item: fifteen individually-labelled
    // marks in a strip is noise, and the count is the fact.
    <span className="taken" data-side={side} aria-label={t('ui.status.taken').replace('{n}', String(taken.length))}>
      {taken.map((pieceId, i) => (
        <span key={`${pieceId}-${i}`} className="taken-mark" aria-hidden="true">
          <MarkBody mark={resolveMark(t, content.pieces.get(pieceId), { registry: artRegistry, side: lostBy, fallback: 'none' })} />
        </span>
      ))}
    </span>
  )
}

/** The one-line description under the hotbar, and the way into the full entry. */
function SlotDetail({
  content,
  t,
  cardId,
  onPeek,
}: {
  content: ContentSet
  t: Translate
  cardId: string | undefined
  onPeek: (cardId: string) => void
}) {
  const card = cardId ? content.skillCards.get(cardId) : undefined
  if (!card || !cardId) {
    return <p className="slot-detail" data-empty="true">{t('ui.hand.no-cards')}</p>
  }
  return (
    <button type="button" className="slot-detail" data-testid="slot-detail" onClick={() => onPeek(cardId)}>
      <span className="slot-detail-head">
        <strong>{t(card.nameKey)}</strong>
        <span className="more">{t('ui.dex.more')}</span>
      </span>
      <span className="slot-detail-text">{t(card.textKey)}</span>
    </button>
  )
}

/**
 * The detail sheet, shared by the legend, the hotbar and the waiting hand.
 *
 * It takes resolved strings rather than a record, which is what lets one sheet
 * serve four content kinds without this component learning that there are four.
 */
function PeekSheet({ peek, onClose }: { peek: Peek; onClose: () => void }) {
  const t = useTranslate()
  return (
    // `Sheet` is what makes the `aria-modal` on it a true statement — focus in,
    // Tab trapped, Escape, focus restored. The previous version claimed
    // modality on the strength of the scrim swallowing pointer events, which
    // says nothing to a keyboard or a screen reader.
    <Sheet label={peek.name} onClose={onClose} scrimTestId="peek-sheet">
      <div className="sheet-head">
        <span className="sheet-icon" aria-hidden="true">
          <MarkBody mark={peek.mark} />
        </span>
        <span>
          <strong>{peek.name}</strong>
          <span className="sheet-kind">{peek.kind}</span>
        </span>
      </div>
      <p className="sheet-text">{peek.text}</p>
      <button type="button" data-testid="peek-close" onClick={onClose}>
        {t('ui.action.close')}
      </button>
    </Sheet>
  )
}
