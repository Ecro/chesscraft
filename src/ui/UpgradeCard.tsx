import type { ReactNode } from 'react'
import { practiceContent } from '@progression/practice'
import { makeTranslate, useTranslate } from './i18n'
import { MarkBody } from './art/MarkBody'
import { resolveMark } from './art/resolve'
import { artRegistry } from './art/registry'

// Official acquisition/practice copy must agree with the canonical definitions.
export const upgradeText = makeTranslate(practiceContent.strings)

export function UpgradePortrait({ pieceId }: { pieceId: string }) {
  const definition = practiceContent.pieces.get(pieceId)
  if (!definition) return null
  return <span className="upgrade-portrait" aria-hidden="true"><MarkBody mark={resolveMark(upgradeText, definition, { registry: artRegistry, side: 'white', fallback: 'none' })} /></span>
}

export function UpgradeCard({ upgradeId, children }: { upgradeId: string; children?: ReactNode }) {
  const t = useTranslate()
  const definition = practiceContent.pieces.get(upgradeId)
  if (!definition) return null
  return (
    <article className="upgrade-card">
      <UpgradePortrait pieceId={upgradeId} />
      <h4>{upgradeText(definition.nameKey)}</h4>
      <p className="upgrade-style">{t(`ui.upgrade.style.${upgradeId}`)}</p>
      <p className="upgrade-ability">{upgradeText(definition.textKey)}</p>
      {children}
    </article>
  )
}

export function UpgradeAcquired({ upgradeId }: { upgradeId: string }) {
  const t = useTranslate()
  const definition = practiceContent.pieces.get(upgradeId)
  if (!definition) return null
  return (
    <div className="upgrade-acquired" role="status" aria-live="polite" data-testid="upgrade-acquired">
      <strong>{t('ui.upgrade.acquired').replace('{name}', upgradeText(definition.nameKey))}</strong>
      <p>{t('ui.upgrade.equip-next')}</p>
    </div>
  )
}
