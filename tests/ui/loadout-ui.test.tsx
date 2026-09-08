// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { Lobby } from '../../src/ui/Lobby'
import { RoomDetail } from '../../src/ui/RoomDetail'
import { UPGRADE_PIECE_IDS } from '@progression/catalog'

/**
 * The loadout, on the two screens that use it.
 *
 * The standing finding these guard is that the price had no caller: a room could
 * be played with a loadout nothing had checked. Every test here drives a real
 * screen rather than the function underneath it.
 */

afterEach(cleanup)

const OWN_CARD = 'skill.probe-own'

/** The shipped document plus one card the room does NOT deal, so a side can own it. */
function documentWithOwnCard(): ContentSource {
  const source = structuredClone(bundledContentSource) as ContentSource
  ;(source.skillCards as unknown[]).push({
    id: OWN_CARD,
    nameKey: 'skill.probe-own.name',
    textKey: 'skill.probe-own.text',
    uses: 1,
    royalFollowUp: 'preserve',
    protectRelocatedAfterPlay: false,
    lockRelocatedAfterPlay: false,
    effects: [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 1 }] },
    ],
  })
  return source
}

function withLoadout(pieceId: string, replaces: string): ContentSource {
  const source = documentWithOwnCard()
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadout = { white: { piece: { pieceId, replaces, square: 'b1' }, skillCardId: OWN_CARD } }
  return source
}

function mountLobby(source: ContentSource) {
  const loaded = loadContentSet(source)
  if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const started: string[] = []
  render(
    React.createElement(Lobby, {
      source,
      content: loaded.set,
      presetId: BUNDLED_PRESET_ID,
      names: { white: '흰', black: '검' },
      onNamesChange: () => {},
      onImport: () => {},
      onStart: () => started.push('started'),
      onBack: () => {},
    }),
  )
  return started
}

function mountRoom(source: ContentSource) {
  render(
    React.createElement(RoomDetail, {
      source,
      roomId: BUNDLED_PRESET_ID,
      commit: () => {},
      onBack: () => {},
      onCreateRecord: () => {},
    }),
  )
  fireEvent.click(screen.getByTestId('room-step-cards'))
}

function mountRoomPieces(source: ContentSource) {
  render(
    React.createElement(RoomDetail, {
      source,
      roomId: BUNDLED_PRESET_ID,
      commit: () => {},
      onBack: () => {},
      onCreateRecord: () => {},
    }),
  )
  fireEvent.click(screen.getByTestId('room-step-pieces'))
}

function committedRoom(source: ContentSource, act: () => void): ContentSource {
  let committed: ContentSource | undefined
  render(
    React.createElement(RoomDetail, {
      source,
      roomId: BUNDLED_PRESET_ID,
      commit: (next: ContentSource) => { committed = next },
      onBack: () => {},
      onCreateRecord: () => {},
    }),
  )
  fireEvent.click(screen.getByTestId('room-step-cards'))
  act()
  fireEvent.click(screen.getByTestId('room-save'))
  if (!committed) throw new Error('fixture edit did not save')
  return committed
}

describe('the match-start path consults the price', () => {
  it('starts normally for a room with no loadout — the common case', () => {
    const started = mountLobby(bundledContentSource)
    expect(screen.queryByTestId('lobby-loadout-blocked')).toBeNull()
    expect((screen.getByTestId('lobby-start') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(started).toEqual(['started'])
  })

  it('refuses to start a loadout that swaps grades', () => {
    // The archer costs more than the knight, so standing in for one is exactly
    // the swap the same-grade rule exists to refuse.
    const started = mountLobby(withLoadout('piece.archer', 'piece.knight'))
    expect(screen.getByTestId('lobby-loadout-blocked')).toBeTruthy()
    expect((screen.getByTestId('lobby-start') as HTMLButtonElement).disabled).toBe(true)
    expect(started).toEqual([])
  })

  it('starts a loadout whose piece is the same grade as the one it replaces', () => {
    const started = mountLobby(withLoadout('piece.knight', 'piece.knight'))
    expect(screen.queryByTestId('lobby-loadout-blocked')).toBeNull()
    fireEvent.click(screen.getByTestId('lobby-start'))
    expect(started).toEqual(['started'])
  })
})

describe('the room screen prices what it offers', () => {
  it('never offers progression upgrades in any authoring piece picker', () => {
    mountRoom(documentWithOwnCard())
    for (const testid of ['loadout-piece', 'loadout-replaces']) {
      const values = [...screen.getByTestId(testid).querySelectorAll('option')].map((option) => option.value)
      for (const upgradeId of UPGRADE_PIECE_IDS) expect(values, testid).not.toContain(upgradeId)
    }
    cleanup()
    mountRoomPieces(documentWithOwnCard())
    for (const upgradeId of UPGRADE_PIECE_IDS) {
      expect(screen.queryByTestId(`room-piece-${upgradeId}`), upgradeId).toBeNull()
    }
  })

  it('persists an optional skill without requiring a piece substitution', () => {
    const next = committedRoom(documentWithOwnCard(), () => {
      fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })
    })
    const preset = next.presets.find((item) => (item as {
      loadout?: { white?: { skillCardId?: string } }
    }).loadout?.white?.skillCardId === OWN_CARD) as {
      loadout?: { white?: { piece?: unknown; skillCardId?: string } }
    }
    expect(preset.loadout?.white).toEqual({ skillCardId: OWN_CARD })
  })

  it('persists one exact starting square without requiring a skill card', () => {
    const next = committedRoom(documentWithOwnCard(), () => {
      fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.knight' } })
      fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.knight' } })
      fireEvent.change(screen.getByTestId('loadout-square'), { target: { value: 'b1' } })
    })
    const preset = next.presets.find((item) => (item as {
      loadout?: { white?: { piece?: { square?: string } } }
    }).loadout?.white?.piece?.square === 'b1') as {
      loadout?: { white?: { piece?: unknown; skillCardId?: string } }
    }
    expect(preset.loadout?.white).toEqual({
      piece: { pieceId: 'piece.knight', replaces: 'piece.knight', square: 'b1' },
    })
  })

  it('shows stars against every piece, at least one and never more than five', () => {
    mountRoom(documentWithOwnCard())
    const options = [...screen.getByTestId('loadout-piece').querySelectorAll('option')].slice(1)
    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      const filled = (option.textContent?.match(/★/g) ?? []).length
      const empty = (option.textContent?.match(/☆/g) ?? []).length
      // Every record costs something: a free one would make the budget a
      // formality, which is the state the analytic price exists to rule out.
      expect(filled, `${option.getAttribute('value')} is free`).toBeGreaterThanOrEqual(1)
      // And the scale visibly has a top, which is what lets five bands stay a
      // rule rather than only a label.
      expect(filled + empty, `${option.getAttribute('value')} is off the scale`).toBe(5)
    }
  })

  it('prices the queen above the pawn, the way a player would', () => {
    // The whole reason the price stopped being a measured win rate: under random
    // play the archer beat the queen two to one, which is not what anyone
    // playing this game experiences.
    mountRoom(documentWithOwnCard())
    const gradeOf = (id: string) => {
      const option = [...screen.getByTestId('loadout-piece').querySelectorAll('option')].find(
        (o) => o.getAttribute('value') === id,
      )!
      return (option.textContent?.match(/★/g) ?? []).length
    }
    expect(gradeOf('piece.queen')).toBeGreaterThan(gradeOf('piece.rook'))
    expect(gradeOf('piece.rook')).toBeGreaterThan(gradeOf('piece.knight'))
    expect(gradeOf('piece.knight')).toBeGreaterThan(gradeOf('piece.pawn'))
    // The top band belongs to a creation, not to anything shipped.
    expect(gradeOf('piece.queen')).toBeLessThan(5)
  })

  it('names a grade mismatch before the save, not after it', () => {
    mountRoom(documentWithOwnCard())
    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.queen' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.pawn' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })
    expect(screen.getByTestId('loadout-mismatch')).toBeTruthy()
  })

  it('adds the pair up against the budget', () => {
    mountRoom(documentWithOwnCard())
    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })
    // Both grades are known the instant they are picked — there is nothing to wait for.
    expect(screen.getByTestId('loadout-budget').textContent).toMatch(/별 \d+ \/ 6/)
  })

  it('states the limit of what the number means', () => {
    mountRoom(documentWithOwnCard())
    expect(screen.getByTestId('loadout-caveat').textContent).toBeTruthy()
  })

  it('never offers a card the room already deals', () => {
    mountRoom(documentWithOwnCard())
    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')].map((o) => o.getAttribute('value'))
    expect(options).toContain(OWN_CARD)
    expect(options).not.toContain('skill.volley')
  })

  it('never offers a royal piece — replacing one would move the losing condition', () => {
    mountRoom(documentWithOwnCard())
    for (const testid of ['loadout-piece', 'loadout-replaces']) {
      const options = [...screen.getByTestId(testid).querySelectorAll('option')].map((o) => o.getAttribute('value'))
      expect(options, testid).not.toContain('piece.king')
    }
  })
})

describe('the room that has no card left to own', () => {
  /**
   * A card the room deals cannot also be one side's own, so a room dealing the
   * WHOLE pool offers a picker that cannot be completed. Found by running the
   * app, not by the suite.
   *
   * It used to be enough to mount the shipped document, because there was one
   * room and it dealt all fifteen cards. Four rooms later the default deals 15
   * of 24, so the empty state has no shipped path any more — and a test that
   * asserted the OLD arithmetic would have been deleted as "no longer true"
   * along with the branch it was covering. The room is built here instead, which
   * is what the test was ever really about.
   */
  function roomDealingEverything(): ContentSource {
    const source = structuredClone(bundledContentSource) as ContentSource
    const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
    preset.skillCardIds = source.skillCards.map((c) => (c as { id: string }).id)
    return source
  }

  it('explains the empty list instead of offering a menu that cannot be completed', () => {
    mountRoom(roomDealingEverything())
    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')]
    expect(options, 'a room dealing every card leaves none ownable').toHaveLength(1)
    expect(screen.getByTestId('loadout-no-cards').textContent).toMatch(/새 스킬 카드를 만들거나/)
  })

  it('still offers what the SHIPPED room leaves out — the expansion made the pool wider than the room', () => {
    // The other half of the same fact, and the reason the fixture above had to
    // be built: with 24 cards in the set and 15 dealt by the default room, an
    // author has nine to own without making anything.
    mountRoom(bundledContentSource)
    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')]
    expect(options.length).toBeGreaterThan(1)
    expect(screen.queryByTestId('loadout-no-cards')).toBeNull()
  })

  it('drops the explanation once a card is outside the shared pool', () => {
    mountRoom(documentWithOwnCard())
    expect(screen.queryByTestId('loadout-no-cards')).toBeNull()
  })
})
