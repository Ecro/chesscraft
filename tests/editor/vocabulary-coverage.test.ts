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
    axis: 'condition',
    kind: 'not',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side'],
    path: 'effects.0.condition',
    authored: { kind: 'not', of: { kind: 'piece_side', side: 'mover' } },
  },
  {
    axis: 'condition',
    kind: 'all',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side'],
    path: 'effects.0.condition',
    authored: { kind: 'all', of: [{ kind: 'piece_side', side: 'mover' }] },
  },
  {
    axis: 'condition',
    kind: 'any',
    host: 'piece',
    requires: [...EFFECT, 'vocab-condition-piece_side'],
    path: 'effects.0.condition',
    authored: { kind: 'any', of: [{ kind: 'piece_side', side: 'mover' }] },
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
      { testid: 'param-pattern-jump' },
      { testid: 'param-pattern-cell-2_1' },
      { testid: 'param-duration', value: '3' },
    ],
    path: 'effects.0.actions.0',
    authored: {
      kind: 'grant_movement',
      target: { kind: 'self' },
      pattern: { kind: 'jump', vectors: [[2, 1]] },
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
  {
    axis: 'movement',
    kind: 'slide',
    host: 'piece',
    params: [
      { testid: 'move-cell-0_1' },
      { testid: 'param-move-maxDistance', value: '2' },
    ],
    path: 'movement.1',
    authored: { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
  },
  {
    axis: 'movement',
    kind: 'step',
    host: 'piece',
    params: [{ testid: 'move-cell-1_1' }, { testid: 'param-move-forward' }],
    path: 'movement.1',
    authored: { kind: 'step', vectors: [[1, 1]], forward: true },
  },
  {
    axis: 'movement',
    kind: 'jump',
    host: 'piece',
    params: [{ testid: 'move-cell-1_2' }],
    path: 'movement.1',
    authored: { kind: 'jump', vectors: [[1, 2]] },
  },

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
    params: [{ testid: 'attack-kind-jump' }, { testid: 'attack-cell-2_0' }],
    path: 'attack',
    authored: [{ kind: 'jump', vectors: [[2, 0]] }],
  },
  { host: 'squareType', what: 'paired', params: [{ testid: 'editor-paired' }], path: 'paired', authored: true },
  { host: 'ruleCard', what: 'cost', params: [{ testid: 'editor-cost', value: '4' }], path: 'cost', authored: 4 },
  { host: 'skillCard', what: 'cost', params: [{ testid: 'editor-cost', value: '3' }], path: 'cost', authored: 3 },
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

function clickAll(testids: readonly string[] | undefined) {
  for (const testid of testids ?? []) {
    const el = screen.getByTestId(testid)
    // A disabled prerequisite silently no-ops and the row fails somewhere else
    // entirely, so it is checked here rather than diagnosed downstream.
    expectEnabled(el, testid)
    fireEvent.click(el)
  }
}

function applyParams(params: readonly Param[] | undefined) {
  for (const param of params ?? []) {
    const el = screen.getByTestId(param.testid)
    expectEnabled(el, param.testid)
    if (param.value === undefined) fireEvent.click(el)
    else fireEvent.change(el, { target: { value: param.value } })
  }
}

function readDraft(): unknown {
  return JSON.parse(screen.getByTestId('editor-draft-json').textContent ?? 'null')
}

function nameDraft(id: string, host: DraftKind) {
  fireEvent.change(screen.getByTestId('editor-id'), { target: { value: id } })
  fireEvent.change(screen.getByTestId('editor-nameKey'), { target: { value: `${id}.name` } })
  if (host !== 'board' && host !== 'preset') {
    fireEvent.change(screen.getByTestId('editor-textKey'), { target: { value: `${id}.text` } })
  }
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

  it('seeds a blank piece with exactly one starter pattern, which the movement rows index past', () => {
    // The movement rows assert `movement.1`, so the seed at index 0 is part of
    // the contract, not an accident of an implementation. Asserted here rather
    // than assumed there: a seed that silently changes shape would otherwise
    // shift every movement row's index and fail for the wrong reason, and a
    // seed nobody declared would ship a placeholder pattern on every piece an
    // author never opened the grid for.
    mount(sliceContentSource)
    fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })

    const blank = readDraft()
    expect(at(blank, 'movement')).toEqual([{ kind: 'step', vectors: [[0, 1]] }])
    // And it is visible in the grid, so the author can see and remove it.
    expect(screen.getByTestId('move-cell-0_1').getAttribute('data-on')).toBe('true')
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

      const testid = controlTestId(axis, kind)
      const button = screen.getByTestId(testid)
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
      applyParams(row.params)
      nameDraft(`${PREFIX[row.host]}.probe-${axis.toLowerCase()}-${kind.replace(/_/g, '-')}`, row.host)

      const authored = readDraft()
      expect(at(authored, row.path), `wrong value at ${row.path}; draft was ${JSON.stringify(authored)}`).toEqual(
        row.authored,
      )

      fireEvent.click(screen.getByTestId('editor-save'))
      expect(screen.queryByTestId('editor-errors')?.textContent ?? '', `saving ${key(axis, kind)} was rejected`).toBe('')
      expect(committed.value, 'save produced no content').not.toBeNull()

      const id = `${PREFIX[row.host]}.probe-${axis.toLowerCase()}-${kind.replace(/_/g, '-')}`
      expect(openDraft(committed.value!, row.host, id)).toEqual(authored)
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
      applyParams(row.params)
      const id = `${PREFIX[row.host]}.probe-${row.what.replace(/[^a-z]+/g, '-')}`
      nameDraft(id, row.host)

      const authored = readDraft()
      expect(at(authored, row.path), `wrong value at ${row.path}; draft was ${JSON.stringify(authored)}`).toEqual(
        row.authored,
      )

      fireEvent.click(screen.getByTestId('editor-save'))
      expect(screen.queryByTestId('editor-errors')?.textContent ?? '', `saving ${label} was rejected`).toBe('')
      expect(committed.value, 'save produced no content').not.toBeNull()
      expect(openDraft(committed.value!, row.host, id)).toEqual(authored)
    })
  })
})
