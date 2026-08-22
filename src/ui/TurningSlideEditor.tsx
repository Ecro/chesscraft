import type { Translate } from './i18n'
import { DIRECTIONS, DIRECTION_VECTORS, type Dir8, type TurningReach, TURNING_REACH_VALUES, type TurningRow } from './PieceMoves'
import { isValidTurnPair } from '../content/movement'

interface TurningSlideEditorProps {
  axis: 'move' | 'capture'
  rows: TurningRow[]
  onChange: (rows: TurningRow[]) => void
  t: Translate
  testIdPrefix?: string
  allowMultipleRows?: boolean
}

const DEFAULT_ROW: TurningRow = { first: 'n', second: 'e', reach: 2 }

function validPair(first: Dir8, second: Dir8): boolean {
  return isValidTurnPair(DIRECTION_VECTORS[first], DIRECTION_VECTORS[second])
}

function directionButtonLabel(t: Translate, direction: Dir8): string {
  return t(`ui.editor.piece.dir.${direction}`)
}

export function TurningSlideEditor({
  axis,
  rows,
  onChange,
  t,
  testIdPrefix,
  allowMultipleRows = true,
}: TurningSlideEditorProps) {
  const prefix = testIdPrefix ?? `turning-slide-${axis}`
  const updateRow = (index: number, next: TurningRow) => {
    onChange(rows.map((row, i) => (i === index ? next : row)))
  }

  const chooseDirection = (index: number, leg: 'first' | 'second', direction: Dir8) => {
    const row = rows[index]
    if (!row) return
    const next = { ...row, [leg]: direction } as TurningRow
    if (validPair(next.first, next.second)) updateRow(index, next)
  }

  const chooseReach = (index: number, reach: TurningReach) => {
    const row = rows[index]
    if (row) updateRow(index, { ...row, reach })
  }

  return (
    <fieldset className="turning-slide-editor" data-testid={`${prefix}-editor`}>
      <legend>{t(`ui.editor.turning.${axis}`)}</legend>
      <p className="hint">{t('ui.editor.turning.hint')}</p>
      {rows.map((row, index) => (
        <div className="turning-slide-row" data-testid={`${prefix}-row-${index}`} key={index}>
          <div className="turning-slide-leg" role="group" aria-label={t('ui.editor.turning.first')}>
            <span>{t('ui.editor.turning.first')}</span>
            {DIRECTIONS.map((direction) => (
              <button
                key={direction}
                type="button"
                data-testid={`${prefix}-row-${index}-first-${direction}`}
                data-selected={row.first === direction}
                aria-pressed={row.first === direction}
                aria-label={directionButtonLabel(t, direction)}
                disabled={!validPair(direction, row.second)}
                onClick={() => chooseDirection(index, 'first', direction)}
              >
                {directionButtonLabel(t, direction)}
              </button>
            ))}
          </div>
          <div className="turning-slide-leg" role="group" aria-label={t('ui.editor.turning.second')}>
            <span>{t('ui.editor.turning.second')}</span>
            {DIRECTIONS.map((direction) => (
              <button
                key={direction}
                type="button"
                data-testid={`${prefix}-row-${index}-second-${direction}`}
                data-selected={row.second === direction}
                aria-pressed={row.second === direction}
                aria-label={directionButtonLabel(t, direction)}
                disabled={!validPair(row.first, direction)}
                onClick={() => chooseDirection(index, 'second', direction)}
              >
                {directionButtonLabel(t, direction)}
              </button>
            ))}
          </div>
          <div className="turning-slide-reach" role="group" aria-label={t('ui.editor.turning.reach')}>
            <span>{t('ui.editor.turning.reach')}</span>
            {TURNING_REACH_VALUES.map((reach) => (
              <button
                key={reach}
                type="button"
                data-testid={`${prefix}-row-${index}-reach-${reach}`}
                data-selected={row.reach === reach}
                aria-pressed={row.reach === reach}
                onClick={() => chooseReach(index, reach)}
              >
                {reach === 'edge' ? t('ui.editor.turning.edge') : String(reach)}
              </button>
            ))}
          </div>
          {allowMultipleRows && (
            <button
              type="button"
              data-testid={`${prefix}-row-${index}-remove`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              {t('ui.editor.turning.remove')}
            </button>
          )}
        </div>
      ))}
      {allowMultipleRows && (
        <button type="button" data-testid={`${prefix}-add`} onClick={() => onChange([...rows, { ...DEFAULT_ROW }])}>
          {t('ui.editor.turning.add')}
        </button>
      )}
    </fieldset>
  )
}
