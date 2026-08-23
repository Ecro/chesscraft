import type { CSSProperties, ReactNode } from 'react'
import {
  Cell,
  GRID_RANGE,
  isTurningAt,
  paintAt,
  rayOf,
  turnAt,
  cycleAt,
  type PieceGrid,
} from './PieceMoves'

interface MovementPatternGridProps {
  grid: PieceGrid
  axis: Cell.Move | Cell.Capture
  onChange: (grid: PieceGrid) => void
  testIdPrefix: string
  center?: ReactNode
  readOnly?: boolean
}

/** The single cell surface shared by piece and grant movement editing. */
export function MovementPatternGrid({
  grid,
  axis,
  onChange,
  testIdPrefix,
  center,
  readOnly = false,
}: MovementPatternGridProps) {
  return (
    <div className="move-grid" data-testid={`${testIdPrefix}-grid`}>
      {GRID_RANGE.map((dr) =>
        GRID_RANGE.map((df) => {
          const centre = df === 0 && dr === 0
          if (centre) {
            return (
              <span key={`${df},${dr}`} className="move-cell" data-centre="true" aria-hidden="true">
                {center}
              </span>
            )
          }
          const paint = paintAt(grid, axis, df, dr)
          const turning = isTurningAt(grid, axis, df, dr)
          const ray = rayOf(df, dr)
          const rayAngle = ray || paint.kind !== 'ray' ? undefined : (Math.atan2(-dr, df) * 180) / Math.PI
          return (
            <button
              key={`${df},${dr}`}
              type="button"
              className="move-cell"
              data-testid={`${testIdPrefix}-${df},${dr}`}
              data-value={paint.kind === 'leap' ? axis : Cell.None}
              data-cells={grid.cells[`${df},${dr}`] ?? Cell.None}
              data-paint={paint.kind}
              data-tip={paint.kind === 'ray' ? paint.tip : false}
              data-endless={paint.kind === 'ray' ? paint.endless : false}
              data-ray={ray?.dir ?? (paint.kind === 'ray' ? 'custom' : '')}
              data-turning={turning}
              style={rayAngle === undefined ? undefined : ({ '--ray-angle': `${rayAngle}deg` } as CSSProperties)}
              aria-label={`${df},${dr}`}
              aria-pressed={paint.kind !== 'none'}
              disabled={readOnly}
              onClick={() => onChange(cycleAt(grid, axis, df, dr))}
              onDoubleClick={() => onChange(turnAt(grid, axis, df, dr))}
            />
          )
        }),
      )}
    </div>
  )
}
