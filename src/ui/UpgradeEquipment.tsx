import { costCeiling, pieceStars } from '@balance/cost'
import type { ContentSet } from '@content/load'
import type { Side } from '@engine/types'
import { UPGRADE_CATALOG, upgradeById } from '@progression/catalog'
import { resolveEquipment } from '@progression/equipment'
import { standardEligibility } from '@progression/eligibility'
import type { ProgressionProfileV1 } from '@progression/model'
import { equipUpgrade } from '@progression/rewards'
import { canonicalAuthoredCeiling, CANONICAL_BOARD } from '@progression/power'
import { useTranslate } from './i18n'
import { recordLabel } from './recordLabel'
import { starText } from './useGrades'

export function UpgradeEquipment({
  content,
  bundle,
  presetId,
  profile,
  humanSides,
  onChange,
}: {
  content: ContentSet
  bundle: ContentSet
  presetId: string
  profile: ProgressionProfileV1
  humanSides: readonly Side[]
  onChange: (next: ProgressionProfileV1) => void
}) {
  const t = useTranslate()
  const preset = content.presets.get(presetId)
  const board = preset ? content.boards.get(preset.boardId) : undefined
  const resolved = resolveEquipment({ content, bundle, presetId, profile, humanSides })
  const eligibility = standardEligibility({
    content,
    bundle,
    presetId,
    effectiveEquipment: resolved.effectiveEquipment,
  })

  const clearSide = (side: Side) => {
    const presetEquipment = { ...profile.equipped[presetId] }
    delete presetEquipment[side]
    const equipped = { ...profile.equipped }
    if (Object.keys(presetEquipment).length === 0) delete equipped[presetId]
    else equipped[presetId] = presetEquipment
    onChange({ ...profile, equipped })
  }

  const chooseUpgrade = (side: Side, upgradeId: string) => {
    if (upgradeId === '') return clearSide(side)
    const upgrade = upgradeById(upgradeId)
    if (!upgrade || !board) return
    const square = board.placements.find(
      (placement) => placement.side === side && placement.pieceId === upgrade.basePieceId,
    )?.square
    if (!square) return
    const result = equipUpgrade(profile, presetId, side, upgradeId, square)
    if (result.ok) onChange(result.profile)
  }

  const chooseSquare = (side: Side, square: string) => {
    const saved = profile.equipped[presetId]?.[side]
    if (!saved) return
    const result = equipUpgrade(profile, presetId, side, saved.upgradeId, square)
    if (result.ok) onChange(result.profile)
  }

  return (
    <section className="upgrade-equipment" data-testid="upgrade-equipment">
      <h3>{t('ui.equipment.title')}</h3>
      {humanSides.map((side) => {
        const roomPiece = preset?.loadout?.[side]?.piece
        const saved = profile.equipped[presetId]?.[side]
        const selected = saved && profile.ownedUpgradeIds.includes(saved.upgradeId) ? saved.upgradeId : ''
        const definition = selected ? content.pieces.get(selected) : undefined
        const catalog = selected ? upgradeById(selected) : undefined
        const squares = board && catalog
          ? board.placements.filter(
              (placement) => placement.side === side && placement.pieceId === catalog.basePieceId,
            )
          : []
        const canonicalStars = definition
          ? pieceStars(definition, CANONICAL_BOARD, canonicalAuthoredCeiling(bundle))
          : null
        const roomStars = definition && board
          ? pieceStars(definition, board, costCeiling(content.pieces.values(), board))
          : null
        return (
          <fieldset key={side} className="equipment-side" data-testid={`equipment-${side}`}>
            <legend>{t(`ui.editor.loadout.side-${side}`)}</legend>
            {roomPiece && (
              <p className="hint" data-testid={`equipment-${side}-room-default`}>
                {t('ui.equipment.room-piece')}
              </p>
            )}
            <label htmlFor={`equipment-${side}-upgrade`}>{t('ui.equipment.upgrade')}</label>
            <select
              id={`equipment-${side}-upgrade`}
              data-testid={`equipment-${side}-upgrade`}
              value={selected}
              onChange={(event) => chooseUpgrade(side, event.target.value)}
            >
              <option value="">{t('ui.equipment.room-default')}</option>
              {UPGRADE_CATALOG.filter((upgrade) => profile.ownedUpgradeIds.includes(upgrade.id)).map((upgrade) => {
                const def = content.pieces.get(upgrade.id)
                if (!def) return null
                return (
                  <option key={upgrade.id} value={upgrade.id}>
                    {recordLabel(t, 'piece', upgrade.id, def.nameKey)}
                  </option>
                )
              })}
            </select>
            {selected && squares.length > 0 && (
              <>
                <label htmlFor={`equipment-${side}-square`}>{t('ui.equipment.square')}</label>
                <select
                  id={`equipment-${side}-square`}
                  data-testid={`equipment-${side}-square`}
                  value={saved?.square ?? squares[0]!.square}
                  onChange={(event) => chooseSquare(side, event.target.value)}
                >
                  {squares.map((placement) => (
                    <option key={placement.square} value={placement.square}>{placement.square}</option>
                  ))}
                </select>
              </>
            )}
            {definition && canonicalStars !== null && roomStars !== null && (
              <p
                className="hint"
                data-testid={`equipment-${side}-stars`}
                data-canonical-stars={canonicalStars}
                data-room-stars={roomStars}
                data-budget={preset?.loadoutBudget ?? ''}
              >
                {t('ui.equipment.stars')
                  .replace('{canonical}', starText(canonicalStars))
                  .replace('{room}', starText(roomStars))
                  .replace('{budget}', String(preset?.loadoutBudget ?? '—'))}
              </p>
            )}
            {resolved.refused[side] && (
              <p className="refusal" data-testid={`equipment-${side}-refused`}>
                {t(`ui.equipment.refused.${resolved.refused[side]}`)}
              </p>
            )}
          </fieldset>
        )
      })}
      <p
        className={eligibility.eligible ? 'positive-note' : 'hint'}
        data-testid="eligibility-status"
        data-eligible={String(eligibility.eligible)}
        role="status"
      >
        <strong>{t(eligibility.eligible ? 'ui.eligibility.standard' : 'ui.eligibility.sandbox')}</strong>
        {!eligibility.eligible && ` ${eligibility.reasons.map((reason) => t(`ui.eligibility.reason.${reason}`)).join(' ')}`}
      </p>
    </section>
  )
}
