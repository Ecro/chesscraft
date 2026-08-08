// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { bundledContentSource } from '@content/sets/bundled'
import { sliceContentSource } from '@content/sets/slice'
import type { ContentSource } from '@content/load'
import { VOCABULARY_CONTROLS, controlTestId } from '@editor/controls'
import { type VocabAxis, enumerateVocabulary } from '@editor/vocabulary'
import { type DraftKind, openDraft } from '@editor/draft'
import { Edit } from '../../src/ui/Edit'

/**
 * ADR-006's permanent CI gate, and the price that ADR paid for hand-crafted
 * forms: because the editor is written by hand rather than generated from the
 * schema, nothing structural stops a vocabulary extension from landing with no
 * editor support. This test is that structure.
 *
 * Three things each row must prove, and each one exists because leaving it out
 * let a wrong editor through:
 *
 *   1. REACHABLE — the control is in the rendered DOM and ENABLED in a content
 *      kind whose schema admits it. A table asserting reachability asserts
 *      nothing; the claim is checked against the render.
 *   2. WRITES ITS OWN VALUE — asserted by exact equality at the JSON PATH the
 *      control owns, not by searching the draft for a matching fragment. A
 *      whole-draft search passes whenever the expected value happens to equal
 *      an editor default, so a dead `always` / `self` / `chosen_empty` button
 *      would sail through. Where the value IS a default, `requires` first sets
 *      a different one, so the row proves the control switched it BACK.
 *   3. ROUND-TRIPS — save through the real validator, re-open, get the same
 *      document back.
 *
 * `params` is the other half of the lesson. Asserting only that a `kind`
 * appeared cannot see a parameter-shaped extension — and schema v3's headline
 * addition was exactly that: `duration` on the three generation-time actions,
 * without which they were silent no-ops from a skill card. Every parameter a
 * kind carries is therefore named here by the test id of the control that must
 * author it.
 *
 * The table is hand-written rather than derived from the schema on purpose. A
 * derived expectation moves with the schema and asserts nothing; this one makes
 * an ADR-005 extension a three-place edit — schema, this table, and the editor —
 * which is the coupling ADR-006 knowingly accepted.
 */

/** A control the author touches after picking the vocabulary entry. */
interface Param {
  testid: string
  /** Text/select value to enter. Omitted means the control is clicked. */
  value?: string
}

interface Row {
  axis: VocabAxis
  kind: string
  /** The content kind this entry is authored in; its schema must admit it. */
  host: DraftKind
  /** Clicked before this entry's control, in order. */
  requires?: string[]
  params?: Param[]
  /**
   * The test id of the control that authors this entry, when the mechanical
   * axis→slot mapping does not apply. `not` is a per-leaf toggle and `all`/`any`
   * are the join operator between two leaves, so none of the three is an option
   * in the condition slot's own sheet (ADR-007).
   */
  reachTestId?: string
  /** Dotted path into the draft that this control owns. */
  path: string
  /** The exact value that must be there afterwards. */
  authored: unknown
}

/** A fresh effect with one action that has a `target` slot. */
const EFFECT = ['editor-add-effect', 'vocab-action-block_capture']
/** A fresh effect with one action that has a destination slot. */
const EFFECT_WITH_DESTINATION = ['editor-add-effect', 'vocab-action-teleport_piece']

/**
 * A fresh effect carries NO trigger — an effect that has not been told when it
 * fires is not a draft anyone finished, and a seeded trigger would make one
 * trigger row per host assert a default rather than its own control. Every row
 * that is not itself testing the trigger axis therefore needs one clicked
 * before the save, and the runner inserts it rather than each row repeating it.
 */
const TRIGGER_CLICK: Partial<Record<DraftKind, string>> = {
  piece: 'vocab-trigger-end_of_ply',
  squareType: 'vocab-trigger-on_enter',
  ruleCard: 'vocab-trigger-end_of_ply',
  skillCard: 'vocab-trigger-on_play',
}

const ROWS: readonly Row[] = [
  // --- triggers -----------------------------------------------------------
  ...(
    [
      ['generate_moves', 'piece'],
      ['on_leave', 'piece'],
      ['on_capture', 'piece'],
      ['on_enter', 'piece'],
      ['on_promote', 'piece'],
      ['on_remove', 'piece'],
      ['end_of_ply', 'piece'],
      ['on_play', 'skillCard'],
    ] as ReadonlyArray<readonly [string, DraftKind]>
  ).map(
    ([kind, host]): Row => ({
      axis: 'trigger',
      kind,
      host,
      requires: EFFECT,
      path: 'effects.0.trigger',
      authored: kind,
    }),
  ),

  // --- targets ------------------------------------------------------------
  {
    // `self` is the default target of a fresh action, so this row switches to
    // `mover` first: without that, a dead button passes.
    axis: 'target',
    kind: 'self',
    host: 'piece',
    requires: [...EFFECT, 'vocab-target-mover'],
    path: 'effects.0.actions.0.target',
    authored: { kind: 'self' },
  },
  { axis: 'target', kind: 'mover', host: 'piece', requires: EFFECT, path: 'effects.0.actions.0.target', authored: { kind: 'mover' } },
  {
    axis: 'target',
    kind: 'entering',
    host: 'squareType',
    requires: EFFECT,
    path: 'effects.0.actions.0.target',
    authored: { kind: 'entering' },
  },
  { axis: 'target', kind: 'occupant', host: 'piece', requires: EFFECT, path: 'effects.0.actions.0.target', authored: { kind: 'occupant' } },
  {
    axis: 'target',
    kind: 'adjacent_friendly',
    host: 'piece',
    requires: EFFECT,
    path: 'effects.0.actions.0.target',
    authored: { kind: 'adjacent_friendly' },
  },
  {
    axis: 'target',
    kind: 'chosen_friendly',
    host: 'skillCard',
    requires: EFFECT,
    path: 'effects.0.actions.0.target',
    authored: { kind: 'chosen_friendly' },
  },
  {
    axis: 'target',
    kind: 'chosen_enemy',
    host: 'skillCard',
    requires: EFFECT,
    path: 'effects.0.actions.0.target',
    authored: { kind: 'chosen_enemy' },
  },

  // --- destinations -------------------------------------------------------
  {
    axis: 'destination',
    kind: 'paired_square',
    host: 'squareType',
    requires: EFFECT_WITH_DESTINATION,
    path: 'effects.0.actions.0.to',
    authored: { kind: 'paired_square' },
  },
  {
    // `chosen_empty` is a fresh teleport's default destination, so this row
    // moves away from it first and proves the control comes back.
    // Hosted on `revive_piece`, not on a teleport. Every destination row used
    // to sit on `teleport_piece`, which left the `spawn_piece.at` and
    // `revive_piece.at` slots of the editor's destination mapping untested —
    // both could have been deleted with the suite still green, and an author
    // could never have chosen where a revive lands.
    axis: 'destination',
    kind: 'chosen_empty',
    host: 'skillCard',
    requires: ['editor-add-effect', 'vocab-action-revive_piece'],
    path: 'effects.0.actions.0.at',
    authored: { kind: 'chosen_empty' },
  },
  {
    axis: 'destination',
    kind: 'square',
    host: 'skillCard',
    requires: EFFECT_WITH_DESTINATION,
    params: [{ testid: 'param-square', value: 'c3' }],
    path: 'effects.0.actions.0.to',
    authored: { kind: 'square', square: 'c3' },
  },
  {
    // Hosted on `spawn_piece` for the same reason the row above moved.
    axis: 'destination',
    kind: 'own_back_rank',
    host: 'skillCard',
    requires: ['editor-add-effect', 'vocab-action-spawn_piece'],
    path: 'effects.0.actions.0.at',
    authored: { kind: 'own_back_rank' },
  },
  {
    axis: 'destination',
    kind: 'offset',
    host: 'skillCard',
    requires: EFFECT_WITH_DESTINATION,
    params: [
      { testid: 'param-df', value: '1' },
      { testid: 'param-dr', value: '-2' },
      { testid: 'param-offset-forward' },
    ],
    path: 'effects.0.actions.0.to',
    authored: { kind: 'offset', df: 1, dr: -2, forward: true },
  },

  // --- conditions ---------------------------------------------------------
  {
    // `always` is the default condition of a fresh effect — same trap as
    // `self` and `chosen_empty`, same fix.
    axis: 'condition',
    kind: 'always',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side'],
    path: 'effects.0.condition',
    authored: { kind: 'always' },
  },
  {
    axis: 'condition',
    kind: 'piece_is',
    host: 'piece',
    requires: EFFECT,
    params: [{ testid: 'param-cond-pieceId', value: 'piece.archer' }],
    path: 'effects.0.condition',
    authored: { kind: 'piece_is', pieceId: 'piece.archer' },
  },
  {
    axis: 'condition',
    kind: 'piece_side',
    host: 'piece',
    requires: EFFECT,
    params: [{ testid: 'param-cond-side', value: 'opponent' }],
    path: 'effects.0.condition',
    authored: { kind: 'piece_side', side: 'opponent' },
  },
  {
    axis: 'condition',
    kind: 'on_square',
    host: 'piece',
    requires: EFFECT,
    params: [{ testid: 'param-cond-square-c3' }],
    path: 'effects.0.condition',
    authored: { kind: 'on_square', squares: ['c3'] },
  },
  {
    axis: 'condition',
    kind: 'on_own_rank',
    host: 'ruleCard',
    requires: EFFECT,
    params: [{ testid: 'param-cond-n', value: '5' }],
    path: 'effects.0.condition',
    authored: { kind: 'on_own_rank', n: 5 },
  },
  {
    axis: 'condition',
    kind: 'check_count_at_least',
    host: 'ruleCard',
    requires: EFFECT,
    params: [{ testid: 'param-cond-n', value: '3' }],
    path: 'effects.0.condition',
    authored: { kind: 'check_count_at_least', n: 3 },
  },
  {
    axis: 'condition',
    kind: 'piece_count_at_most',
    host: 'ruleCard',
    requires: EFFECT,
    params: [
      { testid: 'param-cond-side', value: 'mover' },
      { testid: 'param-cond-n', value: '2' },
    ],
    path: 'effects.0.condition',
    authored: { kind: 'piece_count_at_most', side: 'mover', n: 2 },
  },
  {
    // Authored as a toggle on the leaf it inverts, not as an option in a list:
    // "not" is not a condition a child picks, it is something they say about one.
    axis: 'condition',
    kind: 'not',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side'],
    reachTestId: 'slot-not',
    path: 'effects.0.condition',
    authored: { kind: 'not', of: { kind: 'piece_side', side: 'mover' } },
  },
  {
    // TWO operands, where the palette produced one.
    //
    // `{kind:'all', of:[x]}` — a conjunction of a single thing — was an artifact
    // of a control that wrapped whatever condition happened to be selected. The
    // sentence joins two leaves, which is the only shape that means anything to a
    // reader, so the authored value moves with it. The entry is still authorable,
    // which is what this gate measures. `op` defaults to `all` the moment a second
    // leaf exists, so the row switches to `any` first and proves the control
    // switches it back.
    axis: 'condition',
    kind: 'all',
    host: 'piece',
    requires: [
      ...EFFECT,
      'vocab-condition-piece_side',
      'slot-cond2',
      'opt-cond2-on_own_rank',
      'slot-op',
      'opt-op-any',
    ],
    reachTestId: 'opt-op-all',
    path: 'effects.0.condition',
    authored: {
      kind: 'all',
      of: [
        { kind: 'piece_side', side: 'mover' },
        { kind: 'on_own_rank', n: 1 },
      ],
    },
  },
  {
    // Same two-operand move as `all` above. No discriminating click is needed
    // here: adding a second leaf defaults the join to `all`, so `any` is never
    // already sitting at the path.
    axis: 'condition',
    kind: 'any',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side', 'slot-cond2', 'opt-cond2-on_own_rank', 'slot-op'],
    reachTestId: 'opt-op-any',
    path: 'effects.0.condition',
    authored: {
      kind: 'any',
      of: [
        { kind: 'piece_side', side: 'mover' },
        { kind: 'on_own_rank', n: 1 },
      ],
    },
  },

  // --- actions ------------------------------------------------------------
  {
    axis: 'action',
    kind: 'destroy_piece',
    host: 'piece',
    requires: ['editor-add-effect'],
    path: 'effects.0.actions.0',
    authored: { kind: 'destroy_piece', target: { kind: 'self' } },
  },
  {
    axis: 'action',
    kind: 'teleport_piece',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    path: 'effects.0.actions.0',
    authored: { kind: 'teleport_piece', target: { kind: 'self' }, to: { kind: 'chosen_empty' } },
  },
  {
    axis: 'action',
    kind: 'promote_piece',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    // NOT 'piece.king': that is `firstPiece(ctx)`, which the action maker
    // already wrote, so a dead `param-to` would pass.
    params: [{ testid: 'param-to', value: 'piece.archer' }],
    path: 'effects.0.actions.0',
    authored: { kind: 'promote_piece', target: { kind: 'self' }, to: 'piece.archer' },
  },
  {
    axis: 'action',
    kind: 'spawn_piece',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [
      { testid: 'param-pieceId', value: 'piece.archer' },
      { testid: 'param-side', value: 'opponent' },
    ],
    path: 'effects.0.actions.0',
    authored: { kind: 'spawn_piece', pieceId: 'piece.archer', side: 'opponent', at: { kind: 'chosen_empty' } },
  },
  {
    // `duration` is why this table carries parameters at all: without a control
    // for it, this action is a silent no-op on a skill card, and an axis/kind
    // gate cannot tell the difference.
    axis: 'action',
    kind: 'block_capture',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [{ testid: 'param-duration', value: '2' }],
    path: 'effects.0.actions.0',
    authored: { kind: 'block_capture', target: { kind: 'self' }, duration: 2 },
  },
  {
    axis: 'action',
    kind: 'freeze_piece',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [{ testid: 'param-plies', value: '2' }],
    path: 'effects.0.actions.0',
    authored: { kind: 'freeze_piece', target: { kind: 'self' }, plies: 2 },
  },
  {
    axis: 'action',
    kind: 'grant_movement',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [
      // `step`, not `jump`: ADR-006 retires `jump` from the authorable
      // vocabulary, and the engine gives the two the same `maxSteps` anyway.
      { testid: 'param-pattern-step' },
      { testid: 'param-pattern-cell-2_1' },
      { testid: 'param-duration', value: '3' },
    ],
    path: 'effects.0.actions.0',
    authored: {
      kind: 'grant_movement',
      target: { kind: 'self' },
      pattern: { kind: 'step', vectors: [[2, 1]] },
      duration: 3,
    },
  },
  {
    axis: 'action',
    kind: 'forbid_movement',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [{ testid: 'param-duration', value: '1' }],
    path: 'effects.0.actions.0',
    authored: { kind: 'forbid_movement', target: { kind: 'self' }, duration: 1 },
  },
  {
    axis: 'action',
    kind: 'swap_pieces',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    path: 'effects.0.actions.0',
    authored: { kind: 'swap_pieces', a: { kind: 'chosen_friendly' }, b: { kind: 'chosen_enemy' } },
  },
  {
    axis: 'action',
    kind: 'revive_piece',
    host: 'skillCard',
    requires: ['editor-add-effect'],
    params: [
      { testid: 'param-side', value: 'mover' },
      { testid: 'param-except-piece.king' },
    ],
    path: 'effects.0.actions.0',
    authored: { kind: 'revive_piece', side: 'mover', at: { kind: 'own_back_rank' }, except: ['piece.king'] },
  },
  {
    axis: 'action',
    kind: 'win',
    host: 'ruleCard',
    requires: ['editor-add-effect'],
    params: [{ testid: 'param-side', value: 'mover' }],
    path: 'effects.0.actions.0',
    authored: { kind: 'win', side: 'mover' },
  },

  // --- movement patterns --------------------------------------------------
  // A blank piece starts with one step pattern (a piece that cannot move is not
  // a draft anyone wants), so an authored pattern lands at index 1.
  // Authored through the GRID now, not the indexed pattern editor (PLAN Phase 7
  // deleted it). Two consequences the paths record honestly:
  //
  //  - `writeGrid` emits `[slide?, step?]` in that order, so a slide lands at
  //    index 0, not 1. The old `movement.1` was an artifact of an editor that
  //    appended patterns to whatever was already there.
  //  - `forward` is ONE flag over the whole grid, not per pattern, so the step row
  //    below carries it on the pattern it asserts and the slide row does not set
  //    it at all. `readGrid` refuses a record whose patterns disagree about
  //    `forward`, which is why a per-pattern control was never coherent here.
  {
    axis: 'movement',
    kind: 'slide',
    host: 'piece',
    // A direction toggle plus a reach. The blank piece's seeded step stays lit at
    // (0,1), so it is emitted after the slide.
    reachTestId: 'piece-slide-n',
    params: [{ testid: 'piece-reach-2' }],
    path: 'movement.0',
    authored: { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
  },
  {
    axis: 'movement',
    kind: 'step',
    host: 'piece',
    // Lighting a second cell; the seed at (0,1) is part of the authored value,
    // which is the grid meaning exactly what it shows (ADR-027).
    reachTestId: 'piece-cell-1,1',
    params: [{ testid: 'piece-forward' }],
    path: 'movement.0',
    authored: {
      kind: 'step',
      vectors: [
        [0, 1],
        [1, 1],
      ],
      forward: true,
    },
  },
  // `movement: jump` is GONE, not moved (ADR-006 of PLAN-unified-create-ux).
  // `MOVEMENT_KINDS` no longer enumerates it, so `goldenKeys` — derived from these
  // rows — must not either, or the two identity tests above go red. The schema
  // still accepts `jump` and shipped documents still play; what retired is the
  // ability to CHOOSE it, because the engine cannot tell it from `step`.

  // --- the forEach quantifier (schema v2) ---------------------------------
  {
    axis: 'forEach',
    kind: 'piece',
    host: 'ruleCard',
    requires: EFFECT,
    params: [
      { testid: 'param-foreach-pieceId', value: 'piece.king' },
      { testid: 'param-foreach-side', value: 'any' },
    ],
    path: 'effects.0.forEach',
    authored: { kind: 'piece', pieceId: 'piece.king', side: 'any' },
  },
]

/**
 * Record-level fields the schema carries that are not effect vocabulary but
 * that an author still has no other way to reach. Same gate, same reason:
 * `royal` decides what ends a match, and an editor that cannot set it silently
 * makes every authored piece non-royal.
 */
interface FieldRow {
  host: DraftKind
  what: string
  params: Param[]
  path: string
  authored: unknown
  source?: 'bundled'
}

const FIELD_ROWS: readonly FieldRow[] = [
  { host: 'piece', what: 'royal', params: [{ testid: 'editor-royal' }], path: 'royal', authored: true },
  {
    host: 'piece',
    what: 'promotion',
    params: [
      { testid: 'editor-promotion-onRank', value: 'last' },
      // Again not the first piece id — setting `onRank` alone already seeds
      // `to` with it, so this value has to be one only this control can write.
      { testid: 'editor-promotion-to', value: 'piece.archer' },
    ],
    path: 'promotion',
    authored: { onRank: 'last', to: 'piece.archer' },
  },
  {
    // The archer's whole point is that attack differs from movement (AC-009).
    // An editor that cannot author a differing attack cannot express the piece
    // the fixtures have been built around since Phase 1.
    host: 'piece',
    what: 'attack',
    // `step`, not `jump`: an attack pattern is a movement pattern, and ADR-006
    // retired that distinction on both axes rather than on one.
    params: [{ testid: 'attack-kind-step' }, { testid: 'attack-cell-2_0' }],
    path: 'attack',
    authored: [{ kind: 'step', vectors: [[2, 0]] }],
  },
  { host: 'squareType', what: 'paired', params: [{ testid: 'editor-paired' }], path: 'paired', authored: true },
  // `ruleCard.cost` and `skillCard.cost` used to be rows here. They were removed
  // in schema v8 along with their control, and the removal is pinned by its own
  // test at the bottom of this file rather than by silence — a field dropping out
  // of this list is exactly how an uncontrolled field would sneak back in.
  { host: 'skillCard', what: 'uses', params: [{ testid: 'editor-uses', value: '2' }], path: 'uses', authored: 2 },
  {
    // ADR-010: a paired square type is meaningless without a partner, so the
    // board painter must be able to declare one.
    host: 'board',
    what: 'pairedWith',
    source: 'bundled',
    params: [
      { testid: 'paint-type', value: 'square.portal' },
      { testid: 'paint-a1' },
      { testid: 'paint-a6' },
    ],
    path: 'squares.0',
    authored: { square: 'a1', typeId: 'square.portal', pairedWith: 'a6' },
  },
]

// ---------------------------------------------------------------------------

const key = (axis: string, kind: string) => `${axis}:${kind}`
const goldenKeys = ROWS.map((r) => key(r.axis, r.kind))

/** Reads a dotted path out of the draft; `undefined` when any segment misses. */
function at(node: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((n, seg) => {
    if (n === null || typeof n !== 'object') return undefined
    return (n as Record<string, unknown>)[seg]
  }, node)
}

const PREFIX: Record<DraftKind, string> = {
  piece: 'piece',
  squareType: 'square',
  ruleCard: 'rule',
  skillCard: 'skill',
  board: 'board',
  preset: 'preset',
}

function mount(source: ContentSource) {
  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: structuredClone(source),
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  return committed
}

/** Works for any element, unlike `.disabled`, which is undefined off form controls. */
function expectEnabled(el: Element, testid: string) {
  expect(el.getAttribute('disabled'), `${testid} is present but disabled`).toBeNull()
}

/**
 * PLAN Phase 5 — the gate now measures the SENTENCE, not the indexed form.
 *
 * The 38 rows below are unchanged, and deliberately so: each one states which
 * vocabulary entry it covers, where that entry lands in the draft, and what
 * discriminates it from a default. None of that is affected by which control the
 * author reaches it through. What changes is the reach, and it changes here, once,
 * rather than 38 times — a hand-edited row is a row whose intent can drift from
 * its comment while still passing.
 *
 * The translation is mechanical: a `vocab-<axis>-<kind>` id becomes "open the
 * sentence slot that owns that axis, then choose that entry in its sheet", and a
 * `param-*` id becomes its `s-param-*` twin inside the sheet. `editor-add-effect`
 * disappears because the sentence always has exactly one effect to edit.
 *
 * The `movement` axis is NOT translated. It has no sentence slot — a piece's
 * movement is the grid, not a clause — so those three rows still reach the indexed
 * editor. Phase 7 handles them together with ADR-006's retirement of `jump`; until
 * then they keep the axis measured rather than briefly unmeasured, which is the
 * whole point of ADR-003's ordering.
 */
const SLOT_OF: Partial<Record<VocabAxis, string>> = {
  trigger: 'when',
  condition: 'cond',
  action: 'then',
  target: 'who',
  destination: 'where',
  forEach: 'each',
}

/** Opens a slot's sheet the way a child does, and returns its option button. */
function openOption(slot: string, kind: string): Element {
  const chip = screen.getByTestId(`slot-${slot}`)
  expectEnabled(chip, `slot-${slot}`)
  // `Sheet` captures `document.activeElement` to restore focus on close, and a
  // real tap focuses the button first; jsdom's click does not.
  ;(chip as HTMLElement).focus()
  fireEvent.click(chip)
  return screen.getByTestId(`opt-${slot}-${kind}`)
}

/** `vocab-<axis>-<kind>` → the sentence slot and entry that now author it. */
function retarget(testid: string): { slot: string; kind: string } | null {
  const parsed = /^vocab-([A-Za-z]+)-(.+)$/.exec(testid)
  if (parsed === null) return null
  const slot = SLOT_OF[parsed[1] as VocabAxis]
  return slot === undefined ? null : { slot, kind: parsed[2]! }
}

/** The control this axis/kind is reached through, opening its sheet if needed. */
export function reach(axis: VocabAxis, kind: string): Element {
  const slot = SLOT_OF[axis]
  if (slot === undefined) return screen.getByTestId(controlTestId(axis, kind))
  return openOption(slot, kind)
}

function clickAll(testids: readonly string[] | undefined) {
  for (const testid of testids ?? []) {
    // The sentence has one effect and always has it; there is nothing to add.
    if (testid === 'editor-add-effect') continue

    const moved = retarget(testid)
    if (moved !== null) {
      const option = openOption(moved.slot, moved.kind)
      expectEnabled(option, `opt-${moved.slot}-${moved.kind}`)
      fireEvent.click(option)
      continue
    }

    const el = screen.getByTestId(testid)
    // A disabled prerequisite silently no-ops and the row fails somewhere else
    // entirely, so it is checked here rather than diagnosed downstream.
    expectEnabled(el, testid)
    fireEvent.click(el)
  }
}

/**
 * A row's parameter id, inside the sheet.
 *
 * `s-param-*` rather than `param-*` because the indexed form still renders its own
 * copies until Phase 7 deletes them, and two nodes sharing a test id makes every
 * `getByTestId` here ambiguous. Ids that are not parameters (grid cells, record
 * fields) pass through untouched.
 */
function sentenceParam(testid: string): string {
  return testid.startsWith('param-') ? `s-${testid}` : testid
}

function applyParams(params: readonly Param[] | undefined, translate = true) {
  for (const param of params ?? []) {
    const testid = translate ? sentenceParam(param.testid) : param.testid
    const el = screen.getByTestId(testid)
    expectEnabled(el, testid)
    if (param.value === undefined) fireEvent.click(el)
    else fireEvent.change(el, { target: { value: param.value } })
  }
}

function readDraft(): unknown {
  return JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
}

/**
 * Gives the draft an id, which is now the whole of naming it.
 *
 * The two raw KEY fields are gone (PLAN Phase 7 of unified-create-ux), so a key is
 * DERIVED from the id at save time by `slotFor`. The draft therefore still carries
 * empty keys while the committed record carries `<id>.name` — a documented
 * transformation, not a discrepancy, and `derivedKeys` below is where the row
 * assertions account for it. Stated as a literal rather than by calling `deriveKey`:
 * an expectation computed with the function under test cannot fail with it.
 */
function nameDraft(id: string, host: DraftKind) {
  fireEvent.change(screen.getByTestId('editor-id'), { target: { value: id } })
  // The human fields, which is the only naming path left. `slotFor` derives a key
  // ONLY for a slot the author actually typed into (`if (!s.active || !s.typed)
  // continue`) — so a draft with an id and no words keeps empty keys and fails the
  // i18n-key regex on save. That is correct behaviour, and it means this helper has
  // to do what a child does rather than what the old raw slots did.
  fireEvent.change(screen.getByTestId('editor-name'), { target: { value: `이름 ${id}` } })
  if (host !== 'board' && host !== 'preset') {
    fireEvent.change(screen.getByTestId('editor-text'), { target: { value: `설명 ${id}` } })
  }
}

/** What the save adds to a draft that never named its own keys. */
function derivedKeys(id: string, host: DraftKind): Record<string, string> {
  const keys: Record<string, string> = { nameKey: `${id}.name` }
  if (host !== 'board' && host !== 'preset') keys.textKey = `${id}.text`
  return keys
}

afterEach(cleanup)

describe('vocabulary-editor coverage (ADR-006)', () => {
  it('enumerates exactly the vocabulary the schema declares', () => {
    const enumerated = enumerateVocabulary().map((e) => key(e.axis, e.kind))
    expect([...enumerated].sort()).toEqual([...goldenKeys].sort())
  })

  it('has one editor control per vocabulary entry, and no control for anything else', () => {
    const controls = VOCABULARY_CONTROLS.map((c) => key(c.axis, c.kind))
    expect([...controls].sort()).toEqual([...goldenKeys].sort())
  })

  it('seeds a blank piece with exactly one starter pattern, which the movement rows build on', () => {
    // The movement rows author through the GRID now (PLAN Phase 7 deleted the
    // indexed editor), and the grid emits `[slide?, step?]` — so the seed is part
    // of what those rows assert rather than something they index past. Asserted
    // here rather than assumed there: a seed that silently changed shape would
    // fail those rows for the wrong reason, and a seed nobody declared would ship
    // a placeholder pattern on every piece an author never opened the grid for.
    mount(sliceContentSource)
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })

    const blank = readDraft()
    expect(at(blank, 'movement')).toEqual([{ kind: 'step', vectors: [[0, 1]] }])
    // And it is visible in the grid, so the author can see and remove it.
    expect(screen.getByTestId('piece-cell-0,1').getAttribute('aria-pressed')).toBe('true')
  })

  it('names every control with a stable, collision-free test id', () => {
    const ids = VOCABULARY_CONTROLS.map((c) => c.testid)
    expect(new Set(ids).size).toBe(ids.length)
    // The scheme is written out here rather than imported from the code under
    // test; `toBe(controlTestId(...))` was the same expression on both sides
    // and could not go red for the stability it claims to pin.
    for (const c of VOCABULARY_CONTROLS) expect(c.testid).toBe(`vocab-${c.axis}-${c.kind}`)
    expect(controlTestId('action', 'win')).toBe('vocab-action-win')
  })

  describe.each(ROWS.map((r) => [r.axis, r.kind, r] as const))('%s: %s', (axis, kind, row) => {
    it('is reachable from an enabled control and writes exactly its own value', () => {
      const committed = mount(sliceContentSource)

      fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: row.host } })

      const requires = [...(row.requires ?? [])]
      const addEffect = requires.indexOf('editor-add-effect')
      if (axis !== 'trigger' && addEffect >= 0) requires.splice(addEffect + 1, 0, TRIGGER_CLICK[row.host]!)
      clickAll(requires)

      // Reached through the sentence for every axis that has a slot; the
      // `movement` axis still reaches the indexed editor (see `reach`).
      const inSentence = SLOT_OF[axis] !== undefined
      const testid = row.reachTestId ?? (inSentence ? `opt-${SLOT_OF[axis]}-${kind}` : controlTestId(axis, kind))
      const button = row.reachTestId === undefined ? reach(axis, kind) : screen.getByTestId(row.reachTestId)
      expectEnabled(button, `${testid} in ${row.host}`)

      // The anti-tautology guard, and the reason no row needs to argue its own
      // discriminating setup: if the asserted value is already sitting at the
      // path before this control is touched, the row proves nothing about the
      // control and a dead button would pass. This cannot rot the way a
      // per-row hand-written discriminator can.
      expect(
        at(readDraft(), row.path),
        `${row.path} already holds the asserted value before ${testid} was clicked`,
      ).not.toEqual(row.authored)

      fireEvent.click(button)
      applyParams(row.params, inSentence)
      nameDraft(`${PREFIX[row.host]}.probe-${axis.toLowerCase()}-${kind.replace(/_/g, '-')}`, row.host)

      const authored = readDraft() as Record<string, unknown>
      expect(at(authored, row.path), `wrong value at ${row.path}; draft was ${JSON.stringify(authored)}`).toEqual(
        row.authored,
      )

      fireEvent.click(screen.getByTestId('editor-save'))
      expect(screen.queryByTestId('editor-errors')?.textContent ?? '', `saving ${key(axis, kind)} was rejected`).toBe('')
      expect(committed.value, 'save produced no content').not.toBeNull()

      const id = `${PREFIX[row.host]}.probe-${axis.toLowerCase()}-${kind.replace(/_/g, '-')}`
      expect(openDraft(committed.value!, row.host, id)).toEqual({ ...authored, ...derivedKeys(id, row.host) })
    })
  })

  describe.each(FIELD_ROWS.map((r) => [`${r.host}.${r.what}`, r] as const))('record field %s', (label, row) => {
    it('is reachable from an enabled control and writes exactly its own value', () => {
      const source = row.source === 'bundled' ? bundledContentSource : sliceContentSource
      const committed = mount(source)

      fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: row.host } })
      expect(
        at(readDraft(), row.path),
        `${row.path} already holds the asserted value before the control was touched`,
      ).not.toEqual(row.authored)
      applyParams(row.params, false)
      const id = `${PREFIX[row.host]}.probe-${row.what.replace(/[^a-z]+/g, '-')}`
      nameDraft(id, row.host)

      const authored = readDraft() as Record<string, unknown>
      expect(at(authored, row.path), `wrong value at ${row.path}; draft was ${JSON.stringify(authored)}`).toEqual(
        row.authored,
      )

      fireEvent.click(screen.getByTestId('editor-save'))
      expect(screen.queryByTestId('editor-errors')?.textContent ?? '', `saving ${label} was rejected`).toBe('')
      expect(committed.value, 'save produced no content').not.toBeNull()
      expect(openDraft(committed.value!, row.host, id)).toEqual({ ...authored, ...derivedKeys(id, row.host) })
    })
  })
})

/**
 * The one field this gate deliberately does NOT require a control for.
 *
 * `cost` was an author-typed balance number that no code ever read — the
 * textbook instance of this project's most recurring failure. Schema v8 makes it
 * optional, deprecates it, and removes its control, because a record's strength
 * is now measured rather than declared (ADR-002) and recomputed rather than
 * stored (ADR-007).
 *
 * Pinned here rather than left implicit. Dropping a field out of the coverage
 * table is indistinguishable from forgetting it; this test makes the removal a
 * decision that a future change has to argue with.
 */
describe('schema v8 — `cost` is retired, not merely hidden', () => {
  it.each(['ruleCard', 'skillCard'] as const)('offers no cost control on a %s', (host) => {
    mount(sliceContentSource)
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: host } })
    // The form IS rendered — asserted through a control that must still be
    // there, so a query returning null because nothing mounted cannot pass for
    // a control that was deliberately removed.
    expect(screen.getByTestId('editor-name')).toBeTruthy()
    expect(screen.queryByTestId('editor-cost'), `${host} still offers a cost control`).toBeNull()
  })

  it('saves a card with no cost, and the saved record carries none', () => {
    const committed = mount(sliceContentSource)
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'skillCard' } })
    clickAll(['editor-add-effect', 'vocab-trigger-on_play', 'vocab-action-destroy_piece'])
    nameDraft('skill.probe-no-cost', 'skillCard')
    fireEvent.click(screen.getByTestId('editor-save'))

    expect(screen.queryByTestId('editor-errors')?.textContent ?? '', 'saving a costless card was rejected').toBe('')
    expect(committed.value, 'save produced no content').not.toBeNull()
    const saved = openDraft(committed.value!, 'skillCard', 'skill.probe-no-cost')
    expect(saved).not.toBeNull()
    expect(saved && 'cost' in saved, 'the form put a cost back on the record').toBe(false)
  })
})

/**
 * AC-008 — the gate re-derived for the split movement axes (ADR-027/028/029).
 *
 * The table above enumerates `enumerateVocabulary()`, which is derived from the
 * Zod schemas. The slide directions and the reach cap are NOT schema entries —
 * they are a second way to author `movePattern`, and a gate enumerated along one
 * axis is blind to extensions along every other one. That is this repo's own
 * recorded failure: the first draft of the table ran 44 kind rows and could not
 * see schema v3's `duration` PARAMETER on kinds it already covered.
 *
 * So these rows are the same three claims — reachable, writes its own value,
 * round-trips — applied to the controls the split introduced.
 */
describe('AC-008 — the split movement controls are covered too', () => {
  const DIRS = {
    n: [0, 1],
    ne: [1, 1],
    e: [1, 0],
    se: [1, -1],
    s: [0, -1],
    sw: [-1, -1],
    w: [-1, 0],
    nw: [-1, 1],
  } as const

  type Dir = keyof typeof DIRS
  type Pattern = { kind: string; vectors: number[][]; maxDistance?: number }

  function slideOf(draft: unknown): Pattern | undefined {
    const movement = (draft as { movement?: Pattern[] })?.movement ?? []
    return movement.find((p) => p.kind === 'slide')
  }

  function openPiece() {
    const committed = mount(bundledContentSource)
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
    return committed
  }

  it.each(Object.entries(DIRS))('slide %s is reachable and writes its own vector', (dir, vector) => {
    openPiece()
    const control = screen.getByTestId(`piece-slide-${dir}`)
    expectEnabled(control, `piece-slide-${dir}`)
    fireEvent.click(control)

    const slide = slideOf(readDraft())
    expect(slide, `clicking piece-slide-${dir} wrote no slide pattern`).toBeTruthy()
    expect(slide!.vectors.some(([df, dr]) => df === vector[0] && dr === vector[1])).toBe(true)
    // Its OWN vector and no other — a control that lit every direction would
    // otherwise pass every row in this table.
    expect(slide!.vectors).toHaveLength(1)
  })

  it.each([
    ['1', 1],
    ['2', 2],
  ] as const)('reach %s caps the slide at that distance', (label, expected) => {
    openPiece()
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    const control = screen.getByTestId(`piece-reach-${label}`)
    expectEnabled(control, `piece-reach-${label}`)
    fireEvent.click(control)
    expect(slideOf(readDraft())?.maxDistance).toBe(expected)
  })

  it('reach "끝까지" writes no cap at all, rather than a large number', () => {
    openPiece()
    fireEvent.click(screen.getByTestId('piece-slide-n'))
    fireEvent.click(screen.getByTestId('piece-reach-2'))
    fireEvent.click(screen.getByTestId('piece-reach-edge'))
    const slide = slideOf(readDraft())
    expect(slide).toBeTruthy()
    expect('maxDistance' in slide!).toBe(false)
  })

  /**
   * Save-and-reopen for EVERY direction and EVERY reach, not one example.
   *
   * Round-1 review finding (cross-model, P2): the rows above stop at the
   * transient `editor-draft-json`, and only one combination — east at two
   * squares — was ever saved and reopened. A normalisation that dropped, say,
   * the south-west vector or the one-square cap on the way through the
   * validator would have passed the whole block. That is this repo's recorded
   * "gate enumerated along one axis is blind to every other" shape, arriving in
   * the very gate written to answer it.
   *
   * Bounded rather than Cartesian: 8 directions at one cap, plus 3 caps on one
   * direction, is 11 round-trips and covers each value at least once. A 24-cell
   * product would buy the interaction terms only, which nothing in `writeGrid`
   * treats as coupled — `reach` is one shared field, not a per-direction one.
   */
  const roundTrip = (id: string, dir: Dir, reach: string) => {
    const committed = openPiece()
    fireEvent.click(screen.getByTestId(`piece-slide-${dir}`))
    fireEvent.click(screen.getByTestId(`piece-reach-${reach}`))
    // One hop as well, so the emitted array is the two-pattern shape.
    fireEvent.click(screen.getByTestId('piece-cell-1,2'))
    nameDraft(id, 'piece')

    const authored = readDraft() as Record<string, unknown>
    fireEvent.click(screen.getByTestId('editor-save'))
    expect(screen.queryByTestId('editor-errors')?.textContent ?? '', `${dir}/${reach} was rejected`).toBe('')
    expect(committed.value, 'save produced no content').not.toBeNull()
    expect(openDraft(committed.value!, 'piece', id), `${dir}/${reach} did not survive the round trip`).toEqual({
      ...authored,
      ...derivedKeys(id, 'piece'),
    })
    return authored
  }

  it.each(Object.keys(DIRS) as Dir[])('a slide-plus-hop piece round-trips: %s at the board edge', (dir) => {
    const authored = roundTrip(`piece.probe-rt-${dir}`, dir, 'edge')
    expect(slideOf(authored)?.vectors).toEqual([[...DIRS[dir]]])
  })

  it.each(['1', '2', 'edge'] as const)('a slide-plus-hop piece round-trips: north at reach %s', (reach) => {
    const authored = roundTrip(`piece.probe-rt-reach-${reach}`, 'n', reach)
    const slide = slideOf(authored)
    if (reach === 'edge') expect('maxDistance' in slide!).toBe(false)
    else expect(slide?.maxDistance).toBe(Number(reach))
  })

  it('has ONE set of movement controls, not a simple one and a detailed one', () => {
    openPiece()
    // The grid opened — it did not put up its refusal note.
    expect(screen.queryByTestId('editor-readonly-moves')).toBeNull()
    expect(screen.getByTestId('editor-moves')).toBeTruthy()

    // This asserted `form-tab-expert` and two `hidden` flags, then (Phase 6) that
    // the indexed controls sat on the same surface. Phase 7 deleted them, so the
    // claim is now the simpler one the whole PLAN was for: there is one way to say
    // how a piece moves, and every part of it is on screen at once.
    expect(screen.queryByTestId('form-tab-expert')).toBeNull()
    expect(screen.queryByTestId('editor-clear-movement')).toBeNull()
    expect(screen.queryByTestId('movement-select-0')).toBeNull()
    expect(screen.queryByTestId('editor-add-effect')).toBeNull()
    expectEnabled(screen.getByTestId('piece-cell-1,2'), 'piece-cell-1,2')
    expectEnabled(screen.getByTestId('piece-slide-n'), 'piece-slide-n')
    expectEnabled(screen.getByTestId('piece-forward'), 'piece-forward')
  })
})
