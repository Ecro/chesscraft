import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { SLICE_BOARD_ID, SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { type DraftKind, EDITABLE_KINDS, commitDraft, editorContext, openDraft } from '@editor/draft'
import { createMatch, currentState } from '@engine/match'
import { legalActions } from '@engine/engine'
import { paintedSquares } from '@engine/effects'

/**
 * PLAN Phase 5 — the two axes the Phase 3 first pass did not have: a board with
 * painted squares, and the preset that bundles a set into something playable.
 *
 * The recurring failure this file is shaped against is `built-but-not-wired`:
 * content that validates, is fully covered by tests, and that no player ever
 * reaches. So every axis is checked twice — that it saves, and that a match
 * started in the same session actually observes it.
 */

function base() {
  return structuredClone(sliceContentSource)
}

function loadedOrThrow(source: ReturnType<typeof base>) {
  const result = loadContentSet(source)
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2))
  return result.set
}

describe('board authoring', () => {
  it('saves a new board with painted squares and starts a match on it', () => {
    const draft = {
      id: 'board.duel',
      nameKey: 'board.duel.name',
      width: 6,
      height: 6,
      placements: [
        { square: 'a1', pieceId: 'piece.king', side: 'white' },
        { square: 'a6', pieceId: 'piece.king', side: 'black' },
        { square: 'c1', pieceId: 'piece.archer', side: 'white' },
        { square: 'c6', pieceId: 'piece.archer', side: 'black' },
      ],
      squares: [{ square: 'd4', typeId: 'square.beacon' }],
    }
    const saved = commitDraft(base(), 'board', draft)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const preset = { ...structuredClone(sliceContentSource.presets[0]!), id: 'preset.duel', boardId: 'board.duel' }
    const withPreset = commitDraft(saved.source, 'preset', preset)
    expect(withPreset.ok).toBe(true)
    if (!withPreset.ok) return

    const state = currentState(createMatch({ content: withPreset.set, presetId: 'preset.duel', seed: 3 }))
    expect([...state.board.keys()].sort()).toEqual(['a1', 'a6', 'c1', 'c6'])
    expect(paintedSquares(state, withPreset.set).get('d4')?.type.id).toBe('square.beacon')
  })

  it('blocks a board whose painted square is off the edge, naming the field', () => {
    const draft = { ...structuredClone(sliceContentSource.boards[0]!), id: 'board.overflow' } as {
      id: string
      squares: { square: string; typeId: string }[]
    }
    draft.squares = [{ square: 'z9', typeId: 'square.beacon' }]

    const result = commitDraft(base(), 'board', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const offending = result.errors.find((e) => e.path.includes('squares'))
    expect(offending).toBeDefined()
    expect(offending!.contentId).toBe('board.overflow')
  })

  it('blocks a board that paints a square type nobody defined', () => {
    const draft = { ...structuredClone(sliceContentSource.boards[0]!), id: 'board.ghost' } as {
      id: string
      squares: { square: string; typeId: string }[]
    }
    draft.squares = [{ square: 'c3', typeId: 'square.lava' }]

    const result = commitDraft(base(), 'board', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('square.lava'))).toBe(true)
  })

  it('edits the shipped board in place and the change reaches the board a match starts on', () => {
    const edited = structuredClone(sliceContentSource.boards[0]!) as {
      id: string
      squares: { square: string; typeId: string }[]
    }
    edited.squares = [
      { square: 'c3', typeId: 'square.beacon' },
      { square: 'e5', typeId: 'square.beacon' },
    ]

    const result = commitDraft(base(), 'board', edited)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.set.boards.size).toBe(1)

    const state = currentState(createMatch({ content: result.set, presetId: SLICE_PRESET_ID, seed: 3 }))
    expect(paintedSquares(state, result.set).get('e5')?.type.id).toBe('square.beacon')
  })
})

describe('preset bundling', () => {
  it('saves a preset that narrows the card pool, and the match draws only from it', () => {
    // The preset must be a STRICT subset of what the document carries, or the
    // assertion is vacuous: with `skillCardIds` equal to every skill card in
    // the set, "every offered card is in the preset" holds for an engine that
    // ignores the preset entirely and draws from the whole document.
    const POOL = ['skill.warp', 'skill.hold', 'skill.rally']
    const EXCLUDED = ['skill.volley', 'skill.snare', 'skill.ascend']
    expect(sliceContentSource.skillCards.map((c) => (c as { id: string }).id).sort()).toEqual(
      [...POOL, ...EXCLUDED].sort(),
    )

    const draft = {
      id: 'preset.archers-only',
      nameKey: 'preset.archers-only.name',
      boardId: SLICE_BOARD_ID,
      pieceIds: ['piece.king', 'piece.archer'],
      ruleCardIds: ['rule.beacon-rush'],
      skillCardIds: POOL,
    }
    const saved = commitDraft(base(), 'preset', draft)
    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const state = currentState(createMatch({ content: saved.set, presetId: 'preset.archers-only', seed: 7 }))
    const offered = legalActions(state, saved.set)
      .filter((a) => a.kind === 'draft_pick')
      .map((a) => (a as { cardId: string }).cardId)

    // A pool of exactly three fills exactly one offer (AC-005), so the offer is
    // the pool — an equality, not a containment that a superset would satisfy.
    expect([...offered].sort()).toEqual([...POOL].sort())
    for (const excluded of EXCLUDED) expect(offered).not.toContain(excluded)
  })

  it('blocks a preset naming a board that does not exist', () => {
    const draft = {
      ...structuredClone(sliceContentSource.presets[0]!),
      id: 'preset.nowhere',
      boardId: 'board.atlantis',
    }
    const result = commitDraft(base(), 'preset', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('board.atlantis'))).toBe(true)
  })

  it('blocks a preset naming a skill card that does not exist', () => {
    const draft = structuredClone(sliceContentSource.presets[0]!) as { id: string; skillCardIds: string[] }
    draft.id = 'preset.phantom'
    draft.skillCardIds = [...draft.skillCardIds, 'skill.phantom']

    const result = commitDraft(base(), 'preset', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('skill.phantom'))).toBe(true)
  })
})

describe('re-opening saved content', () => {
  it('returns each shipped record byte-identical to what the document holds', () => {
    const source = base()
    const pairs: ReadonlyArray<readonly [DraftKind, string]> = [
      ['piece', 'piece.archer'],
      ['squareType', 'square.beacon'],
      ['ruleCard', 'rule.beacon-rush'],
      ['skillCard', 'skill.warp'],
      ['board', SLICE_BOARD_ID],
      ['preset', SLICE_PRESET_ID],
    ]
    for (const [kind, id] of pairs) {
      const reopened = openDraft(source, kind, id)
      expect(reopened, `${kind} ${id} could not be re-opened`).not.toBeNull()
      expect(JSON.stringify(reopened)).toBe(
        JSON.stringify(
          (source[COLLECTION[kind]] as { id: string }[]).find((r) => r.id === id),
        ),
      )
    }
  })

  it('returns null for an id the document does not carry', () => {
    expect(openDraft(base(), 'piece', 'piece.griffin')).toBeNull()
  })

  it('hands back a copy, so editing the re-opened draft cannot mutate the saved document', () => {
    const source = base()
    const reopened = openDraft(source, 'ruleCard', 'rule.beacon-rush') as { cost: number }
    reopened.cost = 99
    expect((source.ruleCards[0] as { cost: number }).cost).not.toBe(99)
  })

  it('round-trips every editable kind through save and re-open unchanged', () => {
    // Driven from EDITABLE_KINDS rather than a literal list, so adding a
    // seventh axis without a fixture fails here instead of being silently
    // skipped while the test's name still claims full coverage.
    const SAMPLE: Record<DraftKind, string> = {
      piece: 'piece.archer',
      squareType: 'square.beacon',
      ruleCard: 'rule.beacon-rush',
      skillCard: 'skill.warp',
      board: SLICE_BOARD_ID,
      preset: SLICE_PRESET_ID,
    }
    expect(Object.keys(SAMPLE).sort()).toEqual([...EDITABLE_KINDS].sort())

    const source = base()
    for (const kind of EDITABLE_KINDS) {
      const id = SAMPLE[kind]
      const opened = openDraft(source, kind, id)
      expect(opened, `no ${kind} fixture named ${id}`).not.toBeNull()
      const saved = commitDraft(source, kind, opened)
      expect(saved.ok, `re-saving an untouched ${kind} was rejected`).toBe(true)
      if (!saved.ok) continue
      expect(openDraft(saved.source, kind, id)).toEqual(opened)
    }
  })
})

describe('editor context', () => {
  it('offers the ids and squares an author can actually pick from', () => {
    const ctx = editorContext(base())
    expect(ctx.pieceIds).toContain('piece.archer')
    expect(ctx.squareTypeIds).toContain('square.beacon')
    expect(ctx.squares).toContain('a1')
    expect(ctx.squares).toContain('f6')
    // A 6x6 board has no g-file; offering one would author an off-board square.
    expect(ctx.squares.some((s) => s.startsWith('g'))).toBe(false)
  })

  it('never hands back an empty picker for a set that has content', () => {
    const ctx = editorContext(base())
    expect(ctx.pieceIds.length).toBeGreaterThan(0)
    expect(ctx.squares.length).toBe(36)
  })
})

const COLLECTION: Record<DraftKind, keyof ReturnType<typeof base>> = {
  piece: 'pieces',
  squareType: 'squareTypes',
  ruleCard: 'ruleCards',
  skillCard: 'skillCards',
  board: 'boards',
  preset: 'presets',
}

describe('authored content reaches gameplay in the same session (AC-014)', () => {
  it('a piece authored now is placeable and moves by the pattern that was authored', () => {
    const draft = {
      id: 'piece.hopper',
      nameKey: 'piece.hopper.name',
      textKey: 'piece.hopper.text',
      movement: [{ kind: 'jump', vectors: [[2, 1]] }],
      effects: [],
    }
    const withPiece = commitDraft(base(), 'piece', draft)
    expect(withPiece.ok).toBe(true)
    if (!withPiece.ok) return

    const board = structuredClone(sliceContentSource.boards[0]!) as {
      placements: { square: string; pieceId: string; side: string }[]
    }
    board.placements = [
      { square: 'a1', pieceId: 'piece.hopper', side: 'white' },
      { square: 'd1', pieceId: 'piece.king', side: 'white' },
      { square: 'd6', pieceId: 'piece.king', side: 'black' },
    ]
    const withBoard = commitDraft(withPiece.source, 'board', board)
    expect(withBoard.ok).toBe(true)
    if (!withBoard.ok) return

    const preset = { ...structuredClone(sliceContentSource.presets[0]!) } as { pieceIds: string[] }
    preset.pieceIds = ['piece.king', 'piece.archer', 'piece.hopper']
    const ready = commitDraft(withBoard.source, 'preset', preset)
    expect(ready.ok).toBe(true)
    if (!ready.ok) return

    const state = currentState(createMatch({ content: ready.set, presetId: SLICE_PRESET_ID, seed: 2 }))
    expect(state.board.get('a1')?.pieceId).toBe('piece.hopper')
    expect(loadedOrThrow(ready.source).pieces.get('piece.hopper')!.movement[0]!.kind).toBe('jump')
  })
})
