import { describe, expect, it } from 'vitest'
import { LIFECYCLE_EVENTS } from '@content/schema'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { contentWith } from '../helpers/content'
import type { ContentSet } from '@content/load'
import type { GameState, Side, SquareId } from '@engine/types'

/**
 * The guard `pending-proposals.md` asked for, keyed on the TRIGGER ENUM.
 *
 * ADR-001's settlement step defers a `freeze_piece` that names `mover`, because
 * the piece is between squares and a square-keyed write would land on the one it
 * is about to leave. The deferral must fire at EXACTLY the triggers where that
 * is true — and the first implementation got it wrong in both directions at
 * once, using `ctx.moverSquare != null` as a proxy for "mid-move":
 *
 *   - `cascadeEnter` passes a non-null `moverSquare` for every `on_enter`, so a
 *     square effect's freeze was deferred and then written to the LAST endpoint
 *     — on a two-endpoint swap, the other piece.
 *   - `end_of_ply` passes one too, and runs AFTER the queue has been drained, so
 *     the write vanished: no freeze, no `settle:dropped`, and the log still said
 *     `end_of_ply:rule:<id>` as though the effect had fired.
 *
 * Neither was caught by a suite; both were caught by review. This is the
 * mechanical version, and it is keyed on `LIFECYCLE_EVENTS` rather than on a
 * hand-written list — `pending-proposals.md`'s own conclusion after the
 * `declared-but-inert-vocabulary` harness surveyed CARDS and missed a SQUARE
 * TYPE was that the coverage assertion has to walk the schema's enum, so a
 * trigger added tomorrow is included without anyone remembering to add it.
 */

const DEFERRING_TRIGGERS: ReadonlySet<string> = new Set(['on_leave', 'on_capture'])

type Place = { square: SquareId; pieceId: string; side: Side }
const at = (square: SquareId, pieceId: string, side: Side = 'white'): Place => ({ square, pieceId, side })

/** A rule card that freezes the ply's mover, fired from one named trigger. */
function cardFiringAt(trigger: string): ContentSet {
  return contentWith((src) => {
    src.ruleCards.push({
      id: 'rule.trigger-probe',
      nameKey: 'rule.trigger-probe.name',
      textKey: 'rule.trigger-probe.text',
      effects: [
        {
          trigger,
          condition: { kind: 'always' },
          actions: [{ kind: 'freeze_piece', target: { kind: 'mover' }, plies: 3 }],
        },
      ],
    })
    src.presets[0]!.ruleCardIds.push('rule.trigger-probe')
  })
}

/**
 * One capture ply — the only shape that reaches every lifecycle event in a
 * single move: the origin is vacated (E2), an occupant is removed (E3), the
 * destination is entered (E4), and the close-out runs E5..E7.
 */
function captureUnder(content: ContentSet): GameState {
  const before = createPosition({
    content,
    presetId: 'preset.default',
    seed: 1,
    sideToMove: 'white',
    placements: [
      at('a3', 'piece.king'),
      at('d1', 'piece.rook'),
      at('d5', 'piece.rook', 'black'),
      at('f3', 'piece.king', 'black'),
    ],
    ruleCardId: 'rule.trigger-probe',
    held: { white: [] },
    captured: { white: [] },
  })
  const move = legalActions(before, content).find((a) => a.kind === 'move' && a.from === 'd1' && a.to === 'd5')
  if (!move) throw new Error('d1->d5 is not a legal capture — the fixture is wrong, not the engine')
  return apply(before, move, content)
}

describe('a mover-targeted freeze defers at exactly the mid-move triggers', () => {
  // Enumerated from the schema, not hand-listed: a new lifecycle event joins
  // this table automatically and has to declare which side of the line it is on.
  for (const trigger of LIFECYCLE_EVENTS) {
    const shouldDefer = DEFERRING_TRIGGERS.has(trigger)

    it(`${trigger} ${shouldDefer ? 'defers to settlement' : 'resolves immediately'}`, () => {
      const content = cardFiringAt(trigger)
      const after = captureUnder(content)
      const settled = after.log.some((entry) => entry.startsWith('settle:'))

      expect(settled, shouldDefer ? 'the mover is between squares here' : 'the mover is where it will stay').toBe(
        shouldDefer,
      )
    })
  }

  it('never leaves a deferred write undrained', () => {
    /*
     * The half that made the `end_of_ply` bug silent. A queued write and an
     * applied write are indistinguishable from the outside — both leave the log
     * saying the effect fired — so the invariant has to be that EVERY deferral
     * produces a settlement line, applied or dropped. A trigger that defers
     * after the drain point produces neither, which is precisely the shape this
     * asserts against.
     */
    for (const trigger of LIFECYCLE_EVENTS) {
      if (!DEFERRING_TRIGGERS.has(trigger)) continue
      const after = captureUnder(cardFiringAt(trigger))
      const fired = after.log.some((entry) => entry.startsWith(`${trigger}:rule:rule.trigger-probe`))
      const settled = after.log.filter((entry) => entry.startsWith('settle:'))

      expect(fired, `${trigger}: the probe card did not fire, so this asserts nothing`).toBe(true)
      expect(settled.length, `${trigger}: fired but nothing settled — the write was queued and lost`).toBeGreaterThan(
        0,
      )
    }
  })
})
