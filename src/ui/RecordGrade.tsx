import { useMemo } from 'react'
import type { GradeCache } from '@balance/cache'
import type { Calibration } from '@balance/predict'
import type { ContentSource } from '@content/load'
import { useTranslate } from './i18n'
import { contentOf, useGrades } from './useGrades'

/**
 * What a record is worth, on the screen where it was made (ADR-005).
 *
 * The room's picker shows a grade beside every candidate, which is where the
 * number is USED — but it is not where the author is standing when they finish a
 * piece. Making something and then having to go find out elsewhere whether it is
 * reasonable is the loop this closes.
 *
 * Only a SAVED record has a grade. A grade is a measurement over a whole content
 * set, so a half-typed draft has nothing to measure; the badge appears once the
 * record is in the document and shows the measuring state until the worker
 * answers. Most of the time it will not have to: the bundled records ship with
 * their grades, and an authored one keeps its own once measured, because the
 * cache key is a hash of the record itself.
 */
export function RecordGrade({
  source,
  kind,
  recordId,
  cache,
  calibration,
}: {
  source: ContentSource
  kind: string
  /** The SAVED id this form is responsible for, or null before the first save. */
  recordId: string | null
  cache?: GradeCache
  calibration?: Calibration | null
}) {
  const t = useTranslate()
  const content = useMemo(() => contentOf(source), [source])

  /**
   * The room the grade is measured in.
   *
   * The first room that declares a scale, rather than a room named here: no
   * source file outside the content set may name a preset any more than it may
   * name a piece (AC-009), and the scale is a property of a room.
   */
  const preset = useMemo(
    () => (content ? [...content.presets.values()].find((p) => p.grading !== undefined) : undefined),
    [content],
  )

  const ids = useMemo(() => (recordId === null ? [] : [recordId]), [recordId])
  const grades = useGrades({
    source,
    content: content ?? EMPTY,
    preset,
    ids,
    ...(cache ? { cache } : {}),
    ...(calibration === undefined ? {} : { calibration }),
  })

  // Grades exist for pieces and skill cards only. A rule card or a square type
  // is not something a side brings of its own, so it has no band to sit in and
  // showing an empty badge for one would imply a measurement that never runs.
  if (recordId === null || (kind !== 'piece' && kind !== 'skillCard')) return null
  if (!content || !preset) return null

  const state = grades.of(recordId)
  const text =
    state.status === 'graded'
      ? t('ui.editor.loadout.grade').replace('{cost}', String(state.cost))
      : state.status === 'provisional'
        ? t('ui.editor.loadout.provisional').replace('{cost}', String(state.cost))
        : state.status === 'unmeasurable'
          ? t('ui.editor.loadout.unmeasurable')
          : t('ui.editor.loadout.measuring')

  return (
    <p className="record-grade" data-testid="record-grade" data-status={state.status}>
      <strong>{text}</strong>
      <span className="hint">{t('ui.editor.loadout.caveat')}</span>
    </p>
  )
}

/** Stands in when the document does not load — grading nothing is the right answer there. */
const EMPTY = {
  schemaVersion: 0,
  strings: {},
  pieces: new Map(),
  squareTypes: new Map(),
  ruleCards: new Map(),
  skillCards: new Map(),
  boards: new Map(),
  presets: new Map(),
}
