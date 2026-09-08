// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUNDLED_PRESET_ID, loadBundledContent } from '@content/sets/bundled'
import { createPosition } from '@engine/match'
import type { GameState, MatchResult } from '@engine/types'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { MatchHost } from '../../src/ui/MatchHost'
import { UpgradeReward } from '../../src/ui/UpgradeReward'
import { App } from '../../src/ui/App'
import { PROGRESSION_KEY, loadProgression } from '@progression/record'
import { skipOnboarding } from '../helpers/onboarding'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

const content = loadBundledContent()

function terminal(result: MatchResult): GameState {
  const state = createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 91,
    sideToMove: 'white',
    held: { white: [], black: [] },
    placements: [
      { square: 'a1', pieceId: 'piece.king', side: 'white' },
      { square: 'f6', pieceId: 'piece.king', side: 'black' },
    ],
  })
  return { ...state, result }
}

describe('standard match reward commit', () => {
  it.each([
    ['white win', { kind: 'win', winner: 'white', reason: 'win_action' }],
    ['black win', { kind: 'win', winner: 'black', reason: 'win_action' }],
    ['draw', { kind: 'draw', reason: 'material_cap' }],
  ] as const)('grants exactly one persisted Spark for a %s', (_label, result) => {
    const committed: ProgressionProfileV1[] = []
    const view = render(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={terminal(result)}
        progression={emptyProgression()}
        eligibility={{ eligible: true }}
        claimId={`claim-${_label}`}
        onProgressionChange={(next) => { committed.push(next); return true }}
      />,
    )
    expect(committed).toHaveLength(1)
    expect(committed[0]!.sparks).toBe(1)
    expect(committed[0]!.recentClaimIds).toEqual([`claim-${_label}`])
    expect(screen.getByTestId('progression-granted').getAttribute('data-sparks')).toBe('1')

    view.rerender(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={terminal(result)}
        progression={committed[0]!}
        eligibility={{ eligible: true }}
        claimId={`claim-${_label}`}
        onProgressionChange={(next) => { committed.push(next); return true }}
      />,
    )
    expect(committed).toHaveLength(1)
  })

  it('never announces a Spark that persistence refused', () => {
    let attempts = 0
    const current = emptyProgression()
    const eligibility = { eligible: true } as const
    const view = render(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={terminal({ kind: 'draw', reason: 'material_cap' })}
        progression={current}
        eligibility={eligibility}
        claimId="claim-refused"
        onProgressionChange={() => {
          attempts += 1
          return attempts > 1
        }}
      />,
    )
    expect(screen.queryByTestId('progression-granted')).toBeNull()
    expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
    view.rerender(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={terminal({ kind: 'draw', reason: 'material_cap' })}
        progression={current}
        eligibility={eligibility}
        claimId="claim-refused"
        onProgressionChange={() => {
          attempts += 1
          return attempts > 1
        }}
      />,
    )
    expect(attempts).toBe(1)
    fireEvent.click(screen.getByTestId('progression-grant-retry'))
    expect(attempts).toBe(2)
    expect(screen.getByTestId('progression-granted')).toBeTruthy()
  })

  it('shows the frozen sandbox reason and makes no progression write', () => {
    const commit = vi.fn(() => true)
    render(
      <MatchHost
        content={content}
        presetId={BUNDLED_PRESET_ID}
        initialState={terminal({ kind: 'draw', reason: 'material_cap' })}
        progression={emptyProgression()}
        eligibility={{ eligible: false, reasons: ['authored-piece-over-ceiling'] }}
        claimId="claim-sandbox"
        onProgressionChange={commit}
      />,
    )
    expect(commit).not.toHaveBeenCalled()
    expect(screen.getByTestId('progression-sandbox').textContent).toMatch(/세기 한도/)
  })
})

describe('explicit reveal and persisted pending choice', () => {
  it('does not auto-spend three Sparks and spends only after the button is pressed', () => {
    const current = { ...emptyProgression(), sparks: 3 }
    let requested: ProgressionProfileV1 | undefined
    render(
      <UpgradeReward
        profile={current}
        eligibility={{ eligible: true }}
        notice="none"
        onProgressionChange={(next) => { requested = next; return true }}
      />,
    )
    expect(requested).toBeUndefined()
    expect(screen.getByTestId('progression-sparks').textContent).toContain('3')
    fireEvent.click(screen.getByTestId('progression-reveal'))
    expect(requested?.sparks).toBe(0)
    expect(requested?.pendingOffer?.upgradeIds.length).toBeGreaterThan(0)
  })

  it('keeps reveal and choice actions visible when their durable write fails', () => {
    const current = { ...emptyProgression(), sparks: 3 }
    const view = render(
      <UpgradeReward
        profile={current}
        eligibility={{ eligible: true }}
        notice="none"
        onProgressionChange={() => false}
      />,
    )
    fireEvent.click(screen.getByTestId('progression-reveal'))
    expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
    expect(screen.getByTestId('progression-reveal')).toBeTruthy()

    view.rerender(
      <UpgradeReward
        profile={{
          ...emptyProgression(),
          pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus'] },
          nextOfferNonce: 1,
        }}
        eligibility={{ eligible: true }}
        notice="none"
        onProgressionChange={() => false}
      />,
    )
    fireEvent.click(screen.getByTestId('progression-offer-piece.pawn-plus'))
    expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
    expect(screen.getByTestId('progression-offer-piece.pawn-plus')).toBeTruthy()
  })

  it('lets the real App callback retry after a transient write failure', () => {
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify({ ...emptyProgression(), sparks: 5 }))
    window.history.replaceState(null, '', '/dex')
    const originalSetItem = Storage.prototype.setItem
    let failProgressionOnce = true
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === PROGRESSION_KEY && failProgressionOnce) {
        failProgressionOnce = false
        throw new DOMException('full', 'QuotaExceededError')
      }
      return originalSetItem.call(this, key, value)
    })
    render(<App />)

    fireEvent.click(screen.getByTestId('progression-reveal'))
    expect(screen.getByTestId('progression-storage-notice').getAttribute('data-reason')).toBe('save-failed')
    expect(loadProgression(localStorage).profile.sparks).toBe(5)

    fireEvent.click(screen.getByTestId('progression-reveal'))
    const persisted = loadProgression(localStorage)
    expect(persisted.ok).toBe(true)
    expect(persisted.profile.sparks).toBe(2)
    expect(persisted.profile.pendingOffer).toBeTruthy()
    expect(screen.queryByTestId('progression-storage-notice')).toBeNull()
  })

  it('keeps a paid offer actionable across App navigation, remount, and storage reload', () => {
    const current: ProgressionProfileV1 = {
      ...emptyProgression(),
      pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus', 'piece.knight-plus'] },
      nextOfferNonce: 1,
    }
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(current))
    window.history.replaceState(null, '', '/dex')
    const view = render(<App />)
    expect(screen.getByTestId('progression-offer-piece.knight-plus')).toBeTruthy()
    fireEvent.click(screen.getByTestId('rules-close'))
    fireEvent.click(screen.getByTestId('tab-dex'))
    expect(screen.getByTestId('progression-offer-piece.knight-plus')).toBeTruthy()
    view.unmount()
    render(<App />)
    fireEvent.click(screen.getByTestId('progression-offer-piece.knight-plus'))
    const persisted = loadProgression(localStorage)
    expect(persisted.profile.ownedUpgradeIds).toEqual(['piece.knight-plus'])
    expect(persisted.profile.pendingOffer).toBeUndefined()
  })

  it('fails closed on future progression data instead of overwriting it', () => {
    skipOnboarding()
    const future = JSON.stringify({ ...emptyProgression(), version: 2, sparks: 99 })
    localStorage.setItem(PROGRESSION_KEY, future)
    window.history.replaceState(null, '', '/dex')
    render(<App />)
    expect(screen.getByTestId('progression-storage-notice').getAttribute('data-reason')).toBe('future')
    expect(localStorage.getItem(PROGRESSION_KEY)).toBe(future)
  })

  it('rejects a stale-tab snapshot and adopts the newer stored profile', () => {
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify({ ...emptyProgression(), sparks: 5 }))
    window.history.replaceState(null, '', '/dex')
    render(<App />)

    const newer = { ...emptyProgression(), sparks: 4, recentClaimIds: ['other-tab'] }
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(newer))
    fireEvent.click(screen.getByTestId('progression-reveal'))

    expect(loadProgression(localStorage)).toEqual({ ok: true, profile: newer })
    expect(screen.getByTestId('progression-storage-notice').getAttribute('data-reason')).toBe('conflict')
  })
})
