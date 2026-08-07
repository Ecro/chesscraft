import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 300_000 })

import { BUNDLED_PRESET_ID, bundledContentSource } from '@content/sets/bundled'
import { type AiMove, type WorkerLike, createAiClient } from '@engine/ai/client'
import { DIFFICULTIES, chooseMove } from '@engine/ai/difficulty'
import { createSession } from '@engine/ai/engine-side'
import type { FromWorker, ToWorker } from '@engine/ai/protocol'
import { SURROGATE_NODE_BUDGET, search } from '@engine/ai/search'
import { chooseAction } from '@engine/agent'
import { apply } from '@engine/engine'
import { createMatch, currentState } from '@engine/match'
import type { Action, GameState } from '@engine/types'
import { shippedContent } from '../helpers/shipped'

/**
 * AC-003 — a seeded single-player match replays identically.
 *
 * The claim has two halves and the second is the one a worker could break: the
 * same `(seed, difficulty)` must produce the same moves when driven through the
 * transport as when the core is called directly. If those ever diverged, the
 * shipped behaviour and the tested behaviour would be different things —
 * `shared-vocabulary-unshared-code-path`, which this repo has recorded twice.
 *
 * The budget being NODES rather than wall-clock (ADR-003) is what makes this
 * assertable at all. A time-budgeted search visits a different node count under
 * different load, so the test would need a tolerance, and a tolerance would
 * hide exactly the drift it is here to catch.
 */

const content = shippedContent()

/**
 * A worker that is not a worker: it runs the real session inline.
 *
 * This is what `ADR-002`'s "the worker is transport only" buys. The session
 * under test is byte-identical to the one the browser loads; only the delivery
 * differs, and delivery is the one thing a fake may legitimately replace.
 */
function fakeWorker(): WorkerLike & { terminated: number; queued: number } {
  const session = createSession()
  const worker = {
    terminated: 0,
    queued: 0,
    onmessage: null as ((event: { data: FromWorker }) => void) | null,
    postMessage(message: ToWorker) {
      worker.queued += 1
      const reply = session.handle(message)
      // Delivered asynchronously, as a real worker would, so a test that
      // accidentally depended on synchronous delivery fails here rather than in
      // the browser.
      if (reply) queueMicrotask(() => worker.onmessage?.({ data: reply }))
    },
    terminate() {
      worker.terminated += 1
      worker.onmessage = null
    },
  }
  return worker
}

/** A real mid-game position, reached by the uniform-random fixture. */
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

function playThroughCore(seed: number, difficulty: (typeof DIFFICULTIES)[number], plies: number): Action[] {
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const actions: Action[] = []
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const action = chooseMove(state, content, { difficulty, seed, nodeBudget: SURROGATE_NODE_BUDGET })
    if (!action) break
    actions.push(action)
    match = { states: [...match.states, apply(state, action, content)] }
  }
  return actions
}

async function playThroughWorker(
  seed: number,
  difficulty: (typeof DIFFICULTIES)[number],
  plies: number,
): Promise<Action[]> {
  const client = createAiClient({
    spawn: fakeWorker,
    source: bundledContentSource,
    nodeBudget: SURROGATE_NODE_BUDGET,
  })
  let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed })
  const actions: Action[] = []
  for (let i = 0; i < plies; i += 1) {
    const state = currentState(match)
    if (state.result) break
    const move = await client.request(state, difficulty, seed)
    if (!move?.action) break
    actions.push(move.action)
    match = { states: [...match.states, apply(state, move.action, content)] }
  }
  client.dispose()
  return actions
}

describe('AC-003 — same seed, same difficulty, same moves', () => {
  it('two independent runs of the core agree exactly', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const seed of [7, 101, 4_242]) {
        const a = playThroughCore(seed, difficulty, 14)
        const b = playThroughCore(seed, difficulty, 14)
        expect(a).toEqual(b)
        // Premise: a run that produced nothing would make the equality vacuous.
        expect(a.length).toBeGreaterThan(4)
      }
    }
  })

  it('a different seed produces a different line — the premise of determinism', () => {
    // Without this the file would pass against an agent that ignored the seed
    // entirely, which is deterministic and also wrong.
    const sampled = playThroughCore(7, 'easy', 14)
    const other = playThroughCore(8, 'easy', 14)
    expect(sampled).not.toEqual(other)
  })

  it('the transport does not change the answer', async () => {
    for (const difficulty of DIFFICULTIES) {
      const direct = playThroughCore(31, difficulty, 10)
      const viaWorker = await playThroughWorker(31, difficulty, 10)
      expect(viaWorker).toEqual(direct)
    }
  })
})

describe('AC-008 — cancelling stops the work, not just the answer', () => {
  it('terminates the worker and does not queue the next request behind it', async () => {
    let spawned = 0
    const workers: Array<ReturnType<typeof fakeWorker>> = []
    const client = createAiClient({
      spawn: () => {
        spawned += 1
        const worker = fakeWorker()
        workers.push(worker)
        return worker
      },
      source: bundledContentSource,
      nodeBudget: SURROGATE_NODE_BUDGET,
    })

    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 5 }))
    const abandoned = client.request(state, 'hard', 5)
    client.cancel()

    // A cancelled request resolves null rather than hanging: a caller awaiting
    // a promise that never settles is a mode with no way out, which is the
    // failure this repo recorded on 2026-08-07.
    await expect(abandoned).resolves.toBeNull()
    expect(workers[0]!.terminated).toBe(1)

    // The next request must go to a FRESH worker. Dropping the stale reply
    // alone would leave the abandoned search holding the only thread.
    const next = await client.request(state, 'hard', 5)
    expect(next?.action).not.toBeNull()
    expect(spawned).toBe(2)
    expect(workers[1]!.terminated).toBe(0)
    client.dispose()
  })

  it('does NOT terminate the worker on a cleanly finished turn', async () => {
    // The regression a review found, and the reason no existing test saw it:
    // React runs an effect's cleanup whenever its dependencies change, and the
    // AI's own move changes the state — so `cancel()` is reached on the
    // ORDINARY path, after the request has already settled. An unconditional
    // terminate there killed the worker after every ply and made the next turn
    // pay a worker start plus a full content re-send, on the hot path.
    let spawned = 0
    const workers: Array<ReturnType<typeof fakeWorker>> = []
    const client = createAiClient({
      spawn: () => {
        spawned += 1
        const worker = fakeWorker()
        workers.push(worker)
        return worker
      },
      source: bundledContentSource,
      nodeBudget: SURROGATE_NODE_BUDGET,
    })

    let match = createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 21 })
    for (let i = 0; i < 4; i += 1) {
      const state = currentState(match)
      if (state.result) break
      const move = await client.request(state, 'hard', 21)
      // The cleanup a settled turn performs. It must be a no-op.
      client.cancel()
      if (!move?.action) break
      match = { states: [...match.states, apply(state, move.action, content)] }
    }

    expect(spawned).toBe(1)
    expect(workers[0]!.terminated).toBe(0)
    client.dispose()
  })

  it('drops a reply that arrives for a superseded request', async () => {
    const client = createAiClient({
      spawn: fakeWorker,
      source: bundledContentSource,
      nodeBudget: SURROGATE_NODE_BUDGET,
    })
    const state = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 9 }))

    const first = client.request(state, 'hard', 9)
    const second = client.request(state, 'hard', 9)
    // Issuing a second request supersedes the first; the first must settle
    // null rather than resolving with a move for a board that has moved on.
    await expect(first).resolves.toBeNull()
    const move = (await second) as AiMove
    expect(move.action).not.toBeNull()
    client.dispose()
  })
})

describe('ADR-010 — the wall-clock valve cuts the search short, it does not just label it', () => {
  it('an already-expired deadline stops the search and says so', () => {
    const state = walk(13, 8)
    const generous = search(state, content, { nodeBudget: 8_000 })
    // A deadline in the past: the very first check trips it.
    const starved = search(state, content, { nodeBudget: 8_000, deadline: Date.now() - 1 })

    expect(starved.valveTripped).toBe(true)
    // Cut SHORT, not merely flagged after running to completion. The first
    // implementation measured elapsed time afterwards, so this number was
    // identical between the two and nothing noticed.
    expect(starved.nodes).toBeLessThan(generous.nodes)
    // And it still answers: a valve that returned nothing would hand the caller
    // a stuck match instead of a weaker move.
    expect(starved.best).not.toBeNull()
  })

  it('reads no clock at all when no deadline is given — the determinism contract', () => {
    const state = walk(13, 8)
    const now = Date.now
    let reads = 0
    // Not a mock of the search: a real count of how often the search consults
    // the clock. AC-003 rests on this being zero, because a node count that
    // depends on the clock is a node count that differs under load.
    ;(Date as unknown as { now: () => number }).now = () => {
      reads += 1
      return now()
    }
    try {
      search(state, content, { nodeBudget: 4_000 })
    } finally {
      ;(Date as unknown as { now: () => number }).now = now
    }
    expect(reads).toBe(0)
  })

  it('a deadline far in the future changes nothing', () => {
    const state = walk(13, 8)
    const plain = search(state, content, { nodeBudget: 4_000 })
    const dated = search(state, content, { nodeBudget: 4_000, deadline: Date.now() + 600_000 })
    expect(dated.valveTripped).toBe(false)
    expect(dated.scored).toEqual(plain.scored)
    expect(dated.nodes).toBe(plain.nodes)
  })
})

describe('the worker session refuses to guess', () => {
  it('reports an error rather than a move when it has no content', () => {
    const session = createSession()
    const state: GameState = currentState(createMatch({ content, presetId: BUNDLED_PRESET_ID, seed: 1 }))
    const reply = session.handle({
      kind: 'search',
      requestId: 1,
      state: { json: JSON.stringify({ ...state, board: [...state.board.entries()] }) },
      difficulty: 'hard',
      seed: 1,
      nodeBudget: 100,
      valveMs: 5_000,
    })
    expect(reply?.kind).toBe('error')
  })
})
