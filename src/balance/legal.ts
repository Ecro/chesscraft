import type { ValidationError } from '@content/load'
import type { PresetDef } from '@content/schema'
import { type BandScale, bandOf, bandValue } from './bands'

/**
 * The half of the duel-legal check that needs measured grades (ADR-011).
 *
 * `loadContentSet` owns everything decidable from the document — the budget must
 * be declared, the slot may not carry `win` or `royal`, the replaced piece must
 * actually stand on that side. It cannot own these two, because a grade is 600
 * self-play matches per arm and a synchronous validator that ran twenty thousand
 * matches would freeze the app on every save.
 *
 * So grades arrive as an argument, from the cache that recomputed them
 * (ADR-007). A grade this function cannot find is NOT treated as zero: an
 * unmeasured record is refused, because scoring the unknown as harmless is how a
 * budget gets bypassed by whatever the measurement has not caught up with yet.
 */

export interface GradeLookup {
  /** Measured delta for a content id, or `undefined` when nothing has measured it. */
  get(contentId: string): number | undefined
}

export function checkLoadoutGrades(preset: PresetDef, grades: GradeLookup, scale: BandScale): ValidationError[] {
  const errors: ValidationError[] = []
  const budget = preset.loadoutBudget

  for (const side of ['white', 'black'] as const) {
    const slot = preset.loadout?.[side]
    if (!slot) continue
    const at = `presets.${preset.id}.loadout.${side}`

    const brought = grades.get(slot.pieceId)
    const replaced = grades.get(slot.replaces)
    const card = grades.get(slot.skillCardId)

    for (const [id, delta, field] of [
      [slot.pieceId, brought, 'pieceId'],
      [slot.replaces, replaced, 'replaces'],
      [slot.skillCardId, card, 'skillCardId'],
    ] as const) {
      if (delta === undefined) {
        errors.push({ contentId: preset.id, path: `${at}.${field}`, message: `${id} has not been graded yet` })
      }
    }
    if (brought === undefined || replaced === undefined || card === undefined) continue

    // ADR-008 — same band, not same number. The band is the unit the player is
    // shown, so it has to be the unit the rule speaks in.
    if (bandOf(brought, scale) !== bandOf(replaced, scale)) {
      errors.push({
        contentId: preset.id,
        path: `${at}.pieceId`,
        message: `${slot.pieceId} is not the same grade as ${slot.replaces}, so it cannot replace it`,
      })
    }

    // ADR-004 — the budget charges the BAND REPRESENTATIVE, not the raw delta.
    // Two records the UI calls the same grade must cost the same, or "why does
    // my B-grade leave less skill budget than yours?" has no visible answer.
    if (budget !== undefined) {
      const spent = bandValue(brought, scale) + bandValue(card, scale)
      if (spent > budget) {
        errors.push({
          contentId: preset.id,
          path: `${at}`,
          message: `this loadout costs ${spent} and the room's budget is ${budget}`,
        })
      }
    }
  }
  return errors
}

/** A `GradeLookup` over a plain map, which is what the cache hands back. */
export function gradesFrom(entries: ReadonlyMap<string, number>): GradeLookup {
  return { get: (id) => entries.get(id) }
}
