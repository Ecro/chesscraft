import type { ContentSet } from '@content/load'
import { parseSquare } from '@content/schema'

/**
 * A room's board at thumbnail size — the picture on a room's card.
 *
 * It exists because a room is otherwise indistinguishable from another room: the
 * old picker was a `<select>` of names, so a minefield and a king-of-the-hill room looked the
 * same until you started a match in one. What actually differs between two rooms
 * at a glance is the SHAPE of the board — where the painted squares are — and
 * that is all this draws.
 *
 * **Every painted square is the same violet, whatever type it is.** The design
 * prototype gave each type its own colour, which needs the UI to know that a
 * bomb is red and a portal is purple — and ADR-011 is precisely the rule that
 * the UI may not name a piece, card or square type. A room a child invents would
 * have had no colour at all under that scheme. The thumbnail says "this many
 * special squares, in this pattern", which is the question it is answering.
 */
export function MiniBoard({ content, boardId }: { content: ContentSet; boardId: string }) {
  const board = content.boards.get(boardId)
  // A preset pointing at a board the document no longer has is reachable — the
  // editor can delete one — and a missing thumbnail is better than a crash on
  // the screen a player opens the app to.
  if (!board) return <div className="mini-board" data-empty="true" aria-hidden="true" />

  const painted = new Set(board.squares.map((s) => s.square))
  const cells: { key: string; parity: number; painted: boolean }[] = []
  // Top rank first, so the thumbnail is oriented the way the board is drawn.
  for (let rank = board.height - 1; rank >= 0; rank--) {
    for (let file = 0; file < board.width; file++) {
      const key = `${String.fromCharCode(97 + file)}${rank + 1}`
      cells.push({ key, parity: (file + rank) % 2, painted: painted.has(key) })
    }
  }

  return (
    // `aria-hidden`: the room's name and its summary sit immediately beside this,
    // and there is no way to say "a six by six board with four violet squares"
    // that helps anyone more than the count already does.
    <div
      className="mini-board"
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${board.width}, 1fr)` }}
    >
      {cells.map((c) => (
        <span key={c.key} data-parity={c.parity} data-painted={c.painted} />
      ))}
    </div>
  )
}

/** How many squares of the board carry a type — the number under the thumbnail. */
export function paintedCount(content: ContentSet, boardId: string): number {
  return content.boards.get(boardId)?.squares.length ?? 0
}

/**
 * Whether a board declares a square outside its own bounds.
 *
 * Not used by the thumbnail — `boardDef` already refuses one at load — but the
 * builder paints onto a grid and has to ask the same question before saving, and
 * a second implementation of "is this square on this board" is exactly the kind
 * of thing that drifts.
 */
export function inBounds(square: string, width: number, height: number): boolean {
  const parsed = parseSquare(square)
  return parsed !== null && parsed.file < width && parsed.rank < height
}
