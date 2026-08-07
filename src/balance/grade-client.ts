import type { ContentSource } from '@content/load'
import type { CachedGrade, GradeCache } from './cache'
import type { Baseline, Candidate } from './measure'
import type { GradeReply, GradeRequest } from './worker'

/**
 * The main thread's half of the grade measurement (ADR-005).
 *
 * A save returns immediately with the predictor's provisional grade; this starts
 * the real measurement in a worker and resolves when the confirmed grade lands.
 * The split exists because a confirmed grade is ~1200 self-play matches — a few
 * seconds on a phone — and blocking a child's save on it is not a trade anyone
 * would take.
 *
 * The `new URL(..., import.meta.url)` form is what makes the bundler emit the
 * worker as its own chunk. Constructing it from a string path would build
 * cleanly and fail at runtime in production only, which is the failure shape
 * worth spending a line of syntax to avoid.
 */

export interface GradeClient {
  measure(source: ContentSource, baseline: Baseline, contentId: string, candidate: Candidate): Promise<GradeReply>
  dispose(): void
}

let nextRequestId = 0

export function createGradeClient(): GradeClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<string, (reply: GradeReply) => void>()

  worker.onmessage = (event: MessageEvent<GradeReply>) => {
    const resolve = pending.get(event.data.requestId)
    if (!resolve) return
    pending.delete(event.data.requestId)
    resolve(event.data)
  }

  return {
    measure(source, baseline, contentId, candidate) {
      void contentId
      const requestId = `grade-${(nextRequestId += 1)}`
      const request: GradeRequest = { requestId, source, baseline, candidate }
      return new Promise<GradeReply>((resolve) => {
        pending.set(requestId, resolve)
        worker.postMessage(request)
      })
    },
    dispose() {
      // Pending promises are abandoned rather than rejected: the only caller is
      // a component unmounting, and a rejection there is an unhandled one.
      pending.clear()
      worker.terminate()
    },
  }
}

/**
 * Runs a measurement and writes the result into the cache under the record's key.
 *
 * A failed measurement writes NOTHING. An unmeasurable record has to stay
 * unmeasured, because `checkLoadoutGrades` refuses an ungraded record and would
 * wave through a record cached as zero — which is precisely the case where the
 * measurement gave up.
 */
export async function measureIntoCache(
  client: GradeClient,
  cache: GradeCache,
  source: ContentSource,
  baseline: Baseline,
  contentId: string,
  candidate: Candidate,
  key: string,
): Promise<CachedGrade | null> {
  const reply = await client.measure(source, baseline, contentId, candidate)
  if (!reply.ok) return null
  const grade: CachedGrade = { contentId, ...reply.measurement }
  cache.write(key, grade)
  return grade
}
