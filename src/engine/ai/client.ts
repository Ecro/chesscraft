import type { ContentSource } from '@content/load'
import { serializeState } from '../engine'
import type { Action, GameState } from '../types'
import type { Difficulty } from './difficulty'
import type { FromWorker, ToWorker } from './protocol'
import { PRODUCTION_NODE_BUDGET } from './search'

/**
 * The main thread's handle on the search worker (ADR-002, ADR-009).
 *
 * Two things it owns, and the second is the one that was nearly missed.
 *
 * **A monotonic request id**, so a reply that arrives after the position moved
 * on is dropped rather than applied. Without it a slow search can commit a move
 * for a board that no longer exists.
 *
 * **Termination on cancel.** Dropping a stale reply stops the ANSWER from
 * landing; it does nothing about the search still running. With a single worker
 * that abandoned work occupies the only thread there is, and the NEXT request —
 * a legitimate one, for the position the player is now looking at — waits
 * behind it. So cancelling terminates the worker and spawns a fresh one. It
 * costs a worker start and a content re-send, both paid only on the exceptional
 * path: abort, unmount, undo.
 */

/** The wall-clock backstop of ADR-010. Not a budget — a report (see protocol). */
export const VALVE_MS = 5_000

export interface AiClientOptions {
  /**
   * Makes a worker. Injected rather than constructed here so tests can drive
   * the real search synchronously without a worker at all — the same reason
   * ADR-024 injects the seed provider instead of calling `Math.random()`.
   */
  spawn: () => WorkerLike
  source: ContentSource
  nodeBudget?: number
  valveMs?: number
}

/** The slice of `Worker` this needs. Narrow, so a fake is cheap to write. */
export interface WorkerLike {
  postMessage(message: ToWorker): void
  terminate(): void
  onmessage: ((event: { data: FromWorker }) => void) | null
}

export interface AiMove {
  action: Action | null
  nodes: number
  depthReached: number
  /** The match is no longer seed-reproducible when true (AC-011). */
  valveTripped: boolean
}

export interface AiClient {
  /** Resolves with the move, or `null` if this request was cancelled. */
  request(state: GameState, difficulty: Difficulty, seed: number): Promise<AiMove | null>
  /** Abandons any in-flight search and stops it computing. */
  cancel(): void
  dispose(): void
}

export function createAiClient(options: AiClientOptions): AiClient {
  const nodeBudget = options.nodeBudget ?? PRODUCTION_NODE_BUDGET
  const valveMs = options.valveMs ?? VALVE_MS

  let worker: WorkerLike | null = null
  let nextRequestId = 1
  let pending: { id: number; resolve: (move: AiMove | null) => void } | null = null

  const spawn = (): WorkerLike => {
    const next = options.spawn()
    next.onmessage = (event) => {
      const reply = event.data
      // The stale-reply guard. Not redundant with termination: a reply can
      // already be in the message queue at the moment cancel() fires.
      if (!pending || reply.requestId !== pending.id) return
      const settle = pending.resolve
      pending = null
      if (reply.kind === 'error') {
        settle({ action: null, nodes: 0, depthReached: 0, valveTripped: false })
        return
      }
      settle({
        action: reply.action,
        nodes: reply.nodes,
        depthReached: reply.depthReached,
        valveTripped: reply.valveTripped,
      })
    }
    next.postMessage({ kind: 'init', source: options.source })
    return next
  }

  const ensure = (): WorkerLike => {
    if (!worker) worker = spawn()
    return worker
  }

  return {
    request(state, difficulty, seed) {
      // A second request supersedes the first rather than queueing behind it.
      // The player has moved on; the old answer is about a board that is gone.
      if (pending) this.cancel()
      const id = nextRequestId
      nextRequestId += 1

      return new Promise<AiMove | null>((resolve) => {
        pending = { id, resolve }
        ensure().postMessage({
          kind: 'search',
          requestId: id,
          state: { json: serializeState(state) },
          difficulty,
          seed,
          nodeBudget,
          valveMs,
        })
      })
    },

    cancel() {
      const settle = pending?.resolve
      const wasPending = pending !== null
      pending = null

      // Terminate ONLY when something was actually in flight.
      //
      // Terminate, not merely ignore, because an abandoned search would hold
      // the one worker until it finished on its own and the next request would
      // inherit that delay — satisfying the letter of "the cancelled action is
      // never applied" while breaking the responsiveness it protects.
      //
      // But `cancel()` is also reached on the ORDINARY path. React runs an
      // effect's cleanup whenever its dependencies change, and the AI's own
      // move changes `state` — so a successful turn calls cleanup, and an
      // unconditional terminate here killed the worker after every single ply.
      // The next turn then paid a worker start plus a full content re-send,
      // on the hot path, invisibly: Phase 5's response-time numbers were
      // measured against direct search calls and never saw it. ADR-009 says
      // respawn is "paid on the exceptional path only", and this is what makes
      // that true rather than aspirational.
      if (wasPending && worker) {
        worker.terminate()
        worker = null
      }
      settle?.(null)
    },

    dispose() {
      this.cancel()
    },
  }
}
