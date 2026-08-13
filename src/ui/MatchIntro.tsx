import type { Mark } from './art/resolve'
import { MarkBody } from './art/MarkBody'
import { useTranslate } from './i18n'
import { Sheet } from './Sheet'

/**
 * The sheet a player meets on the first board they ever open.
 *
 * `Boot` already runs on the home screen and says what the app IS. It cannot
 * say what a turn is, because at that point there is no board, no rule card and
 * no hand to point at — and a tour that explains a mechanic three screens
 * before the mechanic exists is the documented way onboarding fails. This is
 * the other half, and it lives where the thing it describes is.
 *
 * Three blocks, and the split is not cosmetic:
 *
 * 1. **The rule this match drew**, read from the loaded content set. Generated,
 *    never written down — the same argument `Rules.tsx` makes for the dex. A
 *    hand-maintained sentence would go stale the first time anyone authors a
 *    room, which is the product's whole point.
 * 2. **The turn shape.** The one rule no content set can state for itself:
 *    playing a card does not spend your turn, you still move. It is a property
 *    of the engine, so it is the only prose here that is safe to hard-code as a
 *    key.
 * 3. **That the opponent's card will be announced.** This exists so the banner
 *    is discoverable BEFORE it first fires. A one-shot notice nobody is
 *    expecting reads as a glitch; one they were told about reads as the game
 *    talking to them.
 *
 * The rule block is conditional because a preset need not deal a rule card, and
 * an empty bordered box explaining nothing is worse than three blocks becoming
 * two.
 */
export function MatchIntro({
  rule,
  ruleMark,
  onClose,
}: {
  /** The rule card this match drew, or absent when the preset dealt none. */
  rule?: { nameKey: string; textKey: string } | undefined
  ruleMark: Mark
  onClose: () => void
}) {
  const t = useTranslate()

  return (
    <Sheet label={t('ui.intro.title')} onClose={onClose} scrimTestId="match-intro">
      <div className="intro-body">
        <h2 className="intro-title">{t('ui.intro.title')}</h2>

        {rule && (
          <section className="intro-rule" data-testid="match-intro-rule">
            <span className="intro-label">{t('ui.intro.rule.label')}</span>
            <div className="intro-rule-head">
              {ruleMark.kind !== 'none' && (
                <span className="intro-icon" aria-hidden="true">
                  <MarkBody mark={ruleMark} />
                </span>
              )}
              <strong>{t(rule.nameKey)}</strong>
            </div>
            <p>{t(rule.textKey)}</p>
          </section>
        )}

        <section className="intro-point">
          <strong>{t('ui.intro.turn.title')}</strong>
          <p>{t('ui.intro.turn.body')}</p>
        </section>

        <section className="intro-point">
          <strong>{t('ui.intro.opponent.title')}</strong>
          <p>{t('ui.intro.opponent.body')}</p>
        </section>
      </div>

      <button type="button" className="primary" data-testid="match-intro-close" onClick={onClose}>
        {t('ui.intro.start')}
      </button>
    </Sheet>
  )
}
