import { useId, useState } from 'react'
import type { ContentSet } from '@content/load'
import { progressionAffordances } from '@progression/affordances'
import { upgradesForBase, upgradeById } from '@progression/catalog'
import { practiceContent } from '@progression/practice'
import { UpgradeAcquired, UpgradePortrait, upgradeText } from './UpgradeCard'
import { UpgradePractice } from './UpgradePractice'
import type { ProgressionProfileV1 } from '@progression/model'
import { FORGE_COST, forgeUpgrade } from '@progression/rewards'
import { useTranslate } from './i18n'

export function UpgradeFamily({
  basePieceId,
  profile,
  onProgressionChange,
}: {
  content: ContentSet
  basePieceId: string
  profile: ProgressionProfileV1
  onProgressionChange: (next: ProgressionProfileV1) => boolean
}) {
  const t = useTranslate()
  const [saveFailed, setSaveFailed] = useState(false)
  const [acquired, setAcquired] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const choiceId = useId()
  const family = upgradesForBase(basePieceId)
  const upgrade = upgradeById(basePieceId) ?? family.find((entry) => entry.id === selectedId) ?? family[0]
  if (!upgrade) return null
  const definition = practiceContent.pieces.get(upgrade.id)
  if (!definition) return null
  const owned = profile.ownedUpgradeIds.includes(upgrade.id)
  const affordances = progressionAffordances(profile)

  const forge = () => {
    const result = forgeUpgrade(profile, upgrade.id)
    if (result.ok) {
      const saved = onProgressionChange(result.profile)
      setSaveFailed(!saved)
      setAcquired(saved ? upgrade.id : null)
    }
  }

  return (
    <section
      className="upgrade-family"
      data-testid={`upgrade-family-${basePieceId}`}
      aria-label={t('ui.upgrade.region').replace('{name}', upgradeText(definition.nameKey))}
    >
      <h3>{t('ui.upgrade.family')}</h3>
      {family.length > 1 && (
        <>
          <label htmlFor={choiceId}>{t('ui.upgrade.family-choice')}</label>
          <select id={choiceId} data-testid="upgrade-family-choice" value={upgrade.id} onChange={(event) => {
            setSelectedId(event.target.value)
            setSaveFailed(false)
            setAcquired(null)
          }}>
            {family.map((entry) => {
              const piece = practiceContent.pieces.get(entry.id)!
              return <option key={entry.id} value={entry.id}>{upgradeText(piece.nameKey)}</option>
            })}
          </select>
        </>
      )}
      <UpgradePortrait pieceId={upgrade.id} />
      <strong>{upgradeText(definition.nameKey)}</strong>
      <p data-testid="upgrade-move-preview">
        {t('ui.upgrade.move-preview')} {upgradeText(definition.textKey)}
      </p>
      <UpgradePractice key={upgrade.id} upgradeId={upgrade.id} />
      {acquired === upgrade.id && owned && <UpgradeAcquired upgradeId={upgrade.id} />}
      {owned && <p className="hint">{t('ui.upgrade.equip-next')}</p>}
      <p data-testid="upgrade-owned" data-owned={String(owned)}>
        {t(owned ? 'ui.upgrade.owned' : 'ui.upgrade.unowned')}
      </p>
      {saveFailed && (
        <p className="hint" data-testid="progression-save-failed" role="status">
          {t('ui.progression.save-failed')}
        </p>
      )}
      {!owned && (
        <button
          type="button"
          data-testid={`upgrade-forge-${upgrade.id}`}
          disabled={!affordances.forgeableUpgradeIds.includes(upgrade.id)}
          onClick={forge}
        >
          {t('ui.upgrade.forge').replace('{cost}', String(FORGE_COST))}
        </button>
      )}
    </section>
  )
}
