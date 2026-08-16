import { describe, expect, it } from 'vitest'
import { shippedContent } from '../helpers/shipped'

describe('bundled square-type reachability', () => {
  it('keeps every bundled square type painted on at least one selectable board', () => {
    const content = shippedContent()
    const painted = new Set<string>()
    for (const board of content.boards.values()) {
      for (const square of board.squares) painted.add(square.typeId)
    }
    for (const id of content.squareTypes.keys()) expect(painted.has(id), `${id} must be painted`).toBe(true)
  })
})
