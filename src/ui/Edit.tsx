import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, EDITABLE_KINDS, blankDraft, commitDraft, editorContext, openDraft } from '@editor/draft'
import { type VocabularyControl, controlsFor } from '@editor/controls'
import { exportContent, importContent } from '@editor/io'
import { browserStorage, saveContent } from '@editor/storage'

/**
 * The content editor (PLAN Phase 5) — hand-crafted forms for all five axes plus
 * the preset that bundles them (ADR-006).
 *
 * Two structural decisions carry most of the file:
 *
 * 1. **The vocabulary palettes are `.map`ped from `VOCABULARY_CONTROLS`.** Not
 *    written out button by button. A vocabulary entry with no control is then
 *    impossible to ship by omission — the only way to lose one is to delete it
 *    from the table, which the ADR-006 coverage test fails on immediately. This
 *    is the coupling ADR-006 accepted, made cheap.
 *
 * 2. **A control an author cannot use here renders DISABLED, not absent.** A
 *    missing button and an inapplicable button look identical to a child; a
 *    greyed one says "the grammar has this, this card cannot". Absence is how
 *    the vocabulary quietly shrinks.
 *
 * Saving runs the WHOLE document through `loadContentSet` — the same validator
 * the game loads with. A save therefore cannot produce content the engine will
 * choke on later, and a cross-reference broken by an edit is caught here rather
 * than mid-match.
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

export function Edit({ source, onCommit }: { source: ContentSource; onCommit: (next: ContentSource) => void }) {
  const [kind, setKind] = useState<DraftKind>('piece')
  const [draft, setDraft] = useState<Draft>(() => blankDraft('piece'))
  const [effectIndex, setEffectIndex] = useState(0)
  const [actionIndex, setActionIndex] = useState(0)
  const [patternIndex, setPatternIndex] = useState(0)
  const [attackIndex, setAttackIndex] = useState(0)
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saved, setSaved] = useState<string | null>(null)
  const [json, setJson] = useState('')
  const [status, setStatus] = useState('')
  const [paintType, setPaintType] = useState('')
  const [pendingPair, setPendingPair] = useState<string | null>(null)
  const [placePiece, setPlacePiece] = useState('')
  const [placeSide, setPlaceSide] = useState<'white' | 'black'>('white')

  const ctx = useMemo(() => editorContext(source), [source])

  const existing = useMemo(() => {
    const collection = {
      piece: source.pieces,
      squareType: source.squareTypes,
      ruleCard: source.ruleCards,
      skillCard: source.skillCards,
      board: source.boards,
      preset: source.presets,
    }[kind]
    return collection.map((r) => String((r as { id?: unknown }).id ?? ''))
  }, [source, kind])

  const pairedTypes = useMemo(
    () =>
      new Set(
        source.squareTypes
          .filter((t) => (t as { paired?: unknown }).paired === true)
          .map((t) => String((t as { id: string }).id)),
      ),
    [source],
  )

  const reset = (next: Draft) => {
    setDraft(next)
    setEffectIndex(0)
    setActionIndex(0)
    setPatternIndex(0)
    setAttackIndex(0)
    setErrors([])
    setSaved(null)
    setPendingPair(null)
  }

  const changeKind = (next: DraftKind) => {
    setKind(next)
    setPaintType('')
    setPlacePiece(ctx.pieceIds[0] ?? '')
    reset(blankDraft(next))
  }

  const open = (id: string) => {
    const loaded = openDraft(source, kind, id)
    if (loaded) reset(loaded)
  }

  /** Every mutation goes through a clone, so no state object is ever edited in place. */
  const update = (mutate: (d: Draft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    setSaved(null)
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

  const palette = (axis: VocabularyControl['axis'], label: string) => (
    <fieldset>
      <legend>{label}</legend>
      {controlsFor(axis).map((control) => (
        <button
          key={control.testid}
          type="button"
          data-testid={control.testid}
          disabled={!controlEnabled(control)}
          onClick={() => applyControl(control)}
        >
          {control.kind}
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

  const numberField = (testid: string, value: unknown, apply: (n: number | null) => void) => (
    <label key={testid}>
      {testid.replace(/^param-/, '')}
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
      side
      <select data-testid={testid} value={typeof value === 'string' ? value : ''} onChange={(e) => apply(e.target.value)}>
        <option value="">—</option>
        <option value="mover">mover</option>
        <option value="opponent">opponent</option>
        {withAny && <option value="any">any</option>}
      </select>
    </label>
  )

  const pieceSelect = (testid: string, value: unknown, apply: (id: string) => void) => (
    <label key={testid}>
      piece
      <select data-testid={testid} value={typeof value === 'string' ? value : ''} onChange={(e) => apply(e.target.value)}>
        <option value="">—</option>
        {ctx.pieceIds.map((id) => (
          <option key={id} value={id}>
            {id}
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
        numberField('param-duration', currentAction.duration, (n) =>
          setInAction((a) => {
            if (n === null) delete a.duration
            else a.duration = n
          }),
        ),
      )
    }
    if (k === 'freeze_piece') {
      out.push(
        numberField('param-plies', currentAction.plies, (n) =>
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
          <legend>never revive</legend>
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
              {id}
            </button>
          ))}
        </fieldset>,
      )
    }
    if (k === 'grant_movement') {
      const pattern = (currentAction.pattern as Draft | undefined) ?? {}
      out.push(
        <fieldset key="pattern">
          <legend>granted pattern</legend>
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
              {pk}
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
          square
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
        numberField('param-df', dest.df, (n) =>
          setInAction((a) => {
            ;(a[slot!] as Draft).df = n ?? 0
          }),
        ),
        numberField('param-dr', dest.dr, (n) =>
          setInAction((a) => {
            ;(a[slot!] as Draft).dr = n ?? 0
          }),
        ),
        <label key="param-offset-forward">
          forward
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
    if (k === 'check_count_at_least' || k === 'piece_count_at_most') {
      out.push(
        numberField('param-cond-n', currentCondition.n, (n) =>
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
          <legend>squares</legend>
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
        setStatus(`pick the square ${square} is linked to`)
        return
      }
      const partner = pendingPair
      setPendingPair(null)
      setStatus('')
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

  // --- preset bundling ------------------------------------------------------

  const toggleInList = (field: string, id: string) =>
    update((d) => {
      const list = (d[field] as string[] | undefined) ?? []
      const at = list.indexOf(id)
      if (at >= 0) list.splice(at, 1)
      else list.push(id)
      d[field] = list
    })

  const checkboxList = (field: string, testidPrefix: string, ids: string[]) => (
    <fieldset>
      <legend>{field}</legend>
      {ids.map((id) => (
        <label key={id}>
          <input
            type="checkbox"
            data-testid={`${testidPrefix}-${id}`}
            checked={((draft[field] as string[] | undefined) ?? []).includes(id)}
            onChange={() => toggleInList(field, id)}
          />
          {id}
        </label>
      ))}
    </fieldset>
  )

  // --- save / transfer ------------------------------------------------------

  const persist = (next: ContentSource) => {
    const storage = browserStorage()
    if (!storage) {
      setStatus('browser storage is unavailable — export to a file to keep this content')
      return
    }
    const result = saveContent(storage, next)
    setStatus(result.ok ? 'saved to this browser' : result.message)
  }

  const save = () => {
    const result = commitDraft(source, kind, draft)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(null)
      return
    }
    setErrors([])
    setSaved(String(draft.id ?? ''))
    onCommit(result.source)
    persist(result.source)
  }

  const doExport = () => {
    setJson(exportContent(source))
    setErrors([])
  }

  const doImport = () => {
    const result = importContent(json)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors([])
    setSaved(null)
    onCommit(result.source)
    persist(result.source)
  }

  const text = (field: string, testid: string) => (
    <label>
      {field}
      <input
        data-testid={testid}
        value={String(draft[field] ?? '')}
        onChange={(e) =>
          update((d) => {
            d[field] = e.target.value
          })
        }
      />
    </label>
  )

  return (
    <section className="editor">
      <label>
        kind
        <select data-testid="editor-kind" value={kind} onChange={(e) => changeKind(e.target.value as DraftKind)}>
          {EDITABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend>open</legend>
        <button type="button" data-testid="editor-new" onClick={() => reset(blankDraft(kind))}>
          new
        </button>
        {existing.map((id) => (
          <button key={id} type="button" data-testid={`editor-open-${id}`} onClick={() => open(id)}>
            {id}
          </button>
        ))}
      </fieldset>

      {text('id', 'editor-id')}
      {text('nameKey', 'editor-nameKey')}
      {kind !== 'board' && kind !== 'preset' && text('textKey', 'editor-textKey')}

      {(kind === 'ruleCard' || kind === 'skillCard') &&
        numberField('editor-cost', draft.cost, (n) =>
          update((d) => {
            d.cost = n ?? 0
          }),
        )}
      {kind === 'skillCard' &&
        numberField('editor-uses', draft.uses, (n) =>
          update((d) => {
            d.uses = n ?? 1
          }),
        )}

      {kind === 'squareType' && (
        <label>
          paired
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
            royal
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
            promotes on rank
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
            promotes to
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
              <option value="">—</option>
              {ctx.pieceIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend>movement</legend>
            <button
              type="button"
              data-testid="editor-clear-movement"
              onClick={() =>
                update((d) => {
                  d.movement = []
                })
              }
            >
              clear
            </button>
            {palette('movement', 'add pattern')}
            {patterns.map((p, i) => (
              <button
                key={i}
                type="button"
                data-testid={`movement-select-${i}`}
                data-selected={i === patternIndex}
                onClick={() => setPatternIndex(i)}
              >
                {String(p.kind)}
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
                {numberField('param-move-maxDistance', currentPattern.maxDistance, (n) =>
                  update((d) => {
                    const p = (d.movement as Draft[])[patternIndex]!
                    if (n === null) delete p.maxDistance
                    else p.maxDistance = n
                  }),
                )}
                <label>
                  mirrored by side
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
          </fieldset>

          <fieldset>
            <legend>attack (omit to capture the way it moves)</legend>
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
                {k}
              </button>
            ))}
            {attacks[attackIndex] &&
              vectorGrid(
                'attack-cell',
                (attacks[attackIndex]!.vectors as number[][] | undefined) ?? [],
                (df, dr) =>
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
          <legend>effects</legend>
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
            add effect
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
              effect {i + 1}
            </button>
          ))}

          {palette('trigger', 'when')}
          {palette('condition', 'only if')}
          {conditionParams()}
          {palette('forEach', 'for each')}
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

          {palette('action', 'then')}
          {actions(draft).map((a, i) => (
            <button
              key={i}
              type="button"
              data-testid={`editor-action-${i}`}
              data-selected={i === actionIndex}
              onClick={() => setActionIndex(i)}
            >
              {String(a.kind)}
            </button>
          ))}
          {palette('target', 'to which piece')}
          {palette('destination', 'to where')}
          {actionParams()}
        </fieldset>
      )}

      {kind === 'board' && (
        <fieldset>
          <legend>board</legend>
          {numberField('board-width', draft.width, (n) =>
            update((d) => {
              d.width = n ?? 6
            }),
          )}
          {numberField('board-height', draft.height, (n) =>
            update((d) => {
              d.height = n ?? 6
            }),
          )}
          <label>
            paint
            <select data-testid="paint-type" value={paintType} onChange={(e) => setPaintType(e.target.value)}>
              <option value="">—</option>
              {ctx.squareTypeIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            place
            <select data-testid="place-piece" value={placePiece} onChange={(e) => setPlacePiece(e.target.value)}>
              <option value="">—</option>
              {ctx.pieceIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            side
            <select
              data-testid="place-side"
              value={placeSide}
              onChange={(e) => setPlaceSide(e.target.value as 'white' | 'black')}
            >
              <option value="white">white</option>
              <option value="black">black</option>
            </select>
          </label>

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
          <legend>bundle</legend>
          <label>
            board
            <select
              data-testid="preset-board"
              value={String(draft.boardId ?? '')}
              onChange={(e) =>
                update((d) => {
                  d.boardId = e.target.value
                })
              }
            >
              <option value="">—</option>
              {source.boards.map((b) => String((b as { id: string }).id)).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          {checkboxList('pieceIds', 'preset-piece', ctx.pieceIds)}
          {checkboxList(
            'ruleCardIds',
            'preset-rule',
            source.ruleCards.map((c) => String((c as { id: string }).id)),
          )}
          {checkboxList(
            'skillCardIds',
            'preset-skill',
            source.skillCards.map((c) => String((c as { id: string }).id)),
          )}
        </fieldset>
      )}

      <button type="button" data-testid="editor-save" onClick={save}>
        save
      </button>
      {saved && <p data-testid="editor-saved">{saved}</p>}
      <p data-testid="editor-storage-status">{status}</p>

      {errors.length > 0 && (
        <ul data-testid="editor-errors">
          {errors.map((e, i) => (
            <li key={`${e.path}-${i}`}>
              {e.path} — {e.message}
            </li>
          ))}
        </ul>
      )}

      <fieldset>
        <legend>transfer</legend>
        <button type="button" data-testid="editor-export" onClick={doExport}>
          export
        </button>
        <button type="button" data-testid="editor-import" onClick={doImport}>
          import
        </button>
        <textarea data-testid="editor-json" value={json} onChange={(e) => setJson(e.target.value)} rows={6} />
      </fieldset>

      <pre data-testid="editor-draft-json">{JSON.stringify(draft)}</pre>
    </section>
  )
}
