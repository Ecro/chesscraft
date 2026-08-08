import { useMemo } from 'react'
import { costCeiling, pieceStars, skillCardStars } from '@balance/cost'
import { type ContentSet, type ContentSource, loadContentSet } from '@content/load'
import type { BoardDef, PresetDef } from '@content/schema'

/**
 * What a record costs, for the screens that show it (ADR-012).
 *
 * This used to run self-play in a Web Worker, cache the answer by content hash,
 * ship a precomputed table for the bundled records and gate a fitted predictor
 * on leave-one-out accuracy — and all of that is gone, because a cost is now
 * read off the declaration. The whole apparatus existed to make an expensive
 * measurement feel instant; a computation that IS instant needs none of it.
 *
 * The three states a grade could be in are down to one. There is no "measuring",
 * because nothing is measured; no "unmeasurable", because every declaration has
 * a cost; and no provisional estimate, because there is nothing to estimate. A
 * record either exists in the document and has a price, or it does not exist.
 */

export interface Costs {
  /** The grade of a record, or null when the document has no such record. */
  of(contentId: string): number | null
}

export function costsFor(content: ContentSet | null, board: Pick<BoardDef, 'width' | 'height'> | undefined): Costs {
  const ceiling = content && board ? costCeiling(content.pieces.values(), board) : 0
  return {
    of(contentId) {
      if (!content || !board) return null
      const piece = content.pieces.get(contentId)
      if (piece) return pieceStars(piece, board, ceiling)
      const card = content.skillCards.get(contentId)
      return card ? skillCardStars(card, ceiling) : null
    },
  }
}

/**
 * The board a room's costs are read against.
 *
 * The only board-dependent input is how far an unbounded slide can travel, and a
 * board is authored too — the same piece is worth more on a wider one. A room
 * whose board is missing prices nothing rather than guessing a size.
 */
export function useCosts(content: ContentSet | null, preset: PresetDef | undefined): Costs {
  const board = preset ? content?.boards.get(preset.boardId) : undefined
  return useMemo(() => costsFor(content, board), [content, board])
}

/**
 * A star count as the characters a player reads.
 *
 * Filled and empty both, so five is visibly a scale of five rather than a
 * quantity with no top — the ceiling is the whole reason the scale can be this
 * coarse without loosening the rule it feeds.
 */
export function starText(stars: number, max = 5): string {
  return '★'.repeat(stars) + '☆'.repeat(Math.max(0, max - stars))
}

/** Re-validates a document after an edit, for callers that need a `ContentSet`. */
export function contentOf(source: ContentSource): ContentSet | null {
  const result = loadContentSet(source)
  return result.ok ? result.set : null
}
