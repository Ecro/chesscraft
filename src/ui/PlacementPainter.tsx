import type React from 'react'
import type { Mark } from './art/resolve'
import { MarkBody } from './art/MarkBody'
import { PIXEL_SPRITES } from './art/pixels'
import { Pix } from './art/Pix'
import type { Translate } from './i18n'

/**
 * The one way this game puts something on a square.
 *
 * Extracted from `RoomDetail`, which had it first and still looks exactly the
 * same — the room's every `data-testid` is unchanged, which is the only reason
 * that extraction could be called a refactor rather than a rewrite. The board
 * RECORD's editor used to draw its own: two tiny buttons per square, one of them
 * labelled with the algebraic name (`a6`) and the other with `·`/`w`/`b`, and
 * `<select>` dropdowns for the piece and the side. That surface was the only
 * place in the app that showed a child a coordinate string, and it wrote the
 * identical model — `boardDef.placements` — through different code.
 *
 * ## Why the test-id prefix is a prop and not a constant
 *
 * `Edit.tsx` keeps BOTH editor panels mounted and hides the inactive one with
 * the `hidden` attribute, so a room on its placement step and a board record in
 * the library can be in the document at the same moment. Both used to emit
 * `place-${square}`. One namespace would therefore make `getByTestId` ambiguous
 * exactly when a test drives both surfaces to compare them — which is the test
 * that proves they agree. The room keeps the unprefixed ids so its suites and
 * its e2e spec did not have to be touched; the board record takes `board-`.
 *
 * ## Why the palette is a prop rather than derived here
 *
 * A room offers only the pieces it lists — placing one it does not list produces
 * a board the loader accepts and the match then draws with no rules a player can
 * look up. A standalone board record has no room to scope by, so it offers
 * everything in the source. The scoping decision belongs to the caller that
 * knows which of the two it is; this component just draws what it is handed.
 *
 * Tap to place, tap the same square again to take it away. Not drag-and-drop:
 * measured on 7-8 year olds, a tap succeeds about 83% of the time and a
 * drag-and-drop about 30%, and dragging is close to the worst gesture in the set.
 */

export type PainterMode = 'place' | 'paint'

export interface Placed {
  square: string
  pieceId: string
  side: 'white' | 'black'
}

/**
 * What one tap on a square does to a board's `placements`.
 *
 * Shared rather than duplicated, and that is not tidiness: the two surfaces had
 * DIFFERENT answers here, and only one of them had a reason written down. The
 * room cleared any occupied square whatever the child was holding; the board
 * record cleared only on an exact piece-and-side match and otherwise replaced.
 * A child who tapped a square holding the wrong piece therefore got a different
 * outcome depending on which screen they were on.
 *
 * The room's rule wins, with its own argument: "swap what is here" and "remove
 * what is here" cannot both be one tap, and removal is the one a child can undo
 * by tapping again.
 *
 * Returns a NEW list; never mutates the one it is given.
 */
export function togglePlacement(
  list: readonly Placed[],
  square: string,
  pieceId: string,
  side: 'white' | 'black',
): Placed[] {
  if (list.some((p) => p.square === square)) return list.filter((p) => p.square !== square)
  // Nothing held, nothing to put down — and emphatically not an empty-id entry,
  // which the schema's `contentId` refuses at save with a message naming a field
  // the child has never seen.
  if (pieceId === '') return [...list]
  return [...list, { square, pieceId, side }]
}

/** A painted square, as a board record stores it. */
export interface PaintedSquare {
  square: string
  typeId: string
  pairedWith?: string
}

/**
 * Removes a square's paint, and its partner's with it.
 *
 * A half-erased pair is a board the loader refuses, and the child's action was
 * "remove this one" — taking both is the only outcome that leaves them somewhere
 * valid.
 */
export function erasePaint(list: readonly PaintedSquare[], square: string): PaintedSquare[] {
  const hit = list.find((s) => s.square === square)
  if (!hit) return [...list]
  const alsoRemove = new Set([square, ...(hit.pairedWith ? [hit.pairedWith] : [])])
  return list.filter((s) => !alsoRemove.has(s.square))
}

/** What one tap on a square did: a new square list, a new pending half, or both. */
export interface PaintResult {
  squares?: PaintedSquare[]
  pendingPair: string | null
}

/**
 * What one tap does to a board's painted squares.
 *
 * Shared for the same reason `togglePlacement` is, and found the same way — by a
 * reviewer noticing the two callers had drifted. The board record's copy
 * REPLACED a square's entry in place, which left the other half of a portal pair
 * pointing at a square that no longer pairs back: a document the loader refuses,
 * produced by painting over one end of a pair. It also had no cancel for tapping
 * the same square twice while arming a pair, so that produced two entries for
 * one square, each paired with itself.
 *
 * The room's rules win on both counts, and they are the ones with a written
 * argument behind them.
 *
 * `typeId === ''` is the erase tool. `pendingPair` is the first half of a pair
 * waiting for its partner; a result with no `squares` means the tap only moved
 * that state.
 */
export function paintSquare(
  list: readonly PaintedSquare[],
  square: string,
  typeId: string,
  isPaired: (typeId: string) => boolean,
  pendingPair: string | null,
): PaintResult {
  if (typeId === '') return { squares: erasePaint(list, square), pendingPair: null }

  // Tapping a square that already holds the SELECTED type erases it — what makes
  // a palette usable without a separate eraser mode for the common case.
  if (list.find((s) => s.square === square)?.typeId === typeId) {
    return { squares: erasePaint(list, square), pendingPair: null }
  }

  if (!isPaired(typeId)) {
    return { squares: [...erasePaint(list, square), { square, typeId }], pendingPair: null }
  }

  // Paired: two taps, and tapping the same square twice cancels rather than
  // pairing it with itself.
  if (pendingPair === null) return { pendingPair: square }
  if (pendingPair === square) return { pendingPair: null }

  const cleared = erasePaint(erasePaint(list, pendingPair), square)
  return {
    squares: [
      ...cleared,
      { square: pendingPair, typeId, pairedWith: square },
      { square, typeId, pairedWith: pendingPair },
    ],
    pendingPair: null,
  }
}

/** What is on one square, as far as the drawing is concerned. */
export interface PainterCell {
  mark: Mark | null
  painted: boolean
  /** Paint mode only — the first half of a portal pair is chosen and waiting. */
  arming?: boolean
  /** Place mode only — drives the cell's colour. */
  side?: 'white' | 'black' | ''
}

export interface PaletteEntry {
  id: string
  label: string
  mark: Mark
}

export interface PlacementPainterProps {
  mode: PainterMode
  width: number
  height: number
  /**
   * Prepended to every test id. Empty keeps the room's historical ids, which is
   * what lets the room's tests pass unedited. See the header.
   */
  testIdPrefix?: string
  hint: string
  cellOf: (square: string) => PainterCell
  onSquare: (square: string) => void
  palette: PaletteEntry[]
  selected: string
  onSelect: (id: string) => void
  t: Translate
  /** Rendered between the grid and the palette heading. The room's pending-pair note. */
  afterGrid?: React.ReactNode
  /** Rendered after the palette. The room's "what the held tool does" note. */
  footer?: React.ReactNode
  /** Paint mode: the palette gets a heading and an erase tool. */
  paletteHeading?: string
  includeErase?: boolean
  /** Place mode: the side picker, the running count and the clear-all. */
  side?: 'white' | 'black'
  onSide?: (side: 'white' | 'black') => void
  counts?: { white: number; black: number }
  onClear?: () => void
}

export const squareName = (file: number, rank: number) => `${String.fromCharCode(97 + file)}${rank + 1}`

/**
 * Light on the a-file's first rank, as every board in the game draws it.
 * Derived from the name rather than the loop indices so a caller that renders a
 * subset still gets the same colours — the room's mini-board preview imports it
 * for exactly that reason.
 */
export const parityOf = (square: string) => (square.charCodeAt(0) - 97 + Number(square.slice(1)) - 1) % 2

export function PlacementPainter(props: PlacementPainterProps): React.ReactElement {
  const { mode, width, height, hint, cellOf, onSquare, palette, selected, onSelect, t } = props
  const prefix = props.testIdPrefix ?? ''
  const cellId = mode === 'place' ? 'place' : 'paint'
  const pickId = mode === 'place' ? 'place-pick' : 'paint-pick'

  const squares: string[] = []
  for (let rank = height - 1; rank >= 0; rank--) {
    for (let file = 0; file < width; file++) squares.push(squareName(file, rank))
  }

  return (
    <>
      <p className="hint">{hint}</p>

      {mode === 'place' && props.onSide && (
        <div className="side-picker">
          {(['white', 'black'] as const).map((side) => (
            <button
              key={side}
              type="button"
              data-testid={`${prefix}place-side-${side}`}
              data-side={side}
              data-selected={props.side === side}
              aria-pressed={props.side === side}
              onClick={() => props.onSide?.(side)}
            >
              {t(`ui.side.${side}`)}
            </button>
          ))}
        </div>
      )}

      <div className="build-grid" style={{ gridTemplateColumns: `repeat(${width}, 1fr)` }}>
        {squares.map((square) => {
          const cell = cellOf(square)
          return (
            <button
              key={square}
              type="button"
              className="build-cell"
              data-testid={`${prefix}${cellId}-${square}`}
              data-parity={parityOf(square)}
              data-painted={cell.painted}
              {...(mode === 'paint' ? { 'data-arming': cell.arming ?? false } : { 'data-side': cell.side ?? '' })}
              aria-label={square}
              onClick={() => onSquare(square)}
            >
              {cell.mark && cell.mark.kind !== 'none' && <MarkBody mark={cell.mark} />}
            </button>
          )
        })}
      </div>

      {props.afterGrid}

      {mode === 'place' && props.counts && (
        <p className="hint centred" data-testid={`${prefix}place-count`}>
          {t('ui.editor.place.count')
            .replace('{white}', String(props.counts.white))
            .replace('{black}', String(props.counts.black))}
        </p>
      )}

      {props.paletteHeading && <h3>{props.paletteHeading}</h3>}

      <div className="palette">
        {palette.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-testid={`${prefix}${pickId}-${entry.id}`}
            data-selected={selected === entry.id}
            aria-pressed={selected === entry.id}
            onClick={() => onSelect(entry.id)}
          >
            {entry.mark.kind !== 'none' && <MarkBody mark={entry.mark} />}
            <span>{entry.label}</span>
          </button>
        ))}
        {props.includeErase && (
          <button
            type="button"
            data-testid={`${prefix}${pickId}-erase`}
            data-selected={selected === ''}
            aria-pressed={selected === ''}
            onClick={() => onSelect('')}
          >
            <Pix sprite={PIXEL_SPRITES.erase} />
            <span>{t('ui.editor.paint.erase')}</span>
          </button>
        )}
      </div>

      {props.footer}

      {mode === 'place' && props.onClear && (
        <button type="button" data-testid={`${prefix}place-clear`} onClick={props.onClear}>
          {t('ui.editor.place.clear')}
        </button>
      )}
    </>
  )
}
