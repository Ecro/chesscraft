import { useMemo, useState } from 'react'
import { PRACTICE_ORIGIN, PRACTICE_SQUARES, practiceContent, upgradePractice } from '@progression/practice'
import { upgradeById } from '@progression/catalog'
import { useTranslate } from './i18n'
import { UpgradePortrait, upgradeText } from './UpgradeCard'

export function UpgradePractice({ upgradeId }: { upgradeId: string }) {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  return (
    <div className="upgrade-practice-toggle">
      <button type="button" data-testid={`upgrade-practice-${upgradeId}`} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? 'ui.practice.hide' : 'ui.practice.try')}
      </button>
      {open && <PracticeBoard key={upgradeId} upgradeId={upgradeId} />}
    </div>
  )
}

function PracticeBoard({ upgradeId }: { upgradeId: string }) {
  const t = useTranslate()
  const example = useMemo(() => upgradePractice(upgradeId), [upgradeId])
  const [base, setBase] = useState(false)
  const [landed, setLanded] = useState<string | null>(null)
  const upgrade = upgradeById(upgradeId)
  if (!example || !upgrade) return null
  const pieceId = base ? upgrade.basePieceId : upgradeId
  const name = upgradeText(practiceContent.pieces.get(pieceId)!.nameKey)
  const targets = base ? example.baseTargets : example.upgradeTargets
  const current = landed ?? PRACTICE_ORIGIN
  return (
    <section className="upgrade-practice" data-testid="upgrade-practice" aria-label={t('ui.practice.region')}>
      <h4>{name}</h4>
      <p>{t('ui.practice.context')}</p>
      <div className="row-actions">
        <button type="button" data-testid="practice-base" aria-pressed={base} onClick={() => { setBase(true); setLanded(null) }}>{t('ui.practice.base')}</button>
        <button type="button" data-testid="practice-upgrade" aria-pressed={!base} onClick={() => { setBase(false); setLanded(null) }}>{t('ui.practice.upgrade')}</button>
      </div>
      <p>{t('ui.practice.legend')}</p>
      <div className="practice-board" role="group" aria-label={t('ui.practice.board')}>
        {PRACTICE_SQUARES.map((square, index) => {
          const occupied = square === current
          const king = square === 'a1' || square === 'f6'
          const added = !base && example.addedTargets.includes(square)
          const legal = targets.includes(square)
          const label = occupied ? 'piece' : king ? 'king' : added ? 'added' : legal ? 'ordinary' : 'unavailable'
          return (
            <button type="button" key={square} className="practice-square"
              data-testid={`practice-square-${square}`} data-piece={occupied ? pieceId : ''}
              data-added={String(added)} data-dark={(Math.floor(index / 6) + index % 6) % 2 === 0}
              aria-label={`${square} · ${t(`ui.practice.cell.${label}`)}`}
              disabled={landed !== null || !legal}
              onClick={() => { if (legal && landed === null) setLanded(square) }}>
              {occupied ? <UpgradePortrait pieceId={pieceId} /> : king ? <span aria-hidden="true">♚</span> : !landed && legal ? <span aria-hidden="true">{added ? '★' : '·'}</span> : null}
            </button>
          )
        })}
      </div>
      <p data-testid="practice-feedback" role="status">
        {t(landed ? (!base && example.addedTargets.includes(landed) ? 'ui.practice.success' : 'ui.practice.ordinary') : 'ui.practice.prompt')}
      </p>
      <button type="button" data-testid="practice-reset" onClick={() => setLanded(null)}>{t('ui.practice.reset')}</button>
    </section>
  )
}
