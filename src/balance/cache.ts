import type { ContentSet } from '@content/load'
import { type Baseline, type Candidate, GRADE_SEEDS, type MeasureOutcome, measureRecord } from './measure'

/**
 * Where a measured grade lives (ADR-007).
 *
 * Not on the record. A grade written into the content document is a number an
 * imported file can simply claim, and `cost` already demonstrates what becomes
 * of a number nobody verifies — it has been declared, editor-typed and read by
 * nothing since v1. So the document carries records and the cache carries
 * grades, keyed by a hash of the record's own content.
 *
 * Keying by content rather than by id is what makes a stale grade impossible
 * rather than merely unlikely: editing a piece changes its bytes, which changes
 * its key, which is a miss. There is no path where an edited record keeps the
 * grade its previous version earned.
 */

/**
 * A stable digest of a record.
 *
 * Keys are sorted at every level, because `JSON.stringify` preserves insertion
 * order and two documents describing the identical piece would otherwise hash
 * differently depending on which field the editor happened to write first —
 * turning every re-save into a cache miss and a fresh 1200-match measurement.
 */
export function hashRecord(record: unknown): string {
  const canonical = JSON.stringify(record, (_key, value: unknown) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return value
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries)
  })
  // FNV-1a, 32-bit. A collision here would hand one record another's grade, so
  // the hash is widened with the length: two records that collide on FNV *and*
  // have identical serialized length are not a case worth engineering against,
  // but the pairing is free.
  let hash = 0x811c9dc5
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `${hash.toString(16)}-${canonical.length.toString(16)}`
}

/** A measured grade, plus what it was measured from. */
export interface CachedGrade {
  contentId: string
  delta: number
  stderr: number
  n: number
  everChanged: boolean
}

export interface GradeCache {
  read(key: string): CachedGrade | undefined
  write(key: string, grade: CachedGrade): void
}

export function memoryCache(seed: Iterable<[string, CachedGrade]> = []): GradeCache {
  const store = new Map(seed)
  return { read: (key) => store.get(key), write: (key, grade) => void store.set(key, grade) }
}

/**
 * A cache over `localStorage`, degrading to memory when it is unavailable.
 *
 * Degrading rather than throwing: a private-browsing profile or a storage quota
 * error must cost a re-measurement, never the ability to save a record. The
 * degraded case is silent by design — the caller cannot do anything useful with
 * the distinction, and a grade recomputed is a grade.
 */
export function localStorageCache(namespace = 'grade'): GradeCache {
  const fallback = memoryCache()
  const key = (k: string) => `${namespace}:${k}`
  return {
    read(k) {
      try {
        const raw = globalThis.localStorage?.getItem(key(k))
        return raw ? (JSON.parse(raw) as CachedGrade) : fallback.read(k)
      } catch {
        return fallback.read(k)
      }
    },
    write(k, grade) {
      fallback.write(k, grade)
      try {
        globalThis.localStorage?.setItem(key(k), JSON.stringify(grade))
      } catch {
        /* quota or unavailable — the memory copy is the grade for this session */
      }
    },
  }
}

export interface GradeJob {
  baseline: Baseline
  candidate: Candidate
  seeds?: number
  budgetMs?: number
}

/**
 * Everything besides the record itself that a measured delta depends on.
 *
 * The first version keyed on the record alone, which is wrong in a way that
 * silently hands one experiment another's answer: the same piece graded as a
 * replacement for a pawn and as a replacement for a queen produces different
 * deltas, and two rooms with different boards or card pools produce different
 * deltas again. `MEASUREMENT_REVISION` is in here for the same reason — a change
 * to how the engine or the rig measures makes every stored grade an answer to a
 * question nobody is asking any more.
 */
export interface GradeContext extends Baseline {
  seeds: number
}

/** Bumped whenever a change to the engine or the rig invalidates stored grades. */
export const MEASUREMENT_REVISION = 1

/**
 * The unit of work the Web Worker runs, extracted so it is testable without one.
 *
 * The worker file around it does nothing but marshal messages. Keeping the
 * decision-making out of it is what stops this from being a capability that
 * exists and is never exercised by anything but production.
 */
export function runGradeJob(content: ContentSet, job: GradeJob): MeasureOutcome {
  // `budgetMs` is spread in only when it is set, never written as `undefined`:
  // under `exactOptionalPropertyTypes` a present-but-undefined field is a
  // different thing from an absent one, and the absent one is what selects the
  // default budget.
  const options = { seeds: job.seeds ?? GRADE_SEEDS, ...(job.budgetMs === undefined ? {} : { budgetMs: job.budgetMs }) }
  return measureRecord(content, job.baseline, job.candidate, options)
}

/**
 * The cache key for a record, under the context it was measured in.
 *
 * The context is part of the key, not metadata beside it. A key over the record
 * alone would let a grade measured against one baseline answer a question about
 * another — and the two are indistinguishable once stored.
 */
export function keyForRecord(content: ContentSet, contentId: string, context: GradeContext): string | undefined {
  const record = content.pieces.get(contentId) ?? content.skillCards.get(contentId)
  if (record === undefined) return undefined

  // Everything `armsFor` and `playOut` actually read, by VALUE. Hashing the ids
  // instead would leave every cached grade untouched when the reference piece,
  // the reference card, the room or its board is edited — and those are exactly
  // the edits that change every other record's delta at once.
  const preset = content.presets.get(context.presetId)
  return hashRecord({
    revision: MEASUREMENT_REVISION,
    seeds: context.seeds,
    record,
    referencePiece: content.pieces.get(context.referencePieceId) ?? null,
    referenceSkill: content.skillCards.get(context.referenceSkillCardId) ?? null,
    preset: preset ?? null,
    board: preset ? content.boards.get(preset.boardId) ?? null : null,
  })
}

/**
 * Grades for the ids a caller asks about, as `checkLoadoutGrades` wants them.
 *
 * An id the cache has never seen is ABSENT from the result rather than present
 * with a zero. The distinction is the whole point: `checkLoadoutGrades` refuses
 * an ungraded record, and it can only do that if "not measured" is a different
 * value from "measured as harmless".
 */
export function gradeMapFor(
  content: ContentSet,
  cache: GradeCache,
  contentIds: Iterable<string>,
  context: GradeContext,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const contentId of contentIds) {
    const key = keyForRecord(content, contentId, context)
    if (key === undefined) continue
    const cached = cache.read(key)
    if (cached !== undefined) out.set(contentId, cached.delta)
  }
  return out
}
