/** Immutable bundle-owned metadata for collectible piece upgrades. */
export interface UpgradeDef {
  id: string
  basePieceId: string
}

export const BASE_PIECE_IDS = ['piece.pawn', 'piece.knight', 'piece.bishop', 'piece.rook'] as const

export const UPGRADE_CATALOG = [
  { id: 'piece.pawn-plus', basePieceId: 'piece.pawn' },
  { id: 'piece.knight-plus', basePieceId: 'piece.knight' },
  { id: 'piece.bishop-plus', basePieceId: 'piece.bishop' },
  { id: 'piece.rook-plus', basePieceId: 'piece.rook' },
  { id: 'piece.pawn-scout', basePieceId: 'piece.pawn' },
  { id: 'piece.pawn-retreat', basePieceId: 'piece.pawn' },
  { id: 'piece.knight-diagonal', basePieceId: 'piece.knight' },
  { id: 'piece.knight-spring', basePieceId: 'piece.knight' },
  { id: 'piece.bishop-spring', basePieceId: 'piece.bishop' },
  { id: 'piece.bishop-scout', basePieceId: 'piece.bishop' },
  { id: 'piece.rook-spring', basePieceId: 'piece.rook' },
  { id: 'piece.rook-scout', basePieceId: 'piece.rook' },
] as const satisfies readonly UpgradeDef[]

export const UPGRADE_PIECE_IDS = UPGRADE_CATALOG.map((upgrade) => upgrade.id)

const UPGRADE_IDS = new Set<string>(UPGRADE_PIECE_IDS)

export function isProgressionOnlyPiece(pieceId: string): boolean {
  return UPGRADE_IDS.has(pieceId)
}

export function upgradeForBase(basePieceId: string): UpgradeDef | undefined {
  return UPGRADE_CATALOG.find((upgrade) => upgrade.basePieceId === basePieceId)
}

/** All alternatives in stable display order; the original upgrade stays first. */
export function upgradesForBase(basePieceId: string): readonly UpgradeDef[] {
  return UPGRADE_CATALOG.filter((upgrade) => upgrade.basePieceId === basePieceId)
}

export function upgradeById(upgradeId: string): UpgradeDef | undefined {
  return UPGRADE_CATALOG.find((upgrade) => upgrade.id === upgradeId)
}
