import { useMemo } from 'react'
import type { ContentSource } from '@content/load'
import { pieceDef, skillCardDef } from '@content/schema'
import { type CostExplanation, costCeiling, explainPieceCost, explainSkillCardCost, starsOf } from '@balance/cost'
import { useTranslate } from './i18n'
import { contentOf, starText, useCosts } from './useGrades'

/**
 * What a record is worth, on the screen where it was made, and WHY (ADR-005, ADR-009).
 *
 * The room's picker shows a grade beside every candidate, which is where the
 * number is USED — but it is not where the author is standing when they finish a
 * piece. Making something and then having to go find out elsewhere whether it is
 * reasonable is the loop this closes.
 *
 * The stars alone were an oracle. `cost.ts` has claimed since ADR-012 that its model is
 * explainable — "this one costs more because it reaches further" — and nothing rendered a word
 * of it, which is `declared-but-inert-vocabulary` and the reason an author could only ask why
 * a piece got the stars it got. The terms shown here come out of the same arithmetic that
 * produces the price (`explainPieceCost` / `explainSkillCardCost`), not out of a second
 * description of the model that would go stale the day a weight moves.
 *
 * It answers on the DRAFT. A cost is a pure function of the declaration as of ADR-012, so
 * there is nothing to wait for and no reason to withhold the answer until the first save — the
 * question is loudest while the author is still choosing. A draft that does not yet parse as a
 * record has no price, and then the saved record is what is described.
 *
 * The paragraph that used to sit here described a Web Worker, a measuring state and a
 * content-hash cache. ADR-012 deleted all three; the comment outlived them and said so in a
 * file whose neighbour's comment says the opposite (`useGrades.ts`). Removed rather than
 * corrected — `[fail:design] comment-claims-unbuilt-safeguard` is at count 7 in this repo.
 */
export function RecordGrade({
  source,
  kind,
  recordId,
  draft,
}: {
  source: ContentSource
  kind: string
  /** The SAVED id this form is responsible for, or null before the first save. */
  recordId: string | null
  /** What the author is editing right now. Priced when it parses; ignored when it does not. */
  draft?: Record<string, unknown> | undefined
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

  /**
   * The record to describe: what is on screen if it parses, else what is saved.
   *
   * `safeParse` and not a hand-rolled shape check — the price is a function of the
   * declaration, so the thing that decides whether a declaration exists yet has to be the
   * schema the engine loads with.
   */
  const board = preset ? content?.boards.get(preset.boardId) : undefined

  /**
   * The draft with its identity fields made parseable.
   *
   * A price is a function of movement, attack, promotion and effects — the id, the name key
   * and the text key contribute nothing to it. A brand-new record has those three empty, so
   * parsing the draft as-is fails and the author gets no answer at the exact moment they are
   * asking the question. Substituting placeholders for the three fields the arithmetic does
   * not read is what lets the explanation appear before the record has a name; anything the
   * arithmetic DOES read is left exactly as authored, so nothing here can flatter a price.
   */
  const priceable = useMemo(() => {
    if (!draft) return null
    // Shaped to satisfy `contentId` (`<kind>.<slug>`) and `i18nKey` (dotted lowercase) —
    // placeholders that do not parse are placeholders that do nothing.
    const identity = { id: `${kind === 'skillCard' ? 'skill' : 'piece'}.draft`, nameKey: 'draft.name', textKey: 'draft.text' }
    const out: Record<string, unknown> = { ...draft }
    for (const [key, placeholder] of Object.entries(identity)) {
      if (typeof out[key] !== 'string' || (out[key] as string).length === 0) out[key] = placeholder
    }
    return out
  }, [draft, kind])

  /**
   * The explanation, and where it came from.
   *
   * `from` is not decoration. An earlier version fell back to the SAVED record whenever the
   * draft failed to parse, which showed a plausible price for a declaration the author had
   * already edited away — the form said "invalid" and the cost panel described the old piece
   * with nothing marking it as stale. A draft that cannot be priced now says so.
   */
  const priced: { explanation: CostExplanation; from: 'draft' | 'saved' } | { explanation: null; from: 'unpriceable' | 'none' } =
    useMemo(() => {
      if (!board) return { explanation: null, from: 'none' as const }
      if (kind === 'piece') {
        const fromDraft = priceable ? pieceDef.safeParse(priceable) : null
        if (fromDraft?.success) return { explanation: explainPieceCost(fromDraft.data, board), from: 'draft' as const }
        const saved = recordId ? content?.pieces.get(recordId) : undefined
        if (priceable) return { explanation: null, from: 'unpriceable' as const }
        return saved
          ? { explanation: explainPieceCost(saved, board), from: 'saved' as const }
          : { explanation: null, from: 'none' as const }
      }
      if (kind === 'skillCard') {
        const fromDraft = priceable ? skillCardDef.safeParse(priceable) : null
        if (fromDraft?.success) return { explanation: explainSkillCardCost(fromDraft.data), from: 'draft' as const }
        const saved = recordId ? content?.skillCards.get(recordId) : undefined
        if (priceable) return { explanation: null, from: 'unpriceable' as const }
        return saved
          ? { explanation: explainSkillCardCost(saved), from: 'saved' as const }
          : { explanation: null, from: 'none' as const }
      }
      return { explanation: null, from: 'none' as const }
    }, [board, content, kind, priceable, recordId])

  const explanation = priced.explanation

  // Grades exist for pieces and skill cards only. A rule card or a square type
  // is not something a side brings of its own, so it has no band to sit in and
  // showing an empty badge for one would imply a measurement that never runs.
  if (kind !== 'piece' && kind !== 'skillCard') return null
  if (!content || !preset) return null

  /**
   * The band, computed from the SAME record the explanation describes.
   *
   * It used to come from the saved document unconditionally, and both reviewers independently
   * caught what that produces: widen a saved one-star piece's movement and the explanation
   * jumps to the new price while the badge still shows the old star, two numbers describing
   * two different pieces inside one paragraph with nothing saying so. Deriving the band from
   * the priced explanation removes the contradiction instead of labelling it.
   *
   * The ceiling is still the saved document's — it is derived from the room's own pieces, and a
   * draft is not in the room yet. That is the same one-save-behind the ADR already accepts, and
   * it moves the band by at most a step; showing a stale BAND for a live PRICE was a different
   * thing, because the two were contradicting each other on screen.
   */
  const ceiling = board ? costCeiling(content.pieces.values(), board) : 0
  const grade =
    explanation !== null && board ? starsOf(explanation.total, ceiling) : recordId === null ? null : costs.of(recordId)
  if (grade === null && explanation === null && priced.from !== 'unpriceable') return null

  return (
    <p className="record-grade" data-testid="record-grade" data-status="graded">
      {grade !== null && (
        <strong data-stars={grade}>{t('ui.editor.loadout.grade').replace('{stars}', starText(grade))}</strong>
      )}
      {priced.from === 'unpriceable' && (
        <span className="hint" data-testid="record-cost-unpriceable">
          {t('ui.editor.cost.unpriceable')}
        </span>
      )}
      {explanation && (
        <span className="cost-why" data-testid="record-cost-why" data-from={priced.from}>
          <span className="cost-total">
            {t('ui.editor.cost.total').replace('{n}', String(explanation.total))}
          </span>
          {explanation.terms.map((term, i) => (
            <span key={`${term.kind}-${i}`} className="cost-term" data-term={term.kind}>
              {t(`ui.editor.cost.term.${term.kind}`).replace('{n}', String(term.amount))}
            </span>
          ))}
          {explanation.steps.map((step, i) => (
            <span key={`${step.kind}-${i}`} className="cost-step" data-step={step.kind}>
              {t(`ui.editor.cost.step.${step.kind}`).replace('{n}', String(step.amount ?? 0))}
            </span>
          ))}
        </span>
      )}
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
