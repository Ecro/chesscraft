import { describe, expect, it } from 'vitest'
import { loadContentSet } from '@content/load'
import { SLICE_PRESET_ID, sliceContentSource } from '@content/sets/slice'
import { EDITABLE_KINDS, blankDraft, commitDraft } from '@editor/draft'
import { createMatch, currentState } from '@engine/match'

/**
 * PLAN Phase 3 — the editor's first pass over the four content kinds the slice
 * uses. The full five-axis editor is Phase 5; what this phase must establish is
 * that authoring goes through the SAME validator the loader uses, so a save can
 * never produce content the engine will later choke on (AC-011's fail-closed
 * boundary applies to authored content, not only to bundled content).
 */

function baseSource() {
  return structuredClone(sliceContentSource)
}

describe('editor drafts', () => {
  it('offers a blank draft for each of the five content axes plus the preset that bundles them', () => {
    // Phase 3 covered the four effect-bearing kinds; Phase 5 owns all five axes
    // (ADR-006) and the preset that bundles them.
    expect([...EDITABLE_KINDS].sort()).toEqual([
      'board',
      'piece',
      'preset',
      'ruleCard',
      'skillCard',
      'squareType',
    ])
    for (const kind of EDITABLE_KINDS) {
      const draft = blankDraft(kind)
      expect(draft).toHaveProperty('id')
      expect(draft).toHaveProperty('nameKey')
      if (kind !== 'board' && kind !== 'preset') expect(draft).toHaveProperty('effects')
    }
  })

  it('blocks a save whose text is a literal instead of an i18n key, naming the field', () => {
    const draft = {
      ...blankDraft('skillCard'),
      id: 'skill.smokescreen',
      nameKey: 'Smokescreen',
      textKey: 'skill.smokescreen.text',
      cost: 2,
      uses: 1,
      effects: [
        { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 1 }] },
      ],
    }
    const result = commitDraft(baseSource(), 'skillCard', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    const offending = result.errors.find((e) => e.path.endsWith('nameKey'))
    expect(offending).toBeDefined()
    expect(offending!.contentId).toBe('skill.smokescreen')
    expect(offending!.path).toBe('skillCards.skill.smokescreen.nameKey')
  })

  it('blocks a save that references a piece the set does not contain', () => {
    const draft = {
      id: 'skill.summon-dragon',
      nameKey: 'skill.summon-dragon.name',
      textKey: 'skill.summon-dragon.text',
      cost: 6,
      uses: 1,
      effects: [
        { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'spawn_piece', pieceId: 'piece.dragon', side: 'mover', at: { kind: 'chosen_empty' } }] },
      ],
    }
    const result = commitDraft(baseSource(), 'skillCard', draft)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors.some((e) => e.message.includes('piece.dragon'))).toBe(true)
  })

  it('saves a valid new card and makes it part of the loadable set', () => {
    const draft = {
      id: 'skill.smokescreen',
      nameKey: 'skill.smokescreen.name',
      textKey: 'skill.smokescreen.text',
      cost: 2,
      uses: 1,
      effects: [
        { trigger: 'on_play', condition: { kind: 'always' }, actions: [{ kind: 'freeze_piece', target: { kind: 'chosen_enemy' }, plies: 1 }] },
      ],
    }
    const result = commitDraft(baseSource(), 'skillCard', draft)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.set.skillCards.get('skill.smokescreen')!.cost).toBe(2)
    expect(loadContentSet(result.source).ok).toBe(true)
  })

  it('edits an existing item in place rather than duplicating it', () => {
    const before = loadContentSet(baseSource())
    expect(before.ok).toBe(true)
    if (!before.ok) return

    const edited = { ...structuredClone(sliceContentSource.ruleCards[0]!), cost: 9 }
    const result = commitDraft(baseSource(), 'ruleCard', edited)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.set.ruleCards.size).toBe(before.set.ruleCards.size)
    expect(result.set.ruleCards.get('rule.beacon-rush')!.cost).toBe(9)
  })

  it('produces content a match can start from in the same session', () => {
    const draft = {
      id: 'square.mire',
      nameKey: 'square.mire.name',
      textKey: 'square.mire.text',
      paired: false,
      effects: [
        { trigger: 'on_enter', condition: { kind: 'always' }, actions: [{ kind: 'freeze_piece', target: { kind: 'entering' }, plies: 1 }] },
      ],
    }
    const result = commitDraft(baseSource(), 'squareType', draft)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const state = currentState(createMatch({ content: result.set, presetId: SLICE_PRESET_ID, seed: 5 }))
    expect(state.board.size).toBeGreaterThan(0)
    expect(result.set.squareTypes.has('square.mire')).toBe(true)
  })

  it('leaves the source it was given untouched', () => {
    const base = baseSource()
    const snapshot = JSON.stringify(base)
    commitDraft(base, 'skillCard', { ...blankDraft('skillCard'), id: 'skill.whatever' })
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})
