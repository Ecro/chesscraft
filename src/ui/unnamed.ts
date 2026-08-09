import type { DraftKind } from '@editor/draft'
import type { Translate } from './i18n'

/**
 * What to call a record whose name will not resolve (ADR-002).
 *
 * The audience is a Korean-speaking child, and the previous answer was the
 * record's id, which is developer output that happened to be printable. The id
 * is an internal identifier and always was; this is the screen's answer
 * instead.
 *
 * Keyed by kind rather than composed from a template, so a translator fixes one
 * string per kind and no code has to know how Korean attaches a modifier to a
 * noun. The kind vocabulary itself already exists at `ui.editor.kind.*`; these
 * keys reuse those words rather than inventing a second set.
 *
 * `ordinal` disambiguates within ONE list. Two unnamed rooms rendering the same
 * label is a different defect from two rooms rendering their ids — not a fix for
 * it — so a list hands each unnamed record its 1-based position among the
 * unnamed. A record shown on its own gets no number, because there is nothing to
 * tell it apart from.
 */
export function unnamedLabel(t: Translate, kind: DraftKind, ordinal?: number): string {
  const base = t(`ui.record.unnamed.${kind}`)
  return ordinal === undefined ? base : `${base} ${ordinal}`
}
