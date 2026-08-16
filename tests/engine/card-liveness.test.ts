import { describe, expect, it } from 'vitest'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import type { GameState, Side, SquareId } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * Per-record liveness survey for the shipped card set.
 *
 * The `declared-but-inert-vocabulary` failure has now recurred four times, and
 * every previous guard missed it for the same reason: they observed that an
 * effect FIRED. A card whose effect fires and resolves to nothing writes
 * `on_capture:rule:rule.blood-toll` to the log and leaves the board untouched,
 * so a log assertion, a no-caller sweep and a schema check all pass on it. What
 * separates a working card from an inert one is a STATE CHANGE, so that is what
 * this file observes, and it observes it differentially:
 *
 * - a rule card is played against a control run of the same script with no rule
 *   card, on both surfaces it can act through (resolved state, and the legal
 *   move set — a `generate_moves` card never reaches `apply`);
 * - a skill card is played every legal way the engine will let it be played
 *   from a position built for it, and the best case counts. Whether a card
 *   works must not depend on which targets the survey author guessed.
 *
 * `intended` is what the card's own text promises a player. `current` is what
 * the engine does today. Where they disagree the probe carries a `defect` note
 * naming the root cause; those four are real, open bugs, not accepted
 * behaviour. The assertion is against `current`, so this suite is green on a
 * broken engine ON PURPOSE — its job is to make the next change to any of it
 * loud. Fix one and the matching probe fails: that is the signal to move
 * `current` to `intended` and delete the note.
 */

const content = shippedContent()

/** Everything a player could observe. Ply bookkeeping is deliberately excluded. */
function observe(s: GameState): string {
  return JSON.stringify({
    board: [...s.board.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    frozenUntil: s.frozenUntil,
    captured: s.captured,
    grants: [...s.grants].map((g) => `${g.kind}@${g.square}<${g.untilPly}`).sort(),
    result: s.result,
    checkCount: s.checkCount,
  })
}

function moveSet(s: GameState): string {
  return legalActions(s, content)
    .filter((a) => a.kind === 'move')
    .map((a) => (a.kind === 'move' ? `${a.from}${a.to}` : ''))
    .sort()
    .join(' ')
}

type Place = { square: SquareId; pieceId: string; side: Side }

function pos(opts: { placements: Place[]; ruleCardId?: string | null; held?: string[]; captured?: string[]; sideToMove?: Side }): GameState {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: opts.sideToMove ?? 'white',
    placements: opts.placements,
    ruleCardId: opts.ruleCardId ?? null,
    held: { white: opts.held ?? [] },
    captured: { white: opts.captured ?? [] },
  })
}

/** Plays a scripted sequence of board moves, failing loudly on an illegal one. */
function drive(start: GameState, script: Array<[SquareId, SquareId]>): GameState {
  let s = start
  for (const [from, to] of script) {
    const act = legalActions(s, content).find((a) => a.kind === 'move' && a.from === from && a.to === to)
    if (!act) throw new Error(`survey script broke: ${from}->${to} is not legal at ply ${s.plyCount}`)
    s = apply(s, act, content)
  }
  return s
}

type Verdict = 'live' | 'inert'

/** Rule probe, resolved-state surface: the same script with the card and without it. */
function ruleState(card: string, placements: Place[], script: Array<[SquareId, SquareId]>) {
  return (): Verdict => {
    const withCard = drive(pos({ placements, ruleCardId: card }), script)
    const without = drive(pos({ placements, ruleCardId: null }), script)
    return observe(withCard) === observe(without) ? 'inert' : 'live'
  }
}

/** Rule probe, move-generation surface — where a `generate_moves` card lives. */
function ruleMoves(card: string, placements: Place[], sideToMove: Side = 'white') {
  return (): Verdict =>
    moveSet(pos({ placements, ruleCardId: card, sideToMove })) === moveSet(pos({ placements, ruleCardId: null, sideToMove })) ? 'inert' : 'live'
}

/** Skill probe: every legal play the engine offers, best case wins. */
function skill(card: string, placements: Place[], captured?: string[]) {
  return (): Verdict => {
    const before = pos({ placements, held: [card], captured: captured ?? [] })
    const plays = legalActions(before, content).filter((a) => a.kind === 'play_card' && a.cardId === card)
    if (plays.length === 0) return 'inert'
    const base = observe(before)
    return plays.some((p) => observe(apply(before, p, content)) !== base) ? 'live' : 'inert'
  }
}

const K_W: Place = { square: 'a1', pieceId: 'piece.king', side: 'white' }
const K_B: Place = { square: 'f6', pieceId: 'piece.king', side: 'black' }
const rook = (square: SquareId, side: Side = 'white'): Place => ({ square, pieceId: 'piece.rook', side })
const pawn = (square: SquareId, side: Side): Place => ({ square, pieceId: 'piece.pawn', side })

// The rook checks along rank 6, the king steps down, the rook follows to rank 5,
// the king steps back, and the rook returns: three deliveries by white.
const CHECK_DRIVE: Place[] = [K_W, rook('c1'), K_B]
const THREE_CHECKS: Array<[SquareId, SquareId]> = [
  ['c1', 'c6'],
  ['f6', 'f5'],
  ['c6', 'c5'],
  ['f5', 'f6'],
  ['c5', 'c6'],
]

/**
 * A skill probe on a surface the card must NOT move.
 *
 * Every card this expansion adds is unconditional, so there is no position where
 * it correctly does nothing — the (a) shape of an inert probe does not exist for
 * them. The (b) shape does: a card that acts on the enemy must leave the MOVER's
 * own moves alone, and a card that relocates or grants must never add to the
 * captured pile. Both flip to `live` the moment the card fires on the wrong
 * thing, which is the failure this survey was written for — 3 of the 4 defects
 * it originally found were cards that changed state, just the wrong state.
 */
function skillKeeps(card: string, placements: Place[], surface: (s: GameState) => string, captured?: string[]) {
  return (): Verdict => {
    const before = pos({ placements, held: [card], captured: captured ?? [] })
    const plays = legalActions(before, content).filter((a) => a.kind === 'play_card' && a.cardId === card)
    if (plays.length === 0) return 'inert'
    const base = surface(before)
    return plays.some((p) => surface(apply(before, p, content)) !== base) ? 'live' : 'inert'
  }
}

/** The captured pile, as a string — the surface a relocation must never touch. */
const capturedOf = (s: GameState) => JSON.stringify(s.captured)

/**
 * Where one side's pieces stand.
 *
 * The surface for a card that acts on the OPPONENT: throwing an enemy around
 * can legitimately end with it dead (the shipped board paints a bomb square, and
 * the entry pipeline runs for a card-driven move exactly as it does for a board
 * move), so the captured pile is not a rule that card obeys. Which pieces the
 * MOVER still has, and where, is.
 */
const squaresOf = (side: Side) => (s: GameState) =>
  [...s.board.entries()]
    .filter(([, piece]) => piece.side === side)
    .map(([square]) => square)
    .sort()
    .join(' ')

const queen = (square: SquareId, side: Side = 'white'): Place => ({ square, pieceId: 'piece.queen', side })
const knight = (square: SquareId, side: Side = 'white'): Place => ({ square, pieceId: 'piece.knight', side })

interface Probe {
  card: string
  probe: string
  /** What the card's own text promises. */
  intended: Verdict
  /** What the engine does today. Differs from `intended` only where a bug is open. */
  current: Verdict
  defect?: string
  run: () => Verdict
}

const PROBES: Probe[] = [
  {
    card: 'rule.king-of-the-hill',
    probe: 'the king steps onto the centre',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.king-of-the-hill', [{ square: 'c2', pieceId: 'piece.king', side: 'white' }, K_B], [['c2', 'c3']]),
  },
  {
    card: 'rule.king-of-the-hill',
    probe: 'a ROOK steps onto the centre while the king sits at home',
    intended: 'inert',
    current: 'inert',
    run: ruleState('rule.king-of-the-hill', [K_W, rook('c2'), K_B], [['c2', 'c3']]),
  },
  {
    card: 'rule.three-check',
    probe: 'white delivers three checks',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.three-check', CHECK_DRIVE, THREE_CHECKS),
  },
  {
    card: 'rule.sudden-death',
    probe: 'the opponent is down to two pieces',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.sudden-death', [K_W, rook('b1'), K_B, pawn('f5', 'black')], [['b1', 'b2']]),
  },
  {
    card: 'rule.fast-promotion',
    probe: 'the pawn itself steps onto rank 5',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.fast-promotion', [K_W, pawn('c4', 'white'), K_B], [['c4', 'c5']]),
  },
  {
    card: 'rule.fast-promotion',
    probe: 'the pawn already stands on rank 5 and a rook moves elsewhere',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.fast-promotion', [K_W, pawn('c5', 'white'), rook('e1'), K_B], [['e1', 'e3']]),
  },
  {
    card: 'rule.fast-promotion',
    probe: 'a ROOK lands on e2 while the only pawn sits on c3, nowhere near promotion',
    intended: 'inert',
    current: 'inert',
    run: ruleState('rule.fast-promotion', [K_W, pawn('c3', 'white'), rook('e1'), K_B], [['e1', 'e2']]),
  },
  {
    card: 'rule.fast-promotion',
    probe: 'white pawns stand on their OWN rank 2, where the opening array puts them',
    intended: 'inert',
    current: 'inert',
    // The condition used to be a flat square list holding both sides' near-promotion
    // ranks. White's whole pawn line starts on rank 2, which that list contained, so
    // with the quantifier working every white pawn promoted on move one. This probe
    // is the opening position, and it must stay inert.
    run: ruleState('rule.fast-promotion', [K_W, pawn('b2', 'white'), pawn('c2', 'white'), rook('e1'), K_B], [['e1', 'e3']]),
  },
  {
    card: 'rule.fast-promotion',
    probe: 'a BLACK pawn on board rank 2, which is rank 5 counted from black',
    intended: 'live',
    current: 'live',
    // The mirror of the probe above, and the pair is the point: board rank 2 is
    // home for white and one-short for black, which is exactly what a flat square
    // list cannot say. Black has to be the mover for its own pawns to be quantified.
    run: ruleState(
      'rule.fast-promotion',
      [K_W, { square: 'b2', pieceId: 'piece.pawn', side: 'black' }, rook('e1'), K_B],
      [
        ['e1', 'e3'],
        ['f6', 'f5'],
      ],
    ),
  },
  {
    card: 'rule.royal-bodyguard',
    probe: 'a rook eyes a pawn standing beside the enemy king',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.royal-bodyguard', [K_W, rook('c6'), pawn('e6', 'black'), K_B]),
  },
  {
    card: 'rule.last-stand',
    probe: 'white is down to two pieces',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.last-stand', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'rule.conscription',
    probe: 'white is down to two pieces and moves',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.conscription', [K_W, rook('b1'), K_B], [['b1', 'b2']]),
  },
  {
    card: 'rule.blood-toll',
    probe: 'a pawn captures a pawn',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.blood-toll', [K_W, pawn('b2', 'white'), pawn('c3', 'black'), K_B], [['b2', 'c3']]),
  },
  {
    /*
     * v12. The card keeps the id `rule.blood-toll` and nothing else: the record
     * is now a two-ply freeze on the capturer rather than its destruction. The
     * id survives a total change of identity because `BASELINE_STAMP_IDS` is a
     * FROZEN snapshot of a past release and `baseline-stamp.test.ts` refuses a
     * stamp that names a record the bundle no longer ships.
     *
     * The probe is unchanged in shape and still differential, so it measures the
     * new behaviour rather than restating it.
     */
    card: 'rule.democracy',
    probe: 'the opponent loses their last pawn',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.democracy', [K_W, pawn('b2', 'white'), pawn('c3', 'black'), K_B], [['b2', 'c3']]),
  },
  {
    card: 'rule.blitz',
    probe: 'white delivers two checks',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.blitz', CHECK_DRIVE, THREE_CHECKS.slice(0, 3)),
  },
  {
    card: 'rule.knights-honour',
    probe: 'a knight in the open',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.knights-honour', [K_W, { square: 'c3', pieceId: 'piece.knight', side: 'white' }, K_B]),
  },
  {
    card: 'rule.duel',
    probe: 'the opponent is down to four pieces',
    intended: 'live',
    current: 'live',
    run: ruleState(
      'rule.duel',
      [K_W, rook('b1'), K_B, pawn('a5', 'black'), pawn('b5', 'black'), pawn('c5', 'black')],
      [['b1', 'b2']],
    ),
  },
  {
    card: 'rule.march',
    probe: 'a footman gets a second forward step',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.march', [K_W, pawn('c2', 'white'), K_B]),
  },
  {
    card: 'rule.steadfast',
    probe: 'a king shelters a nearby friendly piece',
    intended: 'live',
    current: 'live',
    run: ruleMoves(
      'rule.steadfast',
      [K_W, rook('b1'), { square: 'c1', pieceId: 'piece.rook', side: 'black' }, K_B],
      'black',
    ),
  },
  {
    card: 'rule.scarcity',
    probe: 'the opponent has already fallen below the scarcity threshold',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.scarcity', [K_W, rook('b1'), K_B], [['b1', 'b2']]),
  },
  {
    card: 'rule.diagonal-court',
    probe: 'a bishop gets a short orthogonal turn',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.diagonal-court', [K_W, { square: 'c3', pieceId: 'piece.bishop', side: 'white' }, K_B]),
  },
  {
    card: 'rule.fallen-banner',
    probe: 'a capture costs the capturer tempo',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.fallen-banner', [K_W, pawn('b2', 'white'), pawn('c3', 'black'), K_B], [['b2', 'c3']]),
  },
  {
    card: 'rule.heartland',
    probe: 'a small force calls a footman back home',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.heartland', [K_W, rook('b1'), K_B], [['b1', 'b2']]),
  },

  {
    card: 'skill.teleport',
    probe: 'a rook and an empty square',
    intended: 'live',
    current: 'live',
    run: skill('skill.teleport', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.swap',
    probe: 'two of your own pieces',
    intended: 'live',
    current: 'live',
    run: skill('skill.swap', [K_W, rook('b1'), { square: 'c1', pieceId: 'piece.knight', side: 'white' }, K_B]),
  },
  {
    card: 'skill.revive',
    probe: 'a rook in the graveyard and a free home rank',
    intended: 'live',
    current: 'live',
    run: skill('skill.revive', [{ square: 'd1', pieceId: 'piece.king', side: 'white' }, K_B], ['piece.rook']),
  },
  {
    card: 'skill.freeze',
    probe: 'an enemy pawn',
    intended: 'live',
    current: 'live',
    run: skill('skill.freeze', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.snare',
    probe: 'an enemy pawn',
    intended: 'live',
    current: 'live',
    run: skill('skill.snare', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.coronation',
    probe: 'one of your pawns',
    intended: 'live',
    current: 'live',
    run: skill('skill.coronation', [K_W, pawn('c6', 'white'), { square: 'a6', pieceId: 'piece.king', side: 'black' }]),
  },
  {
    card: 'skill.knight-leap',
    probe: 'one of your pieces',
    intended: 'live',
    current: 'live',
    run: skill('skill.knight-leap', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.charge',
    probe: 'two of your pawns on the board',
    intended: 'live',
    current: 'live',
    run: skill('skill.charge', [K_W, pawn('b2', 'white'), pawn('c2', 'white'), K_B]),
  },
  {
    card: 'skill.bulwark',
    probe: 'one of your pieces',
    intended: 'live',
    current: 'live',
    run: skill('skill.bulwark', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.shackle',
    probe: 'an enemy pawn',
    intended: 'live',
    current: 'live',
    run: skill('skill.shackle', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.recall',
    probe: 'a rook up the board with the home rank open',
    intended: 'live',
    current: 'live',
    run: skill('skill.recall', [{ square: 'd1', pieceId: 'piece.king', side: 'white' }, rook('b4'), K_B]),
  },
  {
    card: 'skill.shove',
    probe: 'an enemy pawn with an empty square behind it',
    intended: 'live',
    current: 'live',
    run: skill('skill.shove', [K_W, K_B, pawn('c4', 'black')]),
  },
  {
    card: 'skill.recruit',
    probe: 'a free home rank',
    intended: 'live',
    current: 'live',
    run: skill('skill.recruit', [{ square: 'd1', pieceId: 'piece.king', side: 'white' }, K_B]),
  },
  {
    card: 'skill.volley',
    probe: 'an enemy pawn',
    intended: 'live',
    current: 'live',
    run: skill('skill.volley', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.sacrifice',
    probe: 'one of yours and one of theirs',
    intended: 'live',
    current: 'live',
    run: skill('skill.sacrifice', [K_W, rook('c3'), rook('d3', 'black'), K_B]),
  },
  // --- PLAN-preset-content-expansion: the 15 records this task added.
  // Every one carries a live probe AND an inert probe (AC-013). The inert half
  // is the one that matters: a card that does SOMETHING is not the same as a
  // card that does the right thing, and a did-anything-happen assertion cleared
  // two of the four defects the first survey found.
  {
    card: 'rule.beacon',
    probe: 'the king reaches the far rank',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.beacon', [{ square: 'c5', pieceId: 'piece.king', side: 'white' }, K_B], [['c5', 'c6']]),
  },
  {
    card: 'rule.beacon',
    probe: 'a ROOK reaches the far rank while the king sits at home',
    intended: 'inert',
    current: 'inert',
    run: ruleState('rule.beacon', [K_W, rook('c5'), K_B], [['c5', 'c6']]),
  },
  {
    card: 'rule.tribute',
    probe: 'a capture pays for a fresh footman',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.tribute', [K_W, rook('b1'), pawn('b5', 'black'), K_B], [['b1', 'b5']]),
  },
  {
    card: 'rule.tribute',
    probe: 'a quiet move, with a capture available and declined',
    intended: 'inert',
    current: 'inert',
    run: ruleState('rule.tribute', [K_W, rook('b1'), pawn('b5', 'black'), K_B], [['b1', 'b2']]),
  },
  {
    card: 'rule.eclipse',
    probe: 'a queen is on the board',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.eclipse', [K_W, queen('c1'), K_B]),
  },
  {
    card: 'rule.eclipse',
    probe: 'a ROOK stands where the queen would — nothing else may be pinned',
    intended: 'inert',
    current: 'inert',
    run: ruleMoves('rule.eclipse', [K_W, rook('c1'), K_B]),
  },
  {
    card: 'rule.oath',
    probe: 'a footman is under attack',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.oath', [K_W, rook('b1'), pawn('b5', 'black'), K_B]),
  },
  {
    card: 'rule.oath',
    probe: 'a ROOK is under attack — the shield is for footmen only',
    intended: 'inert',
    current: 'inert',
    run: ruleMoves('rule.oath', [K_W, rook('b1'), rook('b5', 'black'), K_B]),
  },
  {
    card: 'rule.siege',
    probe: 'a rook is on the board',
    intended: 'live',
    current: 'live',
    run: ruleMoves('rule.siege', [K_W, rook('c3'), K_B]),
  },
  {
    card: 'rule.siege',
    probe: 'a KNIGHT stands where the rook would',
    intended: 'inert',
    current: 'inert',
    run: ruleMoves('rule.siege', [K_W, knight('c3'), K_B]),
  },
  {
    card: 'rule.harvest',
    probe: 'a footman steps onto the centre',
    intended: 'live',
    current: 'live',
    run: ruleState('rule.harvest', [K_W, pawn('c2', 'white'), K_B], [['c2', 'c3']]),
  },
  {
    card: 'rule.harvest',
    probe: 'a footman steps one file over, OFF the centre',
    intended: 'inert',
    current: 'inert',
    // b3 is not one of the four centre squares, so the correct behaviour here is
    // provably nothing — the discriminating placement, not merely a quiet one.
    run: ruleState('rule.harvest', [K_W, pawn('b2', 'white'), K_B], [['b2', 'b3']]),
  },
  {
    card: 'skill.leash',
    probe: 'an enemy piece is pinned where it stands',
    intended: 'live',
    current: 'live',
    run: skill('skill.leash', [K_W, rook('b1'), rook('e5', 'black'), K_B]),
  },
  {
    card: 'skill.leash',
    probe: 'the mover’s OWN moves are untouched',
    intended: 'inert',
    current: 'inert',
    run: skillKeeps('skill.leash', [K_W, rook('b1'), rook('e5', 'black'), K_B], moveSet),
  },
  {
    card: 'skill.blink',
    probe: 'a piece jumps two squares forward',
    intended: 'live',
    current: 'live',
    run: skill('skill.blink', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.blink',
    probe: 'nothing is captured by moving',
    intended: 'inert',
    current: 'inert',
    /*
     * Both friendly pieces land on an EMPTY, UNPAINTED square: the king c1->c3
     * and the footman e2->e4... which is a portal on the shipped board, and a
     * portal moves a piece without taking one, so the pile still may not change.
     *
     * The first version of this probe put an enemy rook on the destination and a
     * king on a1 — whose two-square hop is the bomb square. Both made the card
     * change the pile for reasons that are the ENGINE working correctly, and the
     * probe reported a defect that was not there. A probe for wrong-firing has to
     * place its subject where the correct behaviour is provably nothing.
     */
    run: skillKeeps(
      'skill.blink',
      [{ square: 'c1', pieceId: 'piece.king', side: 'white' }, pawn('e2', 'white'), K_B],
      capturedOf,
    ),
  },
  {
    card: 'skill.mend',
    probe: 'a lost piece comes back',
    intended: 'live',
    current: 'live',
    run: skill('skill.mend', [K_W, rook('b1'), K_B], ['piece.knight']),
  },
  {
    card: 'skill.mend',
    probe: 'nothing has been lost yet',
    intended: 'inert',
    current: 'inert',
    run: skill('skill.mend', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.quake',
    probe: 'an enemy is thrown across the board',
    intended: 'live',
    current: 'live',
    run: skill('skill.quake', [K_W, rook('b1'), rook('e5', 'black'), K_B]),
  },
  {
    card: 'skill.quake',
    probe: 'the mover’s own pieces do not move',
    intended: 'inert',
    current: 'inert',
    // NOT the captured pile: the thrown piece may legitimately land on the
    // shipped board's bomb square and die there, which is the entry pipeline
    // doing its job. What a card aimed at the enemy may never do is relocate one
    // of the mover's own pieces — the shape the forEach defects took.
    run: skillKeeps('skill.quake', [K_W, rook('b1'), rook('e5', 'black'), K_B], squaresOf('white')),
  },
  {
    card: 'skill.veil',
    probe: 'a piece is covered',
    intended: 'live',
    current: 'live',
    run: skill('skill.veil', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.veil',
    probe: 'cover does not change where its own side may go',
    intended: 'inert',
    current: 'inert',
    run: skillKeeps('skill.veil', [K_W, rook('b1'), K_B], moveSet),
  },
  {
    card: 'skill.dart',
    probe: 'a piece gains the diagonal leap',
    intended: 'live',
    current: 'live',
    run: skill('skill.dart', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.dart',
    probe: 'granting reach takes nothing',
    intended: 'inert',
    current: 'inert',
    run: skillKeeps('skill.dart', [K_W, rook('b1'), rook('d3', 'black'), K_B], capturedOf),
  },
  {
    card: 'skill.tide',
    probe: 'a footman gains two squares of orthogonal reach',
    intended: 'live',
    current: 'live',
    run: skill('skill.tide', [K_W, pawn('c2', 'white'), K_B]),
  },
  {
    card: 'skill.tide',
    probe: 'granting reach takes nothing',
    intended: 'inert',
    current: 'inert',
    run: skillKeeps('skill.tide', [K_W, pawn('c2', 'white'), rook('c4', 'black'), K_B], capturedOf),
  },
  {
    card: 'skill.brand',
    probe: 'a footman becomes a lancer',
    intended: 'live',
    current: 'live',
    run: skill('skill.brand', [K_W, pawn('c2', 'white'), K_B]),
  },
  {
    card: 'skill.brand',
    probe: 'there is no footman to brand',
    intended: 'inert',
    current: 'inert',
    run: skill('skill.brand', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.echo',
    probe: 'a fresh footman appears on the home rank',
    intended: 'live',
    current: 'live',
    run: skill('skill.echo', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.echo',
    probe: 'the new footman is created, not taken from anyone',
    intended: 'inert',
    current: 'inert',
    run: skillKeeps('skill.echo', [K_W, rook('b1'), rook('e5', 'black'), K_B], capturedOf),
  },
  {
    card: 'skill.scout',
    probe: 'a friendly non-royal gains a scouting leap',
    intended: 'live',
    current: 'live',
    run: skill('skill.scout', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.guard',
    probe: 'a friendly non-royal receives cover',
    intended: 'live',
    current: 'live',
    run: skill('skill.guard', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.hinder',
    probe: 'an enemy non-royal is held in place',
    intended: 'live',
    current: 'live',
    run: skill('skill.hinder', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.reinforce',
    probe: 'a vacant home rank receives a footman',
    intended: 'live',
    current: 'live',
    run: skill('skill.reinforce', [K_W, K_B]),
  },
  {
    card: 'skill.sprint',
    probe: 'a friendly non-royal gains a short sprint',
    intended: 'live',
    current: 'live',
    run: skill('skill.sprint', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.bridge',
    probe: 'a friendly non-royal crosses a short bridge',
    intended: 'live',
    current: 'live',
    run: skill('skill.bridge', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.anchor',
    probe: 'an enemy non-royal is anchored',
    intended: 'live',
    current: 'live',
    run: skill('skill.anchor', [K_W, K_B, pawn('f5', 'black')]),
  },
  {
    card: 'skill.ward',
    probe: 'a friendly non-royal gets a longer guard window',
    intended: 'live',
    current: 'live',
    run: skill('skill.ward', [K_W, rook('b1'), K_B]),
  },
  {
    card: 'skill.salve',
    probe: 'a fallen minor piece returns',
    intended: 'live',
    current: 'live',
    run: skill('skill.salve', [K_W, K_B], ['piece.knight']),
  },
  {
    card: 'skill.courier',
    probe: 'a friendly non-royal moves into home territory',
    intended: 'live',
    current: 'live',
    run: skill('skill.courier', [K_W, rook('b4'), K_B]),
  },
  {
    card: 'skill.feint',
    probe: 'two friendly non-royals exchange places',
    intended: 'live',
    current: 'live',
    run: skill('skill.feint', [K_W, rook('b1'), rook('c1'), K_B]),
  },
  {
    card: 'skill.surge',
    probe: 'friendly footmen gain diagonal movement',
    intended: 'live',
    current: 'live',
    run: skill('skill.surge', [K_W, pawn('c2', 'white'), K_B]),
  },
]

describe('what the new skill cards do, exactly', () => {
  /*
   * The survey above asks whether a card changes anything. That is the right
   * question for a liveness sweep and the wrong one for a card whose failure
   * mode is "changed the wrong thing" — a second-opinion review of
   * PLAN-preset-content-expansion made the point precisely: a Blink that moved
   * sideways, a Brand that produced the wrong piece, or a grant with the wrong
   * pattern all pass `skill()`.
   *
   * So the cards whose effect has a NAMEABLE result get one assertion each on
   * that result. Not every card: `skill.veil` and `skill.leash` are already
   * pinned by their inert probes above, which is the sharper direction for them.
   */
  function play(card: string, placements: Place[], pick: SquareId) {
    const before = pos({ placements, held: [card] })
    const action = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === card && a.targets[0] === pick,
    )
    if (!action) throw new Error(`${card} was not offered on ${pick}`)
    return apply(before, action, content)
  }

  it('skill.brand turns the chosen footman into a lancer, not into anything else', () => {
    const after = play('skill.brand', [K_W, pawn('c2', 'white'), K_B], 'c2')
    expect(after.board.get('c2')?.pieceId).toBe('piece.lancer')
  })

  it('skill.echo adds one footman to the mover and takes nothing', () => {
    // No chosen slot: the card spawns on the home rank, so its play carries an
    // empty target list rather than a square.
    const before = pos({ placements: [K_W, rook('b1'), K_B], held: ['skill.echo'] })
    const white = (s: GameState) => [...s.board.values()].filter((p) => p.side === 'white').length
    const action = legalActions(before, content).find((a) => a.kind === 'play_card' && a.cardId === 'skill.echo')
    expect(action, 'echo was not offered').toBeDefined()
    const after = apply(before, action!, content)
    expect(white(after)).toBe(white(before) + 1)
    expect(after.captured).toEqual(before.captured)
  })

  it('skill.blink grants a two-square straight leap to the piece that was chosen', () => {
    // The card was re-aimed during review: as a `teleport_piece` to an `offset`
    // destination it was offered for pieces whose destination is off the board,
    // consuming the card and moving nothing. A grant always resolves — and this
    // asserts WHICH piece got it and that the reach is real.
    const after = play('skill.blink', [K_W, rook('c3'), K_B], 'c3')
    const moves = legalActions(after, content).filter((a) => a.kind === 'move' && a.from === 'c3')
    expect(moves.some((m) => m.kind === 'move' && m.to === 'c5')).toBe(true)
    expect([...after.grants].some((g) => g.square === 'c3'), 'the grant landed on another piece').toBe(true)
  })

  it('skill.tide gives a footman orthogonal reach it has never had', () => {
    const after = play('skill.tide', [K_W, pawn('c2', 'white'), K_B], 'c2')
    const moves = legalActions(after, content).filter((a) => a.kind === 'move' && a.from === 'c2')
    expect(moves.some((m) => m.kind === 'move' && m.to === 'a2'), 'no sideways reach was granted').toBe(true)
  })

  it('skill.quake moves the chosen ENEMY and leaves the mover’s pieces where they were', () => {
    const before = pos({ placements: [K_W, rook('b1'), rook('e5', 'black'), K_B], held: ['skill.quake'] })
    const action = legalActions(before, content).find(
      (a) => a.kind === 'play_card' && a.cardId === 'skill.quake' && a.targets[0] === 'e5',
    )
    expect(action, 'quake was not offered on the enemy rook').toBeDefined()
    const after = apply(before, action!, content)
    expect(after.board.has('e5'), 'the enemy rook did not move').toBe(false)
    expect(after.board.get('b1')?.pieceId, 'the mover’s own rook moved').toBe('piece.rook')
  })
})

describe('every shipped card changes something a player can see', () => {
  for (const p of PROBES) {
    const label = p.defect ? `${p.card} — ${p.probe} (KNOWN DEFECT)` : `${p.card} — ${p.probe}`
    it(label, () => {
      expect(
        p.run(),
        p.defect
          ? `open bug: ${p.defect}\n\nIf you have just fixed it, set current: '${p.intended}' and delete the defect note.`
          : `this probe used to be ${p.current}`,
      ).toBe(p.current)
    })
  }

  it('covers every rule and skill card in the shipped set', () => {
    const surveyed = new Set(PROBES.map((p) => p.card))
    const shipped = [...content.ruleCards.keys(), ...content.skillCards.keys()]
    // A hand-maintained probe list grows a hole every time a card is added, and
    // this repo has already shipped one screen and one literal through exactly
    // that gap. The hole is worth closing loudly.
    expect(shipped.filter((id) => !surveyed.has(id))).toEqual([])
  })
})
