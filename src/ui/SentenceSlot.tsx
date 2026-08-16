import { type ReactNode, useState } from 'react'
import { controlsFor } from '@editor/controls'
import type { DraftKind, EditorContext } from '@editor/draft'
import {
  type Sentence,
  type SentenceAction,
  type SlotId,
  optionsFor,
  readSentence,
  takesDestination,
  targetKeysOf,
  targetCount,
  writeSentence,
} from './CardRecipe'
import { Sheet } from './Sheet'
import type { Translate } from './i18n'

/**
 * The sentence, as chips you tap (ADR-001).
 *
 * Each slot shows only its CURRENT value; tapping it opens the app's existing
 * bottom sheet with that slot's options and, underneath the chosen one, that
 * option's parameters (ADR-004). The alternative — every option inline — was
 * measured against the axes it has to hold: 12 actions and 7 targets per action,
 * twice over, plus 11 conditions twice. Laid out inline that is several screens
 * of buttons above a sentence you would have to scroll to read, and the sentence
 * being readable is the whole design.
 *
 * ## One interaction model, no exceptions
 *
 * Every slot is a chip and every chip opens a sheet, including the ones with a
 * single option (a skill card's trigger) and the optional ones. A slot that
 * behaved differently because its option list happened to be short would make
 * the child re-learn the control per row — the documented pitfall of
 * inconsistent disclosure.
 *
 * The two negations are the deliberate exception, and they are not slots: `not`
 * has no options to pick from, so it is a checkbox on the leaf it inverts.
 *
 * ## Recorded deviation from ADR-001
 *
 * ADR-001 says "pixel-art buttons". There is no sprite for a vocabulary entry —
 * `artRegistry` maps art ids for PIECES, SQUARES and CARDS, not for
 * `destroy_piece` — so options render as large labelled buttons instead. Drawing
 * 47 new sprites is a separate piece of work. What the sheet delivers regardless
 * is the tap target and the room for a parameter, which a `<select>` option has
 * neither of.
 *
 * ## Parameter test ids are `s-param-*`
 *
 * They were named that way because the indexed form rendered its own `param-*`
 * controls at the time, and two nodes sharing a test id makes every
 * `getByTestId` in the coverage gate ambiguous — it would have broken the gate in
 * the phase that had to keep it green. Phase 7 has since deleted those originals,
 * so the prefix is now only history; renaming it would be churn across the gate
 * for no behaviour, and the prefix still says "this control lives in a slot".
 */

type Draft = Record<string, unknown>

/** Actions whose effect can be told how long to last (schema v3). */
const DURATION_ACTIONS = new Set(['block_capture', 'grant_movement', 'forbid_movement'])

/** Which key of an action holds its destination. `promote_piece.to` is a piece id, not a place. */
const DESTINATION_SLOT: Readonly<Record<string, string>> = {
  teleport_piece: 'to',
  spawn_piece: 'at',
  revive_piece: 'at',
}

const GRID = [3, 2, 1, 0, -1, -2, -3]

/** The slots whose value can be cleared back to "not said". */
const OPTIONAL_SLOTS = new Set<SlotId>(['each', 'cond2', 'then2'])

const SLOT_LABEL: Readonly<Record<SlotId, string>> = {
  when: 'ui.editor.card.slot.when',
  each: 'ui.editor.card.slot.each',
  cond: 'ui.editor.card.slot.cond',
  not: 'ui.editor.card.slot.not',
  cond2: 'ui.editor.card.slot.cond2',
  not2: 'ui.editor.card.slot.not',
  op: 'ui.editor.card.slot.op',
  then: 'ui.editor.card.slot.then',
  who: 'ui.editor.card.slot.who',
  whoB: 'ui.editor.card.slot.whoB',
  where: 'ui.editor.card.slot.where',
  then2: 'ui.editor.card.slot.then2',
  who2: 'ui.editor.card.slot.who',
  who2B: 'ui.editor.card.slot.whoB',
  where2: 'ui.editor.card.slot.where',
}

/** Which vocabulary axis a slot's options come from, for labelling. */
const SLOT_AXIS: Readonly<Record<SlotId, string>> = {
  when: 'trigger',
  each: 'forEach',
  cond: 'condition',
  not: 'condition',
  cond2: 'condition',
  not2: 'condition',
  op: 'op',
  then: 'action',
  who: 'target',
  whoB: 'target',
  where: 'destination',
  then2: 'action',
  who2: 'target',
  who2B: 'target',
  where2: 'destination',
}

// --- addressing the draft ---------------------------------------------------

function effectOf(draft: Draft): Draft | undefined {
  const list = (draft.effects as Draft[] | undefined) ?? []
  return list.length === 1 ? list[0] : undefined
}

const unwrapNot = (value: Draft | undefined): Draft | undefined =>
  value && value.kind === 'not' ? (value.of as Draft | undefined) : value

/** The condition object a leaf slot addresses, with any `not` wrapper removed. */
function leafOf(draft: Draft, index: 0 | 1): Draft | undefined {
  const condition = effectOf(draft)?.condition as Draft | undefined
  if (condition === undefined) return undefined
  if (condition.kind === 'all' || condition.kind === 'any') {
    return unwrapNot(((condition.of as Draft[] | undefined) ?? [])[index])
  }
  return index === 0 ? unwrapNot(condition) : undefined
}

function actionOf(draft: Draft, index: 0 | 1): Draft | undefined {
  return ((effectOf(draft)?.actions as Draft[] | undefined) ?? [])[index]
}

/** `1` for the second action's slots, `0` otherwise. */
function slotIndex(slot: SlotId): 0 | 1 {
  return slot === 'cond2' || slot === 'not2' || slot === 'then2' || slot === 'who2' || slot === 'who2B' || slot === 'where2'
    ? 1
    : 0
}

export function SentenceEditor({
  draft,
  kind,
  ctx,
  t,
  pieceLabel,
  update,
}: {
  draft: Draft
  kind: DraftKind
  ctx: EditorContext
  t: Translate
  /** A piece's own name when it has one, never a bare key. */
  pieceLabel: (id: string) => string
  update: (mutate: (d: Draft) => void) => void
}) {
  const [open, setOpen] = useState<SlotId | null>(null)
  const sentence = readSentence(draft)
  if (sentence === null) return null

  const put = (slot: SlotId, value: string) =>
    update((d) => {
      d.effects = writeSentence(d, slot, value, ctx)
    })

  /** Mutates the object a param control addresses, or does nothing when absent. */
  const mutateAt = (resolve: (d: Draft) => Draft | undefined, mutate: (target: Draft) => void) =>
    update((d) => {
      const target = resolve(d)
      if (target !== undefined) mutate(target)
    })

  // --- parameter controls (ADR-004: inside the slot's sheet) ----------------

  const numberField = (testid: string, labelKey: string, value: unknown, apply: (n: number | null) => void) => (
    <label key={testid} className="slot-param">
      {t(labelKey)}
      <input
        type="number"
        data-testid={testid}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => apply(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )

  /**
   * Whose side, RELATIVE — never named as a colour.
   *
   * Every schema enum this control writes is `mover` / `opponent`
   * (`piece_side`, `piece_count_at_most`, `forEach.side`, `spawn_piece.side`,
   * `revive_piece.side`, `win.side`), and those are roles resolved per event, not
   * players. This control was carried over from the indexed form labelling them
   * `ui.side.white` / `ui.side.black`, which resolve to the board's two fixed COLOUR
   * names. So a child picking the first colour to make that colour win authored
   * `side: 'mover'`, and at runtime the win went to whichever colour happened to
   * trigger the event that ply: the opposite side, half the time, with both values
   * schema-valid so nothing refused it.
   *
   * The vocabulary already had the relative phrasing for the same idea —
   * `ui.editor.vocab.target.mover` names the side that moved — so the labels now come
   * from `ui.editor.vocab.side.*`, which say the role. The absolute keys keep their
   * one correct home: the board painter's `place-side`, whose values really are
   * `white` / `black`.
   */
  const sideSelect = (testid: string, value: unknown, apply: (s: string) => void, withAny = false) => (
    <label key={testid} className="slot-param">
      {t('ui.editor.param.side')}
      <select data-testid={testid} value={typeof value === 'string' ? value : ''} onChange={(e) => apply(e.target.value)}>
        <option value="">{t('ui.editor.board.none')}</option>
        <option value="mover">{t('ui.editor.vocab.side.mover')}</option>
        <option value="opponent">{t('ui.editor.vocab.side.opponent')}</option>
        {withAny && <option value="any">{t('ui.editor.param.any')}</option>}
      </select>
    </label>
  )

  const pieceSelect = (testid: string, value: unknown, apply: (id: string) => void) => (
    <label key={testid} className="slot-param">
      {t('ui.editor.param.pieceId')}
      <select data-testid={testid} value={typeof value === 'string' ? value : ''} onChange={(e) => apply(e.target.value)}>
        <option value="">{t('ui.editor.board.none')}</option>
        {ctx.pieceIds.map((id) => (
          <option key={id} value={id}>
            {pieceLabel(id)}
          </option>
        ))}
      </select>
    </label>
  )

  const toggleVector = (vectors: number[][], df: number, dr: number): number[][] => {
    const at = vectors.findIndex((v) => v[0] === df && v[1] === dr)
    if (at >= 0) return vectors.filter((_, i) => i !== at)
    return [...vectors, [df, dr]]
  }

  const vectorGrid = (prefix: string, vectors: number[][], onToggle: (df: number, dr: number) => void) => (
    <div className="vector-grid" role="group" key={prefix}>
      {GRID.map((dr) => (
        <div className="vector-row" key={dr}>
          {GRID.map((df) => {
            const lit = vectors.some((v) => v[0] === df && v[1] === dr)
            return (
              <button
                key={df}
                type="button"
                data-testid={`${prefix}-${df}_${dr}`}
                data-lit={lit}
                aria-pressed={lit}
                aria-label={`${df} ${dr}`}
                disabled={df === 0 && dr === 0}
                onClick={() => onToggle(df, dr)}
              />
            )
          })}
        </div>
      ))}
    </div>
  )

  /** The quantifier's own parameters: which piece, on which side. */
  function eachParams(): ReactNode[] {
    const forEach = effectOf(draft)?.forEach as Draft | undefined
    if (forEach === undefined) return []
    const at = (mutate: (f: Draft) => void) => mutateAt((d) => effectOf(d)?.forEach as Draft | undefined, mutate)
    return [
      pieceSelect('s-param-foreach-pieceId', forEach.pieceId, (id) =>
        at((f) => {
          f.pieceId = id
        }),
      ),
      sideSelect(
        's-param-foreach-side',
        forEach.side,
        (s) =>
          at((f) => {
            f.side = s
          }),
        true,
      ),
    ]
  }

  function condParams(slot: SlotId): ReactNode[] {
    const index = slotIndex(slot)
    const leaf = leafOf(draft, index)
    if (leaf === undefined) return []
    const k = String(leaf.kind)
    const suffix = index === 1 ? '2' : ''
    const at = (mutate: (c: Draft) => void) => mutateAt((d) => leafOf(d, index), mutate)
    const out: ReactNode[] = []

    if (k === 'piece_is' || k === 'piece_kind_count_at_most') {
      out.push(
        pieceSelect(`s-param-cond-pieceId${suffix}`, leaf.pieceId, (id) =>
          at((c) => {
            c.pieceId = id
          }),
        ),
      )
    }
    if (k === 'piece_side' || k === 'piece_count_at_most' || k === 'piece_kind_count_at_most') {
      out.push(
        sideSelect(`s-param-cond-side${suffix}`, leaf.side, (s) =>
          at((c) => {
            c.side = s
          }),
        ),
      )
    }
    if (k === 'check_count_at_least' || k === 'piece_count_at_most' || k === 'on_own_rank' || k === 'piece_kind_count_at_most') {
      out.push(
        numberField(`s-param-cond-n${suffix}`, 'ui.editor.param.n', leaf.n, (n) =>
          at((c) => {
            // The cleared-field fallback differs by condition: every other one
            // is `positive()` in the schema, so 1 is its floor, but the
            // kind-count is `nonnegative()` and 0 is the value it exists for —
            // snapping a cleared field up to 1 would quietly change "none left"
            // into "one left".
            c.n = n ?? (k === 'piece_kind_count_at_most' ? 0 : 1)
          }),
        ),
      )
    }
    if (k === 'on_square') {
      const chosen = (leaf.squares as string[] | undefined) ?? []
      out.push(
        <fieldset key="cond-squares" className="slot-param">
          <legend>{t('ui.editor.param.squares')}</legend>
          {ctx.squares.map((sq) => (
            <button
              key={sq}
              type="button"
              data-testid={`s-param-cond-square${suffix}-${sq}`}
              data-chosen={chosen.includes(sq)}
              aria-pressed={chosen.includes(sq)}
              onClick={() =>
                at((c) => {
                  const list = (c.squares as string[] | undefined) ?? []
                  const seen = list.indexOf(sq)
                  if (seen >= 0) list.splice(seen, 1)
                  else list.push(sq)
                  c.squares = list
                })
              }
            >
              {sq}
            </button>
          ))}
        </fieldset>,
      )
    }
    return out
  }

  function actionParams(slot: SlotId): ReactNode[] {
    const index = slotIndex(slot)
    const action = actionOf(draft, index)
    if (action === undefined) return []
    const k = String(action.kind)
    const suffix = index === 1 ? '2' : ''
    const at = (mutate: (a: Draft) => void) => mutateAt((d) => actionOf(d, index), mutate)
    const out: ReactNode[] = []

    if (DURATION_ACTIONS.has(k)) {
      out.push(
        numberField(`s-param-duration${suffix}`, 'ui.editor.param.duration', action.duration, (n) =>
          at((a) => {
            if (n === null) delete a.duration
            else a.duration = n
          }),
        ),
      )
    }
    if (k === 'freeze_piece') {
      out.push(
        numberField(`s-param-plies${suffix}`, 'ui.editor.param.plies', action.plies, (n) =>
          at((a) => {
            a.plies = n ?? 1
          }),
        ),
      )
    }
    if (k === 'promote_piece') {
      out.push(
        pieceSelect(`s-param-to${suffix}`, action.to, (id) =>
          at((a) => {
            a.to = id
          }),
        ),
      )
    }
    if (k === 'spawn_piece') {
      out.push(
        pieceSelect(`s-param-pieceId${suffix}`, action.pieceId, (id) =>
          at((a) => {
            a.pieceId = id
          }),
        ),
      )
    }
    if (k === 'spawn_piece' || k === 'revive_piece' || k === 'win') {
      out.push(
        sideSelect(`s-param-side${suffix}`, action.side, (s) =>
          at((a) => {
            a.side = s
          }),
        ),
      )
    }
    if (k === 'revive_piece') {
      const except = (action.except as string[] | undefined) ?? []
      out.push(
        <fieldset key="except" className="slot-param">
          <legend>{t('ui.editor.param.except')}</legend>
          {ctx.pieceIds.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`s-param-except${suffix}-${id}`}
              data-chosen={except.includes(id)}
              aria-pressed={except.includes(id)}
              onClick={() =>
                at((a) => {
                  const list = (a.except as string[] | undefined) ?? []
                  const seen = list.indexOf(id)
                  if (seen >= 0) list.splice(seen, 1)
                  else list.push(id)
                  if (list.length === 0) delete a.except
                  else a.except = list
                })
              }
            >
              {pieceLabel(id)}
            </button>
          ))}
        </fieldset>,
      )
    }
    if (k === 'grant_movement') {
      // The movement grid, inside the sheet (ADR-007). A granted pattern is a
      // pattern, so it gets the same picture of squares the piece maker uses
      // rather than a second way of saying the same thing.
      const pattern = (action.pattern as Draft | undefined) ?? {}
      out.push(
        <fieldset key="pattern" className="slot-param">
          <legend>{t('ui.editor.param.pattern')}</legend>
          {(['slide', 'step'] as const).map((pk) => (
            <button
              key={pk}
              type="button"
              data-testid={`s-param-pattern${suffix}-${pk}`}
              data-chosen={pattern.kind === pk}
              aria-pressed={pattern.kind === pk}
              onClick={() =>
                // Switching kind clears the vectors: a slide's squares rarely
                // mean the same thing as a step's, and reinterpreting them would
                // author a pattern nobody chose.
                at((a) => {
                  a.pattern = { kind: pk, vectors: [] }
                })
              }
            >
              {t(`ui.editor.vocab.movement.${pk}`)}
            </button>
          ))}
          {vectorGrid(`s-param-pattern${suffix}-cell`, (pattern.vectors as number[][] | undefined) ?? [], (df, dr) =>
            at((a) => {
              const p = a.pattern as Draft
              p.vectors = toggleVector((p.vectors as number[][] | undefined) ?? [], df, dr)
            }),
          )}
        </fieldset>,
      )
    }
    return out
  }

  function targetParams(slot: SlotId): ReactNode[] {
    const index = slotIndex(slot)
    const action = actionOf(draft, index)
    if (action === undefined) return []
    const keys = targetKeysOf(action)
    const key = keys[slot === 'who' || slot === 'who2' ? 0 : 1]
    if (key === undefined) return []
    const target = action[key] as Draft | undefined
    if (target === undefined || (target.kind !== 'chosen_friendly' && target.kind !== 'chosen_enemy')) return []
    const at = (mutate: (value: Draft) => void) =>
      mutateAt((d) => actionOf(d, index)?.[key] as Draft | undefined, mutate)

    const filterControls = controlsFor('targetFilter').filter((control) => control.hosts.includes(kind))
    const relationControls = controlsFor('relation').filter((control) => control.hosts.includes(kind))
    const out: ReactNode[] = []
    if (filterControls.length > 0) {
      out.push(
        <fieldset key="target-filter" className="slot-param">
          <legend>{t('ui.editor.param.target-filter')}</legend>
          {filterControls.map((control) => {
            const chosen = (target.filter as Draft | undefined)?.kind === control.kind
            return (
              <button
                key={control.testid}
                type="button"
                data-testid={control.testid}
                data-chosen={chosen}
                aria-pressed={chosen}
                onClick={() =>
                  at((value) => {
                    value.filter = control.make(ctx, value.filter)
                  })
                }
              >
                {t(`ui.editor.vocab.targetFilter.${control.kind}`)}
              </button>
            )
          })}
        </fieldset>,
      )
    }
    if (relationControls.length > 0) {
      out.push(
        <fieldset key="target-relation" className="slot-param">
          <legend>{t('ui.editor.param.relation')}</legend>
          {relationControls.map((control) => {
            const chosen = (target.relation as Draft | undefined)?.kind === control.kind
            return (
              <button
                key={control.testid}
                type="button"
                data-testid={control.testid}
                data-chosen={chosen}
                aria-pressed={chosen}
                onClick={() =>
                  at((value) => {
                    value.relation = control.make(ctx, value.relation)
                  })
                }
              >
                {t(`ui.editor.vocab.relation.${control.kind}`)}
              </button>
            )
          })}
        </fieldset>,
      )
    }
    return out
  }

  function destParams(slot: SlotId): ReactNode[] {
    const index = slotIndex(slot)
    const action = actionOf(draft, index)
    if (action === undefined) return []
    const key = DESTINATION_SLOT[String(action.kind)]
    if (key === undefined) return []
    const dest = action[key] as Draft | undefined
    if (dest === undefined) return []
    const suffix = index === 1 ? '2' : ''
    const at = (mutate: (d: Draft) => void) =>
      mutateAt((d) => actionOf(d, index)?.[key] as Draft | undefined, mutate)
    const out: ReactNode[] = []

    if (dest.kind === 'chosen_empty') {
      const regionControls = controlsFor('destinationRegion').filter((control) => control.hosts.includes(kind))
      out.push(
        <fieldset key="destination-region" className="slot-param">
          <legend>{t('ui.editor.param.destination-region')}</legend>
          {regionControls.map((control) => {
            const chosen = dest.region === control.kind
            return (
              <button
                key={control.testid}
                type="button"
                data-testid={control.testid}
                data-chosen={chosen}
                aria-pressed={chosen}
                onClick={() =>
                  at((value) => {
                    value.region = control.make(ctx, value.region)
                  })
                }
              >
                {t(`ui.editor.vocab.destinationRegion.${control.kind}`)}
              </button>
            )
          })}
        </fieldset>,
      )
    }

    if (dest.kind === 'square') {
      out.push(
        <label key="square" className="slot-param">
          {t('ui.editor.param.square')}
          <select
            data-testid={`s-param-square${suffix}`}
            value={String(dest.square ?? '')}
            onChange={(e) =>
              at((d) => {
                d.square = e.target.value
              })
            }
          >
            {ctx.squares.map((sq) => (
              <option key={sq} value={sq}>
                {sq}
              </option>
            ))}
          </select>
        </label>,
      )
    }
    if (dest.kind === 'offset') {
      out.push(
        numberField(`s-param-df${suffix}`, 'ui.editor.param.df', dest.df, (n) =>
          at((d) => {
            d.df = n ?? 0
          }),
        ),
        numberField(`s-param-dr${suffix}`, 'ui.editor.param.dr', dest.dr, (n) =>
          at((d) => {
            d.dr = n ?? 0
          }),
        ),
        <label key="forward" className="slot-param">
          {t('ui.editor.param.forward')}
          <input
            type="checkbox"
            data-testid={`s-param-offset-forward${suffix}`}
            checked={dest.forward === true}
            onChange={() =>
              at((d) => {
                if (d.forward === true) delete d.forward
                else d.forward = true
              })
            }
          />
        </label>,
      )
    }
    return out
  }

  function paramsFor(slot: SlotId): ReactNode[] {
    switch (slot) {
      case 'each':
        return eachParams()
      case 'cond':
      case 'cond2':
        return condParams(slot)
      case 'then':
      case 'then2':
        return actionParams(slot)
      case 'who':
      case 'whoB':
      case 'who2':
      case 'who2B':
        return targetParams(slot)
      case 'where':
      case 'where2':
        return destParams(slot)
      default:
        return []
    }
  }

  // --- the rows -------------------------------------------------------------

  interface Row {
    slot: SlotId
    value: string
    /** Rendered beside the chip rather than in a sheet — a toggle has no options. */
    toggle?: { on: boolean; slot: SlotId }
  }

  const actionRows = (action: SentenceAction | undefined, index: 0 | 1): Row[] => {
    const kindSlot: SlotId = index === 0 ? 'then' : 'then2'
    const rows: Row[] = [{ slot: kindSlot, value: action?.kind ?? '' }]
    if (action === undefined || action.kind === '') return rows
    const targets = targetCount(action.kind, ctx)
    if (targets > 0) rows.push({ slot: index === 0 ? 'who' : 'who2', value: action.targets[0] ?? '' })
    if (targets > 1) rows.push({ slot: index === 0 ? 'whoB' : 'who2B', value: action.targets[1] ?? '' })
    if (takesDestination(action.kind, ctx)) {
      rows.push({ slot: index === 0 ? 'where' : 'where2', value: action.dest })
    }
    return rows
  }

  const rows: Row[] = [
    { slot: 'when', value: sentence.when },
    { slot: 'each', value: sentence.each },
    { slot: 'cond', value: sentence.cond[0]?.kind ?? '', toggle: { on: sentence.cond[0]?.not === true, slot: 'not' } },
    // The second leaf's negation appears only once there IS a second leaf; a
    // toggle for a clause that is not on screen inverts nothing.
    sentence.cond.length > 1
      ? { slot: 'cond2' as SlotId, value: sentence.cond[1]?.kind ?? '', toggle: { on: sentence.cond[1]?.not === true, slot: 'not2' as SlotId } }
      : { slot: 'cond2' as SlotId, value: '' },
    ...(sentence.cond.length > 1 ? [{ slot: 'op' as SlotId, value: sentence.op }] : []),
    ...actionRows(sentence.actions[0], 0),
    ...actionRows(sentence.actions[1], 1),
  ]

  const optionLabel = (slot: SlotId, value: string) =>
    value === '' ? t('ui.editor.card.slot.pick') : t(`ui.editor.vocab.${SLOT_AXIS[slot]}.${value}`)

  return (
    <fieldset className="sentence" data-testid="editor-sentence">
      <legend>{t('ui.editor.card.recipe')}</legend>
      <p className="hint">{t('ui.editor.card.sentence-hint')}</p>

      {rows.map((row) => (
        <div className="sentence-row" key={row.slot} data-slot={row.slot}>
          <span className="sentence-label">{t(SLOT_LABEL[row.slot])}</span>
          <button
            type="button"
            className="slot-chip"
            data-testid={`slot-${row.slot}`}
            data-empty={row.value === ''}
            aria-haspopup="dialog"
            onClick={() => setOpen(row.slot)}
          >
            {optionLabel(row.slot, row.value)}
          </button>
          {row.toggle && (
            <label className="slot-toggle">
              {t('ui.editor.card.slot.not')}
              <input
                type="checkbox"
                data-testid={`slot-${row.toggle.slot}`}
                checked={row.toggle.on}
                onChange={() => put(row.toggle!.slot, row.toggle!.on ? '' : 'on')}
              />
            </label>
          )}
        </div>
      ))}

      <div className="note-box">
        <span className="kicker">{t('ui.editor.card.reads-as')}</span>
        <p data-testid="sentence-text">
          {sentenceText(t, sentence, kind) || t('ui.editor.card.sentence-incomplete')}
        </p>
      </div>

      {open !== null && (
        <Sheet label={t(SLOT_LABEL[open])} onClose={() => setOpen(null)} scrimTestId={`slot-sheet-${open}`}>
          <div className="sheet-head">
            <strong>{t(SLOT_LABEL[open])}</strong>
          </div>
          <div className="slot-options">
            {OPTIONAL_SLOTS.has(open) && (
              <button
                type="button"
                data-testid={`opt-${open}-none`}
                onClick={() => {
                  put(open, '')
                  setOpen(null)
                }}
              >
                {t('ui.editor.card.slot.none')}
              </button>
            )}
            {optionsFor(open, kind).map((option) => (
              <button
                key={option}
                type="button"
                data-testid={`opt-${open}-${option}`}
                data-chosen={rows.find((r) => r.slot === open)?.value === option}
                aria-pressed={rows.find((r) => r.slot === open)?.value === option}
                onClick={() => put(open, option)}
              >
                {t(`ui.editor.vocab.${SLOT_AXIS[open]}.${option}`)}
              </button>
            ))}
          </div>
          {/* The chosen option's own settings, under it rather than in the
              sentence — a clause with a number input inside stops reading as
              language (ADR-004). */}
          <div className="slot-params" data-testid={`slot-params-${open}`}>
            {paramsFor(open)}
          </div>
        </Sheet>
      )}
    </fieldset>
  )
}

/**
 * What a record DOES, as one line per effect — the read-only path (AC-007).
 *
 * A record the sentence cannot edit is still a record the child chose to open,
 * and "this was made somewhere else" tells them nothing about what they have.
 * Each effect is projected into a single-effect record and rendered through the
 * same formatter the editor uses, so the description cannot drift from the
 * editable view: whatever a sentence would say about that effect is what this
 * says about it.
 *
 * A line the formatter cannot produce — an effect that is itself unshowable, e.g.
 * three actions — degrades to a named placeholder rather than an empty string, so
 * the count of lines always equals the count of effects. Silence would read as
 * "this record does nothing".
 */
export function describeRecord(t: Translate, draft: Draft, host: DraftKind): string[] {
  const effects = (draft.effects as Draft[] | undefined) ?? []
  return effects.map((effect) => {
    const sentence = readSentence({ effects: [effect] })
    if (sentence === null) return t('ui.editor.readonly.unknown')
    const text = sentenceText(t, sentence, host)
    return text === '' ? t('ui.editor.readonly.unknown') : text
  })
}

/**
 * The sentence, as words.
 *
 * Assembled from `ui.*` keys with `{…}` placeholders rather than concatenated
 * here, because Korean puts the verb last and an English-order join of fragments
 * produces something no child would read twice.
 */
export function sentenceText(t: Translate, sentence: Sentence, host: DraftKind): string {
  /**
   * An incomplete sentence has no readable form, so it returns '' rather than a
   * template with holes in it.
   *
   * Korean marks role with a particle attached to the noun, so an empty slot does
   * not leave a gap — it leaves the particle. A brand-new skill card rendered as a
   * line of two bare particles and a full stop, with no words at all. The caller shows
   * "nothing decided yet" instead, which is true and readable, and the live
   * validator is what says which slot is still missing.
   *
   * A verb is the minimum: no action, no sentence. A trigger is required too for
   * every host but a skill card, whose one trigger the template does not print.
   */
  if (sentence.actions.length === 0) return ''
  if (host !== 'skillCard' && sentence.when === '') return ''

  const label = (axis: string, kind: string) => (kind === '' ? '' : t(`ui.editor.vocab.${axis}.${kind}`))

  const leaf = (index: number) => {
    const entry = sentence.cond[index]
    if (entry === undefined) return ''
    const words = label('condition', entry.kind)
    return entry.not ? t('ui.editor.card.line.not').replace('{cond}', words) : words
  }

  const cond =
    sentence.cond.length < 2
      ? leaf(0)
      : t(sentence.op === 'any' ? 'ui.editor.card.line.any' : 'ui.editor.card.line.all')
          .replace('{a}', leaf(0))
          .replace('{b}', leaf(1))

  /**
   * One action, as a clause.
   *
   * Four keys rather than one with optional placeholders, because Korean marks
   * grammatical role with a particle attached to the noun. A clause template of
   * the form "{who}<object-particle> {where}<destination-particle> {then}" leaves
   * that destination particle dangling when `{where}` resolves to nothing, and no
   * amount of whitespace collapsing removes it. The shape is chosen by the
   * action's arity instead, so every rendered clause is a whole fragment.
   */
  const clause = (action: SentenceAction) => {
    const then = label('action', action.kind)
    if (then === '') return ''
    const who = label('target', action.targets[0] ?? '')
    const whoB = label('target', action.targets[1] ?? '')
    const where = label('destination', action.dest)

    const key =
      action.targets.length === 0
        ? 'ui.editor.card.line.clause-bare'
        : action.targets.length > 1
          ? 'ui.editor.card.line.clause-two'
          : where === ''
            ? 'ui.editor.card.line.clause'
            : 'ui.editor.card.line.clause-dest'

    return t(key)
      .replace('{whoB}', whoB)
      .replace('{who}', who)
      .replace('{where}', where)
      .replace('{then}', then)
      .replace(/\s+/g, ' ')
      .trim()
  }

  const body = sentence.actions
    .map(clause)
    .filter((text) => text !== '')
    .join(t('ui.editor.card.line.and'))

  return t(host === 'skillCard' ? 'ui.editor.card.line.skill' : 'ui.editor.card.line.rule')
    .replace('{when}', label('trigger', sentence.when))
    .replace('{each}', sentence.each === '' ? '' : t('ui.editor.card.line.each'))
    .replace('{cond}', cond)
    .replace('{body}', body)
    .replace(/\s+/g, ' ')
    .trim()
}
