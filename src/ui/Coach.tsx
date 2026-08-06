import { useTranslate } from './i18n'

/**
 * First-visit coach marks (PLAN Phase 3).
 *
 * One card at a time, in order, skippable at every step. The documented way
 * onboarding fails is explaining the whole product up front, and this one has
 * four content layers to explain — pieces, rule cards, skill cards, special
 * squares — so the temptation is real and the guard is structural: the
 * component can only ever render `STEPS[index]`, not the list.
 *
 * It deliberately teaches nothing about how a piece moves. That belongs to the
 * rules screen, which is generated from the content and therefore always true;
 * anything written here would be a second, drifting copy of it.
 */

/**
 * Two cards, not four. Review found the first restating `ui.home.tagline`
 * almost verbatim on the same screen — a child who learns the first card is
 * skippable stops reading the one that is not — and the middle two narrating
 * controls already visible and labelled. What survives is the thing to do and
 * the thing that is not discoverable: where to look a piece up later.
 */
const STEPS = ['start', 'rules'] as const

export function Coach({
  index,
  onNext,
  onDone,
}: {
  index: number
  onNext: () => void
  onDone: () => void
}) {
  const t = useTranslate()
  // Unreachable by construction — the next button unmounts at the last step —
  // but the component takes its index from a caller now, so it does not get to
  // assume that.
  const step = STEPS[index]
  if (!step) return null

  const isLast = index === STEPS.length - 1

  return (
    <div className="coach" data-testid={`coach-step-${step}`} role="dialog" aria-modal="false">
      <p className="coach-body">{t(`ui.coach.${step}`)}</p>
      <div className="coach-actions">
        {/* Skip is on every step EXCEPT the last, where it would be a second
            button doing exactly what the first one does — and a child cannot
            tell what "skip" skips when there is nothing left. */}
        {!isLast && (
          <button data-testid="coach-skip" onClick={onDone}>
            {t('ui.coach.skip')}
          </button>
        )}
        {isLast ? (
          <button className="primary" data-testid="coach-done" onClick={onDone}>
            {t('ui.coach.done')}
          </button>
        ) : (
          <button className="primary" data-testid="coach-next" onClick={onNext}>
            {t('ui.coach.next')}
          </button>
        )}
      </div>
      <span className="coach-progress">
        {index + 1} / {STEPS.length}
      </span>
    </div>
  )
}
