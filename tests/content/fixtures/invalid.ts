/**
 * Invalid fixtures for AC-011. Each one breaks exactly ONE schema clause so the
 * expected error location is unambiguous; every other field stays valid.
 */
import { cloneValid } from './valid-set'

/** Unknown top-level field on a rule card. */
export const cardUnknownField = (() => {
  const src = cloneValid()
  src.ruleCards.push({
    id: 'rule.bogus',
    nameKey: 'rule.bogus.name',
    textKey: 'rule.bogus.text',
    cost: 1,
    effects: [],
    mysteryField: 'not in the schema',
  } as never)
  return src
})()

/** Piece with its required `movement` field removed. */
export const pieceMissingMovement = (() => {
  const src = cloneValid()
  src.pieces.push({
    id: 'piece.broken',
    nameKey: 'piece.broken.name',
    textKey: 'piece.broken.text',
    effects: [],
  } as never)
  return src
})()

/** Skill card whose action `kind` is not a vocabulary member. */
export const skillCardUnknownEffectAction = (() => {
  const src = cloneValid()
  src.skillCards.push({
    id: 'skill.bogus',
    nameKey: 'skill.bogus.name',
    textKey: 'skill.bogus.text',
    cost: 1,
    uses: 1,
    effects: [
      {
        trigger: 'on_play',
        condition: { kind: 'always' },
        actions: [{ kind: 'summon_dragon', target: { kind: 'chosen_friendly' } }],
      },
    ],
  } as never)
  return src
})()

/** Preset pointing at a piece id that no piece declares. */
export const presetDanglingPieceRef = (() => {
  const src = cloneValid()
  src.presets.push({
    id: 'preset.dangling',
    nameKey: 'preset.dangling.name',
    boardId: 'board.los-alamos',
    pieceIds: ['piece.king', 'piece.does-not-exist'],
    ruleCardIds: ['rule.king-of-the-hill'],
    skillCardIds: ['skill.teleport', 'skill.freeze', 'skill.coronation'],
  } as never)
  return src
})()

/** Board placement outside the declared 6x6 bounds (index 1 of the list). */
export const boardPlacementOffBoard = (() => {
  const src = cloneValid()
  src.boards.push({
    id: 'board.offboard',
    nameKey: 'board.offboard.name',
    width: 6,
    height: 6,
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'z9', pieceId: 'piece.rook', side: 'white' },
    ],
    squares: [],
  } as never)
  return src
})()

/** A human-readable literal where the schema requires an i18n key. */
export const literalTextWhereKeyRequired = (() => {
  const src = cloneValid()
  src.ruleCards.push({
    id: 'rule.literal',
    nameKey: '킹 오브 더 힐',
    textKey: 'rule.literal.text',
    cost: 1,
    effects: [],
  } as never)
  return src
})()

/** Paired square whose partner does not point back at it. */
export const portalAsymmetry = (() => {
  const src = cloneValid()
  src.boards.push({
    id: 'board.asymmetric-portal',
    nameKey: 'board.asymmetric-portal.name',
    width: 6,
    height: 6,
    placements: [{ square: 'a1', pieceId: 'piece.king', side: 'white' }],
    squares: [
      { square: 'b2', typeId: 'square.portal', pairedWith: 'e5' },
      { square: 'e5', typeId: 'square.portal', pairedWith: 'b2' },
      // c3 points at b2, but b2 already points at e5 — not symmetric.
      { square: 'c3', typeId: 'square.portal', pairedWith: 'b2' },
    ],
  } as never)
  return src
})()
