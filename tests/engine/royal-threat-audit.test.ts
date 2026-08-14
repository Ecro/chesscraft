import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { type ContentSet, loadContentSet } from '@content/load'
import { bundledContentSource, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { apply, legalActions } from '@engine/engine'
import { createPosition } from '@engine/match'
import { shippedContent } from '../helpers/shipped'

const content = shippedContent()
const W_KING = { square: 'a1', pieceId: 'piece.king', side: 'white' as const }
const B_KING = { square: 'f6', pieceId: 'piece.king', side: 'black' as const }

function position(cardId: string, extra: Parameters<typeof createPosition>[0]['placements']) {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 23,
    sideToMove: 'white',
    placements: [W_KING, B_KING, ...extra],
    held: { white: [cardId], black: [] },
  })
}

function royalCaptures(state: ReturnType<typeof createPosition>, set: ContentSet = content) {
  return legalActions(state, set)
    .filter((action) => {
      if (action.kind !== 'move') return false
      const victim = state.board.get(action.to)
      return victim !== undefined && set.pieces.get(victim.pieceId)?.royal === true
    })
    .map((action) => (action.kind === 'move' ? `${action.from}>${action.to}` : ''))
    .sort()
}

function newRoyalCaptures(
  before: ReturnType<typeof createPosition>,
  after: ReturnType<typeof createPosition>,
  set: ContentSet = content,
) {
  const baseline = royalCaptures(before, set)
  return royalCaptures(after, set).filter((key) => !baseline.includes(key))
}

function effectFingerprint(state: ReturnType<typeof createPosition>): string {
  return JSON.stringify({
    board: [...state.board.entries()].sort(([left], [right]) => left.localeCompare(right)),
    captured: state.captured,
    frozenUntil: Object.entries(state.frozenUntil).sort(([left], [right]) => left.localeCompare(right)),
    grants: [...state.grants].sort((left, right) =>
      `${left.kind}:${left.square}:${left.sourceId}`.localeCompare(`${right.kind}:${right.square}:${right.sourceId}`),
    ),
  })
}

function removedRoyalSides(
  before: ReturnType<typeof createPosition>,
  after: ReturnType<typeof createPosition>,
) {
  const hasRoyal = (state: ReturnType<typeof createPosition>, side: 'white' | 'black') =>
    [...state.board.values()].some(
      (piece) => piece.side === side && content.pieces.get(piece.pieceId)?.royal === true,
    )
  return (['white', 'black'] as const).filter((side) => hasRoyal(before, side) && !hasRoyal(after, side))
}

const PRESERVE_EXISTING = [
  'skill.teleport',
  'skill.swap',
  'skill.revive',
  'skill.coronation',
  'skill.knight-leap',
  'skill.charge',
  'skill.recall',
  'skill.shove',
  'skill.recruit',
  'skill.volley',
  'skill.sacrifice',
  'skill.blink',
  'skill.mend',
  'skill.quake',
  'skill.dart',
  'skill.tide',
  'skill.brand',
  'skill.echo',
] as const

const PRESERVE = [
  'skill.freeze',
  'skill.snare',
  'skill.bulwark',
  'skill.shackle',
  'skill.leash',
  'skill.veil',
] as const

function richPosition(cardId: string) {
  return createPosition({
    content,
    presetId: BUNDLED_PRESET_ID,
    seed: 31,
    sideToMove: 'white',
    placements: [
      W_KING,
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'c2', pieceId: 'piece.pawn', side: 'white' },
      { square: 'd1', pieceId: 'piece.knight', side: 'white' },
      B_KING,
      { square: 'e5', pieceId: 'piece.rook', side: 'black' },
      { square: 'd5', pieceId: 'piece.pawn', side: 'black' },
    ],
    held: { white: [cardId], black: [] },
    captured: { white: ['piece.knight', 'piece.pawn'], black: [] },
  })
}

describe('bundled royal-threat audit', () => {
  it('makes every bundled skill declare both v11 royal policies', () => {
    expect(bundledContentSource.skillCards).toHaveLength(24)
    const declarations = new Map<string, string>()
    for (const rawCard of bundledContentSource.skillCards) {
      const card = rawCard as {
        id: string
        royalFollowUp?: string
        protectRelocatedAfterPlay?: boolean
      }
      declarations.set(card.id, card.royalFollowUp ?? '')
      expect(typeof card.protectRelocatedAfterPlay, card.id).toBe('boolean')
    }
    expect([...declarations.entries()].filter(([, policy]) => policy === 'preserve-existing').map(([id]) => id).sort()).toEqual(
      [...PRESERVE_EXISTING].sort(),
    )
    expect([...declarations.entries()].filter(([, policy]) => policy === 'preserve').map(([id]) => id).sort()).toEqual(
      [...PRESERVE].sort(),
    )
    expect(
      bundledContentSource.skillCards
        .map((card) => card as { id: string; protectRelocatedAfterPlay?: boolean })
        .filter((card) => card.protectRelocatedAfterPlay)
        .map((card) => card.id),
    ).toEqual(['skill.quake'])
  })

  it.each([...PRESERVE_EXISTING, ...PRESERVE])('audits every resolving target tuple for %s', (cardId) => {
    const before = richPosition(cardId)
    const plays = legalActions(before, content).filter(
      (action) => action.kind === 'play_card' && action.cardId === cardId,
    )
    expect(plays.length, `${cardId} produced no resolving target tuple`).toBeGreaterThan(0)
    for (const play of plays) {
      const after = apply(before, play, content)
      expect(after.drafts.white.used, `${cardId} was offered but did not resolve: ${JSON.stringify(play)}`).toContain(cardId)
      expect(effectFingerprint(after), `${cardId} was consumed without executing an observable effect: ${JSON.stringify(play)}`).not.toBe(
        effectFingerprint(before),
      )
      expect(after.result, `${cardId} ended the match directly: ${JSON.stringify(play)}`).toBeNull()
      expect(removedRoyalSides(before, after), `${cardId} removed a royal: ${JSON.stringify(play)}`).toEqual([])
      expect(newRoyalCaptures(before, after), `${cardId} created a royal capture: ${JSON.stringify(play)}`).toEqual([])
    }
  })

  it('protects Quake relocated material for the mandatory follow-up move', () => {
    const before = position('skill.quake', [
      { square: 'b1', pieceId: 'piece.rook', side: 'white' },
      { square: 'e5', pieceId: 'piece.rook', side: 'black' },
    ])
    const play = legalActions(before, content).find(
      (action) =>
        action.kind === 'play_card' &&
        action.cardId === 'skill.quake' &&
        action.targets[0] === 'e5' &&
        action.targets[1] === 'b5',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(mid.board.get('b5')?.side).toBe('black')
    expect(legalActions(mid, content).some((action) => action.kind === 'move' && action.from === 'b1' && action.to === 'b5')).toBe(false)
    expect(mid.grants.some((grant) => grant.kind === 'block_capture' && grant.square === 'b5')).toBe(true)
  })

  it('moves Quake protection through a portal to the final surviving square', () => {
    const before = position('skill.quake', [
      { square: 'e1', pieceId: 'piece.rook', side: 'white' },
      { square: 'd5', pieceId: 'piece.rook', side: 'black' },
    ])
    const play = legalActions(before, content).find(
      (action) =>
        action.kind === 'play_card' &&
        action.cardId === 'skill.quake' &&
        action.targets[0] === 'd5' &&
        action.targets[1] === 'b3',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(mid.board.get('e4')?.side).toBe('black')
    expect(legalActions(mid, content).some((action) => action.kind === 'move' && action.from === 'e1' && action.to === 'e4')).toBe(false)
    expect(mid.grants.some((grant) => grant.kind === 'block_capture' && grant.square === 'e4')).toBe(true)
    expect(mid.grants.some((grant) => grant.kind === 'block_capture' && grant.square === 'b3')).toBe(false)
  })

  it('leaves no stale Quake protection when the relocated piece is removed on entry', () => {
    const before = position('skill.quake', [{ square: 'd5', pieceId: 'piece.rook', side: 'black' }])
    const play = legalActions(before, content).find(
      (action) =>
        action.kind === 'play_card' &&
        action.cardId === 'skill.quake' &&
        action.targets[0] === 'd5' &&
        action.targets[1] === 'a3',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(mid.board.has('a3')).toBe(false)
    expect(mid.grants.some((grant) => grant.kind === 'block_capture' && grant.sourceId === 'skill.quake')).toBe(false)
  })

  it('keeps a non-empty exact capture baseline when ordinary and granted geometry overlap', () => {
    const before = createPosition({
      content,
      presetId: BUNDLED_PRESET_ID,
      seed: 41,
      sideToMove: 'white',
      placements: [W_KING, { square: 'c3', pieceId: 'piece.knight', side: 'white' }, { square: 'd5', pieceId: 'piece.king', side: 'black' }],
      held: { white: ['skill.knight-leap'], black: [] },
    })
    const baseline = royalCaptures(before)
    expect(baseline).toEqual(['c3>d5'])
    const play = legalActions(before, content).find(
      (action) => action.kind === 'play_card' && action.cardId === 'skill.knight-leap' && action.targets[0] === 'c3',
    )
    expect(play).toBeDefined()
    const mid = apply(before, play!, content)

    expect(royalCaptures(mid)).toEqual(['c3>d5'])
    expect((mid as typeof mid & { royalCaptureBaseline?: readonly string[] | null }).royalCaptureBaseline).toEqual(baseline)
  })

  it('drives synthetic skill cards through execution to prove the threat oracle detects each mechanism', () => {
    const probeCards = [
      {
        id: 'skill.probe-relocate', nameKey: 'probe.name', textKey: 'probe.text', uses: 1,
        royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'teleport_piece', target: { kind: 'chosen_friendly' }, to: { kind: 'chosen_empty' } }] }],
      },
      {
        id: 'skill.probe-grant', nameKey: 'probe.name', textKey: 'probe.text', uses: 1,
        royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'grant_movement', target: { kind: 'chosen_friendly' }, pattern: { kind: 'jump', vectors: [[5, 4]] }, duration: 1 }] }],
      },
      {
        id: 'skill.probe-promote', nameKey: 'probe.name', textKey: 'probe.text', uses: 1,
        royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'promote_piece', target: { kind: 'chosen_friendly' }, to: 'piece.queen' }] }],
      },
      {
        id: 'skill.probe-remove-blocker', nameKey: 'probe.name', textKey: 'probe.text', uses: 1,
        royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'destroy_piece', target: { kind: 'chosen_enemy' } }] }],
      },
      {
        id: 'skill.probe-spawn', nameKey: 'probe.name', textKey: 'probe.text', uses: 1,
        royalFollowUp: 'preserve', protectRelocatedAfterPlay: false, lockRelocatedAfterPlay: false,
        effects: [{ trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'spawn_piece', pieceId: 'piece.pawn', side: 'mover', at: { kind: 'chosen_empty' } }] }],
      },
    ]
    const source = structuredClone(bundledContentSource)
    source.skillCards.push(...probeCards)
    const preset = source.presets.find((entry) => (entry as { id?: string }).id === BUNDLED_PRESET_ID) as { skillCardIds: string[] }
    preset.skillCardIds.push(...probeCards.map((card) => card.id))
    const loaded = loadContentSet(source)
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    const probeContent = loaded.set

    const scenarios = [
      {
        cardId: 'skill.probe-relocate',
        placements: [W_KING, B_KING, { square: 'a2', pieceId: 'piece.rook', side: 'white' as const }],
        targets: ['a2', 'f5'],
        expected: ['f5>f6'],
      },
      {
        cardId: 'skill.probe-grant',
        placements: [W_KING, B_KING, { square: 'a2', pieceId: 'piece.rook', side: 'white' as const }],
        targets: ['a2'],
        expected: ['a2>f6'],
      },
      {
        cardId: 'skill.probe-promote',
        placements: [W_KING, B_KING, { square: 'f5', pieceId: 'piece.pawn', side: 'white' as const }],
        targets: ['f5'],
        expected: ['f5>f6'],
      },
      {
        cardId: 'skill.probe-remove-blocker',
        placements: [W_KING, B_KING, { square: 'f1', pieceId: 'piece.rook', side: 'white' as const }, { square: 'f5', pieceId: 'piece.rook', side: 'black' as const }],
        targets: ['f5'],
        expected: ['f1>f6'],
      },
      {
        cardId: 'skill.probe-spawn',
        placements: [W_KING, { square: 'c2', pieceId: 'piece.king', side: 'black' as const }],
        targets: ['b1'],
        expected: ['b1>c2'],
      },
    ]

    for (const scenario of scenarios) {
      const before = createPosition({
        content: probeContent,
        presetId: BUNDLED_PRESET_ID,
        seed: 47,
        sideToMove: 'white',
        placements: scenario.placements,
        held: { white: [scenario.cardId], black: [] },
      })
      const play = legalActions(before, probeContent).find(
        (action) => action.kind === 'play_card' && action.cardId === scenario.cardId && action.targets.join(',') === scenario.targets.join(','),
      )
      expect(play, scenario.cardId).toBeDefined()
      const after = apply(before, play!, probeContent)
      expect(effectFingerprint(after), scenario.cardId).not.toBe(effectFingerprint(before))
      expect(newRoyalCaptures(before, after, probeContent), scenario.cardId).toEqual(scenario.expected)
    }
  })

  it('enumerates every legal target tuple in bounded category states without a new royal capture', () => {
    const cases = [
      { name: 'friendly-relocation', state: position('skill.teleport', [{ square: 'c3', pieceId: 'piece.rook', side: 'white' }]) },
      { name: 'enemy-relocation', state: position('skill.quake', [{ square: 'e5', pieceId: 'piece.rook', side: 'black' }]) },
      {
        name: 'blocker-removal',
        state: position('skill.volley', [
          { square: 'f1', pieceId: 'piece.rook', side: 'white' },
          { square: 'f5', pieceId: 'piece.rook', side: 'black' },
        ]),
      },
      { name: 'promotion', state: position('skill.coronation', [{ square: 'f5', pieceId: 'piece.pawn', side: 'white' }]) },
    ]
    const generatedCases = fc.sample(
      fc.shuffledSubarray(cases, { minLength: cases.length, maxLength: cases.length }),
      { seed: 20260811, numRuns: 1 },
    )[0]!
    for (const { name, state: before } of generatedCases) {
      const baseline = royalCaptures(before)
      const plays = legalActions(before, content).filter((action) => action.kind === 'play_card')
      expect(plays.length, `${name} generated no card plays`).toBeGreaterThan(0)
      for (const play of plays) {
        const mid = apply(before, play, content)
        expect(royalCaptures(mid).filter((key) => !baseline.includes(key)), JSON.stringify(play)).toEqual([])
      }
    }
  })

  it('generates bounded positions and audits all preserve-existing cards that resolve', () => {
    const squares = ['b1', 'c1', 'd1', 'e1', 'b2', 'c2', 'd2', 'e2', 'b3', 'c3', 'd3', 'e3', 'b4', 'c4', 'd4', 'e4', 'b5', 'c5', 'd5', 'e5'] as const
    const placementArb = fc.uniqueArray(
      fc.record({
        square: fc.constantFrom(...squares),
        pieceId: fc.constantFrom('piece.pawn', 'piece.knight', 'piece.rook'),
        side: fc.constantFrom('white' as const, 'black' as const),
      }),
      { minLength: 0, maxLength: 6, selector: (entry) => entry.square },
    )
    const placementSetArb = fc.uniqueArray(placementArb, {
      minLength: 24,
      maxLength: 24,
      selector: (placements) =>
        JSON.stringify([...placements].sort((left, right) => left.square.localeCompare(right.square))),
    })
    const samples = fc.sample(placementSetArb, { seed: 20260811, numRuns: 1 })[0]!
    expect(new Set(samples.map((placements) => JSON.stringify([...placements].sort((left, right) => left.square.localeCompare(right.square))))).size).toBe(24)
    const coverage = new Map(PRESERVE_EXISTING.map((cardId) => [cardId, 0]))

    for (const extra of samples) {
      for (const cardId of PRESERVE_EXISTING) {
        const before = createPosition({
          content,
          presetId: BUNDLED_PRESET_ID,
          seed: 53,
          sideToMove: 'white',
          placements: [W_KING, B_KING, ...extra],
          held: { white: [cardId], black: [] },
          captured: { white: ['piece.knight', 'piece.pawn'], black: [] },
        })
        const baseline = royalCaptures(before)
        const plays = legalActions(before, content).filter(
          (action) => action.kind === 'play_card' && action.cardId === cardId,
        )
        for (const play of plays) {
          const after = apply(before, play, content)
          expect(removedRoyalSides(before, after), `${cardId}: ${JSON.stringify(play)}`).toEqual([])
          expect(royalCaptures(after).filter((key) => !baseline.includes(key)), `${cardId}: ${JSON.stringify(play)}`).toEqual([])
          coverage.set(cardId, coverage.get(cardId)! + 1)
        }
      }
    }
    for (const [cardId, count] of coverage) expect(count, cardId).toBeGreaterThan(0)
  })
})
