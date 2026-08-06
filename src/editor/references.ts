import type { ContentSource } from '@content/load'
import type { DraftKind } from './draft'

/**
 * Which rooms reference a record (PLAN Phase 9a).
 *
 * A `preset` IS the product's room, so this is the question "is anything using
 * this?" — and it has exactly two callers that must never answer it
 * differently: the library tab's "어느 방에도 안 들어감" badge (9a) and the
 * delete guard (9b). One badges a record as unused; the other refuses to delete
 * a record that is used. Two independent `.some()` expressions would drift, and
 * the drift is silent until the day one of them deletes something the other
 * said was in play.
 *
 * The walk is TRANSITIVE, and that is the whole difficulty. A room names its
 * pieces in `pieceIds`, but the BOARD it plays on names pieces too, in
 * `placements[].pieceId`, and square types in `squares[].typeId` — and nothing
 * in the schema makes the two lists agree. A guard reading only the four direct
 * id fields would report "no room uses this" about a piece standing on a room's
 * opening square.
 *
 * Deliberately reads `ContentSource` — the unvalidated document — rather than a
 * loaded `ContentSet`. The badge re-renders on every keystroke, including the
 * keystrokes between two saves when a `boardId` names a board that does not
 * exist yet. Describing the document as it actually is (and returning nothing
 * rather than throwing on a dangling reference) is what keeps the editor up
 * while a child is mid-edit.
 */

interface RoomLike {
  id?: unknown
  boardId?: unknown
  pieceIds?: unknown
  ruleCardIds?: unknown
  skillCardIds?: unknown
}

interface BoardLike {
  id?: unknown
  placements?: unknown
  squares?: unknown
}

function ids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null) : []
}

/**
 * The preset ids that reach `id`, in document order, each at most once.
 *
 * Once each because a room that reaches a record by two paths is still one
 * room: 9b prints this list back to the child as "이 방들이 쓰고 있어요", and a
 * name repeated in that sentence reads as a bug in the app rather than as a
 * fact about their content.
 *
 * A room is never a referrer of a room — presets do not nest — so asking about
 * a `preset` returns nothing rather than pretending the question means
 * something else.
 */
export function roomsReferencing(source: ContentSource, kind: DraftKind, id: string): string[] {
  if (kind === 'preset') return []

  const boards = new Map<string, BoardLike>()
  for (const board of source.boards as BoardLike[]) {
    if (typeof board?.id === 'string') boards.set(board.id, board)
  }

  const out: string[] = []
  for (const room of source.presets as RoomLike[]) {
    if (typeof room?.id !== 'string') continue
    // A room whose `boardId` names nothing yet contributes no transitive path,
    // but its direct lists still count — the child has not finished, and their
    // ticked pieces are not less real for it.
    const board = typeof room.boardId === 'string' ? boards.get(room.boardId) : undefined

    let hit = false
    switch (kind) {
      case 'board':
        hit = room.boardId === id
        break
      case 'piece':
        hit =
          ids(room.pieceIds).includes(id) ||
          rows(board?.placements).some((p) => p.pieceId === id)
        break
      case 'squareType':
        hit = rows(board?.squares).some((s) => s.typeId === id)
        break
      case 'ruleCard':
        hit = ids(room.ruleCardIds).includes(id)
        break
      case 'skillCard':
        hit = ids(room.skillCardIds).includes(id)
        break
    }
    if (hit && !out.includes(room.id)) out.push(room.id)
  }
  return out
}

/** The inverse question the library badge actually asks. */
export function isOrphaned(source: ContentSource, kind: DraftKind, id: string): boolean {
  // A room is never "in" another room, so orphanhood would be true of every
  // room ever made — which would badge the one screen the child lives on.
  if (kind === 'preset') return false
  return roomsReferencing(source, kind, id).length === 0
}
