// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import React from 'react'
import { type CachedGrade, type GradeCache, keyForRecord, memoryCache } from '@balance/cache'
import { GRADE_SEEDS } from '@balance/measure'
import { type ContentSource, loadContentSet } from '@content/load'
import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { Lobby } from '../../src/ui/Lobby'
import { RoomDetail } from '../../src/ui/RoomDetail'

/**
 * PLAN Phase 6 — the UI half, and specifically the wiring.
 *
 * The review's standing finding about this feature was that the grade-dependent
 * gate had no caller: `checkLoadoutGrades` existed, was tested, and nothing on
 * the match-start path invoked it. A room could be played with a loadout whose
 * grades were never checked. These tests exist to make that statement false and
 * to keep it false — every one of them drives a real screen rather than the
 * function underneath it.
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
    effects: [
      { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }] },
    ],
  })
  return source
}

function withLoadout(pieceId: string, replaces: string): ContentSource {
  const source = documentWithOwnCard()
  const preset = source.presets.find((p) => (p as { id: string }).id === BUNDLED_PRESET_ID) as Record<string, unknown>
  preset.loadout = { white: { pieceId, replaces, skillCardId: OWN_CARD } }
  return source
}

/** A cache pre-loaded with the grades a test wants the screen to read. */
function cacheWith(source: ContentSource, deltas: Record<string, number>): GradeCache {
  const loaded = loadContentSet(source)
  if (!loaded.ok) throw new Error(`fixture must load: ${JSON.stringify(loaded.errors.slice(0, 3))}`)
  const preset = loaded.set.presets.get(BUNDLED_PRESET_ID)!
  const context = {
    presetId: BUNDLED_PRESET_ID,
    referencePieceId: preset.grading!.referencePieceId,
    referenceSkillCardId: preset.grading!.referenceSkillCardId,
    seeds: GRADE_SEEDS,
  }
  const cache = memoryCache()
  for (const [id, delta] of Object.entries(deltas)) {
    const key = keyForRecord(loaded.set, id, context)
    if (key === undefined) throw new Error(`no record ${id} to grade`)
    const grade: CachedGrade = { contentId: id, delta, stderr: 1, n: GRADE_SEEDS, everChanged: true }
    cache.write(key, grade)
  }
  return cache
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

describe('PLAN Phase 6 — the match-start path actually consults the grades', () => {
  it('starts normally for a room with no loadout — the common case', () => {
    const started = mountLobby(bundledContentSource)
    expect(screen.queryByTestId('lobby-loadout-blocked')).toBeNull()
    const start = screen.getByTestId('lobby-start') as HTMLButtonElement
    expect(start.disabled).toBe(false)
    fireEvent.click(start)
    expect(started).toEqual(['started'])
  })

  it('refuses to start when the loadout records have never been graded', () => {
    // The absent case, and the one the whole gate exists for: an ungraded record
    // must block the match rather than be scored as harmless.
    const started = mountLobby(withLoadout('piece.archer', 'piece.knight'))
    expect(screen.getByTestId('lobby-loadout-blocked').textContent).toMatch(/세는 중/)
    expect((screen.getByTestId('lobby-start') as HTMLButtonElement).disabled).toBe(true)
    expect(started).toEqual([])
  })
})

describe('PLAN Phase 6 — the room screen offers a loadout and prices it', () => {
  function mountRoom(source: ContentSource, cache: GradeCache) {
    let committed: ContentSource | null = null
    render(
      React.createElement(RoomDetail, {
        source,
        roomId: BUNDLED_PRESET_ID,
        commit: (next: ContentSource) => {
          committed = next
        },
        onBack: () => {},
        onCreateRecord: () => {},
        gradeCache: cache,
      }),
    )
    fireEvent.click(screen.getByTestId('room-step-cards'))
    return () => committed
  }

  it('shows a grade for a record the cache has measured, and the budget it spends', async () => {
    const source = documentWithOwnCard()
    const cache = cacheWith(source, { 'piece.knight': 5, [OWN_CARD]: 1 })
    mountRoom(source, cache)

    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.knight' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })

    await waitFor(() => {
      // knight measures 5 → band 1 at width 6 → cost 6; the card measures 1 → band 0 → cost 0.
      expect(screen.getByTestId('loadout-budget').textContent).toContain('6 / 18')
    })
    expect(screen.queryByTestId('loadout-mismatch')).toBeNull()
  })

  it('names a cross-band replacement before the save, not after it', async () => {
    const source = documentWithOwnCard()
    // The archer measures far above the pawn, so standing in for a pawn is the
    // exact swap ADR-008 exists to refuse.
    const cache = cacheWith(source, { 'piece.archer': 20, 'piece.pawn': 0, [OWN_CARD]: 0 })
    mountRoom(source, cache)

    fireEvent.change(screen.getByTestId('loadout-piece'), { target: { value: 'piece.archer' } })
    fireEvent.change(screen.getByTestId('loadout-replaces'), { target: { value: 'piece.pawn' } })
    fireEvent.change(screen.getByTestId('loadout-skill'), { target: { value: OWN_CARD } })

    await waitFor(() => expect(screen.getByTestId('loadout-mismatch')).toBeTruthy())
  })

  it('says a grade is still being measured rather than showing it as zero', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    const options = screen.getByTestId('loadout-piece').textContent ?? ''
    expect(options).toContain('세는 중')
    expect(options).not.toContain('세기 0')
  })

  it('states the limit of what a grade measures', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    // ADR-006 accepted that grades miss skill-dependent power; the UI has to say
    // so rather than let the word "grade" imply more than was measured.
    expect(screen.getByTestId('loadout-caveat').textContent).toMatch(/아무렇게나|사람이 잘 쓰면/)
  })

  it('never offers a card the room already deals — a shared card cannot be one side’s own', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    const options = [...screen.getByTestId('loadout-skill').querySelectorAll('option')].map((o) => o.getAttribute('value'))
    expect(options).toContain(OWN_CARD)
    expect(options).not.toContain('skill.volley')
  })

  it('never offers a royal piece — replacing one would move the losing condition', () => {
    const source = documentWithOwnCard()
    mountRoom(source, memoryCache())
    for (const testid of ['loadout-piece', 'loadout-replaces']) {
      const options = [...screen.getByTestId(testid).querySelectorAll('option')].map((o) => o.getAttribute('value'))
      expect(options, testid).not.toContain('piece.king')
    }
  })
})
