import { type ContentSet, loadContentSet } from '@content/load'
import { deserializeState } from '../engine'
import { chooseWithDetail } from './difficulty'
import type { FromWorker, SearchRequest, ToWorker } from './protocol'

/**
 * Everything the worker does, with no `self`, no `postMessage`, no DOM.
 *
 * `worker.ts` is four lines of plumbing around this, and that split is ADR-002:
 * the tests import THIS, the browser imports the wrapper, and there is exactly
 * one implementation between them. A worker file with logic inside it can only
 * be tested through a worker, which in practice means it is tested differently
 * from how it runs — one vocabulary, two code paths.
 */

export interface Session {
  handle(message: ToWorker): FromWorker | null
}

/**
 * The wall-clock valve of ADR-010, as a deadline the search consults.
 *
 * It is NOT the budget. The budget is nodes, because that is what makes a
 * seeded match replay identically on any machine (ADR-003). This is the
 * backstop for content that passed the complexity envelope and is still slow —
 * and when it fires, the reply says so, because a search that silently
 * degrades is worse than one that admits it.
 */
function runSearch(content: ContentSet, request: SearchRequest): FromWorker {
  const state = deserializeState(request.state.json)

  // A real deadline, not a stopwatch read afterwards.
  //
  // The first version measured elapsed time AFTER the search finished and set
  // `valveTripped` from it — which made the valve a label rather than a
  // backstop, and left ADR-010's rejected alternative ("accept the risk — the
  // AI can hang the tab on legal content") quietly in force for the AI's own
  // turn. A review caught the gap between the comment and the ADR.
  //
  // Determinism survives because the deadline is OPT-IN at the search's edge:
  // with no deadline the clock is never read, which is the mode every test and
  // every replay runs in. When the deadline does fire the match stops being
  // reproducible from its seed, and that is exactly what AC-011 says happens —
  // the reply carries `valveTripped` so the UI can say so.
  const detail = chooseWithDetail(state, content, {
    difficulty: request.difficulty,
    seed: request.seed,
    nodeBudget: request.nodeBudget,
    deadline: Date.now() + request.valveMs,
  })

  return {
    kind: 'result',
    requestId: request.requestId,
    action: detail.action,
    nodes: detail.nodes,
    depthReached: detail.depthReached,
    valveTripped: detail.valveTripped,
  }
}

/** A worker session: one content set, then any number of searches. */
export function createSession(): Session {
  let content: ContentSet | null = null

  return {
    handle(message: ToWorker): FromWorker | null {
      if (message.kind === 'init') {
        const result = loadContentSet(message.source)
        // A worker that failed to load content would answer every later request
        // with the same opaque error; failing here at least names the cause
        // once, at the moment it is knowable.
        content = result.ok ? result.set : null
        return null
      }

      if (!content) {
        return { kind: 'error', requestId: message.requestId, message: 'worker has no content set' }
      }

      try {
        return runSearch(content, message)
      } catch (error) {
        return {
          kind: 'error',
          requestId: message.requestId,
          message: error instanceof Error ? error.message : String(error),
        }
      }
    },
  }
}
