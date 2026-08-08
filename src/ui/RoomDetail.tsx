import { useMemo, useState } from 'react'
import type { ContentSource, ValidationError } from '@content/load'
import { type DraftKind, commitDraft, openDraft } from '@editor/draft'
import { roomsReferencing } from '@editor/references'
import { clearString, deriveKey, rekeyStrings, writeString } from '@editor/strings'
import { type RecordSnapshot, sameSnapshot, snapshotOf } from './RecordForm'
import { type Mark, resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'
import { PIXEL_SPRITES } from './art/pixels'
import { Pix } from './art/Pix'
import { namedRecords, recordLabel } from './recordLabel'
import { DEFAULT_LOCALE, type Translate, makeTranslate, useTranslate } from './i18n'
import { type Costs, contentOf, starText, useCosts } from './useGrades'

/**
 * One room, open — the five things a room is, one at a time.
 *
 * A room is a `preset`: a board, the pieces in play, and the two pools the rule
 * draw and the skill drafts come from. It used to be one long form of tick-lists
 * plus a `<select>` for the board, which said all of that truthfully and none of
 * it legibly — the board, the thing a child most wants to change, was a dropdown
 * of names, and the squares and starting position were only editable through the
 * library's flat form for the board record.
 *
 * The five steps are paint / pieces / place / cards / name, and the first and
 * third of them EDIT A DIFFERENT RECORD from the other three. That is the one
 * structural thing to know about this file: a save commits the board and then
 * the preset, in that order, against the source the first commit returned.
 *
 * ## Three guards, all here rather than in the schema
 *
 * The validator's version of each message names a field the child has never
 * seen, and arrives after the save rather than instead of it.
 *
 * - **A room cannot lose its last piece.** `pieceIds` carries `.min(1)`, so an
 *   empty room is a document that will not load.
 * - **A new room is seeded, not blank.** Same `.min(1)`: a room created empty is
 *   a room that cannot be saved.
 * - **A shared board is forked before it is painted.** Two rooms may point at
 *   one board — the bundled set does not, but an author who copies a room will —
 *   and painting in one would silently repaint the other. See `forkBoard`.
 */

const MAX_SEEDED_ROOMS = 999
const MAX_SEEDED_BOARDS = 999

/**
 * A free id for a new room.
 *
 * Derived, not typed. The child names the room in Korean and the name lives in
 * the `strings` overlay (ADR-020); the id is machinery, and asking a
 * nine-year-old to invent a unique dotted ASCII token is asking them to do the
 * schema's job.
 */
export function nextRoomId(source: ContentSource): string {
  return nextFreeId(source.presets, 'preset.room-', MAX_SEEDED_ROOMS)
}

function nextFreeId(records: readonly unknown[], prefix: string, cap: number): string {
  const taken = new Set(records.map((p) => String((p as { id?: unknown }).id ?? '')))
  for (let n = 1; n <= cap; n += 1) {
    const id = `${prefix}${n}`
    if (!taken.has(id)) return id
  }
  // Unreachable in practice; a collision-free fallback beats an infinite loop.
  return `${prefix}${cap + 1}`
}

type Draft = Record<string, unknown>

/** A painted square, as the board record stores it. */
interface PaintedSquare {
  square: string
  typeId: string
  pairedWith?: string
}

/** A piece standing somewhere at the start of a match. */
interface Placement {
  square: string
  pieceId: string
  side: 'white' | 'black'
}

const DEFAULT_SIZE = 6

/**
 * What `useGrades` reads when the document does not load.
 *
 * A document that fails validation is a reachable state in an editor — that is
 * the whole point of the save-time validator — and grading nothing is the right
 * answer for it. Hooks cannot be called conditionally, so the empty set stands in
 * rather than the hook being skipped.
 */
const EMPTY_CONTENT = {
  schemaVersion: 0,
  strings: {},
  pieces: new Map(),
  squareTypes: new Map(),
  ruleCards: new Map(),
  skillCards: new Map(),
  boards: new Map(),
  presets: new Map(),
}

function seedBoard(source: ContentSource): Draft {
  const id = nextFreeId(source.boards, 'board.room-', MAX_SEEDED_BOARDS)
  return { id, nameKey: deriveKey(id, 'name'), width: DEFAULT_SIZE, height: DEFAULT_SIZE, placements: [], squares: [] }
}

function seedRoom(source: ContentSource, boardId: string): Draft {
  const firstPiece = String((source.pieces[0] as { id?: unknown } | undefined)?.id ?? '')
  const id = nextRoomId(source)
  return {
    id,
    nameKey: deriveKey(id, 'name'),
    boardId,
    // Seeded rather than empty — see the note on `.min(1)` above. An empty array
    // here is a room the child cannot save and was never warned about.
    pieceIds: firstPiece === '' ? [] : [firstPiece],
    ruleCardIds: [],
    skillCardIds: [],
  }
}

const STEPS = ['board', 'pieces', 'place', 'cards', 'name'] as const
type Step = (typeof STEPS)[number]

/** `a1`, given zero-based coordinates. The engine's own convention. */
const sq = (file: number, rank: number) => `${String.fromCharCode(97 + file)}${rank + 1}`

export function RoomDetail({
  source,
  roomId,
  commit,
  onBack,
  onCreateRecord,
  onPlay,
}: {
  source: ContentSource
  /** The room being edited, or null to create one. */
  roomId: string | null
  commit: (next: ContentSource) => void
  onBack: () => void
  onCreateRecord: (kind: DraftKind) => void
  /** Save and go straight to a match in this room. Absent means the caller has
   *  nowhere to send them, and the button is not offered. */
  onPlay?: () => void
}) {
  const t = useTranslate()

  const [step, setStep] = useState<Step>('board')

  const [draft, setDraft] = useState<Draft>(() => {
    const existing = roomId ? openDraft(source, 'preset', roomId) : null
    if (existing) return existing
    return seedRoom(source, String((source.boards[0] as { id?: unknown } | undefined)?.id ?? ''))
  })

  /**
   * The board this room plays on, as an editable record.
   *
   * A room whose `boardId` points at nothing gets a fresh board rather than a
   * disabled paint tab: that state is reachable (the library can delete a board
   * no room references) and "you cannot paint, and we will not say why" is the
   * worst of the three possible answers.
   */
  const [board, setBoard] = useState<Draft>(() => {
    const id = String((roomId ? openDraft(source, 'preset', roomId) : null)?.boardId ?? (source.boards[0] as { id?: unknown } | undefined)?.id ?? '')
    return (id ? openDraft(source, 'board', id) : null) ?? seedBoard(source)
  })

  const [openedId, setOpenedId] = useState<string | null>(roomId)
  // The room as it looked when this screen opened — see the long note on
  // `openedSnapshot` in `RecordForm`. Identical hazard, identical guard: a room
  // stays mounted across an import, and its save would otherwise overwrite the
  // imported room of the same id with a draft from the previous document.
  const [openedSnapshot, setOpenedSnapshot] = useState<RecordSnapshot>(() => snapshotOf(source, 'preset', roomId))
  /**
   * The BOARD as it looked when this screen opened — the second half of the same
   * guard.
   *
   * The comment above says "identical hazard, identical guard", and for one
   * cycle it guarded one of this screen's two subjects. The redesign made the
   * builder edit the board record directly (paint and place), so a board changed
   * anywhere else — through the library, or by an import that left the preset
   * byte-identical — was silently overwritten by this screen's older draft at
   * save time, with nothing refusing and nothing said. A preset-only snapshot
   * cannot see that: the preset did not change.
   */
  const [openedBoardSnapshot, setOpenedBoardSnapshot] = useState<RecordSnapshot>(() =>
    snapshotOf(source, 'board', String((roomId ? openDraft(source, 'preset', roomId) : null)?.boardId ?? (source.boards[0] as { id?: unknown } | undefined)?.id ?? '') || null),
  )
  const [nameText, setNameText] = useState(openedSnapshot.name)
  // Same rule as `RecordForm`: only a field the author typed in is written, and
  // clearing one means dropping the overlay entry rather than storing an empty
  // string the schema refuses.
  const [nameTyped, setNameTyped] = useState(false)

  /**
   * What to call this room on screen.
   *
   * `nameText` is the OVERLAY's answer and is empty for a shipped room, whose
   * name lives in the locale bundle — so a header reading it alone announced
   * "unnamed room" over a room the title screen had just named correctly.
   * `recordLabel` is the same chain every other screen resolves a record's name
   * through; the typed value wins because that is the edit in progress.
   */
  const displayName = (draft: Draft) =>
    nameText.trim() || recordLabel(t, String(draft.id ?? ''), draft.nameKey) || t('ui.editor.room.unnamed')
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [saved, setSaved] = useState(false)
  const [lastPieceRefused, setLastPieceRefused] = useState(false)

  /** Which square type the paint tool is holding, or `''` for the eraser. */
  const [paintSel, setPaintSel] = useState<string>(() => String((source.squareTypes[0] as { id?: unknown } | undefined)?.id ?? ''))
  /**
   * The first half of a pair, waiting for its partner.
   *
   * A paired square type (ADR-010) needs a symmetric partner on every board, and
   * the loader refuses a board where one is missing. Rather than saving an
   * invalid board and translating the validator's message, the tool paints such a
   * type in TWO taps: the first arms a square, the second completes the pair.
   * Tapping the armed square again cancels.
   */
  const [pendingPair, setPendingPair] = useState<string | null>(null)
  const [placeSide, setPlaceSide] = useState<'white' | 'black'>('white')
  const [placePiece, setPlacePiece] = useState<string>('')

  const pieces = useMemo(() => namedRecords(source.pieces), [source])
  const rules = useMemo(() => namedRecords(source.ruleCards), [source])
  const skills = useMemo(() => namedRecords(source.skillCards), [source])

  /**
   * The loaded content, and the grades for whatever this room can put in a
   * loadout slot.
   *
   * Read from the SAVED document rather than from the draft: a grade is a
   * measurement over a whole content set, and measuring against a half-typed
   * draft would produce a number that changes as the author types. The draft's
   * own loadout choice is checked against these grades at save time, which is
   * where a refusal belongs.
   */
  const content = useMemo(() => contentOf(source), [source])
  const savedPreset = content?.presets.get(String(draft.id ?? '')) ?? undefined

  const squareTypes = useMemo(() => namedRecords(source.squareTypes), [source])

  const costs = useCosts(content, savedPreset)

  const list = (field: string): string[] => (draft[field] as string[] | undefined) ?? []
  const painted = (board.squares as PaintedSquare[] | undefined) ?? []
  const placements = (board.placements as Placement[] | undefined) ?? []
  const width = typeof board.width === 'number' ? board.width : DEFAULT_SIZE
  const height = typeof board.height === 'number' ? board.height : DEFAULT_SIZE

  const touched = () => {
    setSaved(false)
    setLastPieceRefused(false)
  }

  const update = (mutate: (d: Draft) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    touched()
  }

  const updateBoard = (mutate: (b: Draft) => void) => {
    setBoard((prev) => {
      const next = structuredClone(prev)
      mutate(next)
      return next
    })
    touched()
  }

  const toggle = (field: string, id: string) => {
    // The refusal is checked BEFORE the mutation, and it clears on any other
    // change: a notice that stays up after the child has fixed the situation
    // teaches them to ignore notices.
    if (field === 'pieceIds' && list(field).length === 1 && list(field)[0] === id) {
      setLastPieceRefused(true)
      return
    }
    update((d) => {
      const current = (d[field] as string[] | undefined) ?? []
      const at = current.indexOf(id)
      if (at >= 0) current.splice(at, 1)
      else current.push(id)
      d[field] = current
    })
  }

  const markOfRecord = (collection: 'pieces' | 'squareTypes' | 'ruleCards' | 'skillCards', id: string, side?: 'white' | 'black'): Mark => {
    const record = (source[collection] as Array<Record<string, unknown>>).find((r) => r.id === id)
    return resolveMark(t, record as { artKey?: string; iconKey?: string } | undefined, {
      registry: artRegistry,
      side,
      fallback: 'none',
    })
  }

  // ---------------------------------------------------------------- painting

  const isPaired = (typeId: string) =>
    Boolean((source.squareTypes as Array<{ id?: unknown; paired?: unknown }>).find((s) => s.id === typeId)?.paired)

  /** Removes a square's paint, and its partner's with it. */
  const erase = (b: Draft, square: string) => {
    const squares = (b.squares as PaintedSquare[] | undefined) ?? []
    const hit = squares.find((s) => s.square === square)
    if (!hit) return
    // A half-erased pair is a board the loader refuses, and the child's action
    // was "remove this one" — silently taking both is the only outcome that
    // leaves them somewhere valid.
    const alsoRemove = new Set([square, ...(hit.pairedWith ? [hit.pairedWith] : [])])
    b.squares = squares.filter((s) => !alsoRemove.has(s.square))
  }

  const paint = (square: string) => {
    if (paintSel === '') {
      setPendingPair(null)
      updateBoard((b) => erase(b, square))
      return
    }
    // Painting over something replaces it, and tapping a square that already
    // holds the SELECTED type erases — "tap the same square again to clear it",
    // which is what makes a palette usable without a separate eraser
    // mode for the common case.
    const existing = painted.find((s) => s.square === square)
    if (existing?.typeId === paintSel) {
      setPendingPair(null)
      updateBoard((b) => erase(b, square))
      return
    }

    if (!isPaired(paintSel)) {
      setPendingPair(null)
      updateBoard((b) => {
        erase(b, square)
        const squares = (b.squares as PaintedSquare[] | undefined) ?? []
        b.squares = [...squares, { square, typeId: paintSel }]
      })
      return
    }

    // Paired: two taps. See the note on `pendingPair`.
    if (pendingPair === null) {
      setPendingPair(square)
      return
    }
    if (pendingPair === square) {
      setPendingPair(null)
      return
    }
    const first = pendingPair
    setPendingPair(null)
    updateBoard((b) => {
      erase(b, first)
      erase(b, square)
      const squares = (b.squares as PaintedSquare[] | undefined) ?? []
      b.squares = [
        ...squares,
        { square: first, typeId: paintSel, pairedWith: square },
        { square, typeId: paintSel, pairedWith: first },
      ]
    })
  }

  const place = (square: string) => {
    updateBoard((b) => {
      const current = (b.placements as Placement[] | undefined) ?? []
      const existing = current.find((p) => p.square === square)
      // Tapping an occupied square clears it — including when the child is
      // holding a different piece, because "swap what is here" and "remove what
      // is here" cannot both be one tap and removal is the one they can undo by
      // tapping again.
      if (existing) {
        b.placements = current.filter((p) => p.square !== square)
        return
      }
      if (placePiece === '') return
      b.placements = [...current, { square, pieceId: placePiece, side: placeSide }]
    })
  }

  // ------------------------------------------------------------------ saving

  /** This room is no longer in the document — deleted, from here or the library. */
  const roomDeleted = openedId !== null && openDraft(source, 'preset', openedId) === null

  /**
   * Gives this room its own board when it is sharing one.
   *
   * Two rooms pointing at one board is legal and reachable, and the paint and
   * place tabs edit the board record directly — so without this, painting in one
   * room silently repaints every other room built on the same board. The fork is
   * silent on purpose: the child asked to change THIS room, and a dialog about
   * record identity is not a question they can answer.
   *
   * Only when the board is genuinely shared. Forking unconditionally would leave
   * an orphan board behind on every save.
   */
  const forkBoard = (base: ContentSource, boardDraft: Draft, presetId: string): Draft => {
    const id = String(boardDraft.id ?? '')
    if (id === '') return boardDraft
    const sharers = roomsReferencing(base, 'board', id).filter((room) => room !== presetId)
    if (sharers.length === 0) return boardDraft
    const forkId = nextFreeId(base.boards, 'board.room-', MAX_SEEDED_BOARDS)
    return { ...structuredClone(boardDraft), id: forkId, nameKey: deriveKey(forkId, 'name') }
  }

  const save = (): ContentSource | null => {
    if (roomDeleted) {
      setErrors([{ contentId: openedId ?? '', path: '', message: t('ui.editor.room.deleted') }])
      setSaved(false)
      return null
    }
    if (openedId !== null && !sameSnapshot(snapshotOf(source, 'preset', openedId), openedSnapshot)) {
      setErrors([{ contentId: openedId, path: '', message: t('ui.editor.form.stale') }])
      setSaved(false)
      return null
    }
    const openedBoardId = String(board.id ?? '')

    const next = structuredClone(draft)
    const id = String(next.id ?? '')
    const renaming = openedId !== null && id !== '' && id !== openedId

    if (renaming && typeof next.nameKey === 'string' && next.nameKey.startsWith(`${openedId}.`)) {
      next.nameKey = `${id}${next.nameKey.slice(openedId!.length)}`
    }

    let strings = renaming ? rekeyStrings(source.strings, openedId!, id) : source.strings
    if (id !== '' && nameTyped) {
      // The room's own key when it has one — same rule as `RecordForm`'s
      // `slotFor`: a shipped room's name is keyed `preset.slice.name`, and
      // overriding THAT key is what renaming means.
      const existing = next.nameKey
      const key = typeof existing === 'string' && existing !== '' ? existing : deriveKey(id, 'name')
      const value = nameText.trim()
      if (value === '' && makeTranslate()(key) === key) {
        // A room with no name is a blank card in the title screen's carousel —
        // the one control the whole product funnels through.
        setErrors([{ contentId: id, path: 'nameKey', message: t('ui.editor.form.name-needed') }])
        setSaved(false)
        return null
      }
      next.nameKey = key
      strings = value === '' ? clearString(strings, DEFAULT_LOCALE, key) : writeString(strings, DEFAULT_LOCALE, key, value)
    }
    // Narrowed rather than spread blindly: `strings` is exactly-optional, so a
    // document with `strings: undefined` is a DIFFERENT document from one that
    // omits the field, and the schema tells the two apart.
    const base = strings !== undefined && strings !== source.strings ? { ...source, strings } : source

    // The board goes first, and the preset is committed against the source the
    // board's commit returned. The other order fails whenever the board is new:
    // a preset naming a board the document does not have yet is a dangling
    // reference, and `commitDraft` runs the whole document through the loader.
    const boardToSave = forkBoard(base, board, id)
    const boardId = String(boardToSave.id ?? '')

    /*
     * The board is a SECOND subject this save commits, so it needs the same
     * stale check as the preset — but only when the save is actually going to
     * REPLACE the record this screen opened.
     *
     * The check used to run before `forkBoard`, and that was a save-blocking
     * regression on the most ordinary path there is. A new room seeds its board
     * from `boards[0]`, which another room almost always already references, so
     * the save forks into a brand-new record and never touches the original —
     * yet an unrelated edit to that original refused the save anyway, with a
     * message about staleness that did not apply to anything being written. The
     * previous comment even claimed a fork "cannot be stale by construction"
     * while the code checked it regardless.
     *
     * Refusing rather than remounting, for the reason `RecordForm` gives: a
     * remount discards a half-painted board, which trades one silent loss for
     * another.
     */
    if (boardId === openedBoardId && !sameSnapshot(snapshotOf(source, 'board', openedBoardId), openedBoardSnapshot)) {
      setErrors([{ contentId: openedBoardId, path: '', message: t('ui.editor.form.stale') }])
      setSaved(false)
      return null
    }

    const boardResult = commitDraft(base, 'board', boardToSave, openedBoardId === boardId ? openedBoardId : undefined)
    if (!boardResult.ok) {
      setErrors(boardResult.errors)
      setSaved(false)
      return null
    }
    next.boardId = boardId

    const result = commitDraft(boardResult.source, 'preset', next, openedId ?? undefined)
    if (!result.ok) {
      setErrors(result.errors)
      setSaved(false)
      return null
    }
    setErrors([])
    setDraft(next)
    setBoard(boardToSave)
    setOpenedId(id)
    setOpenedSnapshot(snapshotOf(result.source, 'preset', id))
    setOpenedBoardSnapshot(snapshotOf(result.source, 'board', boardId))
    setNameTyped(false)
    setSaved(true)
    commit(result.source)
    return result.source
  }

  // ------------------------------------------------------------------ render

  const squareGrid = (render: (square: string) => React.ReactNode) => {
    const rows = []
    for (let rank = height - 1; rank >= 0; rank--) {
      for (let file = 0; file < width; file++) rows.push(sq(file, rank))
    }
    return (
      <div className="build-grid" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}>
        {rows.map((square) => render(square))}
      </div>
    )
  }

  const parityOf = (square: string) => (square.charCodeAt(0) - 97 + Number(square.slice(1)) - 1) % 2

  return (
    <section className="room-detail" data-testid="room-detail" data-step={step}>
      {/*
        The header and the steps are one sticky block, and they have to be.
        This screen is nested inside the editor's own scroller rather than
        sitting directly in the phone shell, so it cannot own the viewport the
        way `Lobby` or `Rules` do — and without this, scrolling down to reach the
        card pool took the save button and the five steps off the top of the
        screen with it. Wrapped rather than stuck individually so the second one
        does not need to know the height of the first.
      */}
      <div className="build-top">
        <header className="screen-head">
          <button type="button" className="back" data-testid="room-back" aria-label={t('ui.editor.room.back')} onClick={onBack}>
            ‹
          </button>
          <span className="head-title">
            <span className="kicker">{t('ui.editor.rooms.title')}</span>
            <strong>{displayName(draft)}</strong>
          </span>
          <button type="button" className="positive" data-testid="room-save" onClick={save} disabled={roomDeleted}>
            {t(saved ? 'ui.editor.room.saved' : 'ui.editor.room.save')}
          </button>
        </header>

        <div className="build-steps">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              data-testid={`room-step-${s}`}
              data-selected={s === step}
              aria-pressed={s === step}
              onClick={() => setStep(s)}
            >
              {t(`ui.editor.step.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="screen-body">
        {step === 'board' && (
          <>
            <p className="hint">{t('ui.editor.step.board-hint')}</p>
            {squareGrid((square) => {
              const hit = painted.find((s) => s.square === square)
              const mark = hit ? markOfRecord('squareTypes', hit.typeId) : null
              return (
                <button
                  key={square}
                  type="button"
                  className="build-cell"
                  data-testid={`paint-${square}`}
                  data-parity={parityOf(square)}
                  data-painted={Boolean(hit)}
                  data-arming={pendingPair === square}
                  aria-label={square}
                  onClick={() => paint(square)}
                >
                  {mark && mark.kind !== 'none' && <MarkBody mark={mark} />}
                </button>
              )
            })}
            {pendingPair && <p className="hint pending">{t('ui.editor.paint.pair-pending')}</p>}

            <h3>{t('ui.editor.paint.palette')}</h3>
            <div className="palette">
              {squareTypes.map(([id, nameKey]) => {
                const mark = markOfRecord('squareTypes', id)
                return (
                  <button
                    key={id}
                    type="button"
                    data-testid={`paint-pick-${id}`}
                    data-selected={paintSel === id}
                    aria-pressed={paintSel === id}
                    onClick={() => {
                      setPaintSel(id)
                      setPendingPair(null)
                    }}
                  >
                    {mark.kind !== 'none' && <MarkBody mark={mark} />}
                    <span>{recordLabel(t, id, nameKey)}</span>
                  </button>
                )
              })}
              <button
                type="button"
                data-testid="paint-pick-erase"
                data-selected={paintSel === ''}
                aria-pressed={paintSel === ''}
                onClick={() => {
                  setPaintSel('')
                  setPendingPair(null)
                }}
              >
                <Pix sprite={PIXEL_SPRITES.erase} />
                <span>{t('ui.editor.paint.erase')}</span>
              </button>
            </div>

            {/* What the held tool DOES. The palette is marks and short names, and
                a child who has not met a portal yet has no way to learn it there. */}
            <SelectedTypeNote source={source} typeId={paintSel} t={t} />
          </>
        )}

        {step === 'pieces' && (
          <>
            <p className="hint">{t('ui.editor.step.pieces-hint')}</p>
            <div className="tile-grid">
              {pieces.map(([id, nameKey]) => {
                const on = list('pieceIds').includes(id)
                const mark = markOfRecord('pieces', id, 'white')
                return (
                  <button
                    key={id}
                    type="button"
                    className="tile"
                    data-testid={`room-piece-${id}`}
                    data-selected={on}
                    aria-pressed={on}
                    onClick={() => toggle('pieceIds', id)}
                  >
                    {mark.kind !== 'none' && <MarkBody mark={mark} />}
                    <span>{recordLabel(t, id, nameKey)}</span>
                  </button>
                )
              })}
              <VanishedRows field="pieceIds" prefix="room-piece" ids={list('pieceIds')} present={pieces} t={t} onToggle={toggle} />
            </div>
            {lastPieceRefused && (
              <p className="refusal" data-testid="room-last-piece-notice">
                {t('ui.editor.room.last-piece')}
              </p>
            )}
            <button type="button" className="positive" data-testid="room-new-piece" onClick={() => onCreateRecord('piece')}>
              {t('ui.editor.room.new-piece')}
            </button>
          </>
        )}

        {step === 'place' && (
          <>
            <p className="hint">{t('ui.editor.step.place-hint')}</p>
            <div className="side-picker">
              {(['white', 'black'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  data-testid={`place-side-${side}`}
                  data-side={side}
                  data-selected={placeSide === side}
                  aria-pressed={placeSide === side}
                  onClick={() => setPlaceSide(side)}
                >
                  {t(`ui.side.${side}`)}
                </button>
              ))}
            </div>
            {squareGrid((square) => {
              const here = placements.find((p) => p.square === square)
              const hit = painted.find((s) => s.square === square)
              const mark = here
                ? markOfRecord('pieces', here.pieceId, here.side)
                : hit
                  ? markOfRecord('squareTypes', hit.typeId)
                  : null
              return (
                <button
                  key={square}
                  type="button"
                  className="build-cell"
                  data-testid={`place-${square}`}
                  data-parity={parityOf(square)}
                  data-painted={Boolean(hit)}
                  data-side={here?.side ?? ''}
                  aria-label={square}
                  onClick={() => place(square)}
                >
                  {mark && mark.kind !== 'none' && <MarkBody mark={mark} />}
                </button>
              )
            })}
            <p className="hint centred" data-testid="place-count">
              {t('ui.editor.place.count')
                .replace('{white}', String(placements.filter((p) => p.side === 'white').length))
                .replace('{black}', String(placements.filter((p) => p.side === 'black').length))}
            </p>
            <div className="palette">
              {/* Only the pieces this room actually plays with. Offering the rest
                  would let a child place a piece the room does not list, which
                  the loader accepts and the match then draws with no rules a
                  player can look up. */}
              {pieces
                .filter(([id]) => list('pieceIds').includes(id))
                .map(([id, nameKey]) => {
                  const mark = markOfRecord('pieces', id, placeSide)
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`place-pick-${id}`}
                      data-selected={placePiece === id}
                      aria-pressed={placePiece === id}
                      onClick={() => setPlacePiece(id)}
                    >
                      {mark.kind !== 'none' && <MarkBody mark={mark} />}
                      <span>{recordLabel(t, id, nameKey)}</span>
                    </button>
                  )
                })}
            </div>
            <button
              type="button"
              data-testid="place-clear"
              onClick={() =>
                updateBoard((b) => {
                  b.placements = []
                })
              }
            >
              {t('ui.editor.place.clear')}
            </button>
          </>
        )}

        {step === 'cards' && (
          <>
            <h3>{t('ui.editor.room.rules')}</h3>
            <p className="hint">{t('ui.editor.step.rules-hint')}</p>
            <ChipList
              field="ruleCardIds"
              prefix="room-rule"
              entries={rules}
              chosen={list('ruleCardIds')}
              markOf={(id) => markOfRecord('ruleCards', id)}
              onToggle={toggle}
              t={t}
            />
            <button type="button" className="positive" data-testid="room-new-rule" onClick={() => onCreateRecord('ruleCard')}>
              {t('ui.editor.room.new-rule')}
            </button>

            <h3>{t('ui.editor.room.skills')}</h3>
            <p className="hint">{t('ui.editor.step.skills-hint')}</p>
            <ChipList
              field="skillCardIds"
              prefix="room-skill"
              entries={skills}
              chosen={list('skillCardIds')}
              markOf={(id) => markOfRecord('skillCards', id)}
              onToggle={toggle}
              t={t}
            />
            <button type="button" className="positive" data-testid="room-new-skill" onClick={() => onCreateRecord('skillCard')}>
              {t('ui.editor.room.new-skill')}
            </button>

            <h3>{t('ui.editor.room.loadout')}</h3>
            <p className="hint">{t('ui.editor.step.loadout-hint')}</p>
            <LoadoutSection
              draft={draft}
              source={source}
              costs={costs}
              t={t}
              onChange={(mutate) => {
                setDraft((d) => {
                  const next = structuredClone(d)
                  mutate(next)
                  return next
                })
                setSaved(false)
              }}
            />
          </>
        )}

        {step === 'name' && (
          <>
            <label htmlFor="room-name-input">{t('ui.editor.room.name')}</label>
            <input
              id="room-name-input"
              data-testid="room-name"
              value={nameText}
              onChange={(e) => {
                setNameText(e.target.value)
                setNameTyped(true)
                setSaved(false)
              }}
            />
            <p className="hint">{t('ui.editor.room.name-hint')}</p>

            <div className="room-preview">
              <div className="mini-board" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }} aria-hidden="true">
                {Array.from({ length: width * height }, (_, i) => {
                  const rank = height - 1 - Math.floor(i / width)
                  const file = i % width
                  const square = sq(file, rank)
                  return (
                    <span
                      key={square}
                      data-parity={parityOf(square)}
                      data-painted={painted.some((s) => s.square === square)}
                    />
                  )
                })}
              </div>
              <div className="room-meta">
                <strong>{displayName(draft)}</strong>
                <span className="hint">
                  {t('ui.editor.room.summary')
                    .replace('{pieces}', String(list('pieceIds').length))
                    .replace('{rules}', String(list('ruleCardIds').length))
                    .replace('{skills}', String(list('skillCardIds').length))}
                </span>
              </div>
            </div>

            {onPlay && (
              <button
                type="button"
                className="primary xl"
                data-testid="room-play"
                onClick={() => {
                  // Saving first is the point of the button — "try it now" that
                  // played an unsaved room would show the child something they
                  // could not get back to.
                  if (save()) onPlay()
                }}
              >
                {t('ui.editor.room.play')}
              </button>
            )}
          </>
        )}

        {/* The save button's own label also flips to "saved", but a label is
            not an announcement: React swaps the text inside a node that was
            already there, and a screen reader says nothing for that. This is the
            live region that does. */}
        {saved && (
          <p className="saved-note" data-testid="room-saved" role="status">
            {t('ui.editor.room.saved')}
          </p>
        )}

        {roomDeleted && (
          <p className="refusal" data-testid="room-deleted-notice">
            {t('ui.editor.room.deleted')}
          </p>
        )}

        {errors.length > 0 && (
          <ul className="refusal" data-testid="room-errors">
            {errors.map((e, i) => (
              <li key={`${e.path}-${i}`}>{e.message}</li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * A row for anything this draft holds that the document no longer does.
 *
 * These rows are the point. The lists are built from the current `source`, and
 * this screen stays mounted while the library deletes things — so a record
 * ticked here but not yet SAVED could be deleted underneath (no committed room
 * references it, so the delete is correct), and the id stayed in the draft with
 * no control left to untick it. The save then failed validation and the only way
 * out was to abandon the room. A row that exists purely to be unticked is what
 * turns that dead end back into a decision.
 */
function VanishedRows({
  field,
  prefix,
  ids,
  present,
  t,
  onToggle,
}: {
  field: string
  prefix: string
  ids: string[]
  present: Array<[string, unknown]>
  t: Translate
  onToggle: (field: string, id: string) => void
}) {
  const known = new Set(present.map(([id]) => id))
  return (
    <>
      {ids
        .filter((id) => !known.has(id))
        .map((id) => (
          <button
            key={id}
            type="button"
            className="tile vanished"
            data-testid={`${prefix}-${id}`}
            data-selected
            aria-pressed
            onClick={() => onToggle(field, id)}
          >
            <span>{`${id} (${t('ui.editor.room.missing-entry')})`}</span>
          </button>
        ))}
    </>
  )
}

/** Which cards this room draws from, as toggles. */
function ChipList({
  field,
  prefix,
  entries,
  chosen,
  markOf,
  onToggle,
  t,
}: {
  field: string
  prefix: string
  entries: Array<[string, unknown]>
  chosen: string[]
  markOf: (id: string) => Mark
  onToggle: (field: string, id: string) => void
  t: Translate
}) {
  const known = new Set(entries.map(([id]) => id))
  return (
    <div className="chips">
      {entries.map(([id, nameKey]) => {
        const on = chosen.includes(id)
        const mark = markOf(id)
        return (
          <button
            key={id}
            type="button"
            className="chip"
            data-testid={`${prefix}-${id}`}
            data-selected={on}
            aria-pressed={on}
            onClick={() => onToggle(field, id)}
          >
            {mark.kind !== 'none' && <MarkBody mark={mark} />}
            {recordLabel(t, id, nameKey)}
          </button>
        )
      })}
      {chosen
        .filter((id) => !known.has(id))
        .map((id) => (
          <button
            key={id}
            type="button"
            className="chip vanished"
            data-testid={`${prefix}-${id}`}
            data-selected
            aria-pressed
            onClick={() => onToggle(field, id)}
          >
            {`${id} (${t('ui.editor.room.missing-entry')})`}
          </button>
        ))}
      {entries.length === 0 && chosen.length === 0 && <p className="empty">{t('ui.editor.library.empty')}</p>}
    </div>
  )
}

/** What the square type currently held by the paint tool does. */
function SelectedTypeNote({ source, typeId, t }: { source: ContentSource; typeId: string; t: Translate }) {
  if (typeId === '') {
    return (
      <div className="note-box">
        <strong>{t('ui.editor.paint.erase')}</strong>
        <p>{t('ui.editor.paint.erase-hint')}</p>
      </div>
    )
  }
  const record = (source.squareTypes as Array<Record<string, unknown>>).find((r) => r.id === typeId)
  if (!record) return null
  const nameKey = typeof record.nameKey === 'string' ? record.nameKey : ''
  const textKey = typeof record.textKey === 'string' ? record.textKey : ''
  return (
    <div className="note-box" data-testid="paint-note">
      <strong>{recordLabel(t, typeId, nameKey)}</strong>
      <p>{textKey ? t(textKey) : ''}</p>
      {Boolean(record.paired) && <p className="hint">{t('ui.editor.paint.paired-hint')}</p>}
    </div>
  )
}

/**
 * The loadout: one piece and one skill card each side brings of its own.
 *
 * Three choices per side, and the constraint between them is the whole feature:
 * the piece may only stand in for a bundled piece of the SAME grade (ADR-008),
 * and the pair must fit the room's budget (ADR-004). Both are shown before the
 * save rather than reported by the validator afterwards — the validator's message
 * names a JSON path, which is not a sentence a nine-year-old can act on.
 *
 * A grade the cache has not produced yet reads as "measuring", never as zero.
 * `checkLoadoutGrades` refuses an ungraded record, so a picker that showed 0
 * would be offering a choice the save is about to reject.
 */
function LoadoutSection({
  draft,
  source,
  costs,
  t,
  onChange,
}: {
  draft: Draft
  source: ContentSource
  costs: Costs
  t: Translate
  onChange: (mutate: (next: Draft) => void) => void
}) {
  const [side, setSide] = useState<'white' | 'black'>('white')

  /**
   * The in-progress choice, which is NOT the same object as the saved slot.
   *
   * A slot carries all three ids together (ADR-001), so a half-filled one cannot
   * live in the draft — and the first version wrote there anyway, deleting the
   * partial slot on every change. The author picked a piece, then a target, then
   * a card, and each write erased the one before it, so the slot could never
   * reach three. The partial choice belongs to the form; the draft only ever sees
   * a complete slot or none.
   */
  const saved = (draft.loadout as Record<string, LoadoutDraft> | undefined) ?? {}
  const [pending, setPending] = useState<Record<string, LoadoutDraft>>(() => ({ ...saved }))
  const slot = pending[side] ?? saved[side]
  const budget = typeof draft.loadoutBudget === 'number' ? draft.loadoutBudget : null
  const pieceIds = (draft.pieceIds as string[] | undefined) ?? []
  const pool = (draft.skillCardIds as string[] | undefined) ?? []

  /** Cards the room does not already deal — the only ones a side may own. */
  const ownable = namedRecords(source.skillCards).filter(([id]) => !pool.includes(id))
  const royal = new Set(
    (source.pieces as Array<Record<string, unknown>>).filter((p) => p.royal === true).map((p) => String(p.id)),
  )
  const replaceable = pieceIds.filter((id) => !royal.has(id))

  const costOf = (id: string | undefined): number | null => (id ? costs.of(id) : null)
  const label = (id: string | undefined): string => {
    const cost = costOf(id)
    return cost === null ? t('ui.editor.loadout.none') : t('ui.editor.loadout.grade').replace('{stars}', starText(cost))
  }

  const pieceCost = costOf(slot?.pieceId)
  const skillCost = costOf(slot?.skillCardId)
  const replacedCost = costOf(slot?.replaces)
  const spent = (pieceCost ?? 0) + (skillCost ?? 0)
  const priced = pieceCost !== null && skillCost !== null

  const mismatch = pieceCost !== null && replacedCost !== null && pieceCost !== replacedCost
  const overBudget = priced && budget !== null && spent > budget

  const setSlot = (field: 'pieceId' | 'replaces' | 'skillCardId', value: string) => {
    const current = pending[side] ?? saved[side] ?? { pieceId: '', replaces: '', skillCardId: '' }
    const updated = { ...current, [field]: value }
    setPending((prev) => ({ ...prev, [side]: updated }))

    const complete = updated.pieceId !== '' && updated.replaces !== '' && updated.skillCardId !== ''
    onChange((next) => {
      const all = (next.loadout as Record<string, LoadoutDraft> | undefined) ?? {}
      const nextAll = { ...all }
      // Only a COMPLETE slot reaches the document. An incomplete one clears the
      // side rather than being written half-formed, because a slot missing any of
      // its three ids is a document that will not load.
      if (complete) nextAll[side] = updated
      else delete nextAll[side]
      if (Object.keys(nextAll).length === 0) delete next.loadout
      else next.loadout = nextAll
      // The room needs a scale and a budget the moment it has a loadout, and
      // both are refused at load time when absent (ADR-010). Seeded from the
      // room's OWN records so no source file names a piece (AC-009).
      if (complete) {
        if (next.grading === undefined && replaceable[0] && ownable[0]) {
          next.grading = { referencePieceId: replaceable[0], referenceSkillCardId: ownable[0][0] }
        }
        if (typeof next.loadoutBudget !== 'number') next.loadoutBudget = DEFAULT_LOADOUT_BUDGET
      }
    })
  }

  return (
    <div className="loadout" data-testid="room-loadout">
      <div className="loadout-sides">
        {(['white', 'black'] as const).map((s) => (
          <button
            key={s}
            type="button"
            data-testid={`loadout-side-${s}`}
            data-selected={side === s}
            aria-pressed={side === s}
            onClick={() => setSide(s)}
          >
            {t(`ui.editor.loadout.side-${s}`)}
          </button>
        ))}
      </div>

      <label htmlFor="loadout-piece">{t('ui.editor.loadout.piece')}</label>
      <select
        id="loadout-piece"
        data-testid="loadout-piece"
        value={slot?.pieceId ?? ''}
        onChange={(e) => setSlot('pieceId', e.target.value)}
      >
        <option value="">{t('ui.editor.loadout.none')}</option>
        {namedRecords(source.pieces)
          .filter(([id]) => !royal.has(id))
          .map(([id, nameKey]) => (
            <option key={id} value={id}>
              {`${recordLabel(t, id, nameKey)} — ${label(id)}`}
            </option>
          ))}
      </select>

      <label htmlFor="loadout-replaces">{t('ui.editor.loadout.replaces')}</label>
      <select
        id="loadout-replaces"
        data-testid="loadout-replaces"
        value={slot?.replaces ?? ''}
        onChange={(e) => setSlot('replaces', e.target.value)}
      >
        <option value="">{t('ui.editor.loadout.none')}</option>
        {replaceable.map((id) => (
          <option key={id} value={id}>
            {`${recordLabel(t, id, keyOf(source.pieces, id))} — ${label(id)}`}
          </option>
        ))}
      </select>

      {ownable.length === 0 && (
        /*
         * The state a real room reaches and no test fixture did: this room deals
         * EVERY card in the library, and a card the room deals cannot also be one
         * side's own, so there is nothing left to choose. Found by opening the
         * app — every test had quietly added a card of its own first, which made
         * the empty case unreachable by construction.
         *
         * Named rather than left as a dropdown with one entry. A control that is
         * technically present and cannot be completed is the worst of the three
         * available answers; the other two are explaining it and offering the way
         * out, and this does both.
         */
        <p className="hint" data-testid="loadout-no-cards">
          {t('ui.editor.loadout.no-cards')}
        </p>
      )}
      <label htmlFor="loadout-skill">{t('ui.editor.loadout.skill')}</label>
      <select
        id="loadout-skill"
        data-testid="loadout-skill"
        value={slot?.skillCardId ?? ''}
        onChange={(e) => setSlot('skillCardId', e.target.value)}
      >
        <option value="">{t('ui.editor.loadout.none')}</option>
        {ownable.map(([id, nameKey]) => (
          <option key={id} value={id}>
            {`${recordLabel(t, id, nameKey)} — ${label(id)}`}
          </option>
        ))}
      </select>

      <p className="loadout-budget" data-testid="loadout-budget">
        {budget === null
          ? t('ui.editor.loadout.no-budget')
          : t('ui.editor.loadout.budget').replace('{spent}', priced ? String(spent) : '?').replace('{budget}', String(budget))}
      </p>

      {mismatch && (
        <p className="refusal" data-testid="loadout-mismatch">
          {t('ui.editor.loadout.mismatch')}
        </p>
      )}
      {overBudget && (
        <p className="refusal" data-testid="loadout-over-budget">
          {t('ui.editor.loadout.over-budget')}
        </p>
      )}
      <p className="hint" data-testid="loadout-caveat">
        {t('ui.editor.loadout.caveat')}
      </p>
    </div>
  )
}

interface LoadoutDraft {
  pieceId: string
  replaces: string
  skillCardId: string
}

/**
 * The budget a room gets when it first grows a loadout.
 *
 * Matches the bundled room's, which was derived from that room's own 600-seed
 * measurement rather than picked — see the comment on `loadoutBudget` in
 * `src/content/sets/bundled.ts`. An authored room starts from the same footing
 * and the author can move it.
 */
const DEFAULT_LOADOUT_BUDGET = 18

/** The `nameKey` of a record in an unvalidated collection, for labelling only. */
function keyOf(records: readonly unknown[], id: string): string {
  const found = records.find((r) => String((r as { id?: unknown }).id ?? '') === id)
  return String((found as { nameKey?: unknown } | undefined)?.nameKey ?? '')
}
