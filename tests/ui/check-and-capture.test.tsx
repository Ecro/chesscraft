// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { createPosition } from '@engine/match'
import type { AiClient } from '@engine/ai/client'
import { CAPTURE_REVEAL_MS, MatchHost } from '../../src/ui/MatchHost'

const content = (() => {
  const loaded = loadContentSet(bundledContentSource)
  if (!loaded.ok) throw new Error('bundled content must load')
  return loaded.set
})()

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function checkedPosition() {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 51,
    sideToMove: 'white',
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'a6', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
}

function capturePosition() {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 52,
    sideToMove: 'black',
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'a2', pieceId: 'piece.rook', side: 'black' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
}

describe('check warning and royal-capture explanation', () => {
  it('marks the checked king before the losing move', () => {
    const { container } = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} initialState={checkedPosition()} />,
    )

    expect(screen.getByTestId('check-warning').getAttribute('data-sides')).toBe('white')
    expect(container.querySelector('[data-testid="sq-a1"]')?.getAttribute('data-check')).toBe('true')
    expect(container.querySelector('[data-testid="sq-a1"]')?.getAttribute('aria-label')).toContain('체크')
  })

  it('shows the capture path before revealing the result screen', () => {
    vi.useFakeTimers()
    const { container } = render(
      <MatchHost content={content} presetId={BUNDLED_PRESET_ID} initialState={capturePosition()} />,
    )

    fireEvent.click(screen.getByTestId('sq-a2'))
    fireEvent.click(screen.getByTestId('sq-a1'))

    const reveal = screen.getByTestId('capture-reveal')
    expect(reveal.textContent).toContain('왕이 잡혔어요')
    expect(reveal.textContent).toContain('a2')
    expect(reveal.textContent).toContain('a1')
    expect(screen.queryByTestId('result-screen')).toBeNull()
    expect(container.querySelector('[data-testid="sq-a1"]')?.getAttribute('data-last')).toBe('to')

    act(() => vi.advanceTimersByTime(CAPTURE_REVEAL_MS))
    expect(screen.getByTestId('result-screen')).toBeTruthy()
  })

  it('uses the same explanation when the computer captures the king', async () => {
    vi.useFakeTimers()
    const client: AiClient = {
      request: vi.fn(async () => ({
        action: { kind: 'move' as const, from: 'a2', to: 'a1' },
        nodes: 1,
        depthReached: 1,
        valveTripped: false,
      })),
      cancel: vi.fn(),
      dispose: vi.fn(),
    }

    render(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={capturePosition()}
        aiSide="black"
        createAi={() => client}
      />,
    )

    await act(async () => {
      await Promise.resolve()
    })
    act(() => vi.advanceTimersByTime(650))

    expect(screen.getByTestId('capture-reveal')).toBeTruthy()
    expect(screen.queryByTestId('result-screen')).toBeNull()
    expect(client.request).toHaveBeenCalledTimes(1)
  })
})
