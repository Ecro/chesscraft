import type { GameState, MatchResult, Side } from '@engine/types'
import { PIXEL_SPRITES } from './art/pixels'
import { Pix } from './art/Pix'
import { type Translate, useTranslate } from './i18n'

/**
 * The end of a match, as a screen rather than a sentence.
 *
 * It used to be one `<p>` and a rematch button wedged above the board, which is
 * the shape an end state takes when nobody has decided what happens next. The
 * three things a child wants at that moment are: who won, why, and one more
 * game — and the second of those was already carried by `resultLabel`, so what
 * this adds is rank and the two other exits (fix this room, go home).
 *
 * Rendered by `MatchHost`, over the board it belongs to, and NOT promoted to a
 * route in `App`. Making it a route would mean lifting the match — position,
 * both hands, the ply count — up a level purely so a summary screen could read
 * it, and every one of those numbers below comes from the final `GameState`.
 */

/**
 * The end-of-match sentence.
 *
 * Exported because the reason code is the one place an engine identifier can
 * reach a player: `state.result.reason` is `'king_capture' | 'win_action' |
 * 'material_cap'`, and rendering it directly prints `king_capture` on screen at
 * the end of every match.
 */
export function resultLabel(t: Translate, result: MatchResult): string {
  const reason = t(`ui.result.reason.${result.reason}`)
  if (result.kind !== 'win') return `${t('ui.result.draw')} — ${reason}`
  return `${t(`ui.side.${result.winner}`)} ${t('ui.result.win')} — ${reason}`
}

export function Result({
  state,
  result,
  nameOf,
  onRematch,
  onEditRoom,
  onHome,
}: {
  state: GameState
  result: MatchResult
  nameOf: (side: Side) => string
  onRematch: () => void
  onEditRoom: () => void
  onHome: () => void
}) {
  const t = useTranslate()
  const winner = result.kind === 'win' ? result.winner : null
  // `captured` is keyed by the side that LOST the piece, so a side's own tally is
  // the other side's list. Getting this backwards is invisible in a close game
  // and obvious in a rout, which is the worst way for a bug to be found.
  const took = (side: Side) => state.captured[side === 'white' ? 'black' : 'white'].length

  return (
    <div className="result-screen" data-testid="result-screen" data-winner={winner ?? ''}>
      <div className="result-body">
        <div className="result-crest" data-side={winner ?? ''}>
          <Pix
            sprite={PIXEL_SPRITES.king}
            tint={winner ? `var(--pix-tint-${winner})` : undefined}
          />
        </div>

        {/* The same node and the same test id the inline panel used, so the
            lifecycle suite keeps reading the outcome from one place. */}
        <p className="result-title" data-testid="result" data-winner={winner ?? ''}>
          {winner ? t('ui.result.winner').replace('{name}', nameOf(winner)) : t('ui.result.draw')}
        </p>
        <p className="result-reason">{t(`ui.result.reason.${result.reason}`)}</p>

        <ul className="result-stats">
          <li>
            <strong>{state.plyCount}</strong>
            <span>{t('ui.result.stat.plies')}</span>
          </li>
          <li data-side="white">
            <strong>{took('white')}</strong>
            <span>{t('ui.result.stat.took').replace('{name}', nameOf('white'))}</span>
          </li>
          <li data-side="black">
            <strong>{took('black')}</strong>
            <span>{t('ui.result.stat.took').replace('{name}', nameOf('black'))}</span>
          </li>
        </ul>
      </div>

      <div className="result-actions">
        <button className="primary xl" data-testid="rematch" onClick={onRematch}>
          {t('ui.action.rematch')}
        </button>
        <div className="result-secondary">
          <button className="positive" data-testid="result-edit-room" onClick={onEditRoom}>
            {t('ui.home.edit-room')}
          </button>
          <button data-testid="go-home" onClick={onHome}>
            {t('ui.action.home')}
          </button>
        </div>
      </div>
    </div>
  )
}
