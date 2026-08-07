import { describe, expect, it } from 'vitest'
import { keyForRecord, memoryCache } from '@balance/cache'
import { SHIPPED_GRADES, withShippedGrades } from '@balance/shipped-grades'
import { GRADE_SEEDS, measureAll } from '@balance/measure'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { type ContentSource, loadContentSet } from '@content/load'
import { shippedContent } from '../helpers/shipped'

/**
 * The shipped grade table is a set of constants that must still be true.
 *
 * This file is the whole reason the table is allowed to exist. `cost` was a
 * number in the content that nothing checked, and it sat there wrong-by-default
 * for eight schema versions; the difference here is that every entry below is
 * re-measured by the same rig that produced it, and a drift fails the build
 * rather than shipping a stale grade to every device.
 */

const content = shippedContent()
const preset = content.presets.get(BUNDLED_PRESET_ID)!
const CONTEXT = {
  presetId: BUNDLED_PRESET_ID,
  referencePieceId: preset.grading!.referencePieceId,
  referenceSkillCardId: preset.grading!.referenceSkillCardId,
  seeds: GRADE_SEEDS,
}

describe('every shipped grade still measures what it claims', () => {
  const graded = measureAll(
    content,
    { presetId: CONTEXT.presetId, referencePieceId: CONTEXT.referencePieceId, referenceSkillCardId: CONTEXT.referenceSkillCardId },
    { seeds: GRADE_SEEDS, budgetMs: 900_000 },
  )

  it('covers every bundled record the room can put in a loadout', () => {
    // A record missing from the table is not a broken build — it just measures on
    // the device — but it IS the slow first visit this table exists to remove, so
    // the gap is surfaced rather than tolerated silently.
    const missing: string[] = []
    for (const id of graded.keys()) {
      const key = keyForRecord(content, id, CONTEXT)
      if (key === undefined || SHIPPED_GRADES[key] === undefined) missing.push(id)
    }
    expect(missing, 'these records would be re-measured on every device').toEqual([])
  })

  it('reports the identical delta for every entry', () => {
    const drifted: Array<{ id: string; shipped: number; measured: number }> = []
    for (const [id, outcome] of graded) {
      const key = keyForRecord(content, id, CONTEXT)
      if (key === undefined) continue
      const shipped = SHIPPED_GRADES[key]
      if (!shipped || !outcome.ok) continue
      if (shipped.delta !== outcome.measurement.delta) {
        drifted.push({ id, shipped: shipped.delta, measured: outcome.measurement.delta })
      }
    }
    expect(drifted, 'regenerate the table — a shipped grade no longer measures what it says').toEqual([])
  })

  it('names the right record under each key, so no entry answers for another', () => {
    for (const [key, grade] of Object.entries(SHIPPED_GRADES)) {
      expect(keyForRecord(content, grade.contentId, CONTEXT), `${grade.contentId} is filed under the wrong key`).toBe(key)
    }
  })
})

describe('the table invalidates itself rather than going stale', () => {
  it('has no entry for an edited record', () => {
    // The property the hash key buys: change the piece and the shipped grade is
    // simply not found, so the record measures instead of being answered wrongly.
    const source = structuredClone(bundledContentSource) as ContentSource
    const knight = (source.pieces as Array<Record<string, unknown>>).find((p) => p.id === 'piece.knight')!
    knight.movement = [{ kind: 'slide', vectors: [[1, 1]] }]
    const edited = loadContentSet(source)
    expect(edited.ok).toBe(true)
    if (!edited.ok) return

    const key = keyForRecord(edited.set, 'piece.knight', CONTEXT)!
    expect(SHIPPED_GRADES[key]).toBeUndefined()
  })

  it('has no entry once the room the grades were measured in changes', () => {
    // A grade is a delta against a baseline, so changing the room changes every
    // grade in it — including the grades of records the edit never touched.
    const source = structuredClone(bundledContentSource) as ContentSource
    const room = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    room.ruleCardIds = (room.ruleCardIds as string[]).slice(1)
    const edited = loadContentSet(source)
    expect(edited.ok).toBe(true)
    if (!edited.ok) return

    const key = keyForRecord(edited.set, 'piece.queen', CONTEXT)!
    expect(SHIPPED_GRADES[key]).toBeUndefined()
  })
})

describe('the layered cache reads shipped values and never writes them', () => {
  it('answers from the shipped table when the writable layer is empty', () => {
    const key = keyForRecord(content, 'piece.queen', CONTEXT)!
    expect(withShippedGrades(memoryCache()).read(key)?.contentId).toBe('piece.queen')
  })

  it('prefers a device measurement over the shipped one', () => {
    // A device that re-measured has newer information about its own build; the
    // shipped value is a starting point, not an override.
    const key = keyForRecord(content, 'piece.queen', CONTEXT)!
    const writable = memoryCache()
    writable.write(key, { contentId: 'piece.queen', delta: 99, stderr: 1, n: GRADE_SEEDS, everChanged: true })
    expect(withShippedGrades(writable).read(key)?.delta).toBe(99)
  })

  it('does not let a write reach the shipped constants', () => {
    const key = keyForRecord(content, 'piece.rook', CONTEXT)!
    const before = SHIPPED_GRADES[key]!.delta
    withShippedGrades(memoryCache()).write(key, { contentId: 'piece.rook', delta: -42, stderr: 0, n: 1, everChanged: false })
    expect(SHIPPED_GRADES[key]!.delta).toBe(before)
  })

  it('still misses for a record nobody has measured', () => {
    expect(withShippedGrades(memoryCache()).read('no-such-key')).toBeUndefined()
  })
})
