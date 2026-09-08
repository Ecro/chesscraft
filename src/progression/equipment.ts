import type { ContentSet } from '@content/load'
import { differsFromBundled } from '@content/provenance'
import type { EffectiveEquipment } from '@engine/loadout'
import type { Side } from '@engine/types'
import { upgradeById } from './catalog'
import type { ProgressionProfileV1 } from './model'

export type EquipmentRefusal =
  | 'not-owned'
  | 'invalid-upgrade'
  | 'invalid-square'
  | 'room-piece-conflict'

export interface ResolveEquipmentInput {
  content: ContentSet
  bundle: ContentSet
  presetId: string
  profile: ProgressionProfileV1
  humanSides: readonly Side[]
}

export interface ResolvedEquipment {
  effectiveEquipment: EffectiveEquipment
  refused: Partial<Record<Side, EquipmentRefusal>>
}

/**
 * Converts device-owned selections into the engine's plain match input.
 *
 * Stored equipment is deliberately only an intention. Content may have changed
 * since it was saved, so ownership, pristine catalog identity, the base family,
 * and the exact starting square are all checked again at match start. A valid
 * device override wins over the room-authored piece axis for that side; the
 * engine still applies only this one exact-square replacement, so the two can
 * never stack. Sides not controlled by a person are ignored entirely.
 */
export function resolveEquipment({
  content,
  bundle,
  presetId,
  profile,
  humanSides,
}: ResolveEquipmentInput): ResolvedEquipment {
  const effectiveEquipment: EffectiveEquipment = {}
  const refused: ResolvedEquipment['refused'] = {}
  const preset = content.presets.get(presetId)
  const board = preset ? content.boards.get(preset.boardId) : undefined
  if (!preset || !board) return { effectiveEquipment, refused }

  for (const side of humanSides) {
    const saved = profile.equipped[presetId]?.[side]
    if (!saved) continue
    if (!profile.ownedUpgradeIds.includes(saved.upgradeId)) {
      refused[side] = 'not-owned'
      continue
    }
    const catalog = upgradeById(saved.upgradeId)
    const active = content.pieces.get(saved.upgradeId)
    const pristine = bundle.pieces.get(saved.upgradeId)
    if (!catalog || !active || !pristine || differsFromBundled(active, pristine)) {
      refused[side] = 'invalid-upgrade'
      continue
    }
    const exactBase = board.placements.some(
      (placement) =>
        placement.side === side &&
        placement.square === saved.square &&
        placement.pieceId === catalog.basePieceId,
    )
    if (!exactBase) {
      refused[side] = 'invalid-square'
      continue
    }
    effectiveEquipment[side] = {
      pieceId: catalog.id,
      replaces: catalog.basePieceId,
      square: saved.square,
    }
  }
  return { effectiveEquipment, refused }
}
