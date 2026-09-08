import { useEffect, useRef, useState } from 'react'
import type { ContentSet } from '@content/load'
import type { PieceDef } from '@content/schema'
import type { AiClient } from '@engine/ai/client'
import type { Difficulty } from '@engine/ai/difficulty'
import { paintedSquares } from '@engine/effects'
import { apply, describeRejection, legalActions, pendingDraftSide, royalSquaresInCheck } from '@engine/engine'
import { type Match, createMatch, currentState, undo } from '@engine/match'
import { type Action, type GameState, type Side, type SquareId, squareId } from '@engine/types'
import { type LiveEffect, badgeFor, liveEffects, sourceRecord } from './liveEffects'
import { type Translate, useTranslate } from './i18n'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'
import { type Settings, DEFAULT_SETTINGS } from './settings'
import { type SoundEvent, hapticsSupported, play } from './sound'
import { Result } from './Result'
import { Sheet } from './Sheet'
import { MatchIntro } from './MatchIntro'
import { CardBanner } from './CardBanner'
import { AwardBanner } from './AwardBanner'
import { CaptureReveal } from './CaptureReveal'
import { type CardPlay, cardPlayBetween } from './cardPlays'
import { MATCH_INTRO_SEEN_KEY, hasSeen, markSeen } from './onboarding'
import { loadCollection, mergeUp, newlyReached, saveCollection } from '../collection/record'
import { observe } from '../collection/observe'
import { PieceMoveRegion } from './PieceDetail'
import { usePressInspect } from './usePressInspect'
import type { EffectiveEquipment } from '@engine/loadout'
import type { StandardEligibility } from '@progression/eligibility'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { grantCompletedMatch } from '@progression/rewards'
import type { ProgressionNotice } from './UpgradeReward'

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
  // A card is the rarer thing and it now gets a banner; a card play that
  // sounded exactly like a step was the audible half of the same defect.
  if (action.kind === 'play_card') return 'card'
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
  effect: { kind: string; remaining: number } | undefined,
  checked: boolean,
): string {
  const parts = [sq]
  if (def && piece) parts.push(`${t(`ui.side.${piece.side}`)} ${t(def.nameKey)}`)
  else parts.push(t('ui.board.empty'))
  if (type) parts.push(t(type.nameKey))
  // The badge is `aria-hidden`, so this is the ONLY way the effect reaches a
  // screen reader — the same reason legal-move state is in the label rather
  // than only in an outline.
  if (effect) {
    parts.push(`${t(`ui.effect.${effect.kind}`)}, ${t('ui.effect.remaining').replace('{n}', String(effect.remaining))}`)
  }
  if (checked) parts.push(t('ui.board.in-check'))
  if (reachable) parts.push(t('ui.board.reachable'))
  return parts.join(', ')
}

/** `a1` -> 0, `f6` -> 5. The engine's squareId is a letter then a 1-based rank. */
const fileOf = (sq: string) => sq.charCodeAt(0) - 97
const rankOf = (sq: string) => Number(sq.slice(1)) - 1

/** A 31-bit non-negative seed — the default when no generator is injected. */
const randomSeed = () => Math.floor(Math.random() * 2 ** 31)
const randomClaimId = () => `match-${Date.now()}-${Math.floor(Math.random() * 2 ** 31)}`

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

/**
 * The floor on how long a computer turn takes, in milliseconds.
 *
 * Not a delay for its own sake. The board already marks the last move — an
 * outline on the two squares and a landing slide — but a player who has just
 * moved is still looking at their OWN move when the reply lands, and the
 * easiest level answers in about 150ms. The mark is there and nobody saw it
 * arrive, so the position appears to have changed by itself.
 *
 * A floor puts a beat between the two moves, which is what makes the landing
 * animation land somewhere the eye is already going, and it is what gives the
 * thinking indicator long enough to be read rather than flashed.
 *
 * It bounds nothing about the SEARCH: the budget is still nodes (ADR-003), the
 * move is already decided when the wait starts, and the hardest level's ~850ms
 * usually exceeds this on its own. It costs time only where the search was
 * faster than a person can follow.
 */
const AI_MIN_THINK_MS = 650

/**
 * How long the card banner names the card that just fired.
 *
 * Exported so a test can advance exactly this far rather than guess. Longer
 * than the hand-off's 1.6s nudge is not needed — this is one short line and a
 * card name — but it must be long enough to read at a glance, and it doubles as
 * the computer's beat (ADR-005): the reply it owes waits this out, so cause is
 * on screen before effect on the one path where the player did not cause it.
 */
export const CARD_BANNER_MS = 1200
/** How long an automatic skill acquisition stays visible. */
export const AWARD_BANNER_MS = 1800
/** How long the final board explains a royal capture before the result screen. */
export const CAPTURE_REVEAL_MS = 2400

/**
 * What the detail sheet is currently showing. Content-agnostic on purpose.
 *
 * `because` and `piece` are the two exceptions, and both are optional so that
 * the call sites predating them (legend chip, hotbar slot, waiting hand) are
 * unchanged: a card and a square type have no movement to draw, and passing
 * nothing is the accurate statement of that rather than a special case inside
 * the sheet.
 */
type Peek = { mark: Mark; name: string; kind: string; text: string; because?: string; piece?: PieceDef }

type TerminalCapture =
  | {
      kind: 'move'
      key: string
      attackerSide: Side
      attackerPieceId: string
      capturedSide: Side
      capturedPieceId: string
      from: SquareId
      to: SquareId
    }
  | {
      kind: 'card'
      key: string
      attackerSide: Side
      cardId: string
      capturedSide: Side
      capturedPieceId: string
    }

function newlyCapturedRoyal(
  before: GameState,
  after: GameState,
  content: ContentSet,
): { side: Side; pieceId: string } | null {
  for (const side of ['white', 'black'] as const) {
    const added = after.captured[side].slice(before.captured[side].length)
    const pieceId = added.find((id) => content.pieces.get(id)?.royal === true)
    if (pieceId) return { side, pieceId }
  }
  return null
}

/**
 * Whether the player has asked the system for less movement.
 *
 * Read here rather than left to a CSS media query because the flourish is a
 * one-shot attribute the board carries, not a permanent style — and a component
 * that keeps emitting it while the stylesheet silently ignores it is a
 * behaviour nothing can test. `matchMedia` is absent in some older WebViews,
 * so its absence means "no preference expressed", not "reduce".
 */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}

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
  aiSide,
  aiDifficulty = 'medium',
  createAi,
  initialState,
  storage,
  effectiveEquipment,
  eligibility,
  progression = emptyProgression(),
  onProgressionChange,
  claimId: initialClaimId,
  newClaimId = randomClaimId,
}: {
  content: ContentSet
  presetId: string
  newSeed?: () => number
  /**
   * The position this screen opens on, instead of a fresh deal.
   *
   * Injected for the same reason `newSeed` and `createAi` are (ADR-024): some
   * states are reachable in play and not reachable from an opening within a
   * test's patience — a card that leaves its own owner with no legal move is
   * the one ADR-003 exists for, and no seed deals it on turn one. A rematch
   * still deals normally; this seeds the first match only.
   */
  initialState?: GameState | undefined
  /**
   * The side the computer plays, or absent for hot-seat.
   *
   * Absent is the existing behaviour, unchanged — which is why this is optional
   * rather than a mode enum every caller has to answer.
   */
  aiSide?: Side | undefined
  aiDifficulty?: Difficulty | undefined
  /**
   * Makes the search client. Injected for the same reason `newSeed` is
   * (ADR-024): a test needs to drive the real search without a worker, and a
   * component that constructed its own would be untestable without one.
   */
  createAi?: (() => AiClient) | undefined
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
  /**
   * Where the first-board sheet records that it has been shown.
   *
   * Injected rather than read from `window`, for the same reason `newSeed` and
   * `createAi` are (ADR-024) — and here the injection is load-bearing beyond
   * testability. Roughly fifteen unit tests mount this component directly to
   * look at a board. A component that reached for `localStorage` on its own
   * would put every one of them behind an undismissed sheet, failing on
   * selectors one tap away with nothing in the output naming the cause.
   *
   * Absent therefore means "no onboarding here", which is also the right answer
   * for a browser that denies storage — see `onboarding.ts` on which way the
   * storage checks fail.
   */
  storage?: Storage | null | undefined
  /** Ownership-validated, start-time snapshot supplied by App. */
  effectiveEquipment?: EffectiveEquipment | undefined
  /** Start-time reward eligibility snapshot; Phase 5 consumes it at result. */
  eligibility?: StandardEligibility | undefined
  progression?: ProgressionProfileV1 | undefined
  onProgressionChange?: ((next: ProgressionProfileV1) => boolean) | undefined
  claimId?: string | undefined
  newClaimId?: (() => string) | undefined
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
  const [{ seed, match, claimId }, setPlay] = useState<{ seed: number; match: Match; claimId: string }>(() => {
    const s = newSeed()
    return {
      seed: s,
      claimId: initialClaimId ?? newClaimId(),
      match: initialState
        ? { states: [initialState] }
        : createMatch({ content, presetId, seed: s, ...(effectiveEquipment ? { effectiveEquipment } : {}) }),
    }
  })
  const [selected, setSelected] = useState<SquareId | null>(null)
  const [rewardState, setRewardState] = useState<{
    profile: ProgressionProfileV1
    notice: ProgressionNotice
  }>({ profile: progression, notice: 'none' })
  const [pendingCard, setPendingCard] = useState<{ cardId: string; targets: SquareId[] } | null>(null)
  const [rejection, setRejection] = useState<string | null>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  // ADR-018: one shared board, flipped by hand. Not an automatic rotation.
  const [flipped, setFlipped] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ruleOpen, setRuleOpen] = useState(false)
  /** The computer is searching. A mode, and one with an exit — see the effect. */
  const [aiThinking, setAiThinking] = useState(false)
  /** The wall-clock valve fired at least once, so this match no longer replays. */
  const [aiDegraded, setAiDegraded] = useState(false)
  const aiRef = useRef<AiClient | null>(null)
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
   * The first-board sheet, open until this browser has been shown it once.
   *
   * Resolved in the initialiser rather than in an effect: an effect would paint
   * one frame of the board first, and a sheet that slides in over a screen the
   * player has already started reading is a sheet they dismiss without reading.
   * With no storage it is simply never open — see the note on the prop.
   */
  const [introOpen, setIntroOpen] = useState(() => Boolean(storage) && !hasSeen(storage!, MATCH_INTRO_SEEN_KEY))
  const closeIntro = () => {
    setIntroOpen(false)
    // Any dismissal counts — the button, the scrim, Escape. `Sheet` routes all
    // three through `onClose`, so recording here covers them without three
    // call sites that could disagree.
    if (storage) markSeen(storage, MATCH_INTRO_SEEN_KEY)
  }
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
  /**
   * The match this screen has already written into the collection.
   *
   * Keyed on the STATE OBJECT that carried the result, not on a boolean and not
   * on `Boolean(state.result)`. React re-renders for reasons that have nothing
   * to do with the board — a settings toggle, a banner timer, a parent's prop
   * change — and a guard that only asked "is there a result?" would write again
   * on every one of them, inflating the count the result screen shows. The
   * engine's states are immutable (ADR-004), so identity is exactly the right
   * question: one finished match, one object, one write.
   *
   * A rematch replaces the whole `match`, so its terminal state is a different
   * object and commits on its own.
   */
  const committedFor = useRef<GameState | null>(null)
  /** How many entries THIS match newly reached, or null before it is known. */
  const [discovered, setDiscovered] = useState<number | null>(null)
  useEffect(() => {
    if (!state.result || !storage) return
    if (committedFor.current === state) return
    committedFor.current = state
    const board = content.boards.get(state.boardId)
    if (!board) return
    // Hot-seat is two children, so both sides are people; against the computer
    // only the one it is not playing is (ADR-001, ADR-004).
    const humanSides: Side[] = aiSide ? (['white', 'black'] as const).filter((side) => side !== aiSide) : ['white', 'black']
    // Read, fold, write — and every one of the three is silent on failure. By
    // the time this runs the match is over and the result is already on screen;
    // a browser that denies storage must not turn the end of a game into a
    // crash. The cost of a lost write is one match's discoveries.
    // Measured ACROSS the write, which is the only place the delta exists: once
    // the fold has landed, "what this match added" is no longer recoverable from
    // the stored collection, and the size of that collection is a different
    // number that reads the same on a match which discovered nothing.
    const before = loadCollection(storage)
    const after = mergeUp(before, observe(match, board, humanSides))
    saveCollection(storage, after)
    // Publish the delta only if the write actually LANDED. `saveCollection`
    // swallows failure by design and returns nothing, so the fold succeeding in
    // memory says nothing about storage — and announcing a discovery count on a
    // browser that refused the write tells a child their collection grew when
    // reopening the dex will show that it did not. `Result` already documents null
    // as "the collection was never written"; this is what makes that true for a
    // denied write and not only for an absent storage.
    const persisted = loadCollection(storage)
    const landed = newlyReached(persisted, after).size === 0
    setDiscovered(landed ? newlyReached(before, after).size : null)
  }, [state, storage, content, match, aiSide])

  /** One persisted progression claim per terminal match state. */
  const rewardCommittedFor = useRef<GameState | null>(null)
  const [rewardRetry, setRewardRetry] = useState(0)
  const progressionChangeRef = useRef(onProgressionChange)
  progressionChangeRef.current = onProgressionChange
  useEffect(() => {
    if (!state.result || !eligibility || rewardCommittedFor.current === state) return
    if (!eligibility.eligible) {
      rewardCommittedFor.current = state
      setRewardState({ profile: progression, notice: 'none' })
      return
    }
    const persist = progressionChangeRef.current
    if (!persist) return
    const granted = grantCompletedMatch(progression, claimId)
    if (!granted.ok) return
    if (!granted.granted) {
      rewardCommittedFor.current = state
      setRewardState({ profile: granted.profile, notice: 'none' })
      return
    }
    if (persist(granted.profile)) {
      rewardCommittedFor.current = state
      setRewardState({ profile: granted.profile, notice: 'granted' })
    } else {
      // Do not consume the in-memory guard until the durable write lands. The
      // result screen exposes an explicit retry, using the same claim id, so a
      // transient storage failure cannot permanently lose this match reward.
      setRewardState({ profile: progression, notice: 'save-failed' })
    }
  }, [claimId, eligibility, progression, rewardRetry, state])

  const applyProgression = (next: ProgressionProfileV1): boolean => {
    if (!onProgressionChange?.(next)) return false
    setRewardState((current) => ({ ...current, profile: next }))
    return true
  }

  const legal = legalActions(state, content)
  const drafting = pendingDraftSide(state)
  const phase = state.result ? 'result' : drafting ? 'draft' : 'play'
  const painted = paintedSquares(state, content)
  // Every lasting effect on the board, derived once and read by all three
  // surfaces (ADR-005): the square badge, the legend chips and the sheet.
  const effects = liveEffects(state)
  // The forced pass, offered only when the engine offers it (ADR-003). Asking
  // the engine rather than re-deriving "has a card and cannot move" keeps one
  // rule in one place — the UI has been the second copy of a rule before.
  const passAction = legal.find((a) => a.kind === 'end_turn')
  /*
   * The effects that appeared on the LAST action, for the one-shot flourish.
   *
   * Derived from the history rather than held in state: `match.states` already
   * records what the board looked like a moment ago, and a `useState` mirror of
   * it would be a second source of truth that drifts on undo. Suppressed
   * wholesale when the player has asked for less movement — the badge simply
   * appears, which is the same information without the motion.
   */
  const arrived = (() => {
    if (prefersReducedMotion() || match.states.length < 2) return new Set<string>()
    /*
     * Keyed on the source and the EXPIRY, not just the square and the kind.
     *
     * `square:kind` alone cannot see a re-application: re-freezing a frozen
     * square, or a second card extending a live grant, leaves that key
     * unchanged — so the badge's number ticked back up and the flourish that
     * says "something just happened here" silently did not fire, on exactly the
     * plies where a player most needs telling.
     *
     * The expiry rather than the remaining COUNT, and the difference is not
     * cosmetic: `remaining` ticks down every ply, so keying on it would mark
     * every surviving effect as newly arrived on every single ply — a board
     * that flashes constantly says nothing at all. `remaining + plyCount` is
     * the absolute ply the effect ends on: constant while it merely persists,
     * and pushed forward exactly when something re-applies it.
     */
    const previous = match.states[match.states.length - 2]!
    const key = (e: LiveEffect, ply: number) => `${e.square}:${e.kind}:${e.sourceId}:${e.remaining + ply}`
    const was = new Set(liveEffects(previous).map((e) => key(e, previous.plyCount)))
    return new Set(effects.filter((e) => !was.has(key(e, state.plyCount))).map((e) => e.square))
  })()

  /**
   * The card played on the LAST transition, if one was — derived, not stored.
   *
   * `[fail:design] rule-keyed-to-event-not-state` is at count:3 here, once in
   * this component. Four routes reach "a card was played": the human commit
   * path, the commit button for a card that names no square, the computer's
   * `push`, and `undo` stepping back across one. A `setState` in each handler
   * is the shape that has failed three times; this asks the history instead.
   */
  const cardPlay = match.states.length < 2 ? null : cardPlayBetween(match.states[match.states.length - 2]!, state)

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
   * The card banner's own lifetime, held rather than derived.
   *
   * The identity comes from the derivation (`cardPlay`); the VISIBILITY is a
   * flag on a timer, and the distinction is the whole of ADR-002's amendment.
   * Rendering straight off `cardPlay` would make the banner last exactly as
   * long as the player took to act next — it vanishes the moment
   * `match.states` grows past the pair that shows the play, so a fast player
   * gets 200ms and a slow one gets however long they sat there.
   *
   * Keyed on the history length as well as the card, so playing the same card
   * twice restarts the countdown instead of inheriting the remainder of the
   * first one's — the same reasoning that puts the absolute expiry in
   * `effectKey`, and the same reason the hand-off effect depends on `plyCount`.
   *
   * The play itself is LATCHED, not read live, and that is the load-bearing
   * part: `cardPlay` is null again the moment the owed move lands, so a banner
   * rendered from it would blink out mid-sentence for the player who moves
   * quickly. What the latch holds is what was true when the card resolved.
   */
  const playKey = cardPlay ? `${match.states.length}:${cardPlay.cardId}` : null
  const [cardNotice, setCardNotice] = useState<{ key: string; play: CardPlay } | null>(null)
  useEffect(() => {
    if (playKey && cardPlay) setCardNotice({ key: playKey, play: cardPlay })
    // `cardPlay` is derived fresh each render; `playKey` is the value that
    // actually changes when a NEW card is played, so it alone drives the latch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey])
  useEffect(() => {
    if (!cardNotice) return
    const id = setTimeout(() => setCardNotice(null), CARD_BANNER_MS)
    return () => clearTimeout(id)
  }, [cardNotice])
  const [awardNotice, setAwardNotice] = useState<{ key: string; side: Side; cardId: string } | null>(null)
  useEffect(() => {
    if (!awardNotice) return
    const id = setTimeout(() => setAwardNotice(null), AWARD_BANNER_MS)
    return () => clearTimeout(id)
  }, [awardNotice])
  /** Keeps the final board visible long enough to explain a royal capture. */
  const [captureNotice, setCaptureNotice] = useState<TerminalCapture | null>(null)
  useEffect(() => {
    if (!captureNotice) return
    const id = setTimeout(() => setCaptureNotice(null), CAPTURE_REVEAL_MS)
    return () => clearTimeout(id)
  }, [captureNotice])
  /**
   * The announced card's record, or absent when the set no longer defines it.
   *
   * Resolved here rather than at the render, and `cardBannerUp` depends on it,
   * so an unknown card takes the card banner OUT of the ordered pick entirely
   * (ADR-004) instead of winning the slot and then drawing nothing — which
   * would blank the notice stack and swallow the hand-off behind it.
   */
  const cardRecord = cardNotice ? content.skillCards.get(cardNotice.play.cardId) : undefined
  const cardBannerUp = cardNotice !== null && cardRecord !== undefined
  const awardRecord = awardNotice ? content.skillCards.get(awardNotice.cardId) : undefined
  const awardBannerUp = awardNotice !== null && awardRecord !== undefined
  const captureRevealUp = captureNotice !== null && state.result?.reason === 'king_capture'
  /**
   * The squares the announced card touched, for as long as it is announced.
   *
   * Gated on `cardBannerUp`, not merely on the latch: the ring and the words
   * are the same event, and two lifetimes for one event is how a ring outlives
   * the sentence explaining it.
   *
   * The `cardBannerUp` half was missed once. When the record lookup was made to
   * suppress the banner, this line still read the latch alone — so an unknown
   * card would have drawn rings on the board with no banner to explain them,
   * while some other notice held the slot. The comment above already claimed
   * the shared lifetime; only the code did not. Review caught it.
   *
   * Empty under reduced motion — the banner still says everything the ring
   * does, in words.
   */
  const impacted: ReadonlySet<SquareId> =
    cardBannerUp && cardNotice && !prefersReducedMotion() ? cardNotice.play.impacted : new Set<SquareId>()

  /**
   * The hand-off banner clears itself.
   *
   * On a timer rather than on the next interaction, because the thing it marks
   * has already happened by the time it appears — waiting for a tap is what the
   * curtain did, and the tap was the problem. Keyed on the side so a second
   * hand-off restarts the countdown rather than inheriting the remainder of the
   * first one's.
   *
   * Its countdown does not start while a card banner is up (ADR-004). The
   * hand-off is displaced by the card, not dropped — running the timer under a
   * banner that outranks it would spend the whole 1.6s hidden and the player
   * would never learn whose turn it is. This is the one notice that queues
   * rather than yields.
   */
  useEffect(() => {
    if (!handOff || cardBannerUp || awardBannerUp) return
    const id = setTimeout(() => setHandOff(null), HAND_OFF_MS)
    return () => clearTimeout(id)
  }, [handOff, cardBannerUp, awardBannerUp, state.plyCount])

  const toggle = (key: 'sound' | 'haptics') => applySettings({ ...live, [key]: !live[key] })

  const startNew = () => {
    // Two children share one phone and this button sits beside the board. A
    // mis-tap used to discard the position, both hands and the ply count with no
    // undo — `undo` steps one ply, it cannot bring a match back.
    if (inProgress && !window.confirm(t('ui.confirm.discard'))) return
    const s = newSeed()
    setLastMove(null)
    // A new deal has discovered nothing yet, and the previous match's count is
    // not it. Without this the result screen of the NEXT match paints the last
    // one's number until the commit effect — a passive effect, so it runs after
    // that paint — overwrites it.
    setDiscovered(null)
    committedFor.current = null
    rewardCommittedFor.current = null
    setRewardState({ profile: progression, notice: 'none' })
    setPlay({
      seed: s,
      claimId: newClaimId(),
      match: createMatch({ content, presetId, seed: s, ...(effectiveEquipment ? { effectiveEquipment } : {}) }),
    })
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setCopyState('idle')
    setHandOff(null)
    setPeek(null)
    setRuleOpen(false)
    setBanner(true)
    // A new deal has nothing to announce; the previous match's card is not it.
    setCardNotice(null)
    setAwardNotice(null)
    setCaptureNotice(null)
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
    for (const side of ['white', 'black'] as const) {
      const beforeDraft = state.drafts[side]
      const afterDraft = next.drafts[side]
      if (afterDraft.awardCount <= beforeDraft.awardCount || afterDraft.held.length <= beforeDraft.held.length) continue
      const cardId = afterDraft.held[afterDraft.held.length - 1]
      if (cardId) setAwardNotice({ key: `${match.states.length}:${side}:${afterDraft.awardCount}`, side, cardId })
      break
    }
    if (next.result?.reason === 'king_capture') {
      const captured = newlyCapturedRoyal(state, next, content)
      const attacker = action.kind === 'move' ? state.board.get(action.from) : undefined
      const target = action.kind === 'move' ? state.board.get(action.to) : undefined
      if (action.kind === 'move' && attacker && target && content.pieces.get(target.pieceId)?.royal === true && captured) {
        setCaptureNotice({
          kind: 'move',
          key: `${match.states.length}:move:${action.from}>${action.to}`,
          attackerSide: attacker.side,
          attackerPieceId: attacker.pieceId,
          capturedSide: captured.side,
          capturedPieceId: captured.pieceId,
          from: action.from,
          to: action.to,
        })
      } else if (captured && action.kind === 'play_card') {
        setCaptureNotice({
          kind: 'card',
          key: `${match.states.length}:card:${action.cardId}`,
          attackerSide: state.sideToMove,
          cardId: action.cardId,
          capturedSide: captured.side,
          capturedPieceId: captured.pieceId,
        })
      }
    } else {
      setCaptureNotice(null)
    }
    setLastMove(action.kind === 'move' ? { from: action.from, to: action.to } : null)
    // The rule banner has done its job once someone has acted on the rule. It
    // also has to go so the hand-off banner below it has somewhere to be — two
    // announcements stacked at the same coordinates is how the notice stack bug
    // happened one screen over.
    setBanner(false)
    setPlay((p) => ({
      seed: p.seed,
      claimId: p.claimId,
      match: { states: [...p.match.states, apply(currentState(p.match), action, content)] },
    }))
    setSelected(null)
    setPendingCard(null)
    setRejection(null)
    setPeek(null)
    if (handedOver) setHandOff(next.sideToMove)
  }

  /**
   * The computer's turn (ADR-009).
   *
   * It goes through `push`, the same function a tap goes through, and that is
   * the whole design: the discard guard, the sound, the hand-off classification
   * and the history all keep working because every action still arrives one way.
   * A second commit path would be one vocabulary with two code paths, which is
   * the failure this repo has recorded twice.
   *
   * The cleanup does two things and both are load-bearing. `cancelled` stops a
   * reply from landing on a board that has moved on — the player may have undone
   * the move that triggered this search. `cancel()` goes further and TERMINATES
   * the worker, because ignoring an answer does not stop the search producing
   * it, and with one worker that abandoned work would sit in front of the next
   * request. "The AI is thinking" is a mode, and a mode owes the player a way
   * out that actually ends it.
   */
  useEffect(() => {
    // Whose turn it is, which during a draft is NOT `sideToMove`: a draft pick
    // does not advance the ply or hand the board over, so `sideToMove` sits on
    // white while the DRAFTING side alternates. Reading `sideToMove` alone left
    // the computer never making its own picks, and the match simply stopped —
    // the same class of mistake as measuring progress by `plyCount`, which a
    // draft pick also does not move.
    const acting = pendingDraftSide(state) ?? state.sideToMove
    if (!aiSide || state.result || acting !== aiSide) return
    const client = (aiRef.current ??= createAi?.() ?? null)
    if (!client) return

    let cancelled = false
    let dwell: ReturnType<typeof setTimeout> | null = null
    const startedAt = Date.now()
    setAiThinking(true)

    void client.request(state, aiDifficulty, seed).then((move) => {
      if (cancelled) return

      const land = () => {
        if (cancelled) return
        // Cleared only when the computer is actually DONE thinking. Since
        // ADR-001 its turn can take two searches — a card, then the move it
        // owes — and clearing here unconditionally put a render with the
        // indicator OFF between them: the effect that starts the second search
        // runs after commit, so the blank frame can paint. What the player sees
        // is the computer finishing, then starting again, which reads as the
        // app having lost track of whose turn it is.
        if (move?.action?.kind !== 'play_card') setAiThinking(false)
        // A search that overran its wall-clock backstop still returns a legal
        // move — it just stops being reproducible from the seed, and the player
        // is told rather than left with a seed that no longer replays (AC-011).
        if (move?.valveTripped) setAiDegraded(true)
        if (move?.action) push(move.action)
      }

      // The floor. Waiting AFTER the search rather than before it means a slow
      // search is never made slower — the remainder is whatever is left of
      // `AI_MIN_THINK_MS`, and at the hardest level that is usually nothing.
      /*
       * The floor, and which floor (ADR-005).
       *
       * `state.turnCard !== null` means the search that just answered is the
       * MOVE this turn's card still owes — so the card is already on the board
       * and its banner is up. Waiting out the banner rather than the ordinary
       * beat is what puts cause before effect on the one path where the player
       * did not cause it: without it the card and the reply land inside one
       * perceptual event and the position appears to change by itself, which is
       * the symptom this floor was introduced for in the first place, never
       * extended to cards.
       *
       * Still the same `dwell` variable and the same `clearTimeout` in the
       * cleanup — a second timer would be a second thing to leak.
       */
      const floor = state.turnCard !== null ? CARD_BANNER_MS : AI_MIN_THINK_MS
      const remaining = floor - (Date.now() - startedAt)
      if (remaining <= 0) land()
      else dwell = setTimeout(land, remaining)
    })

    return () => {
      cancelled = true
      // Cleared, not merely ignored: a pending timer on an unmounted match would
      // still fire, and "the AI is thinking" is a mode that owes an exit which
      // actually ends it.
      if (dwell) clearTimeout(dwell)
      setAiThinking(false)
      client.cancel()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, aiSide, aiDifficulty, seed])

  /** One client per mounted match; disposed with it. */
  useEffect(() => {
    return () => {
      aiRef.current?.dispose()
      aiRef.current = null
    }
  }, [])

  const doUndo = () => {
    play('undo', live)
    // The highlight describes a move that no longer happened.
    setLastMove(null)
    // And so does the banner. The latch deliberately outlives the history pair
    // that produced it — that is what keeps it up when a fast player moves
    // straight away — so it has to be released here explicitly, or an undone
    // card goes on being announced for the rest of its second.
    setCardNotice(null)
    setAwardNotice(null)
    setCaptureNotice(null)
    setPlay((p) => ({ seed: p.seed, claimId: p.claimId, match: undo(p.match) }))
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

  /*
   * The armed card, complete as it stands.
   *
   * Not every card asks a question. One that quantifies over your own pieces,
   * or that places one at your home rank, has nothing to point at — the engine
   * offers it as a play with an EMPTY target list. The only code that committed
   * a card lived inside `clickSquare`, so such a card armed, the board refused
   * every square, and the player was told it cannot target those squares. It
   * could not target any square, and did not need to.
   *
   * Committing on the arming tap instead would have been worse: arming is what
   * makes `SlotDetail` explain the card, so a one-tap play spends the turn
   * before a child has read what the card does.
   */
  const readyCard =
    pendingCard &&
    legal.find(
      (a) =>
        a.kind === 'play_card' &&
        a.cardId === pendingCard.cardId &&
        a.targets.length === pendingCard.targets.length &&
        pendingCard.targets.every((target, i) => a.targets[i] === target),
    )

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

      /*
       * A refused MOVE has to say something (PLAN Phase 4).
       *
       * Until this, `describeRejection` had two call sites and both were card plays, so
       * tapping an enemy piece you were sure you could take did nothing at all: no marker,
       * because the generator never offered it, and no words, because this branch fell
       * straight through to re-selecting. That silence is the whole of the reported bug.
       *
       * Scoped to a tap on an ENEMY piece rather than any refused square. Tapping an empty
       * square, or one of your own pieces, is how a player changes their mind — answering
       * that with a refusal would turn ordinary navigation into an error message. Reaching
       * for a capture is the one that deserves an answer.
       */
      const target = state.board.get(sq)
      if (target && target.side !== state.sideToMove) {
        setRejection(describeRejection(state, { kind: 'move', from: selected, to: sq }, content))
        return
      }
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

  /**
   * What a square IS, for the three routes that ask: the press, the `i` key,
   * and the selection strip.
   *
   * One resolver rather than one per route, and that is the whole reason it is a
   * function. AC-004's four rows — own piece, enemy piece, painted square, bare
   * square — have to hold for every route at once, and three call sites deciding
   * independently is three places for the enemy-piece row to be dropped.
   *
   * The side is carried by the NAME as well as by the sprite's tint (ADR-005).
   * On the board a third channel does that job — a corner marker anchored to the
   * square — and off the board that anchor does not exist, so colour would
   * otherwise be the only cue.
   */
  const inspectPeek = (sq: SquareId): Peek | null => {
    const piece = state.board.get(sq)
    if (piece) {
      const def = content.pieces.get(piece.pieceId)
      if (!def) return null
      return {
        mark: pieceMark(t, def, piece.side),
        name: t('ui.piece-info.side-name').replace('{side}', t(`ui.side.${piece.side}`)).replace('{name}', t(def.nameKey)),
        kind: t('ui.dex.kind.piece'),
        text: t(def.textKey),
        piece: def,
      }
    }
    const type = painted.get(sq)?.type
    if (!type) return null
    return { mark: iconMark(t, type), name: t(type.nameKey), kind: t('ui.dex.kind.square'), text: t(type.textKey) }
  }

  /**
   * The selection that was live when the finger went down.
   *
   * `beginDrag` sets `selected` on pointerdown so a drag has its highlight, and
   * a press that wins must not keep that side effect: AC-002 says inspecting
   * changes nothing about the board, and a piece that quietly became selected
   * because you asked what it was is a change.
   */
  const selectedAtPress = useRef<SquareId | null>(null)

  /**
   * One pointer sequence, exactly one commit.
   *
   * The hook owns the arbitration rather than sitting beside the old handlers —
   * see its header for why a press timer bolted onto an untouched `onClick` is
   * the recorded `rule-keyed-to-event-not-state` failure wearing a new hat.
   * Note what is NOT guarded here: the press fires on any square, including the
   * opponent's pieces and a turn with an armed card, which are exactly the
   * states `beginDrag` refuses. `onDrag` still defers to `dragFrom`, so those
   * guards keep deciding what a DRAG may do without deciding what may be READ.
   */
  /**
   * Opens an inspection sheet, and drops any refusal on the way.
   *
   * One helper rather than a `setRejection(null)` beside each `setPeek`, because there are six
   * ways to open a sheet — press, the `i` key, the selection strip, a card, a square type — and
   * a rule applied at five of them is the shape that made this a finding in the first place. A
   * refusal answers the move just attempted; asking what something IS is a different question,
   * and the old answer sitting in the status line reads as the answer to the new one.
   */
  const openPeek = (found: Peek | null) => {
    if (!found) return
    setRejection(null)
    setPeek(found)
  }

  const press = usePressInspect({
    onInspect: (sq) => {
      dragFrom.current = null
      setSelected(selectedAtPress.current)
      openPeek(inspectPeek(sq))
    },
    onTap: (sq) => {
      dragFrom.current = null
      clickSquare(sq)
    },
    onDrag: (from, to) => {
      const start = dragFrom.current
      dragFrom.current = null
      // `beginDrag` refused this square, so there is no drag to commit.
      if (start !== from) return
      const moveAction = legal.find((a) => a.kind === 'move' && a.from === from && a.to === to)
      if (moveAction) return push(moveAction)

      /*
       * A refused DRAG says why, exactly as a refused tap does.
       *
       * `usePressInspect` resolves one pointer sequence into exactly one of inspect / tap /
       * drag, so a player who presses a piece and pulls it onto an enemy never reaches
       * `clickSquare`. Wiring only the tap path left the reported defect — reach for a capture
       * the engine refuses and NOTHING happens — alive on the gesture a finger actually uses.
       * Both reviewers found this independently; it is the same fix as the tap path's, not a
       * variant of it.
       */
      const target = state.board.get(to)
      if (target && target.side !== state.sideToMove) {
        setRejection(describeRejection(state, { kind: 'move', from, to }, content))
      }
    },
    /*
     * Undo the eager highlight when the browser takes the gesture away.
     *
     * `beginDrag` selects on pointerdown so a drag has something to show, and a
     * cancelled sequence commits nothing — so leaving that selection behind
     * means a touch scroll started on your own piece silently selects it, with
     * its legal moves lit up, for a gesture the player never finished.
     */
    onCancel: () => {
      dragFrom.current = null
      setSelected(selectedAtPress.current)
    },
  })

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

  /**
   * Opens the detail sheet for an effect standing on the board.
   *
   * Names the effect AND the record that caused it (ADR-004/005). The effect's
   * own name alone is the state the badge already showed; the question a player
   * actually has is which card did it — and until now the engine knew and
   * nothing asked.
   * A source the content set no longer defines still renders, under its id: a
   * badge that vanishes because its LABEL is missing hides the effect itself.
   */
  const peekEffect = (effect: LiveEffect) => {
    const record = sourceRecord(effect, content)
    openPeek({
      mark: iconMark(t, record),
      name: t(`ui.effect.${effect.kind}`),
      kind: t('ui.effect.remaining').replace('{n}', String(effect.remaining)),
      text: record ? t(record.textKey) : '',
      because: t('ui.effect.caused-by').replace('{name}', record ? t(record.nameKey) : effect.sourceId),
    })
  }

  /** Opens the detail sheet for a card. The same sheet the dex screen uses. */
  const peekCard = (cardId: string, kindKey: string) => {
    const card = content.skillCards.get(cardId) ?? content.ruleCards.get(cardId)
    if (!card) return
    openPeek({ mark: iconMark(t, card), name: t(card.nameKey), kind: t(kindKey), text: t(card.textKey) })
  }

  const ranks = Array.from({ length: state.height }, (_, i) => (flipped ? i : state.height - 1 - i))
  const files = Array.from({ length: state.width }, (_, i) => (flipped ? state.width - 1 - i : i))
  const rule = state.ruleCardId ? content.ruleCards.get(state.ruleCardId) : undefined
  // Resolved once and reused for both the presence test and the body. Calling it
  // twice was correct (the function is pure) but says the two could differ.
  const ruleMark = iconMark(t, rule)
  const checkedSquares = new Set<SquareId>()
  const checkedSides: Side[] = []
  if (!state.result) {
    for (const side of ['white', 'black'] as const) {
      const squares = royalSquaresInCheck(state, content, side)
      if (squares.length > 0) {
        checkedSides.push(side)
        for (const square of squares) checkedSquares.add(square)
      }
    }
  }

  const captureAttacker = captureNotice?.kind === 'move' ? content.pieces.get(captureNotice.attackerPieceId) : undefined
  const captureTarget = captureNotice ? content.pieces.get(captureNotice.capturedPieceId) : undefined
  const captureCard = captureNotice?.kind === 'card' ? content.skillCards.get(captureNotice.cardId) : undefined
  const captureMark = captureAttacker
    ? pieceMark(t, captureAttacker, captureNotice?.kind === 'move' ? captureNotice.attackerSide : undefined)
    : iconMark(t, captureCard)
  const captureAttackerName = captureNotice ? nameOf(captureNotice.attackerSide) : ''
  const captureActionName = captureAttacker
    ? t(captureAttacker.nameKey)
    : captureCard
      ? t(captureCard.nameKey)
      : t('ui.card.unknown')
  const captureTargetName = captureTarget ? t(captureTarget.nameKey) : t('ui.piece.unknown')

  /**
   * Which notice the stack shows, decided in ONE place (ADR-004).
   *
   * There were four notices, each suppressed by an ad-hoc condition naming the
   * others (`handOff && !banner && !aiSide`), and adding a fifth that way is a
   * fifth clause on each of the existing four. The comment beside the hand-off
   * records what that shape already cost once: two announcements at the same
   * coordinates is how the notice stack bug happened one screen over.
   *
   * `ai-degraded` is deliberately NOT in this list. It is persistent and about
   * the MATCH — the seed no longer replays it (AC-011) — rather than transient
   * and about the ply, and it renders away from these coordinates, so it may
   * legitimately stand beside whichever notice is showing. Absent by decision,
   * not by oversight; `tests/ui/card-banner.test.tsx` pins the coexistence so
   * the two readings cannot be confused later.
   */
  const notice: 'card' | 'award' | 'rule' | 'handoff' | 'thinking' | null = cardBannerUp
    ? 'card'
    : awardBannerUp
      ? 'award'
    : banner && rule
      ? 'rule'
      : handOff && !aiSide
        ? 'handoff'
        : aiThinking && !state.result
          ? 'thinking'
          : null
  const legendTypes = [...new Map([...painted.values()].map((p) => [p.type.id, p.type])).values()]
  /** The selected piece's own entry, for the strip and for its opener. */
  const selectedInfo = selected ? inspectPeek(selected) : null


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
    <section
      className="play"
      data-drafting={phase === 'draft'}
      data-turn={mover}
      /*
       * The machine-readable half of AC-001, carried alongside the enums the
       * suite already asserts on. English, like `data-phase` and `data-side`,
       * because the visible words are translated and a spec that read them
       * would break on a locale change rather than on a behaviour change.
       */
      data-mode={aiSide ? 'single' : 'hotseat'}
      data-ai-side={aiSide ?? ''}
      data-difficulty={aiSide ? aiDifficulty : ''}
      data-standard={eligibility ? String(eligibility.eligible) : ''}
    >
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
          {checkedSides.length > 0 && (
            <span
              className="check-chip"
              data-testid="check-warning"
              data-sides={checkedSides.join(',')}
              role="status"
              aria-live="assertive"
            >
              {checkedSides.length > 1
                ? t('ui.check.both')
                : t('ui.check.warning').replace('{name}', nameOf(checkedSides[0]!))}
            </span>
          )}
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
        <div className="board-viewport" data-board-width={state.width}>
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
            style={{ gridTemplateColumns: `repeat(${state.width}, 1fr)`, '--board-columns': state.width } as React.CSSProperties}
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
                  const badge = badgeFor(effects, sq)
                  return (
                    <button
                      key={sq}
                      className="square"
                      data-testid={`sq-${sq}`}
                      data-piece={piece?.pieceId ?? ''}
                      data-side={piece?.side ?? ''}
                      data-square-type={type?.id ?? ''}
                      data-check={checkedSquares.has(sq) ? 'true' : undefined}
                      {...(badge ? { 'data-effect': badge.kind, 'data-effect-plies': String(badge.remaining) } : {})}
                      {...(badge && arrived.has(sq) ? { 'data-effect-new': 'true' } : {})}
                      {...(impacted.has(sq) ? { 'data-impact': 'true' } : {})}
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
                      onPointerDown={(e) => {
                        selectedAtPress.current = selected
                        beginDrag(sq)
                        press.onPointerDown(sq, e)
                      }}
                      onPointerMove={press.onPointerMove}
                      onPointerUp={(e) => press.onPointerUp(sq, e)}
                      onPointerCancel={press.onPointerCancel}
                      // The keyboard's route to the same sheet the press opens
                      // (AC-007). Enter and Space are already spent on
                      // select/move by the native button, so inspecting needs a
                      // key of its own rather than a modifier on those.
                      onKeyDown={(e) => {
                        if (e.key !== 'i' && e.key !== 'I') return
                        e.preventDefault()
                        openPeek(inspectPeek(sq))
                      }}
                      data-legal={isLegal}
                      // Which KIND of legal, so the cue can differ: an empty
                      // square you may step onto and an enemy you may take are
                      // not the same decision, and one white ring said both.
                      data-legal-kind={isLegal ? (piece ? 'capture' : 'move') : undefined}
                      data-selected={selected === sq}
                      role="gridcell"
                      aria-label={squareLabel(t, sq, def, piece, type, isLegal, badge, checkedSquares.has(sq))}
                      // `aria-selected`, not `aria-pressed`: the explicit gridcell
                      // role overrides the native button role, and `aria-pressed`
                      // is a button-family state a gridcell does not support.
                      aria-selected={selected === sq}
                      onClick={() => press.onClick(sq)}
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
                      {/* Where the card landed. An element of its own rather
                          than a pseudo-element, because both of this square's
                          are already spoken for — `[data-last]` has `::before`
                          and the legal-move dot has `::after` — and the ring
                          first borrowed the dot's, silently replacing the move
                          affordance during the exact window ADR-005 leaves the
                          player free to move in. */}
                      {impacted.has(sq) && <span className="impact-ring" aria-hidden="true" />}
                      {/* The effect standing here, with the plies it has left.
                          Its own hit area, and it swallows the click: the square
                          body means "select / move" and always will, so opening
                          a sheet from it would put an explanation in the way of
                          the game. `aria-hidden` because the square's label
                          already says the same thing in words — a screen reader
                          that heard both would hear the effect twice.

                          Not a nested <button>: the square IS one, and a button
                          inside a button is invalid. The keyboard path to the
                          same sheet is the legend chip below, which is a real
                          button. */}
                      {badge && (
                        <span
                          className="effect-pip"
                          data-testid="effect-pip"
                          data-effect={badge.kind}
                          aria-hidden="true"
                          onClick={(event) => {
                            event.stopPropagation()
                            peekEffect(badge)
                          }}
                        >
                          {badge.remaining}
                        </span>
                      )}
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
        </div>

        {/* One line, always present, holding whatever the board most recently
            refused or is waiting for. Always present because a line that appears
            only on an error reflows the board under the player's thumb at the
            exact moment they are being told they did something wrong. */}
        {/* ADR-003: ONE reserved region, now with SIX states in priority order —
            rejection, armed card, forced pass, selected piece, move-still-owed,
            idle hint. A second always-present region would cost this height
            twice on a 390x844 phone, and the whole reason this one is always
            present is that a region appearing on demand reflows the board under
            the player's thumb.

            The order is the decision. A rejection wins outright — it is the one
            message that must never be buried. A forced pass outranks the piece
            strip because it says the board is stuck, which no description of a
            piece answers. The strip outranks "a card is spent, the move is
            still owed" for the opposite reason: the player who selected a piece
            is already doing the thing that prompt is asking for, and answering
            the question they just posed beats repeating the instruction. */}
        <div
          className="hint-bar"
          data-pending={Boolean(pendingCard)}
          data-state={
            rejection
              ? 'rejection'
              : pendingCard
                ? 'card'
                : passAction
                  ? 'pass'
                  : selectedInfo
                    ? 'piece'
                    : state.turnCard !== null
                      ? 'turn'
                      : 'idle'
          }
          {...(rejection ? { 'data-testid': 'rejection', 'data-reason': rejection } : {})}
          role="status"
        >
          {rejection ? (
            // The code is the machine value and the word is translated — the same split
            // `data-phase` / `data-winner` already use, so a spec can assert WHICH refusal
            // happened without asserting Korean prose. `describeRejection` returns a
            // `RejectionReason`; the engine no longer owns the sentence.
            <p className="hint-line">{t(`ui.match.reject.${rejection}`)}</p>
          ) : pendingCard ? (
            <p className="hint-line">{t(readyCard ? 'ui.hint.card-ready' : 'ui.hint.choose-target')}</p>
          ) : passAction ? (
            <p className="hint-line">{t('ui.hint.no-moves')}</p>
          ) : selectedInfo ? (
            <button type="button" className="piece-strip" data-testid="piece-strip" onClick={() => openPeek(selectedInfo)}>
              <span className="strip-icon" aria-hidden="true">
                <MarkBody mark={selectedInfo.mark} />
              </span>
              <span className="strip-body">
                <span className="strip-head">
                  <strong data-testid="strip-name">{selectedInfo.name}</strong>
                  <span className="more">{t('ui.dex.more')}</span>
                </span>
                <span className="strip-text">{selectedInfo.text}</span>
                {/* AC-010. A gesture nobody is told about is discovered only by
                    accident, which is the whole reason the strip is the floor
                    and the press is the accelerator rather than the other way
                    round. */}
                <span className="strip-hint" data-testid="press-hint">{t('ui.piece-info.press-hint')}</span>
              </span>
            </button>
          ) : state.turnCard !== null ? (
            <p className="hint-line">{t('ui.hint.now-move')}</p>
          ) : (
            <p className="hint-line">{t('ui.hint.tap-piece')}</p>
          )}
        </div>

        {/* The forced pass (ADR-003). Present only while the engine offers it,
            which is only when a card has left nothing that can move — so it can
            never be used to spend a card and skip your move. */}
        {passAction && (
          <button type="button" className="primary end-turn" data-testid="end-turn" onClick={() => push(passAction)}>
            {t('ui.action.end-turn')}
          </button>
        )}

        {/* The commit for a card that asks nothing. It appears only while such a
            card is armed, so it never competes with choosing a target, and the
            card slot still disarms on a second tap — reading a card must stay
            free. */}
        {readyCard && (
          <button type="button" className="primary use-card" data-testid="use-card" onClick={() => push(readyCard)}>
            {t('ui.match.use-card')}
          </button>
        )}

        {/* AC-018's UI clause: every painted type on this board, with its ability
            text one tap away. A chip rather than a paragraph — see the header. */}
        {(legendTypes.length > 0 || effects.length > 0) && (
          <ul className="legend" data-testid="square-legend">
            {/* The effects first, the square types after (ADR-005). Effects are
                what changed this turn and what a player is looking for; square
                types are a property of the board and have been there all match.
                Absent entirely when nothing is live, so the row costs no height
                on the board a player spends most of the match looking at. */}
            {effects.map((effect) => {
              const record = sourceRecord(effect, content)
              const mark = iconMark(t, record)
              return (
                <li key={`${effect.square}:${effect.kind}`} data-testid="effect-chip" data-effect={effect.kind} data-square={effect.square}>
                  <button type="button" onClick={() => peekEffect(effect)}>
                    {mark.kind !== 'none' && (
                      <span className="legend-icon" aria-hidden="true">
                        <MarkBody mark={mark} />
                      </span>
                    )}
                    <strong>{t(`ui.effect.${effect.kind}`)}</strong>
                    <span className="effect-where">
                      {effect.square} · {t('ui.effect.remaining').replace('{n}', String(effect.remaining))}
                    </span>
                  </button>
                </li>
              )
            })}
            {legendTypes.map((type) => {
              const mark = iconMark(t, type)
              return (
                <li key={type.id} data-square-type={type.id}>
                  <button
                    type="button"
                    onClick={() =>
                      openPeek({ mark, name: t(type.nameKey), kind: t('ui.dex.kind.square'), text: t(type.textKey) })
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
      {/* The card that just fired, named while it is still news. First in the
          ordered pick — it is the only notice carrying information the player
          cannot recover from the board a moment later. */}
      {/*
          The record is resolved ONCE and its absence suppresses the banner.

          The first version fell back to `?? cardId`, and both reviewers caught
          the same thing: on a miss that hands a raw `skill.*` id straight to a
          player, which is the one rule (AC-009) this screen may not break. The
          branch is unreachable as the app is wired — the engine only ever puts
          a validated id in `turnCard`, and `App.tsx` remounts on a content
          change — but a defensive path that breaks a guarantee when it fires is
          worse than no path.

          Suppressing rather than substituting a placeholder, because a
          placeholder key would be reachable from nowhere:
          `[fail:design] declared-but-inert-vocabulary` is at count:7 here. If
          there is no record, there is nothing to name.
      */}
      {notice === 'award' && awardNotice && awardRecord && (
        <AwardBanner
          mark={iconMark(t, awardRecord)}
          name={t(awardRecord.nameKey)}
          text={t(awardRecord.textKey)}
          side={awardNotice.side}
          by={nameOf(awardNotice.side)}
        />
      )}

      {notice === 'card' && cardNotice && cardRecord && (
        <CardBanner
          mark={iconMark(t, cardRecord)}
          name={t(cardRecord.nameKey)}
          text={t(cardRecord.textKey)}
          side={cardNotice.play.side}
          by={nameOf(cardNotice.play.side)}
        />
      )}

      {notice === 'rule' && rule && (
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
      {/*
        Absent in single-player, and that is not a detail. The banner's whole
        message is "give the phone to the other person"; there is no other
        person. Reusing it with different words would leave one banner saying
        two unrelated things, and the thinking indicator below says the one that
        is actually true — wait, something is happening.
      */}
      {notice === 'handoff' && handOff && (
        <div className="turn-toast" data-testid="hand-off" data-side={handOff} role="status" aria-live="polite">
          <span className="turn-chip" data-side={handOff} aria-hidden="true" />
          <span>{t('ui.status.whose-turn').replace('{name}', nameOf(handOff))}</span>
        </div>
      )}

      {/*
        The computer is thinking (AC-007).

        `pointer-events: none`, like the hand-off it replaces: nothing here is to
        be dismissed, and every control on screen stays reachable while it shows
        — which is the observable half of "the interface stays alive". The search
        itself is on another thread, so this is a label rather than a promise.
      */}
      {notice === 'thinking' && (
        <div className="turn-toast" data-testid="ai-thinking" data-side={aiSide} role="status" aria-live="polite">
          <span className="turn-chip" data-side={aiSide} aria-hidden="true" />
          <span>{t('ui.ai.thinking').replace('{name}', nameOf(aiSide!))}</span>
        </div>
      )}

      {/*
        The seed no longer replays this match (AC-011).

        Said once, and not dismissible, because the seed control is still on
        screen offering a share that would now produce a different game.
      */}
      {aiDegraded && (
        <p className="ai-degraded" data-testid="ai-degraded" role="status">
          {t('ui.ai.degraded')}
        </p>
      )}

      {/* The end of the match, OVER the board rather than instead of it.
          Returning early and rendering only the summary was the first version,
          and it takes the final position off the screen — which is the one thing
          two children look at while arguing about what just happened. It also
          made the position unobservable to the specs that play a line out. */}
      {captureRevealUp && captureNotice && (
        <CaptureReveal
          mark={captureMark}
          attacker={captureAttackerName}
          action={captureActionName}
          captured={captureTargetName}
          {...(captureNotice.kind === 'move' ? { from: captureNotice.from, to: captureNotice.to } : {})}
        />
      )}

      {state.result && !captureRevealUp && (
        <Result
          state={state}
          result={state.result}
          discovered={discovered}
          progression={rewardState.profile}
          {...(eligibility ? { eligibility } : {})}
          progressionNotice={rewardState.notice}
          onRetryProgression={() => setRewardRetry((attempt) => attempt + 1)}
          onProgressionChange={applyProgression}
          nameOf={nameOf}
          onRematch={startNew}
          onEditRoom={onEditRoom ?? (() => undefined)}
          onHome={onHome ?? (() => undefined)}
        />
      )}

      {peek && <PeekSheet peek={peek} onClose={() => setPeek(null)} />}

      {/* Last in the tree so it sits over everything — including the draft
          offer, which is the first thing this sheet is explaining how to do.
          Read first, then act. */}
      {introOpen && <MatchIntro rule={rule} ruleMark={ruleMark} onClose={closeIntro} />}
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
      {/* Which record did this, when the sheet is about an effect rather than
          about a record (ADR-004). The one question the board could not answer
          before: by the time a player looks at a frozen piece, the card that
          froze it may be four turns spent and gone from the hand. */}
      {peek.because && <p className="sheet-because">{peek.because}</p>}
      <p className="sheet-text">{peek.text}</p>
      {/* ADR-007: exactly one of a grid or a sentence, never a blank box. */}
      {peek.piece && <PieceMoveRegion piece={peek.piece} t={t} />}
      <button type="button" data-testid="peek-close" onClick={onClose}>
        {t('ui.action.close')}
      </button>
    </Sheet>
  )
}
