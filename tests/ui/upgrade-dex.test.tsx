// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BUNDLED_PRESET_ID, loadBundledContent } from '@content/sets/bundled'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { exportProgressionBackup } from '@progression/io'
import { Rules } from '../../src/ui/Rules'
import { App } from '../../src/ui/App'
import { PROGRESSION_KEY, loadProgression } from '@progression/record'
import { skipOnboarding } from '../helpers/onboarding'
import { makeTranslate } from '../../src/ui/i18n'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

const content = loadBundledContent()

function openPawn() {
  const tile = document.querySelector('[data-entry="piece.pawn"] button') as HTMLButtonElement
  fireEvent.click(tile)
}

describe('piece upgrade family in the dex', () => {
  it('shows ownership, movement preview, and a targeted five-Spark forge', () => {
    const current = { ...emptyProgression(), sparks: 5 }
    let requested: ProgressionProfileV1 | undefined
    render(
      <Rules
        content={content}
        onClose={() => {}}
        progression={current}
        onProgressionChange={(next) => { requested = next; return true }}
      />,
    )
    openPawn()
    const family = screen.getByTestId('upgrade-family-piece.pawn')
    expect(family.textContent).toContain(makeTranslate()(content.pieces.get('piece.pawn-plus')!.nameKey))
    expect(screen.getByTestId('upgrade-move-preview').textContent).toMatch(/이동/)
    expect(screen.getByTestId('upgrade-owned').getAttribute('data-owned')).toBe('false')
    fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-plus'))
    expect(requested?.sparks).toBe(0)
    expect(requested?.ownedUpgradeIds).toEqual(['piece.pawn-plus'])
  })

  it('labels an owned upgrade and refuses to offer a duplicate forge', () => {
    render(
      <Rules
        content={content}
        onClose={() => {}}
        progression={{ ...emptyProgression(), sparks: 9, ownedUpgradeIds: ['piece.pawn-plus'] }}
        onProgressionChange={() => true}
      />,
    )
    openPawn()
    expect(screen.getByTestId('upgrade-owned').getAttribute('data-owned')).toBe('true')
    expect(screen.queryByTestId('upgrade-forge-piece.pawn-plus')).toBeNull()
  })

  it('forging an offered id preserves the other paid choices', () => {
    let requested: ProgressionProfileV1 | undefined
    render(
      <Rules
        content={content}
        onClose={() => {}}
        progression={{
          ...emptyProgression(),
          sparks: 5,
          pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus', 'piece.knight-plus', 'piece.bishop-plus'] },
          nextOfferNonce: 1,
        }}
        onProgressionChange={(next) => { requested = next; return true }}
      />,
    )
    openPawn()
    fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-plus'))
    expect(requested?.ownedUpgradeIds).toEqual(['piece.pawn-plus'])
    expect(requested?.pendingOffer?.upgradeIds).toEqual(['piece.knight-plus', 'piece.bishop-plus'])
  })

  it('keeps the forge available and reports a refused durable write', () => {
    render(
      <Rules
        content={content}
        onClose={() => {}}
        progression={{ ...emptyProgression(), sparks: 5 }}
        onProgressionChange={() => false}
      />,
    )
    openPawn()
    fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-plus'))
    expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
    expect(screen.getByTestId('upgrade-forge-piece.pawn-plus')).toBeTruthy()
  })

  it('forges in App, equips in the lobby, and applies it to the next match', () => {
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify({ ...emptyProgression(), sparks: 5 }))
    window.history.replaceState(null, '', '/dex')
    render(<App />)
    openPawn()
    fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-plus'))
    expect(loadProgression(localStorage).profile.ownedUpgradeIds).toEqual(['piece.pawn-plus'])

    fireEvent.click(screen.getByTestId('dex-close'))
    fireEvent.click(screen.getByTestId('rules-close'))
    fireEvent.click(screen.getByTestId('start-match'))
    fireEvent.change(screen.getByTestId('equipment-white-upgrade'), { target: { value: 'piece.pawn-plus' } })
    fireEvent.change(screen.getByTestId('equipment-white-square'), { target: { value: 'b2' } })
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(screen.getByTestId('sq-b2').getAttribute('data-piece')).toBe('piece.pawn-plus')
    expect(screen.getByTestId('sq-a2').getAttribute('data-piece')).toBe('piece.pawn')
  })
})

describe('full progression backup in the dex', () => {
  it('exports the exact profile and atomically replaces every field after confirmation', () => {
    const current: ProgressionProfileV1 = {
      ...emptyProgression(),
      sparks: 0,
      ownedUpgradeIds: ['piece.pawn-plus'],
      equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'b2' } } },
      nextOfferNonce: 2,
      recentClaimIds: ['new-claim'],
    }
    const older: ProgressionProfileV1 = {
      ...emptyProgression(),
      sparks: 4,
      ownedUpgradeIds: ['piece.knight-plus'],
      pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus'] },
      equipped: { [BUNDLED_PRESET_ID]: { black: { upgradeId: 'piece.knight-plus', square: 'b6' } } },
      nextOfferNonce: 1,
      recentClaimIds: ['old-claim'],
    }
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify(current))
    window.history.replaceState(null, '', '/dex')
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.click(screen.getByTestId('progression-export'))
    expect((screen.getByTestId('progression-backup') as HTMLTextAreaElement).value).toBe(exportProgressionBackup(current))

    const backup = exportProgressionBackup(older)
    fireEvent.change(screen.getByTestId('progression-backup'), { target: { value: backup } })
    fireEvent.click(screen.getByTestId('progression-restore'))
    expect(loadProgression(localStorage).profile).toEqual(current)
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByTestId('progression-restore'))
    expect(loadProgression(localStorage).profile).toEqual(older)
    expect(screen.getByTestId('progression-sparks').textContent).toContain('4')
  })
})
