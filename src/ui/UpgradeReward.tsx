import { useState } from 'react'
import type { StandardEligibility } from '@progression/eligibility'
import { progressionAffordances } from '@progression/affordances'
import type { ProgressionProfileV1 } from '@progression/model'
import { chooseOffer, purchaseReveal, REVEAL_COST, FORGE_COST } from '@progression/rewards'
import { UpgradeAcquired, UpgradeCard, upgradeText } from './UpgradeCard'
import { UpgradePractice } from './UpgradePractice'
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
  const [acquired, setAcquired] = useState<string | null>(null)

  const reveal = () => {
    const result = purchaseReveal(profile)
    if (result.ok) setActionSaveFailed(!onProgressionChange(result.profile))
  }
  const choose = (upgradeId: string) => {
    const result = chooseOffer(profile, upgradeId)
    if (result.ok) {
      const saved = onProgressionChange(result.profile)
      setActionSaveFailed(!saved)
      setAcquired(saved ? upgradeId : null)
    }
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
      <p className="hint">{t('ui.progression.how')}</p>
      {acquired && profile.ownedUpgradeIds.includes(acquired) && <UpgradeAcquired upgradeId={acquired} />}
      {affordances.complete ? (
        <p className="upgrade-complete" data-testid="progression-complete">{t('ui.progression.complete')}</p>
      ) : (
        <div className="progression-goals">
          {([
            ['reveal', REVEAL_COST, affordances.revealRemaining],
            ['forge', FORGE_COST, affordances.forgeRemaining],
          ] as const).map(([path, cost, remaining]) => (
            <div key={path} data-testid={`progression-${path}-goal`} data-remaining={remaining}>
              <strong>{t(`ui.progression.goal.${path}`).replace('{cost}', String(cost))}</strong>
              <progress max={cost} value={Math.min(cost, profile.sparks)} aria-label={t(`ui.progression.goal.${path}`).replace('{cost}', String(cost))} />
              <span>{t(remaining === 0 ? 'ui.progression.ready' : 'ui.progression.remaining').replace('{count}', String(remaining))}</span>
            </div>
          ))}
        </div>
      )}
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
          <p>{t('ui.progression.offer-count').replace('{count}', String(profile.pendingOffer.upgradeIds.length))} {t('ui.progression.offer')}</p>
          <p className="hint">{t('ui.progression.keep-offer')}</p>
          <div className="upgrade-choice-grid">
          {profile.pendingOffer.upgradeIds.map((upgradeId) => (
            <UpgradeCard key={upgradeId} upgradeId={upgradeId}>
            <UpgradePractice upgradeId={upgradeId} />
            <button
              type="button"
              data-testid={`progression-offer-${upgradeId}`}
              onClick={() => choose(upgradeId)}
            >
              {t('ui.progression.choose').replace('{name}', upgradeText(`piece.${upgradeId.slice('piece.'.length)}.name`))}
            </button>
            </UpgradeCard>
          ))}
          </div>
        </div>
      ) : !affordances.complete ? (
        <button
          type="button"
          data-testid="progression-reveal"
          disabled={!affordances.canPurchaseReveal}
          onClick={reveal}
        >
          {t('ui.progression.reveal').replace('{cost}', String(REVEAL_COST))}
        </button>
      ) : null}
    </section>
  )
}
