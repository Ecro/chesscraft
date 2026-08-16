import type { Mark } from './art/resolve'
import { MarkBody } from './art/MarkBody'
import { useTranslate } from './i18n'

/**
 * A short pause over the final board before the result screen takes ownership.
 *
 * The final position is valuable evidence: it shows the exact square where the
 * royal fell and the last-move outline identifies the path. This notice adds the
 * sentence the board cannot provide by itself, then yields to the normal result
 * summary after the player has had time to read it.
 */
export function CaptureReveal({
  mark,
  attacker,
  action,
  captured,
  from,
  to,
}: {
  mark: Mark
  attacker: string
  action: string
  captured: string
  from?: string
  to?: string
}) {
  const t = useTranslate()
  const detail = from && to
    ? t('ui.capture.move')
        .replace('{attacker}', attacker)
        .replace('{action}', action)
        .replace('{from}', from)
        .replace('{to}', to)
        .replace('{captured}', captured)
    : t('ui.capture.card')
        .replace('{attacker}', attacker)
        .replace('{action}', action)
        .replace('{captured}', captured)

  return (
    <div className="capture-reveal" data-testid="capture-reveal" role="status" aria-live="assertive">
      {mark.kind !== 'none' && (
        <span className="banner-icon" aria-hidden="true">
          <MarkBody mark={mark} />
        </span>
      )}
      <span className="capture-reveal-body">
        <strong>{t('ui.capture.king-caught')}</strong>
        <span>{detail}</span>
        <small>{t('ui.capture.result-next')}</small>
      </span>
    </div>
  )
}
