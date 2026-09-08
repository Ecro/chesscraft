import { describe, expect, it } from 'vitest'
import { pieceCost, pieceStars } from '@balance/cost'
import { bundledContentSource } from '@content/sets/bundled'
import { loadContentSet } from '@content/load'
import { createPosition } from '@engine/match'
import { legalActions } from '@engine/engine'
import { ART_ASSETS } from '@ui/art/assets'
import { artRegistry } from '@ui/art/registry'
import { makeTranslate } from '@ui/i18n'
import {
  BASE_PIECE_IDS,
  UPGRADE_CATALOG,
  UPGRADE_PIECE_IDS,
  isProgressionOnlyPiece,
  upgradeForBase,
} from '../../src/progression/catalog'
import { CANONICAL_BOARD, canonicalAuthoredCeiling, isUpgradeWithinPowerLimit } from '../../src/progression/power'

const loaded = loadContentSet(bundledContentSource)
if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join('\n'))
const content = loaded.set
const translate = makeTranslate(content.strings)
type Placement = Parameters<typeof createPosition>[0]['placements'][number]

const EXPECTED_KO: Record<string, { name: string; text: string }> = {
  'piece.pawn-scout': { name: '정찰 병사', text: '앞으로 한 칸 또는 대각선 앞으로 한 칸 움직인다. 잡을 때는 대각선 앞으로만 잡는다. 끝줄에 닿으면 여왕이 된다.' },
  'piece.pawn-retreat': { name: '후퇴 병사', text: '앞이나 뒤로 한 칸 움직인다. 잡을 때는 대각선 앞으로만 잡는다. 끝줄에 닿으면 여왕이 된다.' },
  'piece.knight-diagonal': { name: '사선 기사', text: '기사처럼 뛰거나 대각선으로 한 칸 움직인다. 대각선 한 칸 움직임으로는 잡을 수 없다.' },
  'piece.knight-spring': { name: '도약 기사', text: '기사처럼 뛰거나 상하좌우로 두 칸 뛴다. 사이의 기물을 넘을 수 있지만, 새 두 칸 도약으로는 잡을 수 없다.' },
  'piece.bishop-spring': { name: '도약 비숍', text: '대각선으로 쭉 가거나 상하좌우로 두 칸 뛴다. 도약은 사이의 기물을 넘지만 상대를 잡을 수 없다.' },
  'piece.bishop-scout': { name: '정찰 비숍', text: '대각선으로 쭉 가거나 앞으로 두 칸, 옆으로 한 칸인 곳으로 뛴다. 도약은 사이의 기물을 넘지만 상대를 잡을 수 없다.' },
  'piece.rook-spring': { name: '도약 성', text: '가로세로로 쭉 가거나 대각선으로 두 칸 뛴다. 도약은 사이의 기물을 넘지만 상대를 잡을 수 없다.' },
  'piece.rook-scout': { name: '정찰 성', text: '가로세로로 쭉 가거나 앞으로 두 칸, 옆으로 한 칸인 곳으로 뛴다. 도약은 사이의 기물을 넘지만 상대를 잡을 수 없다.' },
  'piece.pawn-plus': {
    name: '재빠른 병사',
    text: '앞으로 한 칸 또는 옆으로 한 칸 움직인다. 잡을 때는 병사처럼 대각선 앞으로만 잡는다.',
  },
  'piece.knight-plus': {
    name: '기동 기사',
    text: '기사처럼 뛰거나 상하좌우로 한 칸 움직인다. 한 칸 움직임으로는 잡을 수 없다.',
  },
  'piece.bishop-plus': {
    name: '기동 비숍',
    text: '대각선으로 쭉 가거나 상하좌우로 한 칸 움직인다. 한 칸 움직임으로는 잡을 수 없다.',
  },
  'piece.rook-plus': {
    name: '기동 성',
    text: '가로세로로 쭉 가거나 대각선으로 한 칸 움직인다. 대각선 움직임으로는 잡을 수 없다.',
  },
}

function targets(pieceId: string, side: 'white' | 'black', square: string, occupied?: string): string[] {
  const placements: Placement[] = [
    { square, pieceId, side },
    { square: 'a1', pieceId: 'piece.king', side: 'white' as const },
    { square: 'f6', pieceId: 'piece.king', side: 'black' as const },
  ]
  if (occupied) placements.push({ square: occupied, pieceId: 'piece.pawn', side: side === 'white' ? 'black' : 'white' })
  const state = createPosition({ content, presetId: 'preset.default', seed: 17, sideToMove: side, placements })
  return legalActions(state, content)
    .filter((action) => action.kind === 'move' && action.from === square)
    .map((action) => action.kind === 'move' ? action.to : '')
    .sort()
}

const BOARD_SQUARES = Array.from({ length: 6 }, (_, rank) =>
  Array.from({ length: 6 }, (_, file) => `${String.fromCharCode(97 + file)}${rank + 1}`),
).flat()

function captureTargets(pieceId: string): string[] {
  const captured = new Set<string>()
  for (const candidate of BOARD_SQUARES) {
    if (candidate === 'c3' || candidate === 'a1') continue
    const placements: Placement[] = [
      { square: 'c3', pieceId, side: 'white' },
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ]
    if (candidate !== 'f6') placements.push({ square: candidate, pieceId: 'piece.pawn', side: 'black' })
    const state = createPosition({ content, presetId: 'preset.default', seed: 29, sideToMove: 'white', placements })
    if (legalActions(state, content).some((action) => action.kind === 'move' && action.from === 'c3' && action.to === candidate)) {
      captured.add(candidate)
    }
  }
  return [...captured].sort()
}

describe('upgrade catalog invariants', () => {
  it('contains three progression-only upgrades for each launch base family', () => {
    expect(BASE_PIECE_IDS).toEqual(['piece.pawn', 'piece.knight', 'piece.bishop', 'piece.rook'])
    expect(UPGRADE_PIECE_IDS).toEqual([
      'piece.pawn-plus',
      'piece.knight-plus',
      'piece.bishop-plus',
      'piece.rook-plus',
      'piece.pawn-scout',
      'piece.pawn-retreat',
      'piece.knight-diagonal',
      'piece.knight-spring',
      'piece.bishop-spring',
      'piece.bishop-scout',
      'piece.rook-spring',
      'piece.rook-scout',
    ])
    expect(UPGRADE_CATALOG).toHaveLength(12)
    for (const basePieceId of BASE_PIECE_IDS) {
      const upgrade = upgradeForBase(basePieceId)
      expect(upgrade?.basePieceId).toBe(basePieceId)
      expect(isProgressionOnlyPiece(upgrade!.id)).toBe(true)
    }
    expect(isProgressionOnlyPiece('piece.queen')).toBe(false)
  })

  it('binds every upgrade to bundled content, distinct art, Korean text, and bounded power', () => {
    for (const upgrade of UPGRADE_CATALOG) {
      const base = content.pieces.get(upgrade.basePieceId)
      const piece = content.pieces.get(upgrade.id)
      expect(base, upgrade.basePieceId).toBeDefined()
      expect(piece, upgrade.id).toBeDefined()
      expect(piece!.royal).not.toBe(true)
      expect(piece!.artKey).toBeTruthy()
      expect(piece!.artKey).not.toBe(base!.artKey)
      expect(translate(piece!.nameKey)).toBe(EXPECTED_KO[upgrade.id]!.name)
      expect(translate(piece!.textKey)).toBe(EXPECTED_KO[upgrade.id]!.text)
      const artName = piece!.artKey!.replace(/^art\./, '')
      const asset = (ART_ASSETS.piece as Record<string, { white: string; black: string }>)[artName]
      expect(asset, `${upgrade.id} asset`).toBeDefined()
      expect(artRegistry.get(piece!.artKey!)).toEqual({ ...asset, kind: 'sided', surface: 'piece' })
      expect(isUpgradeWithinPowerLimit(piece!, base!, canonicalAuthoredCeiling(content))).toBe(true)
      expect(pieceStars(piece!, CANONICAL_BOARD, canonicalAuthoredCeiling(content))).toBeLessThanOrEqual(
        pieceStars(base!, CANONICAL_BOARD, canonicalAuthoredCeiling(content)) + 1,
      )
    }
  })

  it('derives the authored ceiling from the strongest non-royal base piece on canonical 6x6', () => {
    const eligibleBundledPieces = [...content.pieces.values()].filter(
      (piece) => piece.royal !== true && !isProgressionOnlyPiece(piece.id),
    )
    const expected = Math.max(...eligibleBundledPieces.map((piece) => pieceCost(piece, CANONICAL_BOARD)))
    expect(CANONICAL_BOARD).toEqual({ width: 6, height: 6 })
    expect(canonicalAuthoredCeiling(content)).toBe(expected)
  })
})

describe('upgrade movement is a sidegrade, never added capture reach', () => {
  const cases = [
    ['piece.pawn', 'piece.pawn-plus'],
    ['piece.knight', 'piece.knight-plus'],
    ['piece.bishop', 'piece.bishop-plus'],
    ['piece.rook', 'piece.rook-plus'],
  ] as const

  it.each(cases)('%s -> %s adds movement while preserving the complete capture set', (baseId, upgradeId) => {
    const baseMoves = targets(baseId, 'white', 'c3')
    const upgradeMoves = targets(upgradeId, 'white', 'c3')
    expect(upgradeMoves).toEqual(expect.arrayContaining(baseMoves))
    expect(upgradeMoves.filter((square) => !baseMoves.includes(square)).length).toBeGreaterThan(0)
    expect(captureTargets(upgradeId)).toEqual(captureTargets(baseId))
    expect(content.pieces.get(upgradeId)!.attack).toEqual(
      content.pieces.get(baseId)!.attack ?? content.pieces.get(baseId)!.movement,
    )
  })

  it('mirrors Pawn+ forward movement for white and black while keeping sideways movement', () => {
    expect(targets('piece.pawn-plus', 'white', 'c3')).toEqual(expect.arrayContaining(['b3', 'c4', 'd3']))
    expect(targets('piece.pawn-plus', 'black', 'c4')).toEqual(expect.arrayContaining(['b4', 'c3', 'd4']))
  })
})
