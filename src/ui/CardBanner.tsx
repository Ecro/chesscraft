import type { Side } from '@engine/types'
import type { Mark } from './art/resolve'
import { MarkBody } from './art/MarkBody'
import { useTranslate } from './i18n'

/**
 * The card that just fired, named while it is still news.
 *
 * The defect this closes was reported in one sentence: *"it is hard to tell
 * which skill the opponent used."* That was exactly right. Before this the
 * board drew what an effect DID — a badge on the square, a chip in the legend —
 * and nothing anywhere said which card had done it. The only trace a played
 * card left was a dimmed tile in the other player's hand strip, which a player
 * has to already suspect something to go looking at.
 *
 * Both sides, not just the opponent's. Hot-seat shares one screen, so
 * "opponent" is not a stable referent — and the player who spent the card is
 * never blocked by the banner, so announcing their own play costs them nothing
 * and tells the person across the table everything.
 *
 * Content-agnostic, like every other surface here: it takes a resolved name and
 * text, so it names no card, and an authored card announces itself with no code
 * change (AC-009).
 */
export function CardBanner({
  mark,
  name,
  text,
  side,
  by,
}: {
  mark: Mark
  /** Already translated — this component may not know a card by id. */
  name: string
  text: string
  side: Side
  /** Who played it, in the words the rest of the screen uses for them. */
  by: string
}) {
  const t = useTranslate()

  return (
    // `role="status"` with `aria-live`, the same contract the hand-off uses:
    // what the colour and the motion say to everyone else, this says to a
    // screen reader. `pointer-events: none` in the stylesheet — it is not
    // something to dismiss, it is something to notice.
    <div className="card-banner" data-testid="card-banner" data-side={side} role="status" aria-live="polite">
      {mark.kind !== 'none' && (
        <span className="banner-icon" aria-hidden="true">
          <MarkBody mark={mark} />
        </span>
      )}
      <span className="card-banner-body">
        <span className="card-banner-head">{t('ui.card.played.by').replace('{name}', by)}</span>
        <strong>{name}</strong>
        <span className="card-banner-text">{text}</span>
      </span>
    </div>
  )
}
