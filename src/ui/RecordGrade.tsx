import { useMemo } from 'react'
import type { ContentSource } from '@content/load'
import { useTranslate } from './i18n'
import { contentOf, starText, useCosts } from './useGrades'

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
}: {
  source: ContentSource
  kind: string
  /** The SAVED id this form is responsible for, or null before the first save. */
  recordId: string | null
}) {
  const t = useTranslate()
  const content = useMemo(() => contentOf(source), [source])

  /**
   * The room whose board the cost is read against.
   *
   * The first room in the document rather than one named here: no source file
   * outside the content set may name a preset any more than it may name a piece
   * (AC-009). The board only decides how far an unbounded slide travels, so any
   * room of the right size gives the same answer.
   */
  const preset = useMemo(() => (content ? [...content.presets.values()][0] : undefined), [content])
  const costs = useCosts(content, preset)

  // Grades exist for pieces and skill cards only. A rule card or a square type
  // is not something a side brings of its own, so it has no band to sit in and
  // showing an empty badge for one would imply a measurement that never runs.
  if (recordId === null || (kind !== 'piece' && kind !== 'skillCard')) return null
  if (!content || !preset) return null

  const grade = costs.of(recordId)
  if (grade === null) return null

  return (
    <p className="record-grade" data-testid="record-grade" data-status="graded">
      <strong data-stars={grade}>{t('ui.editor.loadout.grade').replace('{stars}', starText(grade))}</strong>
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
