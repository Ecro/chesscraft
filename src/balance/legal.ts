import type { ContentSet, ValidationError } from '@content/load'
import type { PresetDef } from '@content/schema'
import { MAX_STARS, costCeiling, exceedsCeiling, pieceCost, pieceStars, skillCardCost, skillCardStars } from './cost'

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
  // Derived from the room's own pieces, so the ceiling a creation is judged
  // against is set by what that room already plays with rather than by a
  // constant somebody chose once.
  const ceiling = costCeiling(
    preset.pieceIds.map((id) => content.pieces.get(id)).filter((p): p is NonNullable<typeof p> => p !== undefined),
    board,
  )
  const starsOfPiece = (id: string): number | null => {
    const piece = content.pieces.get(id)
    return piece ? pieceStars(piece, board, ceiling) : null
  }

  for (const side of ['white', 'black'] as const) {
    const slot = preset.loadout?.[side]
    if (!slot) continue
    const at = `presets.${preset.id}.loadout.${side}`

    const brought = starsOfPiece(slot.pieceId)
    const replaced = starsOfPiece(slot.replaces)
    const card = content.skillCards.get(slot.skillCardId)
    // A missing record is `load.ts`'s reference check, not this one's; bail
    // rather than reporting the same fault twice under a different message.
    if (brought === null || replaced === null || !card) continue

    // The ceiling is checked BEFORE the star comparison, because five stars is
    // where everything above it lands: without this, a piece ten times the
    // queen's price would read as the same five stars as one just past her and
    // the replacement rule would call them interchangeable. Closing the top band
    // is what keeps a five-level display from being a five-level rule.
    const broughtPiece = content.pieces.get(slot.pieceId)!
    if (exceedsCeiling(pieceCost(broughtPiece, board), ceiling)) {
      errors.push({
        contentId: preset.id,
        path: `${at}.pieceId`,
        message: `${slot.pieceId} is too strong for this room — nothing above ${MAX_STARS} stars may be brought`,
      })
      continue
    }
    if (exceedsCeiling(skillCardCost(card), ceiling)) {
      errors.push({
        contentId: preset.id,
        path: `${at}.skillCardId`,
        message: `${slot.skillCardId} is too strong for this room — nothing above ${MAX_STARS} stars may be brought`,
      })
      continue
    }

    // The same number of stars, which is the number the player was shown.
    if (brought !== replaced) {
      errors.push({
        contentId: preset.id,
        path: `${at}.pieceId`,
        message: `${slot.pieceId} is ${brought} stars and ${slot.replaces} is ${replaced}, so it cannot replace it`,
      })
    }

    if (budget !== undefined) {
      const spent = brought + skillCardStars(card, ceiling)
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
