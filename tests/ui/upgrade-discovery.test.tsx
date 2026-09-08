// @vitest-environment jsdom
import React, { useState } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadBundledContent } from '@content/sets/bundled'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { UPGRADE_PIECE_IDS } from '@progression/catalog'
import { Rules } from '../../src/ui/Rules'
import { UpgradeReward } from '../../src/ui/UpgradeReward'
import { TranslateContext, makeTranslate } from '../../src/ui/i18n'

afterEach(cleanup)
const content = loadBundledContent()
const offer: ProgressionProfileV1 = {
  ...emptyProgression(), sparks: 2,
  pendingOffer: { nonce: 0, upgradeIds: ['piece.pawn-plus', 'piece.rook-plus'] }, nextOfferNonce: 1,
}

function Reward({ initial = offer, save = () => true }: { initial?: ProgressionProfileV1; save?: (p: ProgressionProfileV1) => boolean }) {
  const [profile, setProfile] = useState(initial)
  return <UpgradeReward profile={profile} eligibility={{ eligible: true }} notice="none" onProgressionChange={(next) => {
    if (!save(next)) return false
    setProfile(next)
    return true
  }} />
}

describe('understandable upgrade discovery', () => {
  it.each([0, 2, 3, 5])('shows both saving paths at %i Sparks without spending', (sparks) => {
    const save = vi.fn(() => true)
    render(<Reward initial={{ ...emptyProgression(), sparks }} save={save} />)
    const reveal = screen.getByTestId('progression-reveal-goal')
    const forge = screen.getByTestId('progression-forge-goal')
    expect(reveal.getAttribute('data-remaining')).toBe(String(Math.max(0, 3 - sparks)))
    expect(forge.getAttribute('data-remaining')).toBe(String(Math.max(0, 5 - sparks)))
    expect(reveal.textContent).toContain(sparks >= 3 ? '준비됐어요' : `${3 - sparks}개`)
    expect(forge.textContent).toContain(sparks >= 5 ? '준비됐어요' : `${5 - sparks}개`)
    expect(save).not.toHaveBeenCalled()
  })

  it('compares illustrated abilities and practices before making a paid choice', () => {
    const save = vi.fn((_profile: ProgressionProfileV1) => true)
    render(<Reward save={save} />)
    const candidates = screen.getByTestId('progression-offer')
    expect(candidates.querySelectorAll('img')).toHaveLength(2)
    expect(candidates.textContent).toContain('대각선 움직임으로는 잡을 수 없다')
    fireEvent.click(within(candidates).getByTestId('upgrade-practice-piece.pawn-plus'))
    expect(screen.getByTestId('practice-square-b3').getAttribute('data-added')).toBe('true')
    fireEvent.click(screen.getByTestId('practice-base'))
    expect((screen.getByTestId('practice-square-b3') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByTestId('practice-upgrade'))
    fireEvent.click(screen.getByTestId('practice-square-b3'))
    expect(screen.getByTestId('practice-square-b3').getAttribute('data-piece')).toBe('piece.pawn-plus')
    expect(screen.getByTestId('practice-feedback').textContent).toContain('새 이동')
    fireEvent.click(screen.getByTestId('practice-reset'))
    fireEvent.click(screen.getByTestId('practice-square-c4'))
    expect(screen.getByTestId('practice-feedback').textContent).toContain('기본 기물')
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('progression-offer-piece.pawn-plus'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toMatchObject({ sparks: 2, ownedUpgradeIds: ['piece.pawn-plus'] })
    expect(screen.getByTestId('upgrade-acquired').textContent).toContain('재빠른 병사')
    expect(screen.queryByTestId('progression-offer')).toBeNull()
  })

  it('preserves an offer and does not celebrate when a write fails, then retries explicitly', () => {
    const save = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<Reward save={save} />)
    fireEvent.click(screen.getByTestId('progression-offer-piece.pawn-plus'))
    expect(screen.getByTestId('progression-save-failed')).toBeTruthy()
    expect(screen.queryByTestId('upgrade-acquired')).toBeNull()
    expect(screen.getByTestId('progression-offer')).toBeTruthy()
    fireEvent.click(screen.getByTestId('progression-offer-piece.pawn-plus'))
    expect(screen.getByTestId('upgrade-acquired')).toBeTruthy()
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('describes the actual singleton offer and restores candidates without fresh spending', () => {
    const save = vi.fn(() => true)
    const initial = { ...offer, pendingOffer: { nonce: 0, upgradeIds: ['piece.rook-plus'] } }
    const first = render(<Reward initial={initial} save={save} />)
    expect(screen.getByTestId('progression-offer').textContent).toContain('후보 1개')
    first.unmount()
    render(<Reward initial={initial} save={save} />)
    expect(screen.getByTestId('progression-offer-piece.rook-plus')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('shows collection completion without a dead spending button and still allows free practice', () => {
    const save = vi.fn(() => true)
    render(<Rules content={content} onClose={() => {}} progression={{ ...emptyProgression(), sparks: 8, ownedUpgradeIds: [...UPGRADE_PIECE_IDS] }} onProgressionChange={save} />)
    expect(screen.getByTestId('upgrade-collection-count').textContent).toContain('4 / 4')
    expect(screen.getByTestId('progression-complete')).toBeTruthy()
    expect(screen.queryByTestId('progression-reveal')).toBeNull()
    fireEvent.click(screen.getByTestId('upgrade-album-piece.rook-plus'))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('upgrade-practice-piece.rook-plus'))
    expect(screen.getByTestId('practice-square-d4').getAttribute('data-added')).toBe('true')
    expect(save).not.toHaveBeenCalled()
  })

  it('opens unowned upgrade details from the album and supports the existing forge path', () => {
    function Dex() {
      const [profile, setProfile] = useState({ ...emptyProgression(), sparks: 5 })
      return <Rules content={content} onClose={() => {}} progression={profile} onProgressionChange={(p) => { setProfile(p); return true }} />
    }
    render(<Dex />)
    expect(screen.getByTestId('upgrade-collection-count').textContent).toContain('0 / 4')
    fireEvent.click(screen.getByTestId('upgrade-album-piece.pawn-plus'))
    fireEvent.click(screen.getByTestId('upgrade-forge-piece.pawn-plus'))
    expect(within(screen.getByRole('dialog')).getByTestId('upgrade-acquired').textContent).toContain('재빠른 병사')
    expect(screen.getByTestId('upgrade-collection-count').textContent).toContain('1 / 4')
    expect(screen.getByTestId('progression-sparks').textContent).toContain('0')
  })

  it('waits for current owned-profile confirmation and clears celebration on rollback', () => {
    const save = vi.fn(() => true)
    const props = { eligibility: { eligible: true as const }, notice: 'none' as const, onProgressionChange: save }
    const view = render(<UpgradeReward {...props} profile={offer} />)
    fireEvent.click(screen.getByTestId('progression-offer-piece.pawn-plus'))
    expect(screen.queryByTestId('upgrade-acquired')).toBeNull()
    view.rerender(<UpgradeReward {...props} profile={{ ...emptyProgression(), sparks: 2, ownedUpgradeIds: ['piece.pawn-plus'] }} />)
    expect(screen.getByTestId('upgrade-acquired').textContent).toContain('재빠른 병사')
    view.rerender(<UpgradeReward {...props} profile={offer} />)
    expect(screen.queryByTestId('upgrade-acquired')).toBeNull()
  })

  it('teaches canonical moves and names despite a modified content overlay', () => {
    const pieces = new Map(content.pieces)
    pieces.set('piece.pawn-plus', { ...pieces.get('piece.pawn-plus')!, movement: [{ kind: 'step', vectors: [[0, -1]] }] })
    const altered = { ...content, pieces }
    const t = makeTranslate({ ko: { 'piece.pawn-plus.name': 'OVERLAY-NAME', 'piece.pawn-plus.text': 'OVERLAY-MOVEMENT' } })
    render(<TranslateContext.Provider value={t}><Rules content={altered} onClose={() => {}} /></TranslateContext.Provider>)
    fireEvent.click(screen.getByTestId('upgrade-album-piece.pawn-plus'))
    const dialog = screen.getByRole('dialog', { name: '재빠른 병사' })
    expect(dialog.textContent).not.toContain('OVERLAY-NAME')
    expect(dialog.textContent).not.toContain('OVERLAY-MOVEMENT')
    fireEvent.click(screen.getByTestId('upgrade-practice-piece.pawn-plus'))
    const practice = screen.getByTestId('upgrade-practice')
    expect(practice.textContent).toContain('재빠른 병사')
    expect(practice.textContent).not.toContain('OVERLAY-NAME')
    expect(screen.getByTestId('practice-square-b3').getAttribute('data-added')).toBe('true')
    expect((screen.getByTestId('practice-square-c2') as HTMLButtonElement).disabled).toBe(true)
  })
})
