import type { Side } from '@engine/types'
import type { Mark } from './art/resolve'
import { MarkBody } from './art/MarkBody'
import { useTranslate } from './i18n'

/** Announces an automatic skill acquisition without interrupting board play. */
export function AwardBanner({
  mark,
  name,
  text,
  side,
  by,
}: {
  mark: Mark
  name: string
  text: string
  side: Side
  by: string
}) {
  const t = useTranslate()
  return (
    <div className="award-banner" data-testid="skill-award-banner" data-side={side} role="status" aria-live="polite">
      {mark.kind !== 'none' && (
        <span className="banner-icon" aria-hidden="true">
          <MarkBody mark={mark} />
        </span>
      )}
      <span className="card-banner-body">
        <span className="card-banner-head">{t('ui.card.awarded.by').replace('{name}', by)}</span>
        <strong>{name}</strong>
        <span className="card-banner-text">{text}</span>
      </span>
    </div>
  )
}
