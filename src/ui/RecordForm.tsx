import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import type { ContentStrings } from '@content/schema'
import { type DraftKind, blankDraft, commitDraft, editorContext, openDraft } from '@editor/draft'
import { type VocabularyControl, controlsFor } from '@editor/controls'
import { type StringField, clearString, deriveKey, readString, rekeyStrings, writeString } from '@editor/strings'
import { DEFAULT_LOCALE, makeTranslate, useTranslate } from './i18n'
import { resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'
import { PIXEL_SPRITES, isSpriteName } from './art/pixels'
import { Pix } from './art/Pix'
import { Cell, GRID_RANGE, type PieceGrid, cycle, describeGrid, readGrid, writeGrid } from './PieceMoves'
import { type SlotId, optionsFor, readRecipe, recipeSentence, takesTarget, writeRecipe } from './CardRecipe'
import { RecordGrade } from './RecordGrade'

/**
 * One content record, open for editing (PLAN Phase 9a).
 *
 * This is `Edit.tsx`'s Phase 5 body, moved rather than rewritten. That is a
 * deliberate constraint and it has a check: the ADR-006 vocabulary-coverage
 * gate mounts the editor and drives these controls by test id, and it passes
 * UNCHANGED across this phase. Controls were RE-GROUPED — browse moved out to
 * the library, transfer moved up to the shell, the room's own fields moved to
 * `RoomDetail` — and nothing in the vocabulary palette was re-authored.
 *
 * Three things this phase adds:
 *
 * 1. **The child types a name, not a key** (ADR-020). `editor-name` writes the
 *    Korean text into the document's `strings` overlay and derives the record's
 *    `nameKey` from its id. The raw key fields survive under the advanced
 *    disclosure (`ui.editor.form.advanced`) because
 *    an author who imported someone else's set may need them, and because the
 *    ADR-006 gate authors through them.
 *
 * 2. **The opened id is threaded into `commitDraft`** (R10). Without it a
 *    changed id APPENDS a second record and orphans the first; with it the save
 *    replaces, and `rekeyStrings` carries the text across.
 *
 * 3. **The record's own key fields are re-derived on a rename.** Phase 8 moved
 *    the OVERLAY's keys; nothing moved the `nameKey` stored on the record, so a
 *    renamed piece kept pointing at text that had just moved out from under it
 *    and rendered a dotted key on every square it stood on. The overlay half
 *    passed its unit test the whole time — this is the wiring that half needed.
 */

type Draft = Record<string, unknown>

const EFFECT_BEARING: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']

/** Which key of an action holds a destination. `promote_piece.to` is a piece id, not one. */
const DESTINATION_SLOT: Record<string, string> = {
  teleport_piece: 'to',
  spawn_piece: 'at',
  revive_piece: 'at',
}

const DURATION_ACTIONS = new Set(['block_capture', 'grant_movement', 'forbid_movement'])

const GRID = [3, 2, 1, 0, -1, -2, -3]

/** Records whose schema carries a `textKey`. Boards and rooms have a name only. */
const HAS_TEXT: readonly DraftKind[] = ['piece', 'squareType', 'ruleCard', 'skillCard']

/** Does anything OTHER than this document answer for `key`? */
function bundleResolves(key: string): boolean {
  return makeTranslate()(key) !== key
}

interface TextSlot {
  field: StringField
  slot: 'nameKey' | 'textKey'
  typed: boolean
  value: string
  active: boolean
}

type FoldResult =
  | { ok: true; strings: ContentStrings | undefined }
  | { ok: false; slot: string }

/**
 * Folds what the author typed into the document's overlay.
 *
 * Two rules, and both exist because a save used to conflate three different
 * intentions into one condition (`value !== ''`):
 *
 * 1. **Only a field the author TYPED IN is written.** Otherwise editing the raw
 *    key under the advanced disclosure also re-writes the old text at the new
 *    key, clobbering whatever every other record sharing that key was saying.
 * 2. **Clearing a field means "un-say it", and un-saying is not always
 *    available.** The overlay cannot hold an empty string (`z.string().min(1)`),
 *    so the entry is DROPPED — which for a shipped record is exactly the undo
 *    the author wanted, since the bundle answers again. For a record the author
 *    invented there is nothing underneath, and dropping would paint the dotted
 *    key across the board. That save is refused, with the field named.
 */
function foldText(
  strings: ContentStrings | undefined,
  next: Record<string, unknown>,
  id: string,
  slots: readonly TextSlot[],
): FoldResult {
  let out = strings
  for (const s of slots) {
    if (!s.active || !s.typed) continue
    const key = slotFor(next[s.slot], id, s.field)
    const value = s.value.trim()
    if (value !== '') {
      next[s.slot] = key
      out = writeString(out, DEFAULT_LOCALE, key, value)
      continue
    }
    if (!bundleResolves(key)) return { ok: false, slot: s.slot }
    next[s.slot] = key
    out = clearString(out, DEFAULT_LOCALE, key)
  }
  return { ok: true, strings: out }
}

/**
 * Everything about a record this form is responsible for not clobbering.
 *
 * The record AND the text it resolves to, because those live in two different
 * places in the document. The first version of this guard compared only the
 * record and was defeated by the very case it was written for: an import that
 * changes a name changes the `strings` OVERLAY, while the record — which
 * carries only the KEY — is byte-identical. It refused nothing and the test
 * that named the scenario is what found it.
 */
export interface RecordSnapshot {
  record: unknown
  name: string
  text: string
}

export function snapshotOf(source: ContentSource, kind: DraftKind, id: string | null): RecordSnapshot {
  const record = id ? openDraft(source, kind, id) : null
  return {
    record: record ?? null,
    name: readString(source.strings, DEFAULT_LOCALE, String(record?.nameKey ?? '')) ?? '',
    text: readString(source.strings, DEFAULT_LOCALE, String(record?.textKey ?? '')) ?? '',
  }
}

export function sameSnapshot(a: RecordSnapshot, b: RecordSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Where a record's typed text is stored.
 *
 * The record's OWN key when it has one, and a derived `<id>.<field>` only when
 * it does not. Deriving unconditionally looks tidier and is wrong twice:
 *
 * - A shipped record already keys its text `<its id>.name`, and writing the
 *   overlay at that key is precisely what lets a child RENAME a bundled record
 *   (ADR-020) rather than shadow it from a parallel namespace.
 * - An imported set may key its text anywhere at all. Re-deriving would point
 *   the record at a fresh key and leave the author's original entry stranded in
 *   the overlay — text that is still in the document and reachable by nothing.
 *
 * On a rename the caller has already moved the record's key onto the new id, so
 * "its own key" is the new one by the time this is asked.
 */
function slotFor(current: unknown, id: string, field: StringField): string {
  return typeof current === 'string' && current !== '' ? current : deriveKey(id, field)
}

export function RecordForm({
  source,
  kind,
  initialId,
  commit,
  onDirtyChange,
  onOpenedIdChange,
  errors,
  setErrors,
}: {
  source: ContentSource
  kind: DraftKind
  /** The record this form opened on, or null for a blank one. */
  initialId: string | null
  commit: (next: ContentSource) => void
  /**
   * Whether this form holds unsaved work. Reported in BOTH directions: an edit
   * raises it and a successful save clears it. A one-way latch would leave the
   * shell asking "discard unsaved work?" about a form that has none.
   */
  onDirtyChange?: (dirty: boolean) => void
  /**
   * The id this form is responsible for, reported whenever it changes.
   *
   * The shell cannot derive it: a save made INSIDE the form moves `openedId`
   * (a new record gets one, a rename changes it) and the shell's own
   * `library.id` is set only by navigation. Anything the shell decides from
   * that lagging value — including whether a delete should close this form —
   * is deciding from a stale fact.
   */
  onOpenedIdChange?: (id: string | null) => void
  errors: ValidationError[]
  setErrors: (errors: ValidationError[]) => void

}) {
  const t = useTranslate()

  // Read ONCE, at mount. The caller remounts (via `key`) to open a different
  // record, so there is no prop-to-state sync to get wrong — and a save that
  // rewrites `source` cannot yank the buffer out from under a half-typed edit.
  const [draft, setDraft] = useState<Draft>(() => (initialId ? (openDraft(source, kind, initialId) ?? blankDraft(kind)) : blankDraft(kind)))
  /**
   * WHICH record a save replaces. Tracks the id the form is currently
   * responsible for — the one it opened on, and after a rename, the new one.
   * Never falls back to the draft's own id: that fallback is the data-loss bug
   * `commitDraft` documents.
   */
  const [openedId, setOpenedId] = useState<string | null>(initialId)
  /**
   * The record as it looked when this form opened, kept so a save can tell
   * whether the document moved underneath it (Phase 9a review, P0).
   *
   * `openedId` alone is not enough. The form snapshots its draft at mount but
   * reads `source` LIVE at save time, and nothing remounts it when the document
   * is replaced — so after an import (or after the other panel edited the same
   * record) `commitDraft` matches the stale `openedId` against the NEW list and
   * overwrites a record this form never saw, reporting success. The export →
   * edit → re-import round trip is exactly the flow the transfer controls exist
   * for, which is what made it reachable rather than theoretical.
   *
   * Compared rather than remounted-away: remounting on every document change
   * would throw away a half-typed edit the author is in the middle of, which
   * trades one silent loss for another. Refusing the save keeps the buffer and
   * hands the decision back.
   */
  const [openedSnapshot, setOpenedSnapshot] = useState<RecordSnapshot>(() => snapshotOf(source, kind, initialId))

  // The visible fields start from the same snapshot the guard compares against,
  // so "what the author saw" and "what the guard defends" cannot drift apart.
  const [nameText, setNameText] = useState(openedSnapshot.name)
  const [bodyText, setBodyText] = useState(openedSnapshot.text)
  /**
   * Whether the author actually typed in the two visible text fields.
   *
   * A save used to write the overlay whenever the field was non-empty, which
   * conflates "this is the text" with "I am setting this text" — and the two
   * come apart the moment the author edits the raw KEY under the advanced
   * disclosure instead. There the field still holds the text resolved through
   * the OLD key, so a save re-pointed the record AND wrote that old text over
   * whatever already lived at the destination key, globally, for every record
   * sharing it. Writing only what was typed is the difference.
   */
  const [nameTyped, setNameTyped] = useState(false)
  const [textTyped, setTextTyped] = useState(false)

  const [effectIndex, setEffectIndex] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [patternIndex, setPatternIndex] = useState(0)
  const [attackIndex, setAttackIndex] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  const [paintType, setPaintType] = useState('')
  const [pendingPair, setPendingPair] = useState<string | null>(null)
  const [pairHint, setPairHint] = useState(false)
  const [placePiece, setPlacePiece] = useState('')
  const [placeSide, setPlaceSide] = useState<'white' | 'black'>('white')

  const ctx = useMemo(() => editorContext(source), [source])

  const pairedTypes = useMemo(
    () =>
      new Set(
        source.squareTypes
          .filter((ty) => (ty as { paired?: unknown }).paired === true)
          .map((ty) => String((ty as { id: string }).id)),
      ),
    [source],
  )

  /** Every mutation goes through a clone, so no state object is ever edited in place. */
  const update = (mutate: (d: Draft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    setSaved(null)
    onDirtyChange?.(true)
  }

  const effects = (d: Draft) => (d.effects as Draft[] | undefined) ?? []
  const effect = (d: Draft) => effects(d)[effectIndex]
  const actions = (d: Draft) => (effect(d)?.actions as Draft[] | undefined) ?? []
  const currentEffect = effect(draft)
  const currentAction = actions(draft)[actionIndex]
  const currentCondition = currentEffect?.condition as Draft | undefined
  const patterns = (draft.movement as Draft[] | undefined) ?? []
  const currentPattern = patterns[patternIndex]
  const attacks = (draft.attack as Draft[] | undefined) ?? []

  // --- field-anchored validation (#25) --------------------------------------

  /**
   * The error belonging to one field of THIS record, or none.
   *
   * A list of `presets.preset.foo.pieceIds — array must contain at least 1
   * element` under the save button is a sentence about a document format. The
   * same error rendered beside the control the author was last touching is a
   * sentence about what they just did — so the list stays (the shell renders
   * it) and this puts a copy where the eye already is.
   */
  const errorFor = (field: string): ValidationError | undefined =>
    errors.find((e) => e.path === field || e.path.endsWith(`.${field}`))

  const fieldError = (field: string) => {
    const found = errorFor(field)
    if (!found) return null
    return (
      <p className="field-error" data-testid={`editor-field-error-${field}`}>
        {found.message}
      </p>
    )
  }

  // --- vocabulary palette ---------------------------------------------------

  const applyControl = (control: VocabularyControl) => {
    update((d) => {
      switch (control.axis) {
        case 'trigger': {
          const e = effect(d)
          if (e) e.trigger = control.make(ctx)
          break
        }
        case 'condition': {
          const e = effect(d)
          if (e) e.condition = control.make(ctx, e.condition)
          break
        }
        case 'forEach': {
          const e = effect(d)
          if (e) e.forEach = control.make(ctx)
          break
        }
        case 'action': {
          const e = effect(d)
          if (!e) break
          const list = (e.actions as Draft[] | undefined) ?? []
          list.push(control.make(ctx) as Draft)
          e.actions = list
          break
        }
        case 'target': {
          const a = actions(d)[actionIndex]
          if (a && 'target' in a) a.target = control.make(ctx)
          break
        }
        case 'destination': {
          const a = actions(d)[actionIndex]
          const slot = a ? DESTINATION_SLOT[String(a.kind)] : undefined
          if (a && slot) a[slot] = control.make(ctx)
          break
        }
        case 'movement': {
          const list = (d.movement as Draft[] | undefined) ?? []
          list.push(control.make(ctx) as Draft)
          d.movement = list
          break
        }
      }
    })
    // Selection moves outside the state updater: an updater that also sets
    // other state is not pure, and React may run it twice.
    if (control.axis === 'action') setActionIndex(actions(draft).length)
    if (control.axis === 'movement') setPatternIndex(patterns.length)
  }

  const controlEnabled = (control: VocabularyControl): boolean => {
    if (!control.hosts.includes(kind)) return false
    if (control.axis === 'movement') return true
    if (!currentEffect) return false
    if (control.axis === 'target') return currentAction !== undefined && 'target' in currentAction
    if (control.axis === 'destination') {
      return currentAction !== undefined && DESTINATION_SLOT[String(currentAction.kind)] !== undefined
    }
    if (control.axis === 'action') return true
    return true
  }

  const palette = (axis: VocabularyControl['axis'], labelKey: string) => (
    <fieldset>
      <legend>{t(labelKey)}</legend>
      {controlsFor(axis).map((control) => (
        <button
          key={control.testid}
          type="button"
          data-testid={control.testid}
          disabled={!controlEnabled(control)}
          onClick={() => applyControl(control)}
        >
          {t(`ui.editor.vocab.${control.axis}.${control.kind}`)}
        </button>
      ))}
    </fieldset>
  )

  // --- parameter controls ---------------------------------------------------

  const setInAction = (mutate: (a: Draft) => void) =>
    update((d) => {
      const a = actions(d)[actionIndex]
      if (a) mutate(a)
    })

  const setInCondition = (mutate: (c: Draft) => void) =>
    update((d) => {
      const e = effect(d)
      if (e?.condition) mutate(e.condition as Draft)
    })

  const numberField = (testid: string, labelKey: string, value: unknown, apply: (n: number | null) => void) => (
    <label key={testid}>
      {t(labelKey)}
      <input
        type="number"
        data-testid={testid}
        value={typeof value === 'number' ? String(value) : ''}
        onChange={(e) => apply(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )

  const sideSelect = (testid: string, value: unknown, apply: (s: string) => void, withAny = false) => (
    <label key={testid}>
      {t('ui.editor.param.side')}
      <select data-testid={testid} value={typeof value === 'string' ? value : ''} onChange={(e) => apply(e.target.value)}>
        <option value="">{t('ui.editor.board.none')}</option>
        <option value="mover">{t('ui.side.white')}</option>
        <option value="opponent">{t('ui.side.black')}</option>
        {withAny && <option value="any">{t('ui.editor.param.any')}</option>}
      </select>
    </label>
  )

  /** A record's own name if it has one, otherwise its id — never a bare key. */
  const label = (id: string, nameKey?: unknown): string => {
    if (typeof nameKey === 'string' && nameKey !== '') {
      const resolved = t(nameKey)
      if (resolved !== nameKey) return resolved
    }
    return id
  }

  const pieceLabel = (id: string) => {
    const found = source.pieces.find((p) => (p as { id?: unknown }).id === id) as { nameKey?: unknown } | undefined
    return label(id, found?.nameKey)
  }

  const pieceSelect = (testid: string, value: unknown, apply: (id: string) => void) => (
    <label key={testid}>
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

  const actionParams = () => {
    if (!currentAction) return null
    const k = String(currentAction.kind)
    const out: JSX.Element[] = []

    if (DURATION_ACTIONS.has(k)) {
      out.push(
        numberField('param-duration', 'ui.editor.param.duration', currentAction.duration, (n) =>
          setInAction((a) => {
            if (n === null) delete a.duration
            else a.duration = n
          }),
        ),
      )
    }
    if (k === 'freeze_piece') {
      out.push(
        numberField('param-plies', 'ui.editor.param.plies', currentAction.plies, (n) =>
          setInAction((a) => {
            a.plies = n ?? 1
          }),
        ),
      )
    }
    if (k === 'promote_piece') {
      out.push(
        pieceSelect('param-to', currentAction.to, (id) =>
          setInAction((a) => {
            a.to = id
          }),
        ),
      )
    }
    if (k === 'spawn_piece') {
      out.push(
        pieceSelect('param-pieceId', currentAction.pieceId, (id) =>
          setInAction((a) => {
            a.pieceId = id
          }),
        ),
      )
    }
    if (k === 'spawn_piece' || k === 'revive_piece' || k === 'win') {
      out.push(
        sideSelect('param-side', currentAction.side, (s) =>
          setInAction((a) => {
            a.side = s
          }),
        ),
      )
    }
    if (k === 'revive_piece') {
      out.push(
        <fieldset key="except">
          <legend>{t('ui.editor.param.except')}</legend>
          {ctx.pieceIds.map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`param-except-${id}`}
              onClick={() =>
                setInAction((a) => {
                  const list = (a.except as string[] | undefined) ?? []
                  const at = list.indexOf(id)
                  if (at >= 0) list.splice(at, 1)
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
      const pattern = (currentAction.pattern as Draft | undefined) ?? {}
      out.push(
        <fieldset key="pattern">
          <legend>{t('ui.editor.param.pattern')}</legend>
          {(['slide', 'step', 'jump'] as const).map((pk) => (
            <button
              key={pk}
              type="button"
              data-testid={`param-pattern-${pk}`}
              onClick={() =>
                // Switching kind clears the vectors: a jump's squares rarely
                // mean the same thing as a slide's, and silently reinterpreting
                // them would author a pattern nobody chose.
                setInAction((a) => {
                  a.pattern = { kind: pk, vectors: [] }
                })
              }
            >
              {t(`ui.editor.vocab.movement.${pk}`)}
            </button>
          ))}
          {vectorGrid('param-pattern-cell', (pattern.vectors as number[][] | undefined) ?? [], (df, dr) =>
            setInAction((a) => {
              const p = a.pattern as Draft
              p.vectors = toggleVector((p.vectors as number[][] | undefined) ?? [], df, dr)
            }),
          )}
        </fieldset>,
      )
    }

    const slot = DESTINATION_SLOT[k]
    const dest = slot ? (currentAction[slot] as Draft | undefined) : undefined
    if (dest?.kind === 'square') {
      out.push(
        <label key="param-square">
          {t('ui.editor.param.square')}
          <select
            data-testid="param-square"
            value={String(dest.square ?? '')}
            onChange={(e) =>
              setInAction((a) => {
                ;(a[slot!] as Draft).square = e.target.value
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
    if (dest?.kind === 'offset') {
      out.push(
        numberField('param-df', 'ui.editor.param.df', dest.df, (n) =>
          setInAction((a) => {
            ;(a[slot!] as Draft).df = n ?? 0
          }),
        ),
        numberField('param-dr', 'ui.editor.param.dr', dest.dr, (n) =>
          setInAction((a) => {
            ;(a[slot!] as Draft).dr = n ?? 0
          }),
        ),
        <label key="param-offset-forward">
          {t('ui.editor.param.forward')}
          <input
            type="checkbox"
            data-testid="param-offset-forward"
            checked={dest.forward === true}
            onChange={() =>
              setInAction((a) => {
                const d = a[slot!] as Draft
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

  const conditionParams = () => {
    if (!currentCondition) return null
    const k = String(currentCondition.kind)
    const out: JSX.Element[] = []
    if (k === 'piece_is') {
      out.push(
        pieceSelect('param-cond-pieceId', currentCondition.pieceId, (id) =>
          setInCondition((c) => {
            c.pieceId = id
          }),
        ),
      )
    }
    if (k === 'piece_side' || k === 'piece_count_at_most') {
      out.push(
        sideSelect('param-cond-side', currentCondition.side, (s) =>
          setInCondition((c) => {
            c.side = s
          }),
        ),
      )
    }
    if (k === 'check_count_at_least' || k === 'piece_count_at_most' || k === 'on_own_rank') {
      out.push(
        numberField('param-cond-n', 'ui.editor.param.n', currentCondition.n, (n) =>
          setInCondition((c) => {
            c.n = n ?? 1
          }),
        ),
      )
    }
    if (k === 'on_square') {
      const chosen = (currentCondition.squares as string[] | undefined) ?? []
      out.push(
        <fieldset key="cond-squares">
          <legend>{t('ui.editor.param.squares')}</legend>
          {ctx.squares.map((sq) => (
            <button
              key={sq}
              type="button"
              data-testid={`param-cond-square-${sq}`}
              data-chosen={chosen.includes(sq)}
              onClick={() =>
                setInCondition((c) => {
                  const list = (c.squares as string[] | undefined) ?? []
                  const at = list.indexOf(sq)
                  if (at >= 0) list.splice(at, 1)
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

  // --- movement / attack grids ---------------------------------------------

  function toggleVector(vectors: number[][], df: number, dr: number): number[][] {
    const at = vectors.findIndex((v) => v[0] === df && v[1] === dr)
    if (at >= 0) return vectors.filter((_, i) => i !== at)
    return [...vectors, [df, dr]]
  }

  function vectorGrid(prefix: string, vectors: number[][], onToggle: (df: number, dr: number) => void) {
    return (
      <div className="vector-grid" role="group">
        {GRID.map((dr) => (
          <div key={dr} className="vector-row">
            {GRID.map((df) => df).map((df) =>
              df === 0 && dr === 0 ? (
                <span key={df} className="vector-origin">
                  ●
                </span>
              ) : (
                <button
                  key={df}
                  type="button"
                  data-testid={`${prefix}-${df}_${dr}`}
                  data-on={vectors.some((v) => v[0] === df && v[1] === dr)}
                  onClick={() => onToggle(df, dr)}
                >
                  {vectors.some((v) => v[0] === df && v[1] === dr) ? '×' : ''}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    )
  }

  // --- board painting -------------------------------------------------------

  const boardSquares = () => {
    const width = Number(draft.width ?? 6)
    const height = Number(draft.height ?? 6)
    const rows: string[][] = []
    for (let rank = height; rank >= 1; rank -= 1) {
      const row: string[] = []
      for (let file = 0; file < width; file += 1) row.push(`${String.fromCharCode(97 + file)}${rank}`)
      rows.push(row)
    }
    return rows
  }

  const paint = (square: string) => {
    if (!paintType) return
    if (pairedTypes.has(paintType)) {
      if (pendingPair === null) {
        setPendingPair(square)
        setPairHint(true)
        return
      }
      const partner = pendingPair
      setPendingPair(null)
      setPairHint(false)
      update((d) => {
        const list = (d.squares as Draft[] | undefined) ?? []
        const without = list.filter((s) => s.square !== partner && s.square !== square)
        without.push({ square: partner, typeId: paintType, pairedWith: square })
        without.push({ square, typeId: paintType, pairedWith: partner })
        d.squares = without
      })
      return
    }
    update((d) => {
      const list = (d.squares as Draft[] | undefined) ?? []
      const at = list.findIndex((s) => s.square === square)
      if (at >= 0 && list[at]!.typeId === paintType) list.splice(at, 1)
      else if (at >= 0) list[at] = { square, typeId: paintType }
      else list.push({ square, typeId: paintType })
      d.squares = list
    })
  }

  const place = (square: string) => {
    if (!placePiece) return
    update((d) => {
      const list = (d.placements as Draft[] | undefined) ?? []
      const at = list.findIndex((p) => p.square === square)
      if (at >= 0 && list[at]!.pieceId === placePiece && list[at]!.side === placeSide) list.splice(at, 1)
      else if (at >= 0) list[at] = { square, pieceId: placePiece, side: placeSide }
      else list.push({ square, pieceId: placePiece, side: placeSide })
      d.placements = list
    })
  }

  // --- room bundling (kept here so a room is still editable as a record) ----

  const toggleInList = (field: string, id: string) =>
    update((d) => {
      const list = (d[field] as string[] | undefined) ?? []
      const at = list.indexOf(id)
      if (at >= 0) list.splice(at, 1)
      else list.push(id)
      d[field] = list
    })

  const checkboxList = (field: string, legendKey: string, testidPrefix: string, entries: Array<[string, unknown]>) => (
    <fieldset>
      <legend>{t(legendKey)}</legend>
      {entries.map(([id, nameKey]) => (
        <label key={id}>
          <input
            type="checkbox"
            data-testid={`${testidPrefix}-${id}`}
            checked={((draft[field] as string[] | undefined) ?? []).includes(id)}
            onChange={() => toggleInList(field, id)}
          />
          {label(id, nameKey)}
        </label>
      ))}
      {fieldError(field)}
    </fieldset>
  )

  const named = (records: unknown[]): Array<[string, unknown]> =>
    records.map((r) => [String((r as { id?: unknown }).id ?? ''), (r as { nameKey?: unknown }).nameKey])

  // --- save -----------------------------------------------------------------

  /**
   * Folds the typed Korean text into the document and saves.
   *
   * The order matters and is the whole subtlety of a rename. The record's own
   * key fields are re-derived FIRST, then the overlay is re-keyed, and only
   * then is the new text written — so the freshly typed name lands on the key
   * the record now points at rather than on the one it just left.
   */
  /**
   * The record this form holds is no longer in the document.
   *
   * Deleted — from this panel or the other one, which stays mounted. The 9a
   * stale-snapshot guard already refuses the save, but it refuses it with a
   * message about the document moving, which is true of an import and misleading
   * about a deletion the child just performed. Saying so on the screen, at the
   * moment it becomes true, is the display half of the same rule.
   */
  const subjectDeleted = openedId !== null && openDraft(source, kind, openedId) === null

  const save = () => {
    if (subjectDeleted) {
      setErrors([{ contentId: openedId ?? '', path: '', message: t('ui.editor.form.deleted') }])
      setSaved(null)
      return
    }
    // The document must still be the one this form opened against. A record
    // that changed or vanished under an open form means the save would silently
    // discard someone else's write — including the author's own import.
    if (openedId !== null && !sameSnapshot(snapshotOf(source, kind, openedId), openedSnapshot)) {
      setErrors([{ contentId: openedId, path: '', message: t('ui.editor.form.stale') }])
      setSaved(null)
      return
    }

    const next = structuredClone(draft)
    const id = String(next.id ?? '')
    const renaming = openedId !== null && id !== '' && id !== openedId

    if (renaming) {
      for (const field of ['nameKey', 'textKey', 'iconKey']) {
        const value = next[field]
        if (typeof value === 'string' && value.startsWith(`${openedId}.`)) {
          next[field] = `${id}${value.slice(openedId!.length)}`
        }
      }
    }

    let strings = renaming ? rekeyStrings(source.strings, openedId!, id) : source.strings

    const folded = foldText(strings, next, id, [
      { field: 'name', slot: 'nameKey', typed: nameTyped, value: nameText, active: id !== '' },
      {
        field: 'text',
        slot: 'textKey',
        typed: textTyped,
        value: bodyText,
        active: id !== '' && HAS_TEXT.includes(kind),
      },
    ])
    if (!folded.ok) {
      setErrors([{ contentId: id, path: folded.slot, message: t('ui.editor.form.name-needed') }])
      setSaved(null)
      return
    }
    strings = folded.strings

    // Assigned only when there IS an overlay: `strings` is exactly-optional, so
    // writing `undefined` into it is a different document from omitting it.
    // Narrowed rather than spread blindly: `strings` is exactly-optional, so a
    // document with `strings: undefined` is a DIFFERENT document from one that
    // omits the field, and the schema tells the two apart.
    const base = strings !== undefined && strings !== source.strings ? { ...source, strings } : source

    const result = commitDraft(base, kind, next, openedId ?? undefined)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(null)
      return
    }
    setErrors([])
    setDraft(next)
    setOpenedId(id)
    onOpenedIdChange?.(id)
    // The snapshot moves forward with the save, or the NEXT save would compare
    // against a version this form itself superseded and refuse every time.
    setOpenedSnapshot(snapshotOf(result.source, kind, id))
    // The buffer is now what the document says, so nothing is pending.
    setNameTyped(false)
    setTextTyped(false)
    onDirtyChange?.(false)
    setSaved(id)
    commit(result.source)
  }

  /**
   * `anchor: false` for the two KEY fields under the advanced disclosure — an
   * error rendered
   * inside a collapsed `<details>` is an error nobody sees, so those two anchor
   * beside the name and description inputs the child actually used instead.
   * Rendering both would put two nodes under one test id, which is a broken
   * selector rather than redundancy.
   */
  const textField = (field: string, testid: string, labelKey: string, anchor = true) => (
    <label>
      {t(labelKey)}
      <input
        data-testid={testid}
        value={String(draft[field] ?? '')}
        onChange={(e) =>
          update((d) => {
            d[field] = e.target.value
          })
        }
      />
      {anchor && fieldError(field)}
    </label>
  )


  // --- the simple views (Chess Craft redesign) -------------------------------

  /**
   * Which surface this record renders on, and therefore which art it may point
   * at. A rule card offered a square's picture would render fine and be
   * legibility-checked against the wrong background — see `art-key.test.ts`.
   */
  const ART_SURFACE: Partial<Record<DraftKind, 'piece' | 'square' | 'card'>> = {
    piece: 'piece',
    squareType: 'square',
    ruleCard: 'card',
    skillCard: 'card',
  }

  /**
   * The mark this record shows, picked from the app's sprite sheet.
   *
   * Not a text field for the art id. The id is `art.homeward` and the picture is
   * a house — a child cannot map one to the other by reading, and there is no
   * reason to make them: the whole catalogue fits on one screen at 12 pixels a
   * side.
   */
  function artPicker() {
    const surface = ART_SURFACE[kind]
    if (!surface) return null
    const options = [...artRegistry.entries()].filter(([, entry]) => entry.kind === 'pixel' && entry.surface === surface)
    if (options.length === 0) return null
    const chosen = typeof draft.artKey === 'string' ? draft.artKey : ''
    return (
      <fieldset className="art-picker">
        <legend>{t('ui.editor.field.art')}</legend>
        <div className="palette wrap">
          {options.map(([artId, entry]) => {
            const sprite = entry.kind === 'pixel' && isSpriteName(entry.sprite) ? PIXEL_SPRITES[entry.sprite] : null
            return (
              <button
                key={artId}
                type="button"
                data-testid={`editor-art-${artId}`}
                data-selected={chosen === artId}
                aria-pressed={chosen === artId}
                aria-label={artId}
                onClick={() =>
                  update((d) => {
                    // Tapping the chosen one clears it: `artKey` is optional, and
                    // a picker with no way back to "no picture" makes the absent
                    // case unreachable the moment it is used once.
                    if (d.artKey === artId) delete d.artKey
                    else d.artKey = artId
                  })
                }
              >
                {sprite && <Pix sprite={sprite} tint={surface === 'piece' ? 'var(--pix-tint-white)' : undefined} />}
              </button>
            )
          })}
        </div>
      </fieldset>
    )
  }

  /** How this piece moves, as one grid. See `PieceMoves.tsx` for the mapping. */
  function pieceGridView() {
    if (kind !== 'piece') return null
    const grid = readGrid(draft)
    if (!grid) {
      // Refusing to open beats flattening — see the header of `PieceMoves.tsx`.
      return (
        <div className="note-box" data-testid="editor-moves-complex">
          <strong>{t('ui.editor.piece.complex')}</strong>
          <p>{t('ui.editor.piece.complex-hint')}</p>
        </div>
      )
    }

    const commit = (next: PieceGrid) => {
      const written = writeGrid(next)
      update((d) => {
        if (!written.ok) {
          // A grid with no move squares is a document that will not load
          // (`movement` carries `.min(1)`). The draft keeps the last valid
          // movement and the note below says what is missing, rather than the
          // save failing later against a field name the child has never seen.
          return
        }
        d.movement = written.movement
        if (written.attack === undefined) delete d.attack
        else d.attack = written.attack
      })
    }

    const noMoves = Object.values(grid.cells).every((v) => v !== Cell.Move && v !== Cell.Both)
    const noTakes = Object.values(grid.cells).every((v) => v !== Cell.Capture && v !== Cell.Both)

    return (
      <fieldset className="piece-moves" data-testid="editor-moves">
        <legend>{t('ui.editor.piece.how')}</legend>
        <p className="hint">{t('ui.editor.piece.how-hint')}</p>
        <div className="move-grid">
          {GRID_RANGE.map((dr) =>
            GRID_RANGE.map((df) => {
              const centre = df === 0 && dr === 0
              const value = grid.cells[`${df},${dr}`] ?? Cell.None
              if (centre) {
                return (
                  <span key={`${df},${dr}`} className="move-cell" data-centre="true" aria-hidden="true">
                    <MarkBody mark={resolveMark(t, draft as { artKey?: string; iconKey?: string }, { registry: artRegistry, side: 'white', fallback: 'none' })} />
                  </span>
                )
              }
              return (
                <button
                  key={`${df},${dr}`}
                  type="button"
                  className="move-cell"
                  data-testid={`piece-cell-${df},${dr}`}
                  data-value={value}
                  aria-label={`${df},${dr}`}
                  aria-pressed={value !== Cell.None}
                  onClick={() => {
                    const cells = { ...grid.cells }
                    const next = cycle(value)
                    if (next === Cell.None) delete cells[`${df},${dr}`]
                    else cells[`${df},${dr}`] = next
                    commit({ ...grid, cells })
                  }}
                />
              )
            }),
          )}
        </div>

        <div className="travel-picker">
          {(['step', 'slide', 'jump'] as const).map((travel) => (
            <button
              key={travel}
              type="button"
              data-testid={`piece-travel-${travel}`}
              data-selected={grid.travel === travel}
              aria-pressed={grid.travel === travel}
              onClick={() => commit({ ...grid, travel })}
            >
              {t(`ui.editor.vocab.movement.${travel}`)}
            </button>
          ))}
        </div>

        <div className="note-box">
          <span className="kicker">{t('ui.editor.piece.dex-preview')}</span>
          <p data-testid="piece-summary">{describeGrid(t, grid)}</p>
          {HAS_TEXT.includes(kind) && (
            <button
              type="button"
              data-testid="piece-use-summary"
              onClick={() => {
                setBodyText(describeGrid(t, grid))
                setTextTyped(true)
                setSaved(null)
                onDirtyChange?.(true)
              }}
            >
              {t('ui.editor.piece.use-summary')}
            </button>
          )}
        </div>

        {noMoves && (
          <p className="refusal" data-testid="piece-no-moves">
            {t('ui.editor.piece.no-moves')}
          </p>
        )}
        {noTakes && !noMoves && <p className="hint">{t('ui.editor.piece.no-takes')}</p>}
      </fieldset>
    )
  }

  /** What this card does, as four blocks. See `CardRecipe.tsx`. */
  function recipeView() {
    if (kind !== 'ruleCard' && kind !== 'skillCard') return null
    const recipe = readRecipe(draft)
    if (!recipe) {
      return (
        <div className="note-box" data-testid="editor-recipe-complex">
          <strong>{t('ui.editor.card.complex')}</strong>
          <p>{t('ui.editor.card.complex-hint')}</p>
        </div>
      )
    }
    const hasTarget = takesTarget(recipe.then, ctx)
    const slots: Array<{ id: SlotId; axis: string; value: string; disabled: boolean }> = [
      // A skill card resolves only on its own play, so its trigger slot has one
      // option. Shown inert rather than hidden: the sentence reads wrong without
      // it, and "why does a rule card have four blocks and mine three" is a
      // worse question than a greyed one.
      { id: 'when', axis: 'trigger', value: recipe.when, disabled: kind === 'skillCard' },
      { id: 'cond', axis: 'condition', value: recipe.cond, disabled: false },
      { id: 'then', axis: 'action', value: recipe.then, disabled: false },
      { id: 'who', axis: 'target', value: recipe.who, disabled: !hasTarget },
    ]

    return (
      <fieldset className="card-recipe" data-testid="editor-recipe">
        <legend>{t('ui.editor.card.recipe')}</legend>
        <p className="hint">{t('ui.editor.card.recipe-hint')}</p>
        {slots.map((slot) => (
          <label key={slot.id} className="recipe-slot" data-slot={slot.id}>
            <span className="recipe-label">{t(`ui.editor.card.slot.${slot.id}`)}</span>
            <select
              data-testid={`recipe-${slot.id}`}
              value={slot.value}
              disabled={slot.disabled}
              onChange={(e) =>
                update((d) => {
                  d.effects = writeRecipe(d, slot.id, e.target.value, ctx)
                })
              }
            >
              {slot.disabled && slot.value === '' && <option value="">{t('ui.editor.card.slot.none')}</option>}
              {optionsFor(slot.id, kind).map((option) => (
                <option key={option} value={option}>
                  {t(`ui.editor.vocab.${slot.axis}.${option}`)}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="note-box">
          <span className="kicker">{t('ui.editor.card.reads-as')}</span>
          <p data-testid="recipe-sentence">{recipeSentence(t, recipe, kind)}</p>
        </div>
      </fieldset>
    )
  }

  return (
    <section className="record-form" data-testid="record-form">
      <RecordGrade source={source} kind={kind} recordId={openedId} />
      <label>
        {t('ui.editor.field.name')}
        <input
          data-testid="editor-name"
          value={nameText}
          onChange={(e) => {
            setNameText(e.target.value)
            setNameTyped(true)
            setSaved(null)
            onDirtyChange?.(true)
          }}
        />
      </label>
      {fieldError('nameKey')}

      {HAS_TEXT.includes(kind) && (
        <label>
          {t('ui.editor.field.text')}
          <textarea
            data-testid="editor-text"
            rows={2}
            value={bodyText}
            onChange={(e) => {
              setBodyText(e.target.value)
              setTextTyped(true)
              setSaved(null)
              onDirtyChange?.(true)
            }}
          />
        </label>
      )}
      {HAS_TEXT.includes(kind) && fieldError('textKey')}

      {/* The id stays on the surface while the two KEY fields go under the
          disclosure. It is tempting to hide all three — an id is machinery —
          but the id is also required for a save, so hiding it means a blank
          save fails with an error anchored to a control the child cannot see.
          A hint carries the format instead. */}
      {textField('id', 'editor-id', 'ui.editor.field.id')}
      <p className="hint">{t('ui.editor.field.id-hint')}</p>

      <details className="advanced" data-testid="editor-advanced">
        <summary>{t('ui.editor.form.advanced')}</summary>
        {textField('nameKey', 'editor-nameKey', 'ui.editor.field.name-slot', false)}
        {HAS_TEXT.includes(kind) && textField('textKey', 'editor-textKey', 'ui.editor.field.text-slot', false)}
      </details>

      {/* The simple views come FIRST, and the schema-shaped fieldsets below stay
          exactly where they were. Two editors over one draft is deliberate: they
          read the same state, so the grid always shows whatever `movement`
          holds, and neither can drift from the other. Folding the detailed
          controls into a closed `<details>` was the tempting tidy-up and would
          have broken the ADR-006 vocabulary-coverage gate, which drives them by
          test id and cannot click into collapsed content. */}
      {artPicker()}
      {pieceGridView()}
      {recipeView()}

      {/* The `cost` control is gone as of schema v8. It let an author type their
          own balance number, which nothing ever read — and a number the author
          picks could never have been the objective index the grade needs to be.
          A record's strength is now measured (ADR-002) and recomputed rather
          than stored (ADR-007), so there is nothing here for a form to collect.
          The field stays optional in the schema so older documents still load. */}
      {kind === 'skillCard' &&
        numberField('editor-uses', 'ui.editor.field.uses', draft.uses, (n) =>
          update((d) => {
            d.uses = n ?? 1
          }),
        )}

      {kind === 'squareType' && (
        <label>
          {t('ui.editor.field.paired')}
          <input
            type="checkbox"
            data-testid="editor-paired"
            checked={draft.paired === true}
            onChange={() =>
              update((d) => {
                d.paired = d.paired !== true
              })
            }
          />
        </label>
      )}

      {kind === 'piece' && (
        <>
          <label>
            {t('ui.editor.field.royal')}
            <input
              type="checkbox"
              data-testid="editor-royal"
              checked={draft.royal === true}
              onChange={() =>
                update((d) => {
                  if (d.royal === true) delete d.royal
                  else d.royal = true
                })
              }
            />
          </label>
          <label>
            {t('ui.editor.field.promotion-rank')}
            <input
              data-testid="editor-promotion-onRank"
              value={String((draft.promotion as Draft | undefined)?.onRank ?? '')}
              onChange={(e) =>
                update((d) => {
                  const raw = e.target.value
                  if (raw === '') {
                    delete d.promotion
                    return
                  }
                  const existingTo = (d.promotion as Draft | undefined)?.to
                  d.promotion = {
                    onRank: raw === 'last' ? 'last' : Number(raw),
                    to: existingTo ?? ctx.pieceIds[0] ?? '',
                  }
                })
              }
            />
          </label>
          <label>
            {t('ui.editor.field.promotion-to')}
            <select
              data-testid="editor-promotion-to"
              value={String((draft.promotion as Draft | undefined)?.to ?? '')}
              onChange={(e) =>
                update((d) => {
                  const p = (d.promotion as Draft | undefined) ?? { onRank: 'last' }
                  p.to = e.target.value
                  d.promotion = p
                })
              }
            >
              <option value="">{t('ui.editor.board.none')}</option>
              {ctx.pieceIds.map((id) => (
                <option key={id} value={id}>
                  {pieceLabel(id)}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>{t('ui.editor.movement.legend')}</legend>
            <button
              type="button"
              data-testid="editor-clear-movement"
              onClick={() =>
                update((d) => {
                  d.movement = []
                })
              }
            >
              {t('ui.editor.movement.clear')}
            </button>
            {palette('movement', 'ui.editor.movement.add')}
            {patterns.map((p, i) => (
              <button
                key={i}
                type="button"
                data-testid={`movement-select-${i}`}
                data-selected={i === patternIndex}
                onClick={() => setPatternIndex(i)}
              >
                {t(`ui.editor.vocab.movement.${String(p.kind)}`)}
              </button>
            ))}
            {currentPattern && (
              <>
                {vectorGrid('move-cell', (currentPattern.vectors as number[][] | undefined) ?? [], (df, dr) =>
                  update((d) => {
                    const p = (d.movement as Draft[])[patternIndex]!
                    p.vectors = toggleVector((p.vectors as number[][] | undefined) ?? [], df, dr)
                  }),
                )}
                {numberField('param-move-maxDistance', 'ui.editor.movement.max', currentPattern.maxDistance, (n) =>
                  update((d) => {
                    const p = (d.movement as Draft[])[patternIndex]!
                    if (n === null) delete p.maxDistance
                    else p.maxDistance = n
                  }),
                )}
                <label>
                  {t('ui.editor.movement.forward')}
                  <input
                    type="checkbox"
                    data-testid="param-move-forward"
                    checked={currentPattern.forward === true}
                    onChange={() =>
                      update((d) => {
                        const p = (d.movement as Draft[])[patternIndex]!
                        if (p.forward === true) delete p.forward
                        else p.forward = true
                      })
                    }
                  />
                </label>
              </>
            )}
            {fieldError('movement')}
          </fieldset>

          <fieldset>
            <legend>{t('ui.editor.attack.legend')}</legend>
            {(['slide', 'step', 'jump'] as const).map((k) => (
              <button
                key={k}
                type="button"
                data-testid={`attack-kind-${k}`}
                onClick={() => {
                  update((d) => {
                    const list = (d.attack as Draft[] | undefined) ?? []
                    list.push({ kind: k, vectors: [] })
                    d.attack = list
                  })
                  setAttackIndex(attacks.length)
                }}
              >
                {t(`ui.editor.vocab.movement.${k}`)}
              </button>
            ))}
            {attacks[attackIndex] &&
              vectorGrid('attack-cell', (attacks[attackIndex]!.vectors as number[][] | undefined) ?? [], (df, dr) =>
                update((d) => {
                  const p = (d.attack as Draft[])[attackIndex]!
                  p.vectors = toggleVector((p.vectors as number[][] | undefined) ?? [], df, dr)
                }),
              )}
          </fieldset>
        </>
      )}

      {EFFECT_BEARING.includes(kind) && (
        <fieldset>
          <legend>{t('ui.editor.effects.legend')}</legend>
          <button
            type="button"
            data-testid="editor-add-effect"
            onClick={() => {
              update((d) => {
                const list = (d.effects as Draft[] | undefined) ?? []
                // No trigger: an effect that has not been told WHEN it fires is
                // unfinished, and seeding one would silently author a lifecycle
                // choice the author never made.
                list.push({ condition: { kind: 'always' }, actions: [] })
                d.effects = list
              })
              setEffectIndex(effects(draft).length)
              setActionIndex(0)
            }}
          >
            {t('ui.editor.effects.add')}
          </button>
          {effects(draft).map((_, i) => (
            <button
              key={i}
              type="button"
              data-testid={`editor-effect-${i}`}
              data-selected={i === effectIndex}
              onClick={() => {
                setEffectIndex(i)
                setActionIndex(0)
              }}
            >
              {`${t('ui.editor.effects.item')} ${i + 1}`}
            </button>
          ))}

          {palette('trigger', 'ui.editor.palette.trigger')}
          {palette('condition', 'ui.editor.palette.condition')}
          {conditionParams()}
          {palette('forEach', 'ui.editor.palette.forEach')}
          {currentEffect?.forEach !== undefined && (
            <>
              {pieceSelect('param-foreach-pieceId', (currentEffect.forEach as Draft).pieceId, (id) =>
                update((d) => {
                  ;(effect(d)!.forEach as Draft).pieceId = id
                }),
              )}
              {sideSelect(
                'param-foreach-side',
                (currentEffect.forEach as Draft).side,
                (s) =>
                  update((d) => {
                    ;(effect(d)!.forEach as Draft).side = s
                  }),
                true,
              )}
            </>
          )}

          {palette('action', 'ui.editor.palette.action')}
          {actions(draft).map((a, i) => (
            <button
              key={i}
              type="button"
              data-testid={`editor-action-${i}`}
              data-selected={i === actionIndex}
              onClick={() => setActionIndex(i)}
            >
              {t(`ui.editor.vocab.action.${String(a.kind)}`)}
            </button>
          ))}
          {palette('target', 'ui.editor.palette.target')}
          {palette('destination', 'ui.editor.palette.destination')}
          {actionParams()}
          {fieldError('effects')}
        </fieldset>
      )}

      {kind === 'board' && (
        <fieldset>
          <legend>{t('ui.editor.kind.board')}</legend>
          {numberField('board-width', 'ui.editor.board.width', draft.width, (n) =>
            update((d) => {
              d.width = n ?? 6
            }),
          )}
          {numberField('board-height', 'ui.editor.board.height', draft.height, (n) =>
            update((d) => {
              d.height = n ?? 6
            }),
          )}
          <label>
            {t('ui.editor.board.paint')}
            <select data-testid="paint-type" value={paintType} onChange={(e) => setPaintType(e.target.value)}>
              <option value="">{t('ui.editor.board.none')}</option>
              {named(source.squareTypes).map(([id, nameKey]) => (
                <option key={id} value={id}>
                  {label(id, nameKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('ui.editor.board.place')}
            <select data-testid="place-piece" value={placePiece} onChange={(e) => setPlacePiece(e.target.value)}>
              <option value="">{t('ui.editor.board.none')}</option>
              {ctx.pieceIds.map((id) => (
                <option key={id} value={id}>
                  {pieceLabel(id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('ui.editor.param.side')}
            <select
              data-testid="place-side"
              value={placeSide}
              onChange={(e) => setPlaceSide(e.target.value as 'white' | 'black')}
            >
              <option value="white">{t('ui.side.white')}</option>
              <option value="black">{t('ui.side.black')}</option>
            </select>
          </label>
          {pairHint && <p data-testid="editor-pair-hint">{t('ui.editor.board.pair-hint')}</p>}

          {boardSquares().map((row) => (
            <div key={row[0]} className="board-row">
              {row.map((sq) => {
                const painted = ((draft.squares as Draft[] | undefined) ?? []).find((s) => s.square === sq)
                const placed = ((draft.placements as Draft[] | undefined) ?? []).find((p) => p.square === sq)
                return (
                  <span key={sq} className="board-cell">
                    <button
                      type="button"
                      data-testid={`paint-${sq}`}
                      data-square-type={painted ? String(painted.typeId) : ''}
                      onClick={() => paint(sq)}
                    >
                      {sq}
                    </button>
                    <button
                      type="button"
                      data-testid={`place-${sq}`}
                      data-piece={placed ? String(placed.pieceId) : ''}
                      onClick={() => place(sq)}
                    >
                      {placed ? String(placed.side)[0] : '·'}
                    </button>
                  </span>
                )
              })}
            </div>
          ))}
        </fieldset>
      )}

      {kind === 'preset' && (
        <fieldset>
          <legend>{t('ui.editor.kind.preset')}</legend>
          <label>
            {t('ui.editor.room.board')}
            <select
              data-testid="preset-board"
              value={String(draft.boardId ?? '')}
              onChange={(e) =>
                update((d) => {
                  d.boardId = e.target.value
                })
              }
            >
              <option value="">{t('ui.editor.board.none')}</option>
              {named(source.boards).map(([id, nameKey]) => (
                <option key={id} value={id}>
                  {label(id, nameKey)}
                </option>
              ))}
            </select>
            {fieldError('boardId')}
          </label>
          {checkboxList('pieceIds', 'ui.editor.room.pieces', 'preset-piece', named(source.pieces))}
          {checkboxList('ruleCardIds', 'ui.editor.room.rules', 'preset-rule', named(source.ruleCards))}
          {checkboxList('skillCardIds', 'ui.editor.room.skills', 'preset-skill', named(source.skillCards))}
        </fieldset>
      )}

      {subjectDeleted && (
        <p className="refusal" data-testid="editor-deleted-notice">
          {t('ui.editor.form.deleted')}
        </p>
      )}

      <button type="button" data-testid="editor-save" onClick={save} disabled={subjectDeleted}>
        {t('ui.editor.form.save')}
      </button>
      {saved && <p data-testid="editor-saved">{t('ui.editor.form.saved')}</p>}

      {/* The draft's raw JSON stays in the DOM and off the screen (#19).
          A child reading `{"movement":[{"kind":"step"...` learns nothing and is
          told, wrongly, that the format is the point. It is not deleted because
          the ADR-006 vocabulary-coverage gate reads exactly this node to prove
          each control wrote its own value — deleting it would trade a real CI
          guard for a cosmetic one. `hidden` is what makes the two claims the
          same claim rather than a contradiction. */}
      <pre hidden data-testid="editor-draft-json">{JSON.stringify(draft)}</pre>
    </section>
  )
}
