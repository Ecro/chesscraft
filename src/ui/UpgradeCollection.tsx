import { UPGRADE_CATALOG } from '@progression/catalog'
import { progressionAffordances } from '@progression/affordances'
import type { ProgressionProfileV1 } from '@progression/model'
import { practiceContent } from '@progression/practice'
import { UpgradePortrait, upgradeText } from './UpgradeCard'
import { useTranslate } from './i18n'

export function UpgradeCollection({ profile, onInspect }: { profile: ProgressionProfileV1; onInspect: (id: string) => void }) {
  const t = useTranslate()
  const { ownedCount, totalCount } = progressionAffordances(profile)
  return (
    <section className="upgrade-collection" aria-label={t('ui.upgrade.album')}>
      <h3>{t('ui.upgrade.album')}</h3>
      <p data-testid="upgrade-collection-count" role="status">{t('ui.upgrade.album-count').replace('{owned}', String(ownedCount)).replace('{total}', String(totalCount))}</p>
      <p className="hint">{t('ui.upgrade.album-hint')}</p>
      <div className="upgrade-album-grid">
        {UPGRADE_CATALOG.map(({ id }) => {
          const definition = practiceContent.pieces.get(id)!
          const owned = profile.ownedUpgradeIds.includes(id)
          return <button type="button" key={id} data-testid={`upgrade-album-${id}`} data-owned={String(owned)} onClick={() => onInspect(id)}>
            <UpgradePortrait pieceId={id} />
            <strong>{upgradeText(definition.nameKey)}</strong>
            <span>{t(owned ? 'ui.upgrade.owned' : 'ui.upgrade.unowned')}</span>
          </button>
        })}
      </div>
    </section>
  )
}
