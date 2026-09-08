// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { loadBundledContent } from '@content/sets/bundled'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { Rules } from '@ui/Rules'

afterEach(cleanup)
const content = loadBundledContent()
function Dex({ save = () => true }: { save?: (p: ProgressionProfileV1) => boolean }) {
  const [profile, setProfile] = useState({ ...emptyProgression(), sparks: 5 })
  return <Rules content={content} progression={profile} onClose={() => {}} onProgressionChange={p => {
    if (!save(p)) return false
    setProfile(p)
    return true
  }} />
}

it('shows twelve album entries and opens an exact new variant for free practice and forge', () => {
  const save = vi.fn((_profile: ProgressionProfileV1) => true)
  render(<Dex save={save} />)
  expect(screen.getByTestId('upgrade-collection-count').textContent).toContain('0 / 12')
  expect(document.querySelectorAll('[data-testid^="upgrade-album-"]')).toHaveLength(12)
  fireEvent.click(screen.getByTestId('upgrade-album-piece.rook-scout'))
  const dialog = screen.getByRole('dialog', { name: '정찰 성' })
  expect(within(dialog).getByTestId('upgrade-forge-piece.rook-scout')).toBeTruthy()
  expect(within(dialog).queryByTestId('upgrade-forge-piece.rook-plus')).toBeNull()
  fireEvent.click(screen.getByTestId('upgrade-practice-piece.rook-scout'))
  fireEvent.click(screen.getByTestId('practice-square-b5'))
  expect(screen.getByTestId('practice-square-b5').getAttribute('data-piece')).toBe('piece.rook-scout')
  expect(save).not.toHaveBeenCalled()
  fireEvent.click(screen.getByTestId('upgrade-forge-piece.rook-scout'))
  expect(save.mock.calls[0]?.[0]).toMatchObject({ sparks: 0, ownedUpgradeIds: ['piece.rook-scout'] })
  expect(screen.getByTestId('upgrade-collection-count').textContent).toContain('1 / 12')
  expect(screen.getByTestId('upgrade-acquired').textContent).toContain('정찰 성')
})

it('selects among three family upgrades, keeps failed saves honest and resets transient practice state', () => {
  const save = vi.fn().mockReturnValueOnce(false).mockReturnValue(true)
  render(<Dex save={save} />)
  fireEvent.click(document.querySelector('[data-entry="piece.pawn"] button')!)
  const selector = screen.getByTestId('upgrade-family-choice')
  expect(within(selector).getAllByRole('option')).toHaveLength(3)
  expect((selector as HTMLSelectElement).value).toBe('piece.pawn-plus')
  fireEvent.change(selector, { target: { value: 'piece.pawn-scout' } })
  fireEvent.click(screen.getByTestId('upgrade-practice-piece.pawn-scout'))
  fireEvent.click(screen.getByTestId('practice-square-b4'))
  fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-scout'))
  expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
  expect(screen.queryByTestId('upgrade-acquired')).toBeNull()
  fireEvent.change(selector, { target: { value: 'piece.pawn-retreat' } })
  expect(screen.queryByTestId('progression-save-failed')).toBeNull()
  expect(screen.queryByTestId('upgrade-practice')).toBeNull()
  fireEvent.click(screen.getByTestId('upgrade-practice-piece.pawn-retreat'))
  expect(screen.getByTestId('practice-square-c3').getAttribute('data-piece')).toBe('piece.pawn-retreat')
  fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-retreat'))
  expect(save.mock.calls[1]?.[0]).toMatchObject({ sparks: 0, ownedUpgradeIds: ['piece.pawn-retreat'] })
  expect(screen.getByTestId('upgrade-acquired').textContent).toContain('후퇴 병사')
  fireEvent.change(selector, { target: { value: 'piece.pawn-plus' } })
  expect(screen.queryByTestId('upgrade-acquired')).toBeNull()
})
