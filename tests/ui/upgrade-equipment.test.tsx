// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUNDLED_PRESET_ID, bundledContentSource, loadBundledContent } from '@content/sets/bundled'
import { loadContentSet, type ContentSource } from '@content/load'
import { emptyProgression, type ProgressionProfileV1 } from '@progression/model'
import { resolveEquipment } from '@progression/equipment'
import { canonicalAuthoredCeiling, CANONICAL_BOARD } from '@progression/power'
import { costCeiling, pieceStars } from '@balance/cost'
import { UpgradeEquipment } from '../../src/ui/UpgradeEquipment'
import { Lobby, type MatchSetup } from '../../src/ui/Lobby'
import { App } from '../../src/ui/App'
import { PROGRESSION_KEY, loadProgression } from '@progression/record'
import { skipOnboarding } from '../helpers/onboarding'
import { createMatch, currentState } from '@engine/match'

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

function ownedProfile(): ProgressionProfileV1 {
  return {
    ...emptyProgression(),
    ownedUpgradeIds: ['piece.pawn-plus', 'piece.knight-plus'],
  }
}

describe('owned upgrade equipment', () => {
  it('freezes equipment and eligibility when Play launches directly from the editor', () => {
    skipOnboarding()
    localStorage.setItem(PROGRESSION_KEY, JSON.stringify({
      ...emptyProgression(),
      ownedUpgradeIds: ['piece.pawn-plus'],
      equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } },
    }))
    window.history.replaceState(null, '', '/edit')
    render(<App />)
    fireEvent.click(screen.getByTestId(`room-open-${BUNDLED_PRESET_ID}`))
    fireEvent.click(screen.getByTestId('room-step-name'))
    fireEvent.click(screen.getByTestId('room-play'))

    expect(screen.getByTestId('sq-a2').getAttribute('data-piece')).toBe('piece.pawn-plus')
    expect(screen.getByTestId('sq-b2').getAttribute('data-piece')).toBe('piece.pawn')
  })

  it('persists an App-owned choice and hands the frozen setup to MatchHost', () => {
    skipOnboarding()
    localStorage.setItem(
      PROGRESSION_KEY,
      JSON.stringify({ ...emptyProgression(), ownedUpgradeIds: ['piece.pawn-plus'] }),
    )
    window.history.replaceState(null, '', '/lobby')
    render(<App />)

    fireEvent.change(screen.getByTestId('equipment-white-upgrade'), { target: { value: 'piece.pawn-plus' } })
    fireEvent.change(screen.getByTestId('equipment-white-square'), { target: { value: 'b2' } })

    const saved = loadProgression(localStorage)
    expect(saved.ok).toBe(true)
    expect(saved.profile.equipped[BUNDLED_PRESET_ID]?.white).toEqual({
      upgradeId: 'piece.pawn-plus',
      square: 'b2',
    })

    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(screen.getByTestId('sq-b2').getAttribute('data-piece')).toBe('piece.pawn-plus')
    expect(screen.getByTestId('sq-a2').getAttribute('data-piece')).toBe('piece.pawn')
  })

  it('shows canonical and selected-room stars and stores one exact starting square', () => {
    const content = loadBundledContent()
    let current = ownedProfile()
    const { rerender } = render(
      <UpgradeEquipment
        content={content}
        bundle={content}
        presetId={BUNDLED_PRESET_ID}
        profile={current}
        humanSides={['white', 'black']}
        onChange={(next) => { current = next }}
      />,
    )

    fireEvent.change(screen.getByTestId('equipment-white-upgrade'), { target: { value: 'piece.pawn-plus' } })
    rerender(
      <UpgradeEquipment
        content={content}
        bundle={content}
        presetId={BUNDLED_PRESET_ID}
        profile={current}
        humanSides={['white', 'black']}
        onChange={(next) => { current = next }}
      />,
    )
    const board = content.boards.get(content.presets.get(BUNDLED_PRESET_ID)!.boardId)!
    const upgrade = content.pieces.get('piece.pawn-plus')!
    const stars = screen.getByTestId('equipment-white-stars')
    expect(stars.getAttribute('data-canonical-stars')).toBe(
      String(pieceStars(upgrade, CANONICAL_BOARD, canonicalAuthoredCeiling(content))),
    )
    expect(stars.getAttribute('data-room-stars')).toBe(
      String(pieceStars(upgrade, board, costCeiling(content.pieces.values(), board))),
    )
    expect(stars.getAttribute('data-budget')).toBe('6')
    expect(screen.getByTestId('eligibility-status').getAttribute('data-eligible')).toBe('true')
    expect(screen.getByTestId('eligibility-status').textContent).toMatch(/스탠다드/)
    fireEvent.change(screen.getByTestId('equipment-white-square'), { target: { value: 'b2' } })
    expect(current.equipped[BUNDLED_PRESET_ID]?.white).toEqual({ upgradeId: 'piece.pawn-plus', square: 'b2' })
    expect(current.equipped[BUNDLED_PRESET_ID]?.black).toBeUndefined()
  })

  it('offers only owned upgrades and omits the computer side', () => {
    const content = loadBundledContent()
    render(
      <UpgradeEquipment
        content={content}
        bundle={content}
        presetId={BUNDLED_PRESET_ID}
        profile={{ ...emptyProgression(), ownedUpgradeIds: ['piece.pawn-plus'] }}
        humanSides={['white']}
        onChange={() => {}}
      />,
    )
    const values = [...screen.getByTestId('equipment-white-upgrade').querySelectorAll('option')].map((option) => option.value)
    expect(values).toContain('piece.pawn-plus')
    expect(values).not.toContain('piece.knight-plus')
    expect(screen.queryByTestId('equipment-black-upgrade')).toBeNull()
  })

  it('refuses unowned and stale saved equipment without rewriting the room', () => {
    const content = loadBundledContent()
    const unowned = {
      ...emptyProgression(),
      equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } },
    }
    const result = resolveEquipment({ content, bundle: content, presetId: BUNDLED_PRESET_ID, profile: unowned, humanSides: ['white'] })
    expect(result.effectiveEquipment).toEqual({})
    expect(result.refused.white).toBe('not-owned')

    const stale = resolveEquipment({
      content,
      bundle: content,
      presetId: BUNDLED_PRESET_ID,
      profile: {
        ...unowned,
        ownedUpgradeIds: ['piece.pawn-plus'],
        equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'z9' } } },
      },
      humanSides: ['white'],
    })
    expect(stale.effectiveEquipment).toEqual({})
    expect(stale.refused.white).toBe('invalid-square')
  })

  it('lets validated device equipment override a room-authored piece without stacking', () => {
    const source = structuredClone(bundledContentSource) as ContentSource
    const preset = source.presets.find((item) => (item as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    preset.loadout = { white: { piece: { pieceId: 'piece.archer', replaces: 'piece.knight', square: 'b1' } } }
    const loaded = loadContentSet(source)
    if (!loaded.ok) throw new Error('fixture must load')
    const result = resolveEquipment({
      content: loaded.set,
      bundle: loadBundledContent(),
      presetId: BUNDLED_PRESET_ID,
      profile: {
        ...emptyProgression(),
        ownedUpgradeIds: ['piece.pawn-plus'],
        equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } },
      },
      humanSides: ['white'],
    })
    expect(result.effectiveEquipment).toEqual({
      white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' },
    })
    expect(result.refused.white).toBeUndefined()

    render(
      <UpgradeEquipment
        content={loaded.set}
        bundle={loadBundledContent()}
        presetId={BUNDLED_PRESET_ID}
        profile={{
          ...emptyProgression(),
          ownedUpgradeIds: ['piece.pawn-plus'],
          equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } },
        }}
        humanSides={['white']}
        onChange={() => {}}
      />,
    )
    const selector = screen.getByTestId('equipment-white-upgrade') as HTMLSelectElement
    expect(selector.disabled).toBe(false)
    expect(selector.value).toBe('piece.pawn-plus')
    expect(screen.getByTestId('equipment-white-square')).toBeTruthy()

    const roomOnly = currentState(createMatch({
      content: loaded.set,
      presetId: BUNDLED_PRESET_ID,
      seed: 17,
    }))
    expect(roomOnly.board.get('b1')?.pieceId).toBe('piece.archer')
    const equipped = currentState(createMatch({
      content: loaded.set,
      presetId: BUNDLED_PRESET_ID,
      seed: 17,
      effectiveEquipment: result.effectiveEquipment,
    }))
    const board = loaded.set.boards.get(loaded.set.presets.get(BUNDLED_PRESET_ID)!.boardId)!
    const expected = new Map(board.placements.map((placement) => [
      placement.square,
      { pieceId: placement.square === 'a2' ? 'piece.pawn-plus' : placement.pieceId, side: placement.side },
    ]))
    expect([...equipped.board.entries()]).toEqual([...expected.entries()])
    expect(equipped.board.get('b1')?.pieceId).toBe('piece.knight')
  })

  it('starts a standard match with one validated owned override', () => {
    const content = loadBundledContent()
    const starts: MatchSetup[] = []
    render(
      <Lobby
        content={content}
        bundle={content}
        source={bundledContentSource}
        presetId={BUNDLED_PRESET_ID}
        names={{ white: '', black: '' }}
        progression={{
          ...emptyProgression(),
          ownedUpgradeIds: ['piece.pawn-plus'],
          equipped: { [BUNDLED_PRESET_ID]: { white: { upgradeId: 'piece.pawn-plus', square: 'a2' } } },
        }}
        onProgressionChange={() => {}}
        onNamesChange={() => {}}
        onImport={() => {}}
        onStart={(_opponent, setup) => starts.push(setup)}
        onBack={() => {}}
      />,
    )
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(starts).toEqual([{
      effectiveEquipment: { white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } },
      eligibility: { eligible: true },
    }])
  })

  it('starts sandbox rooms while preserving the reason snapshot', () => {
    const source = structuredClone(bundledContentSource) as ContentSource
    const preset = source.presets.find((item) => (item as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    preset.loadout = { white: { piece: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' } } }
    const loaded = loadContentSet(source)
    if (!loaded.ok) throw new Error('fixture must load')
    const starts: MatchSetup[] = []
    render(
      <Lobby
        content={loaded.set}
        bundle={loadBundledContent()}
        source={source}
        presetId={BUNDLED_PRESET_ID}
        names={{ white: '', black: '' }}
        progression={emptyProgression()}
        onProgressionChange={() => {}}
        onNamesChange={() => {}}
        onImport={() => {}}
        onStart={(_opponent, setup) => starts.push(setup)}
        onBack={() => {}}
      />,
    )
    expect(screen.getByTestId('eligibility-status').getAttribute('data-eligible')).toBe('false')
    expect(screen.getByTestId('eligibility-status').textContent).toMatch(/샌드박스/)
    expect((screen.getByTestId('lobby-start') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(starts).toEqual([{
      effectiveEquipment: {},
      eligibility: { eligible: false, reasons: ['curated-upgrade-requires-owned-equipment'] },
    }])
  })

  it('filters persisted equipment to the human side before the match snapshot', () => {
    const content = loadBundledContent()
    const resolved = resolveEquipment({
      content,
      bundle: content,
      presetId: BUNDLED_PRESET_ID,
      profile: {
        ...emptyProgression(),
        ownedUpgradeIds: ['piece.pawn-plus'],
        equipped: {
          [BUNDLED_PRESET_ID]: {
            white: { upgradeId: 'piece.pawn-plus', square: 'a2' },
            black: { upgradeId: 'piece.pawn-plus', square: 'a5' },
          },
        },
      },
      humanSides: ['white'],
    })
    expect(resolved.effectiveEquipment).toEqual({
      white: { pieceId: 'piece.pawn-plus', replaces: 'piece.pawn', square: 'a2' },
    })
    expect(resolved.effectiveEquipment.black).toBeUndefined()
  })
})
