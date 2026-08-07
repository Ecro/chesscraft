import { describe, expect, it } from 'vitest'
import { gradeMapFor, hashRecord, keyForRecord, memoryCache, runGradeJob } from '@balance/cache'
import { checkLoadoutGrades, gradesFrom } from '@balance/legal'
import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { shippedContent } from '../helpers/shipped'

/**
 * PLAN Phase 5 — the grade cache.
 *
 * ADR-007's claim is that a stale grade is impossible, not unlikely. That claim
 * is only worth making if editing a record changes its key, so that is what the
 * first group asserts — and the second group asserts the other half, that a
 * cache miss stays a miss instead of quietly becoming a zero.
 */

const content = shippedContent()
const CONTEXT = {
  presetId: BUNDLED_PRESET_ID,
  referencePieceId: 'piece.pawn',
  referenceSkillCardId: 'skill.teleport',
  seeds: 600,
} as const

describe('PLAN Phase 5 — the key follows the content, not the id', () => {
  it('gives the same record the same key regardless of field order', () => {
    const a = { id: 'piece.x', movement: [{ kind: 'step', vectors: [[0, 1]] }], nameKey: 'piece.x.name' }
    const b = { nameKey: 'piece.x.name', id: 'piece.x', movement: [{ kind: 'step', vectors: [[0, 1]] }] }
    expect(hashRecord(a)).toBe(hashRecord(b))
  })

  it('changes the key when the record changes', () => {
    const before = content.pieces.get('piece.knight')!
    const after = { ...before, movement: [...before.movement, { kind: 'step' as const, vectors: [[0, 1] as [number, number]] }] }
    expect(hashRecord(after)).not.toBe(hashRecord(before))
  })

  it('does not confuse two different bundled pieces', () => {
    const keys = new Set([...content.pieces.keys()].map((id) => keyForRecord(content, id, CONTEXT)))
    expect(keys.size).toBe(content.pieces.size)
  })

  it('has no key for a record the document does not contain', () => {
    expect(keyForRecord(content, 'piece.nobody', CONTEXT)).toBeUndefined()
  })

  it('leaves an edited record with no cached grade — the stale case cannot arise', () => {
    const cache = memoryCache()
    const knight = content.pieces.get('piece.knight')!
    cache.write(hashRecord(knight), { contentId: 'piece.knight', delta: 1, stderr: 2, n: 600, everChanged: true })
    expect(cache.read(hashRecord(knight))).toBeDefined()

    const edited = { ...knight, movement: [{ kind: 'slide' as const, vectors: [[1, 1] as [number, number]] }] }
    expect(cache.read(hashRecord(edited))).toBeUndefined()
  })
})

describe('PLAN Phase 5 — a miss is a miss, never a zero', () => {
  it('omits an unmeasured id from the grade map instead of defaulting it', () => {
    const grades = gradeMapFor(content, memoryCache(), ['piece.knight', 'skill.volley'], CONTEXT)
    expect(grades.has('piece.knight')).toBe(false)
    expect(grades.get('piece.knight')).toBeUndefined()
  })

  it('makes the loadout check refuse, rather than pass, on an empty cache', () => {
    const preset = content.presets.get(BUNDLED_PRESET_ID)!
    const withLoadout = {
      ...preset,
      loadoutBudget: 100,
      loadout: { white: { pieceId: 'piece.archer', replaces: 'piece.knight', skillCardId: 'skill.volley' } },
    }
    const grades = gradeMapFor(content, memoryCache(), ['piece.archer', 'piece.knight', 'skill.volley'], CONTEXT)
    const errors = checkLoadoutGrades(withLoadout, gradesFrom(grades), { width: 5 })
    expect(errors.length).toBeGreaterThan(0)
    expect(errors.every((e) => e.message.includes('not been graded'))).toBe(true)
  })

  it('returns a cached grade once one is written', () => {
    const cache = memoryCache()
    const key = keyForRecord(content, 'piece.archer', CONTEXT)!
    cache.write(key, { contentId: 'piece.archer', delta: 21.5, stderr: 2.4, n: 600, everChanged: true })
    expect(gradeMapFor(content, cache, ['piece.archer'], CONTEXT).get('piece.archer')).toBe(21.5)
  })
})

describe('PLAN Phase 5 — the worker job is a plain function', () => {
  it('measures a record without a worker, so the worker shell holds no decisions', () => {
    const outcome = runGradeJob(content, {
      baseline: { presetId: BUNDLED_PRESET_ID, referencePieceId: 'piece.pawn', referenceSkillCardId: 'skill.teleport' },
      candidate: { kind: 'piece', pieceId: 'piece.archer', replaces: 'piece.knight' },
      seeds: 20,
    })
    expect(outcome.ok, outcome.ok ? '' : outcome.reason).toBe(true)
    if (!outcome.ok) return
    expect(outcome.measurement.n).toBe(20)
  })

  it('reports a refusal rather than throwing when the job cannot be measured', () => {
    const outcome = runGradeJob(content, {
      baseline: { presetId: 'preset.nonexistent', referencePieceId: 'piece.pawn', referenceSkillCardId: 'skill.teleport' },
      candidate: { kind: 'skill', skillCardId: 'skill.volley' },
      seeds: 5,
    })
    expect(outcome.ok).toBe(false)
  })
})

describe('PLAN Phase 5 — the key covers everything the delta depends on', () => {
  /**
   * Round 2's finding, and the sharpest kind: the module's own comment claimed a
   * stale grade was impossible while the key hashed the reference records and the
   * room by ID. An id survives an edit, so rewriting `piece.pawn` — the piece
   * every other piece is graded against — left every one of their cached grades
   * looking current.
   *
   * Each case below edits something OTHER than the record being keyed, and the
   * key must still move.
   */
  const knightKey = (c: ReturnType<typeof shippedContent>) => keyForRecord(c, 'piece.knight', CONTEXT)

  function edited(mutate: (c: ReturnType<typeof shippedContent>) => void) {
    const next = shippedContent()
    mutate(next)
    return next
  }

  it('changes when the reference piece is edited', () => {
    const after = edited((c) => {
      const pawn = c.pieces.get('piece.pawn')!
      c.pieces.set('piece.pawn', { ...pawn, movement: [{ kind: 'slide', vectors: [[0, 1]] }] })
    })
    expect(knightKey(after)).not.toBe(knightKey(content))
  })

  it('changes when the reference skill card is edited', () => {
    const after = edited((c) => {
      const card = c.skillCards.get('skill.teleport')!
      c.skillCards.set('skill.teleport', { ...card, uses: card.uses + 1 })
    })
    expect(knightKey(after)).not.toBe(knightKey(content))
  })

  it("changes when the room's rule-card pool is edited", () => {
    const after = edited((c) => {
      const preset = c.presets.get(BUNDLED_PRESET_ID)!
      c.presets.set(BUNDLED_PRESET_ID, { ...preset, ruleCardIds: preset.ruleCardIds.slice(1) })
    })
    expect(knightKey(after)).not.toBe(knightKey(content))
  })

  it('changes when the board the room plays on is edited', () => {
    const after = edited((c) => {
      const preset = c.presets.get(BUNDLED_PRESET_ID)!
      const board = c.boards.get(preset.boardId)!
      c.boards.set(preset.boardId, { ...board, placements: board.placements.slice(1) })
    })
    expect(knightKey(after)).not.toBe(knightKey(content))
  })

  it('changes when the seed count changes — a 40-seed grade is not a 600-seed grade', () => {
    expect(keyForRecord(content, 'piece.knight', { ...CONTEXT, seeds: 40 })).not.toBe(knightKey(content))
  })

  it('stays the same when nothing it depends on moved', () => {
    expect(knightKey(shippedContent())).toBe(knightKey(content))
  })
})
