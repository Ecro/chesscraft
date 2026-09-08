import { loadBundledContent, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { upgradeById } from './catalog'

/** Canonical examples deliberately never consume an imported room or profile. */
export const practiceContent = loadBundledContent()
export const PRACTICE_ORIGIN = 'c3'
export const PRACTICE_SQUARES = Array.from({ length: 6 }, (_, row) =>
  Array.from({ length: 6 }, (_, file) => `${String.fromCharCode(97 + file)}${6 - row}`),
).flat()

function emptyTargets(pieceId: string): string[] {
  const state = createPosition({
    content: practiceContent, presetId: BUNDLED_PRESET_ID, seed: 17, sideToMove: 'white',
    placements: [
      { square: PRACTICE_ORIGIN, pieceId, side: 'white' },
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
  return [...new Set(legalActions(state, practiceContent).flatMap((action) =>
    action.kind === 'move' && action.from === PRACTICE_ORIGIN && !state.board.has(action.to) ? [action.to] : [],
  ))].sort()
}

/** A one-move experiment, not a match: there is no save, grant or completion path. */
export function upgradePractice(upgradeId: string) {
  const upgrade = upgradeById(upgradeId)
  if (!upgrade) return null
  const baseTargets = emptyTargets(upgrade.basePieceId)
  const upgradeTargets = emptyTargets(upgradeId)
  return { baseTargets, upgradeTargets, addedTargets: upgradeTargets.filter((square) => !baseTargets.includes(square)) }
}
