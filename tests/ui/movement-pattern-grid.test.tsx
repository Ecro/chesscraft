// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ContentSource } from '@content/load'
import { RecordForm } from '@ui/RecordForm'

afterEach(cleanup)

const emptyBundle: ContentSource = {
  schemaVersion: 16,
  pieces: [],
  squareTypes: [],
  ruleCards: [],
  skillCards: [],
  boards: [],
  presets: [],
}

function source(withSeparateAttack = false): ContentSource {
  return {
    schemaVersion: 16,
    pieces: [
      {
        id: 'piece.turner',
        nameKey: 'piece.turner.name',
        textKey: 'piece.turner.text',
        movement: [{ kind: 'slide', vectors: [[0, 1]] }],
        ...(withSeparateAttack ? { attack: [{ kind: 'step', vectors: [[0, 1]] }] } : {}),
        effects: [],
      },
    ],
    squareTypes: [],
    ruleCards: [],
    skillCards: [],
    boards: [],
    presets: [],
    strings: {
      ko: {
        'piece.turner.name': '꺾이개',
        'piece.turner.text': '바깥에서 두 번 누르면 꺾여요.',
      },
    },
  }
}

describe('unified movement pattern grid', () => {
  it('S1 turns the outermost cell into an automatic bend through the native double-click handler', () => {
    render(
      <RecordForm
        source={source()}
        kind="piece"
        initialId="piece.turner"
        commit={() => {}}
        errors={[]}
        setErrors={() => {}}
        bundle={emptyBundle}
        official={new Set<string>()}
      />,
    )

    const outer = screen.getByTestId('piece-cell-0,3')
    fireEvent.doubleClick(outer)
    expect(outer.getAttribute('data-turning')).toBe('true')
    expect(outer.getAttribute('data-endless')).toBe('true')
  })

  it('S2 keeps a capture double-click separate from the movement axis', () => {
    render(
      <RecordForm
        source={source(true)}
        kind="piece"
        initialId="piece.turner"
        commit={() => {}}
        errors={[]}
        setErrors={() => {}}
        bundle={emptyBundle}
        official={new Set<string>()}
      />,
    )

    fireEvent.doubleClick(screen.getByTestId('piece-cell-3,0'))
    fireEvent.click(screen.getByTestId('piece-mode-capture'))
    expect(screen.getByTestId('piece-cell-3,0').getAttribute('data-turning')).toBe('false')
    fireEvent.doubleClick(screen.getByTestId('piece-cell-0,3'))
    expect(screen.getByTestId('piece-cell-3,0').getAttribute('data-turning')).toBe('false')
    expect(screen.getByTestId('piece-cell-0,3').getAttribute('data-turning')).toBe('true')
  })

  it('S3 marks an off-axis perimeter cell as an automatic bend', () => {
    render(
      <RecordForm
        source={source()}
        kind="piece"
        initialId="piece.turner"
        commit={() => {}}
        errors={[]}
        setErrors={() => {}}
        bundle={emptyBundle}
        official={new Set<string>()}
      />,
    )

    const outer = screen.getByTestId('piece-cell--3,1')
    fireEvent.doubleClick(outer)
    expect(outer.getAttribute('data-turning')).toBe('true')
    expect(outer.getAttribute('data-paint')).toBe('ray')
  })
})
