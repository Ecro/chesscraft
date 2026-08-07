import { useState } from 'react'
import { PIXEL_SPRITES } from './art/pixels'
import { Pix } from './art/Pix'
import { useTranslate } from './i18n'

/**
 * First-run onboarding (Chess Craft redesign).
 *
 * This was `Coach`: two cards floating over the home screen. Two things were
 * wrong with that, and only one of them was visual. It competed with the title
 * behind it, and — the load-bearing one — it deliberately taught nothing about
 * what the app IS, on the reasoning that anything written there would be a
 * second, drifting copy of the reference screen. That reasoning holds for
 * RULES, which are generated from the content and therefore always true. It does
 * not hold for the product: a child who opens this and sees a chess board has no
 * way to discover that the board is the thing they are meant to change.
 *
 * So the three cards say the three things that are true no matter what content
 * is loaded — you build it, the rules vary per match, two of you share one phone
 * — and still say nothing about how any particular piece moves.
 *
 * The one-card-at-a-time guard is kept and is still structural: this component
 * can only ever render `STEPS[step]`, never the list. The documented way
 * onboarding fails is explaining everything up front, and this app has four
 * content layers that would happily be explained.
 */
const STEPS = [
  { id: 'build', sprite: PIXEL_SPRITES['nav-build'] },
  { id: 'rules', sprite: PIXEL_SPRITES.hill },
  { id: 'hotseat', sprite: PIXEL_SPRITES.arrows },
] as const

export function Boot({ onDone }: { onDone: () => void }) {
  const t = useTranslate()
  const [step, setStep] = useState(0)
  const current = STEPS[step] ?? STEPS[0]
  const isLast = step === STEPS.length - 1

  return (
    <section className="boot" data-testid={`boot-step-${current.id}`} aria-label={t('ui.boot.label')}>
      <div className="boot-body">
        <div className="boot-crest">
          {/* Big — 8x the sprite's natural size, which is the whole reason the
              art is 12 pixels of data rather than a raster: it scales to a
              150px crest and stays exactly as sharp as it is in a tab. */}
          <Pix sprite={current.sprite} />
        </div>
        {/* `aria-live`, because the buttons stay put and only this text changes.
            Without it a screen-reader user pressing next hears nothing at all
            and has to go looking for what moved. */}
        <p className="boot-title" role="status" aria-live="polite">
          {t(`ui.boot.${current.id}.title`)}
        </p>
        <p className="boot-text">{t(`ui.boot.${current.id}.body`)}</p>
        <ol className="boot-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <li key={s.id} data-on={i === step} />
          ))}
        </ol>
      </div>

      <div className="boot-actions">
        {/* Skip is on every step EXCEPT the last, where it would be a second
            button doing exactly what the first one does — and a child cannot
            tell what "skip" skips when there is nothing left. */}
        {!isLast && (
          <button type="button" data-testid="boot-skip" onClick={onDone}>
            {t('ui.boot.skip')}
          </button>
        )}
        <button
          type="button"
          className="primary"
          data-testid={isLast ? 'boot-done' : 'boot-next'}
          onClick={() => (isLast ? onDone() : setStep((i) => i + 1))}
        >
          {t(isLast ? 'ui.boot.done' : 'ui.boot.next')}
        </button>
      </div>
    </section>
  )
}
