import { loadContentSet } from '@content/load'
import { type GradeJob, runGradeJob } from './cache'
import type { MeasureOutcome } from './measure'

/**
 * The Web Worker that measures a grade off the main thread (ADR-005).
 *
 * A shell, deliberately. Every decision lives in `runGradeJob`, which is a plain
 * function with its own tests — a worker is the one place where "it exists and
 * nothing exercises it" is easiest to ship, because the harness that would catch
 * it needs a browser. So this file marshals messages and does nothing else.
 *
 * It receives the content DOCUMENT rather than a loaded `ContentSet`: `Map`s do
 * survive structured clone, but re-validating here means the worker can never be
 * handed a set the main thread built by some other path, and it costs one
 * `loadContentSet` against a document the main thread has already validated.
 */

export interface GradeRequest extends GradeJob {
  /** Correlates the reply, since several records can be in flight at once. */
  requestId: string
  /** An unvalidated content document — the same shape `loadContentSet` takes. */
  source: unknown
}

export type GradeReply = { requestId: string } & MeasureOutcome

export function handleGradeRequest(request: GradeRequest): GradeReply {
  const loaded = loadContentSet(request.source)
  if (!loaded.ok) {
    return { requestId: request.requestId, ok: false, reason: `content did not validate: ${loaded.errors[0]?.message ?? 'unknown'}` }
  }
  return { requestId: request.requestId, ...runGradeJob(loaded.set, request) }
}

// `self` is absent when this module is imported by a test or by the main thread
// for its types; guarding means the file is importable everywhere rather than
// throwing on load in the one environment that has no worker scope.
if (typeof self !== 'undefined' && 'onmessage' in self) {
  self.onmessage = (event: MessageEvent<GradeRequest>) => {
    self.postMessage(handleGradeRequest(event.data))
  }
}
