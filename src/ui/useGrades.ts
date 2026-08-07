import { useEffect, useMemo, useRef, useState } from 'react'
import { type GradeCache, type GradeContext, gradeMapFor, keyForRecord, localStorageCache } from '@balance/cache'
import { type BandScale, bandOf, bandValue } from '@balance/bands'
import { GRADE_SEEDS, type Candidate } from '@balance/measure'
import { type Calibration, calibrate, pieceFeatures, predict } from '@balance/predict'
import { createGradeClient, type GradeClient, measureIntoCache } from '@balance/grade-client'
import { type ContentSet, type ContentSource, loadContentSet } from '@content/load'
import type { PresetDef } from '@content/schema'

/**
 * Grades for the records a room's loadout can name (ADR-005, ADR-007).
 *
 * A grade is never read from the document — it is recomputed and cached — so the
 * screen's job is to ask the cache, and to start a worker for whatever the cache
 * has not seen. That is why "not measured yet" is a first-class state here rather
 * than a zero: `checkLoadoutGrades` refuses an ungraded record, and a UI that
 * showed 0 for one would be promising the opposite of what the gate does.
 *
 * The band scale is FIXED rather than derived from the grades on screen. Deriving
 * it live would move every displayed grade whenever a new record finished
 * measuring — the same piece would change grade because an unrelated card
 * arrived — so the scale comes from the seed count, which is what actually sets
 * the noise floor.
 */

/**
 * The scale a room's grades are read on.
 *
 * `width` is twice the standard error the room's seed count produces, rounded up
 * to a whole point: measured over the bundled content at `GRADE_SEEDS`, the worst
 * standard error is ~2.7 percentage points. Fixed here so a displayed grade
 * cannot move for reasons the player cannot see; the derivation itself is
 * `bandScaleFrom`, which the balance suite runs against the live distribution.
 */
export const DISPLAY_SCALE: BandScale = { width: 6 }

export type GradeState =
  | { status: 'graded'; delta: number; band: number; cost: number }
  /** A fitted estimate, shown only when the fit has earned it (see `calibrationOf`). */
  | { status: 'provisional'; delta: number; band: number; cost: number }
  | { status: 'measuring' }
  | { status: 'unmeasurable'; reason: string }

export interface Grades {
  of(contentId: string): GradeState
  /** True while any record in the room's scope is still being measured. */
  pending: boolean
  /** How well the predictor scored on data it did not see, or null with too little data. */
  calibration: Calibration | null
}

/**
 * Fits a predictor from the grades already measured, and scores it honestly.
 *
 * The circularity is real and is resolved by accumulation: a predictor needs
 * measured grades to fit, and the only grades that exist are the ones already
 * measured. So a fresh install predicts nothing and a well-used one predicts from
 * everything it has learned.
 *
 * `usable` is decided by leave-one-out against the trivial predictor, and as of
 * the bundled content it comes out FALSE — measured three ways (one feature, four
 * features, and nearest-neighbour, at 5 and at 15 samples), the fit never beat
 * "always answer zero". So no provisional grade is shown today. That is the
 * design working, not a gap: a provisional number that is no better than a guess
 * is the exact thing the measured grade exists to replace, and this gate is what
 * stops a future feature set from shipping one without proving itself first.
 */
export function calibrationOf(
  content: ContentSet,
  known: ReadonlyMap<string, number>,
  boardId: string | undefined,
): Calibration | null {
  const board = boardId === undefined ? undefined : content.boards.get(boardId)
  if (!board) return null
  const samples = [...known.entries()]
    .filter(([id]) => content.pieces.has(id))
    .map(([id, delta]) => ({ id, features: pieceFeatures(content.pieces.get(id)!, board), delta }))
  if (samples.length < 3) return null
  return calibrate(samples, (d) => bandOf(d, DISPLAY_SCALE))
}

function candidateFor(content: ContentSet, contentId: string, referencePieceId: string): Candidate | null {
  if (content.pieces.has(contentId)) return { kind: 'piece', pieceId: contentId, replaces: referencePieceId }
  if (content.skillCards.has(contentId)) return { kind: 'skill', skillCardId: contentId }
  return null
}

/**
 * Which records a room needs grades for.
 *
 * Every piece the room plays and every card it deals, because the loadout picker
 * offers all of them and a grade that arrives only after the choice is made is a
 * refusal the player could not have predicted.
 */
export function gradedIdsFor(preset: PresetDef, content: ContentSet): string[] {
  const ids = new Set<string>()
  for (const id of preset.pieceIds) if (!content.pieces.get(id)?.royal) ids.add(id)
  for (const id of content.skillCards.keys()) ids.add(id)
  return [...ids]
}

export interface UseGradesOptions {
  source: ContentSource
  content: ContentSet
  preset: PresetDef | undefined
  /** Injected by tests; production creates a real Web Worker client. */
  client?: GradeClient
  cache?: GradeCache
  /** Injected by tests, so the display path can be proven while the real fit is dormant. */
  calibration?: Calibration | null
  /**
   * Which records to grade. Defaults to everything the room's loadout picker can
   * offer — correct for the editor, wrong for a screen that only needs the three
   * ids a loadout already names, which would otherwise start a measurement of
   * every card in the game just to open the lobby.
   */
  ids?: readonly string[]
}

export function useGrades({ source, content, preset, client, cache, ids, calibration }: UseGradesOptions): Grades {
  const store = useMemo(() => cache ?? localStorageCache(), [cache])
  const [version, setVersion] = useState(0)
  const [failed, setFailed] = useState<ReadonlyMap<string, string>>(new Map())
  const inFlight = useRef(new Set<string>())

  const context: GradeContext | null = useMemo(() => {
    if (!preset?.grading) return null
    return {
      presetId: preset.id,
      referencePieceId: preset.grading.referencePieceId,
      referenceSkillCardId: preset.grading.referenceSkillCardId,
      seeds: GRADE_SEEDS,
    }
  }, [preset])

  const known = useMemo(() => {
    if (!preset || !context) return new Map<string, number>()
    // `version` is read so the memo re-runs when a measurement lands; the cache
    // is mutable and would otherwise look unchanged to React.
    void version
    return gradeMapFor(content, store, ids ?? gradedIdsFor(preset, content), context)
  }, [content, preset, store, context, version, ids])

  useEffect(() => {
    if (!preset || !context) return
    const missing = (ids ?? gradedIdsFor(preset, content)).filter(
      (id) => !known.has(id) && !failed.has(id) && !inFlight.current.has(id),
    )
    if (missing.length === 0) return

    // Created lazily and only when there is something to measure: a Worker
    // constructed on every room open would spawn a thread for a room whose
    // grades are all cached, which is the common case after the first visit.
    const worker = client ?? createGradeClient()
    let disposed = false
    for (const id of missing) {
      const candidate = candidateFor(content, id, context.referencePieceId)
      const key = keyForRecord(content, id, context)
      if (!candidate || key === undefined) continue
      inFlight.current.add(id)
      void measureIntoCache(worker, store, source, context, id, candidate, key).then((grade) => {
        if (disposed) return
        inFlight.current.delete(id)
        if (grade === null) setFailed((prev) => new Map(prev).set(id, 'unmeasurable'))
        setVersion((v) => v + 1)
      })
    }
    return () => {
      disposed = true
      if (!client) worker.dispose()
    }
  }, [source, content, preset, context, known, failed, store, client, ids])

  const fit = calibration !== undefined ? calibration : calibrationOf(content, known, preset?.boardId)

  return {
    of(contentId) {
      const delta = known.get(contentId)
      if (delta !== undefined) {
        return { status: 'graded', delta, band: bandOf(delta, DISPLAY_SCALE), cost: bandValue(delta, DISPLAY_SCALE) }
      }
      const reason = failed.get(contentId)
      if (reason !== undefined) return { status: 'unmeasurable', reason }

      // A provisional grade is offered ONLY by a fit that beat the trivial
      // predictor on data it never saw. Below that bar the honest display is the
      // wait, because a wrong number is a promise and a spinner is not.
      const piece = fit?.usable === true ? content.pieces.get(contentId) : undefined
      const board = preset?.boardId === undefined ? undefined : content.boards.get(preset.boardId)
      if (piece && board && fit) {
        const estimate = predict(fit.predictor, pieceFeatures(piece, board))
        return {
          status: 'provisional',
          delta: estimate,
          band: bandOf(estimate, DISPLAY_SCALE),
          cost: bandValue(estimate, DISPLAY_SCALE),
        }
      }
      return { status: 'measuring' }
    },
    pending: inFlight.current.size > 0,
    calibration: fit,
  }
}

/** Re-validates a document after an edit, for callers that need a `ContentSet`. */
export function contentOf(source: ContentSource): ContentSet | null {
  const result = loadContentSet(source)
  return result.ok ? result.set : null
}
