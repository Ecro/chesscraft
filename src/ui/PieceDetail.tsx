import type { PieceDef } from '@content/schema'
import type { Translate } from './i18n'
import { Cell, DIRECTIONS, type Dir8, GRID_RANGE, hasMoves, hasTakes, readGrid } from './PieceMoves'
import { resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'
import { MarkBody } from './art/MarkBody'

/**
 * How a piece moves, drawn for a player rather than for an author (ADR-007).
 *
 * The editor already owns a 7x7 grid, and this is deliberately NOT that
 * component: the editor's cells are buttons that cycle move -> capture -> both ->
 * none on tap, and handing a player a control that edits the piece they are
 * asking about is a different feature. This one is inert — the same geometry,
 * the same `.move-cell` states, no handlers.
 *
 * ## Why the null branch is a rendered branch, not a fallthrough
 *
 * `readGrid` returns null for every piece it cannot round-trip: more than one
 * movement pattern, two travel kinds, a distance cap, an offset off the grid.
 * A renderer that only mapped over the returned grid would draw an empty box
 * for those pieces and report nothing — which is this repo's most-recurring
 * failure shape, a feature that silently never fires for the inputs that
 * motivated it. So there are exactly two outcomes here and the caller can rely
 * on that: a grid that marks at least one square, or a sentence saying this
 * piece is too complicated to draw.
 *
 * A grid whose cells are all `None` is folded into the SECOND branch rather
 * than rendered as an empty diagram, for the same reason. "Nothing is marked"
 * and "this cannot be drawn" look identical to a nine-year-old; only one of
 * them is a sentence they can act on.
 */
export function PieceMoveRegion({ piece, t }: { piece: PieceDef; t: Translate }) {
  const grid = readGrid(piece as unknown as Record<string, unknown>)
  /*
   * "Does this piece have anywhere to go" is asked of BOTH controls, via the
   * schema's own helpers rather than by counting cells here.
   *
   * Counting `cells` alone was correct only while the grid was the whole model.
   * Sliding now lives in `slides` — a direction plus a shared reach, because a
   * finite grid has no cell meaning "and keep going" — so a rook has an EMPTY
   * `cells` map and is perfectly drawable. Reading the count would have called
   * every sliding piece undrawable, which is the same silent-blank failure this
   * component exists to prevent, wearing a different hat.
   */
  const anything = grid !== null && (hasMoves(grid) || hasTakes(grid))

  if (!grid || !anything) {
    return (
      <p className="move-undrawable" data-testid="move-undrawable">
        {t('ui.piece-info.undrawable')}
      </p>
    )
  }

  const slides: Dir8[] = DIRECTIONS.filter((dir) => grid.slides[dir] !== Cell.None)

  return (
    <div className="move-region" data-testid="move-region">
      <div className="move-grid" data-testid="move-grid" role="img" aria-label={t('ui.piece-info.grid-label')}>
        {GRID_RANGE.map((dr) =>
          GRID_RANGE.map((df) => {
            const centre = df === 0 && dr === 0
            if (centre) {
              return (
                <span key={`${df},${dr}`} className="move-cell" data-centre="true" aria-hidden="true">
                  <MarkBody mark={resolveMark(t, piece, { registry: artRegistry, side: 'white', fallback: 'none' })} />
                </span>
              )
            }
            return (
              <span
                key={`${df},${dr}`}
                className="move-cell"
                data-value={grid.cells[`${df},${dr}`] ?? Cell.None}
                aria-hidden="true"
              />
            )
          }),
        )}
      </div>
      {/* Sliding is shown SEPARATELY from hopping, mirroring how it is authored
          (ADR-027 of the editor): a slide is a direction plus a distance, and
          painting it into the grid is what made a lit cell stop denoting a
          reachable square. Rendered only when the piece actually slides, so a
          knight's sheet does not carry an empty dial. */}
      {slides.length > 0 && (
        <p className="move-slides" data-testid="move-slides">
          {t('ui.piece-info.slides')
            .replace('{dirs}', slides.map((dir) => t(`ui.editor.piece.dir.${dir}`)).join(', '))
            .replace('{reach}', t(`ui.piece-info.reach.${grid.reach}`))}
        </p>
      )}
      {/* The legend is not decoration. The three cell states differ by hue and
          by a glyph, and the glyph is the channel a colour-blind player has —
          but a glyph nobody has been told the meaning of is not a channel. */}
      <ul className="move-legend" data-testid="move-legend">
        <li data-value={Cell.Move}>{t('ui.piece-info.legend.move')}</li>
        <li data-value={Cell.Capture}>{t('ui.piece-info.legend.capture')}</li>
        <li data-value={Cell.Both}>{t('ui.piece-info.legend.both')}</li>
      </ul>
    </div>
  )
}
