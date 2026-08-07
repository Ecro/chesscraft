import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 120_000 })

import { BUNDLED_PRESET_ID } from '@content/sets/bundled'
import { PRODUCTION_NODE_BUDGET, SURROGATE_NODE_BUDGET, search } from '@engine/ai/search'
import { chooseAction } from '@engine/agent'
import { apply } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * ADR-001 estimates the reachable depth from `b^(3d/4)`; this measures it.
 *
 * The estimate has already been wrong once here — the first node-cost
 * measurement was taken while three subagents shared the machine and overstated
 * cost by ~3x, which made depth 4 look marginal when it is comfortable. A
 * formula calibrated against a contended benchmark is not evidence, so the
 * PLAN's Phase 1 exit criterion is this file rather than the arithmetic.
 *
 * It asserts a FLOOR, not an exact depth: the point is to catch a search that
 * silently degrades to depth 1-2 (which would still satisfy every correctness
 * relation in the other files while playing nothing like the opponent the SPEC
 * describes), not to pin a number that a faster machine would violate.
 */

const content = shippedContent()

function walk(seed: number, plies: number): GameState {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseAction(state, content, seed)
    if (!action) break
    match = { states: [...match.states, apply(state, action, content)] }
  }
  return currentState(match)
}

function distribution(budget: number) {
  const depths: number[] = []
  const nodes: number[] = []
  for (let seed = 1; seed <= 8; seed += 1) {
    for (const plies of [5, 10, 16, 22]) {
      const state = walk(seed, plies)
      if (state.result) continue
      const result = search(state, content, { nodeBudget: budget })
      depths.push(result.depthReached)
      nodes.push(result.nodes)
    }
  }
  const searchedShare = depths.filter((d) => d >= 2).length / depths.length
  depths.sort((x, y) => x - y)
  return {
    samples: depths.length,
    minDepth: depths[0]!,
    medianDepth: depths[Math.floor((depths.length - 1) / 2)]!,
    maxDepth: depths[depths.length - 1]!,
    /** Fraction of roots that completed a real search rather than one ply. */
    searchedShare: +searchedShare.toFixed(2),
    maxNodes: Math.max(...nodes),
  }
}

describe('search depth at the shipped budgets', () => {
  it('reaches at least depth 3 everywhere and depth 4 typically, at the production budget', () => {
    const d = distribution(PRODUCTION_NODE_BUDGET)
    // Printed so a regression in reachable depth is visible in CI output even
    // when the floor still passes.
    console.log('[ai-bench] production', JSON.stringify(d))
    expect(d.samples).toBeGreaterThan(20)
    expect(d.minDepth).toBeGreaterThanOrEqual(3)
    expect(d.medianDepth).toBeGreaterThanOrEqual(4)
    expect(d.maxNodes).toBeLessThanOrEqual(PRODUCTION_NODE_BUDGET * 1.2)
  })

  it('still sees a reply at the surrogate budget the strength suite uses', () => {
    const d = distribution(SURROGATE_NODE_BUDGET)
    console.log('[ai-bench] surrogate', JSON.stringify(d))
    // The tournament proves the ladder at this budget (ADR-011). A surrogate so
    // small that every level searched one ply would rank by static evaluation
    // alone, and the ladder it proved would say nothing about the shipped one.
    //
    // The claim is about the TYPICAL root, not the widest one, and that is a
    // measured limit rather than a lowered bar. A card-target product reaches
    // 200 legal actions at one node; scoring those alone is 200 of the 250
    // nodes, and completing depth 2 from there costs thousands. So `minDepth`
    // is 1 at any surrogate budget cheap enough to run 1,200 games, and
    // asserting otherwise would be asserting something false about the engine
    // rather than something demanding about the search.
    expect(d.medianDepth).toBeGreaterThanOrEqual(2)
    expect(d.searchedShare).toBeGreaterThanOrEqual(0.7)
  })

  it('spends more nodes for more depth, monotonically', () => {
    const state = walk(6, 12)
    let previous = 0
    for (const nodeBudget of [200, 800, 3_000, 12_000]) {
      const { nodes, depthReached } = search(state, content, { nodeBudget })
      expect(nodes).toBeGreaterThanOrEqual(previous)
      expect(depthReached).toBeGreaterThanOrEqual(1)
      previous = nodes
    }
  })
})
