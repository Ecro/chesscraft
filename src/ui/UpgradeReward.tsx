import { useState } from 'react'
import type { StandardEligibility } from '@progression/eligibility'
import { progressionAffordances } from '@progression/affordances'
import type { ProgressionProfileV1 } from '@progression/model'
import { chooseOffer, purchaseReveal, REVEAL_COST } from '@progression/rewards'
import { useTranslate } from './i18n'

export type ProgressionNotice = 'none' | 'granted' | 'save-failed'

/** Inline, optional progression actions shared by result and dex. */
export function UpgradeReward({
  profile,
  eligibility,
  notice,
  onRetryGrant,
  onProgressionChange,
}: {
  profile: ProgressionProfileV1
  eligibility: StandardEligibility
  notice: ProgressionNotice
  onRetryGrant?: () => void
  onProgressionChange: (next: ProgressionProfileV1) => boolean
}) {
  const t = useTranslate()
  const affordances = progressionAffordances(profile)
  const [actionSaveFailed, setActionSaveFailed] = useState(false)

  const reveal = () => {
    const result = purchaseReveal(profile)
    if (result.ok) setActionSaveFailed(!onProgressionChange(result.profile))
  }
  const choose = (upgradeId: string) => {
    const result = chooseOffer(profile, upgradeId)
    if (result.ok) setActionSaveFailed(!onProgressionChange(result.profile))
  }

  return (
    <section
      className="upgrade-reward"
      data-testid="upgrade-reward"
      aria-label={t('ui.progression.region')}
    >
      <p data-testid="progression-sparks" role="status" aria-live="polite">
        {t('ui.progression.sparks').replace('{count}', String(profile.sparks))}
      </p>
      {notice === 'granted' && (
        <p data-testid="progression-granted" data-sparks={profile.sparks} role="status">
          {t('ui.progression.granted')}
        </p>
      )}
      {(notice === 'save-failed' || actionSaveFailed) && (
        <p className="hint" data-testid="progression-save-failed" role="status">
          {t('ui.progression.save-failed')}
        </p>
      )}
      {notice === 'save-failed' && onRetryGrant && (
        <button type="button" data-testid="progression-grant-retry" onClick={onRetryGrant}>
          {t('ui.progression.retry')}
        </button>
      )}
      {!eligibility.eligible && (
        <p className="hint" data-testid="progression-sandbox">
          {t('ui.progression.sandbox')}{' '}
          {eligibility.reasons.map((reason) => t(`ui.eligibility.reason.${reason}`)).join(' ')}
        </p>
      )}
      {profile.pendingOffer ? (
        <div className="progression-offer" data-testid="progression-offer">
          <p>{t('ui.progression.offer')}</p>
          {profile.pendingOffer.upgradeIds.map((upgradeId) => (
            <button
              key={upgradeId}
              type="button"
              data-testid={`progression-offer-${upgradeId}`}
              onClick={() => choose(upgradeId)}
            >
              {t(`piece.${upgradeId.slice('piece.'.length)}.name`)}
            </button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          data-testid="progression-reveal"
          disabled={!affordances.canPurchaseReveal}
          onClick={reveal}
        >
          {t('ui.progression.reveal').replace('{cost}', String(REVEAL_COST))}
        </button>
      )}
    </section>
  )
}
