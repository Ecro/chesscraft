// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import type { ContentSource } from '@content/load'
import {
  readMovementEditor,
  type TurningRow,
  writeMovementEditor,
} from '@ui/PieceMoves'
import { RecordForm } from '@ui/RecordForm'
import { TurningSlideEditor } from '@ui/TurningSlideEditor'
import { makeTranslate } from '@ui/i18n'

afterEach(cleanup)

const t = makeTranslate()

const emptyBundle: ContentSource = {
  schemaVersion: 14,
  pieces: [],
  squareTypes: [],
  ruleCards: [],
  skillCards: [],
  boards: [],
  presets: [],
}

function turningSource(): ContentSource {
  return {
    schemaVersion: 14,
    strings: {
      ko: {
        'piece.turner.name': '꺾이개',
        'piece.turner.text': '한 번 꺾여요.',
      },
    },
    pieces: [
      {
        id: 'piece.turner',
        nameKey: 'piece.turner.name',
        textKey: 'piece.turner.text',
        movement: [{ kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 2 }],
        effects: [],
      },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [],
    presets: [],
  }
}

describe('turning movement editor model', () => {
  it('reads and writes straight and turning patterns without merging move and capture rows', () => {
    const draft = {
      movement: [
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2, forward: true },
        { kind: 'turning_slide', vectors: [[1, 0], [0, 1]], maxDistance: 3, forward: true },
        { kind: 'turning_slide', vectors: [[-1, 0], [0, 1]], forward: true },
      ],
      attack: [
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2, forward: true },
        { kind: 'turning_slide', vectors: [[1, 0], [0, 1]], maxDistance: 2, forward: true },
      ],
    }

    const editor = readMovementEditor(draft)
    expect(editor).not.toBeNull()
    expect(editor!.grid.forward).toBe(true)
    expect(editor!.turning.move).toEqual([
      { first: 'e', second: 'n', reach: 3 },
      { first: 'w', second: 'n', reach: 'edge' },
    ])
    expect(editor!.turning.capture).toEqual([{ first: 'e', second: 'n', reach: 2 }])

    const written = writeMovementEditor(editor!)
    expect(written).toEqual({
      ok: true,
      movement: [
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2, forward: true },
        { kind: 'turning_slide', vectors: [[1, 0], [0, 1]], maxDistance: 3, forward: true },
        { kind: 'turning_slide', vectors: [[-1, 0], [0, 1]], forward: true },
      ],
      attack: [
        { kind: 'slide', vectors: [[0, 1]], maxDistance: 2, forward: true },
        { kind: 'turning_slide', vectors: [[1, 0], [0, 1]], maxDistance: 2, forward: true },
      ],
    })
  })

  it('supports a turning-only movement and rejects pairs the schema cannot execute', () => {
    const editor = readMovementEditor({
      movement: [{ kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 2 }],
    })
    expect(editor).not.toBeNull()
    expect(writeMovementEditor(editor!)).toEqual({
      ok: true,
      movement: [{ kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 2 }],
      attack: undefined,
    })

    for (const vectors of [
      [[1, 0], [1, 0]],
      [[1, 0], [-1, 0]],
      [[2, 1], [0, 1]],
    ]) {
      expect(readMovementEditor({ movement: [{ kind: 'turning_slide', vectors }] })).toBeNull()
    }
    expect(
      readMovementEditor({ movement: [{ kind: 'turning_slide', vectors: [[1, 0], [0, 1]], maxDistance: 4 }] }),
    ).toBeNull()
  })
})

describe('TurningSlideEditor', () => {
  const row: TurningRow = { first: 'n', second: 'e', reach: 2 }

  it('renders one shared row control and emits valid direction, cap, add, and remove edits', () => {
    const changes: TurningRow[][] = []
    render(
      <TurningSlideEditor
        axis="move"
        rows={[row]}
        onChange={(next) => changes.push(next)}
        t={t}
        testIdPrefix="turning-test"
      />,
    )

    expect(screen.getByTestId('turning-test-row-0-first-n').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('turning-test-row-0-second-e').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('turning-test-row-0-reach-2').getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByTestId('turning-test-row-0-second-w') as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(screen.getByTestId('turning-test-row-0-second-w'))
    fireEvent.click(screen.getByTestId('turning-test-row-0-reach-3'))
    fireEvent.click(screen.getByTestId('turning-test-add'))
    expect(changes.at(-1)).toHaveLength(2)

    fireEvent.click(screen.getByTestId('turning-test-row-0-remove'))
    expect(changes.at(-1)).toHaveLength(0)
  })

  it('persists a piece turning row, cap, and forward choice through save and reopen', () => {
    const source = turningSource()
    let saved: ContentSource | null = null
    const props = {
      source,
      kind: 'piece' as const,
      initialId: 'piece.turner',
      commit: (next: ContentSource) => {
        saved = next
      },
      errors: [],
      setErrors: () => {},
      bundle: emptyBundle,
      official: new Set<string>(),
    }

    render(<RecordForm {...props} />)
    fireEvent.click(screen.getByTestId('piece-forward'))
    fireEvent.click(screen.getByTestId('turning-slide-move-row-0-reach-3'))

    fireEvent.click(screen.getByTestId('editor-save'))
    expect(saved).not.toBeNull()
    const savedPiece = saved!.pieces[0] as Record<string, unknown>
    expect(savedPiece.movement).toEqual([
      { kind: 'turning_slide', vectors: [[0, 1], [1, 0]], maxDistance: 3, forward: true },
    ])

    cleanup()
    render(<RecordForm {...props} source={saved!} />)
    expect(screen.getByTestId('turning-slide-move-row-0-reach-3').getAttribute('aria-pressed')).toBe('true')
    expect((screen.getByTestId('piece-forward') as HTMLInputElement).checked).toBe(true)
  })
})
