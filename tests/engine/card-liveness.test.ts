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

function pos(opts: { placements: Place[]; ruleCardId?: string | null; held?: string[]; captured?: string[] }): GameState {
  return createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
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
function ruleMoves(card: string, placements: Place[]) {
  return (): Verdict =>
    moveSet(pos({ placements, ruleCardId: card })) === moveSet(pos({ placements, ruleCardId: null })) ? 'inert' : 'live'
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
    run: skill('skill.coronation', [K_W, pawn('c4', 'white'), K_B]),
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
    run: skill('skill.sacrifice', [K_W, rook('b1'), K_B, pawn('f5', 'black')]),
  },
]

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
