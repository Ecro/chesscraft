// @vitest-environment jsdom
/**
 * AC-008 — a record the grid cannot draw is suppressed, never flattened.
 *
 * The rule this pins is one the repo paid for twice. Suppressing the EDITOR for
 * a half the screen cannot depict is what keeps the document intact, because a
 * save writes the draft and the draft carries that half untouched. Blocking the
 * SAVE instead — the other obvious answer — made a shipped piece uneditable, and
 * the e2e suite found it three phases later.
 *
 * `tests/editor/movement-opens-shipped-content.test.ts` asserts the same property
 * for the one record that actually ships in this state (`piece.charger`). This
 * file asserts it for shapes that do NOT ship, which is where a future refusal
 * cause would first appear — and it enumerates the causes rather than sampling
 * one, because the value of a refusal test is that it covers the reasons.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import { bundledContentSource } from '@content/sets/bundled'
import { readGrid } from '../../src/ui/PieceMoves'
import { Edit } from '../../src/ui/Edit'

afterEach(cleanup)

type Rec = Record<string, unknown>

/** Every documented reason the grid refuses a movement half. */
const UNDRAWABLE: Array<{ why: string; movement: unknown[]; attack?: unknown[] }> = [
  {
    why: 'a slide capped at exactly three, which no cell can say',
    movement: [{ kind: 'slide', vectors: [[0, 1]], maxDistance: 3 }],
  },
  {
    why: 'a slide along a vector that is not one of the eight compass units',
    movement: [{ kind: 'slide', vectors: [[1, 2]] }],
  },
  {
    why: 'a leap beyond the grid it would have to be drawn in',
    movement: [{ kind: 'step', vectors: [[4, 0]] }],
  },
  {
    why: 'a capped leap, which the engine cannot observe and the cell cannot show',
    movement: [{ kind: 'step', vectors: [[0, 1]], maxDistance: 2 }],
  },
  {
    why: 'one direction claimed twice at two different caps',
    movement: [
      { kind: 'slide', vectors: [[0, 1]] },
      { kind: 'slide', vectors: [[0, 1]], maxDistance: 2 },
    ],
  },
  {
    why: 'movement and attack disagreeing about forward mirroring',
    movement: [{ kind: 'step', vectors: [[0, 1]], forward: true }],
    attack: [{ kind: 'step', vectors: [[1, 1]] }],
  },
]

/** Puts `movement`/`attack` onto the first bundled piece and opens it in the maker. */
function openWith(movement: unknown[], attack?: unknown[]) {
  const source = structuredClone(bundledContentSource) as unknown as Record<string, Rec[]>
  const piece = source.pieces![0]!
  piece.movement = movement
  if (attack === undefined) delete piece.attack
  else piece.attack = attack
  const id = String(piece.id)

  const committed: { value: ContentSource | null } = { value: null }
  render(
    React.createElement(Edit, {
      source: source as unknown as ContentSource,
      onCommit: (next: ContentSource) => {
        committed.value = next
      },
    }),
  )
  fireEvent.click(screen.getByTestId('editor-tab-library'))
  fireEvent.change(screen.getByTestId('editor-kind'), { target: { value: 'piece' } })
  fireEvent.click(screen.getByTestId(`library-open-${id}`))
  return { committed, id, before: { movement, attack } }
}

describe('AC-008 — the fixtures are genuinely undrawable', () => {
  it.each(UNDRAWABLE.map((u) => [u.why, u] as const))('%s', (_why, u) => {
    // The premise. A fixture the grid CAN draw would make every assertion below
    // pass for the wrong reason — it would be testing the ordinary path.
    expect(readGrid({ movement: u.movement, attack: u.attack } as Rec)).toBeNull()
  })
})

describe('AC-008 — undrawable means the editor is suppressed, not the save', () => {
  it.each(UNDRAWABLE.map((u) => [u.why, u] as const))('%s', (_why, u) => {
    const { committed, id, before } = openWith(u.movement, u.attack)

    expect(screen.queryByTestId('editor-moves'), 'the grid drew a record it cannot draw').toBeNull()
    expect(screen.queryByTestId('editor-readonly-moves'), 'nothing explains why the editor is missing').toBeTruthy()

    const save = screen.getByTestId('editor-save') as HTMLButtonElement
    expect(save.disabled, 'the save was blocked by a half this screen cannot draw').toBe(false)

    fireEvent.change(screen.getByTestId('editor-name'), { target: { value: '이름만 바꿔요' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    expect(screen.queryByTestId('editor-errors')?.textContent ?? '').toBe('')
    expect(committed.value, 'the save produced nothing').not.toBeNull()
    const after = (committed.value as unknown as Record<string, Rec[]>).pieces!.find((p) => p.id === id)!
    expect(after.movement, 'the movement half was rewritten by a rename').toEqual(before.movement)
    expect(after.attack).toEqual(before.attack)
  })
})
