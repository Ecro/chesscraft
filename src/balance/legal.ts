import type { ContentSet, ValidationError } from '@content/load'
import type { PresetDef } from '@content/schema'
import { pieceGrade, skillCardGrade } from './cost'

/**
 * The two loadout rules that need a price (ADR-004, ADR-008, ADR-012).
 *
 * These were once split away from `loadContentSet` because a grade cost 600
 * self-play matches and a synchronous validator could not run twenty thousand of
 * them (ADR-011). A cost is now a pure function of the declaration, so the split
 * is no longer forced — but it is kept, because the rules still belong together
 * and `load.ts` has no business computing prices. What HAS gone is the argument
 * that made the split awkward: there is no cache to consult, no "not measured
 * yet" state, and no way for this to disagree with what the screen showed.
 */

export function checkLoadoutGrades(preset: PresetDef, content: ContentSet): ValidationError[] {
  const errors: ValidationError[] = []
  const board = content.boards.get(preset.boardId)
  if (!board) return errors

  const budget = preset.loadoutBudget
  const gradeOfPiece = (id: string): number | null => {
    const piece = content.pieces.get(id)
    return piece ? pieceGrade(piece, board) : null
  }

  for (const side of ['white', 'black'] as const) {
    const slot = preset.loadout?.[side]
    if (!slot) continue
    const at = `presets.${preset.id}.loadout.${side}`

    const brought = gradeOfPiece(slot.pieceId)
    const replaced = gradeOfPiece(slot.replaces)
    const card = content.skillCards.get(slot.skillCardId)
    // A missing record is `load.ts`'s reference check, not this one's; bail
    // rather than reporting the same fault twice under a different message.
    if (brought === null || replaced === null || !card) continue

    // ADR-008 — the same grade, which is the number the player was shown. Exact
    // equality is right now that a cost is exact: the bands existed to absorb
    // measurement noise, and there is none left to absorb.
    if (brought !== replaced) {
      errors.push({
        contentId: preset.id,
        path: `${at}.pieceId`,
        message: `${slot.pieceId} is grade ${brought} and ${slot.replaces} is grade ${replaced}, so it cannot replace it`,
      })
    }

    if (budget !== undefined) {
      const spent = brought + skillCardGrade(card)
      if (spent > budget) {
        errors.push({
          contentId: preset.id,
          path: at,
          message: `this loadout costs ${spent} and the room's budget is ${budget}`,
        })
      }
    }
  }
  return errors
}
