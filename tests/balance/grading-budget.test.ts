import { describe, expect, it, vi } from 'vitest'

/**
 * This file plays whole matches, so it needs the same raised budget the other
 * playout suites already take (`tests/engine/agent.test.ts` and seven siblings).
 *
 * It was the one that did not, and the cost was a flake nobody could reproduce:
 * measured, the heavy test runs in ~6.4 s alone and 21-27 s inside a full
 * parallel run, so the 20 s default in `vitest.config.ts` sits right between the
 * two and the suite failed only when the machine was busy. Isolated re-runs
 * always passed, which is the shape that makes a timeout read as a real
 * regression somewhere else.
 *
 * Raised rather than trimmed. The obvious lever is the seed count below, and the
 * comment on that test records it was already cut 60 -> 12 for exactly this
 * limit — cutting again buys a smaller margin by giving up the coverage the test
 * exists for, while the actual problem is that a whole-match suite was measured
 * against a budget meant for unit tests.
 */
vi.setConfig({ testTimeout: 60_000 })

import { loadBundledContent, BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { playOutGrading } from '@balance/grading-agent'
import { playOut } from '@engine/agent'
import { MAX_MATCH_ACTIONS, ACTIONS_PER_PLY, DRAFT_ACTIONS, PLY_CAP } from '@engine/engine'

/**
 * Review round 1, both voices — the grading agent's step budget.
 *
 * `playOutGrading` budgeted `PLY_CAP + DRAFT_ACTIONS` steps, one per ply. A turn
 * is `[play_card?] -> move`, so a ply costs up to TWO actions while advancing
 * `plyCount` by one: any grading match with enough card plays ran out of loop
 * before the cap could assign a result and came back `result: null`, with the
 * caller reading `.state` off a truncated position and no signal that it had
 * been truncated.
 *
 * `src/engine/agent.ts` already carried the right bound AND a comment recording
 * this exact failure ("~1% of AC-012 seeds ... with nothing wrong with the
 * engine at all"). The lesson had been learned in one file and not the other —
 * `[fail:design] shared-vocabulary-unshared-code-path`, count 4 — so the fix was
 * to delete the second copy rather than correct it.
 *
 * Raising `PLY_CAP` 60 -> 160 did not create this; it widened the shortfall from
 * roughly 56 actions to roughly 156.
 */

const content = loadBundledContent()

describe('the match action budget is one number, not three', () => {
  it('is big enough for two actions per ply plus both drafts', () => {
    // The arithmetic, asserted rather than assumed: a budget of one action per
    // ply is exactly the bug, and it differs from the right answer by a factor
    // this test would catch.
    expect(MAX_MATCH_ACTIONS).toBe(ACTIONS_PER_PLY * PLY_CAP + DRAFT_ACTIONS)
    expect(MAX_MATCH_ACTIONS, 'a one-action-per-ply budget cannot reach the cap').toBeGreaterThan(
      PLY_CAP + DRAFT_ACTIONS,
    )
  })

  it('lets the grading agent finish every match it starts', () => {
    // The observable the truncation hid. `playOutGrading`'s callers read
    // `.state` directly, so a truncated match produced a material measurement
    // from a position the game never actually reached.
    //
    // Twelve seeds, not sixty: the grading agent searches deeper than the
    // ordinary one, and sixty matches at the raised cap take long enough to be
    // worth avoiding even under this file's raised timeout. Twelve is enough to
    // cross the old budget — the shortfall was ~156 actions, so any match of
    // ordinary length trips it.
    const unfinished: number[] = []
    for (let seed = 1; seed <= 12; seed += 1) {
      if (playOutGrading(content, BUNDLED_PRESET_ID, seed).result === null) unfinished.push(seed)
    }
    expect(unfinished, 'a grading match ended with no result').toEqual([])
  })

  it('agrees with the ordinary agent about when a match is over', () => {
    // The two agents choose differently, so their match LENGTHS differ — but
    // neither may report a match as unresolved, and that is what the shared
    // budget buys. A per-file budget could leave the two disagreeing about
    // whether the same content can be played to an end.
    for (let seed = 1; seed <= 6; seed += 1) {
      expect(playOut(content, BUNDLED_PRESET_ID, seed).result, `playOut seed ${seed}`).not.toBeNull()
      expect(playOutGrading(content, BUNDLED_PRESET_ID, seed).result, `grading seed ${seed}`).not.toBeNull()
    }
  })
})
