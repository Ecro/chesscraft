import type { ContentSource } from '@content/load'
import type { Difficulty } from './difficulty'
import type { Action, GameState } from '../types'

/**
 * The wire between the main thread and the search worker (ADR-002).
 *
 * Its own module because both sides import it and neither should import the
 * other: `worker.ts` must not pull the DOM-facing client into the worker
 * bundle, and `client.ts` must not pull the search into the main chunk.
 *
 * The content set is sent ONCE, at init, as its source document rather than as
 * a loaded `ContentSet`. Two reasons, and the second is the load-bearing one:
 * the source is plain JSON while a loaded set is a graph of `Map`s, and sending
 * it per request would clone the whole authored corpus on every AI turn.
 */

export interface InitMessage {
  kind: 'init'
  source: ContentSource
}

export interface SearchRequest {
  kind: 'search'
  /** Monotonic. A reply carrying a stale id is dropped (ADR-009). */
  requestId: number
  state: SerializedState
  difficulty: Difficulty
  seed: number
  nodeBudget: number
  /** The wall-clock backstop of ADR-010, in milliseconds. */
  valveMs: number
}

export type ToWorker = InitMessage | SearchRequest

export interface SearchReply {
  kind: 'result'
  requestId: number
  action: Action | null
  nodes: number
  depthReached: number
  /**
   * True when the wall-clock valve fired before the node budget was spent.
   *
   * The match is no longer reproducible from its seed when this is set, and the
   * UI says so (AC-011). Reporting it is the whole point: a silently degraded
   * search that still returns a legal move is indistinguishable from a healthy
   * one, and the determinism AC-003 promises would quietly stop being true.
   */
  valveTripped: boolean
}

export interface ErrorReply {
  kind: 'error'
  requestId: number
  message: string
}

export type FromWorker = SearchReply | ErrorReply

/**
 * `GameState` over the wire.
 *
 * `board` is a `Map`, which structured clone handles — but the engine already
 * owns a serializer for exactly this, and using it keeps one definition of what
 * a transmitted state is instead of two that drift.
 */
export interface SerializedState {
  json: string
}
