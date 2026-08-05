import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { validContentSource } from './fixtures/valid-set'
import {
  boardPlacementOffBoard,
  cardUnknownField,
  literalTextWhereKeyRequired,
  pieceMissingMovement,
  portalAsymmetry,
  presetDanglingPieceRef,
  skillCardUnknownEffectAction,
} from './fixtures/invalid'

/**
 * AC-011 — invalid content is rejected fail-closed with a located error.
 *
 * Every fixture below breaks exactly one schema clause. The expected error
 * location is read off the schema contract, not off the validator's output, and
 * the paired valid fixture guards against a validator that rejects everything.
 */
describe('AC-011 fail-closed content validation', () => {
  it('accepts the valid bundled set with zero errors', () => {
    const result = loadContentSet(validContentSource)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.set.pieces.size).toBeGreaterThan(0)
      expect(result.set.presets.size).toBeGreaterThan(0)
    }
  })

  it('rejects a rule card carrying an unknown top-level field', () => {
    const result = loadContentSet(cardUnknownField)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'rule.bogus')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.path).toBe('ruleCards.rule.bogus.mysteryField')
  })

  it('rejects a piece missing its required movement field', () => {
    const result = loadContentSet(pieceMissingMovement)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'piece.broken')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.path).toBe('pieces.piece.broken.movement')
  })

  it('rejects a skill card whose action kind is not in the vocabulary', () => {
    const result = loadContentSet(skillCardUnknownEffectAction)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'skill.bogus')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.path).toBe('skillCards.skill.bogus.effects.0.actions.0.kind')
  })

  it('rejects a preset referencing a non-existent piece id', () => {
    const result = loadContentSet(presetDanglingPieceRef)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'preset.dangling')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.message).toContain('piece.does-not-exist')
  })

  it('rejects a board whose initial placement puts a piece off-board', () => {
    const result = loadContentSet(boardPlacementOffBoard)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'board.offboard')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.path).toBe('boards.board.offboard.placements.1')
  })

  it('rejects a literal text string where an i18n key is required', () => {
    const result = loadContentSet(literalTextWhereKeyRequired)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'rule.literal')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.path).toBe('ruleCards.rule.literal.nameKey')
  })

  it('names both the content id and the JSON field path on every error', () => {
    for (const source of [
      cardUnknownField,
      pieceMissingMovement,
      skillCardUnknownEffectAction,
      presetDanglingPieceRef,
      boardPlacementOffBoard,
      literalTextWhereKeyRequired,
      portalAsymmetry,
    ]) {
      const result = loadContentSet(source)
      expect(result.ok).toBe(false)
      if (result.ok) continue
      for (const err of result.errors) {
        expect(err.contentId).toBeTruthy()
        expect(err.path).toBeTruthy()
      }
    }
  })
})

/** ADR-010 — paired squares must reference each other symmetrically. */
describe('ADR-010 portal pairing integrity', () => {
  it('rejects a portal whose partner does not point back', () => {
    const result = loadContentSet(portalAsymmetry)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const err = result.errors.find((e) => e.contentId === 'board.asymmetric-portal')
    expect(err, JSON.stringify(result.errors)).toBeDefined()
    expect(err!.message.toLowerCase()).toContain('symmetric')
  })
})

/**
 * AC-011 atomicity — a mixed valid/invalid set yields no ContentSet at all.
 *
 * Per-record validation can pass while the loader still partially registers the
 * valid records before discovering a later error; that partial registration is
 * exactly what fail-closed prohibits.
 */
describe('AC-011 atomic load boundary', () => {
  it('exposes none of the valid subset when any record is invalid', () => {
    const mixed = {
      ...validContentSource,
      pieces: [...validContentSource.pieces, ...pieceMissingMovement.pieces.filter((p) => p.id === 'piece.broken')],
    }
    const result = loadContentSet(mixed)
    expect(result.ok).toBe(false)
    if (result.ok) return
    // No content set is returned at all — not a partial one.
    expect('set' in result).toBe(false)
  })
})
