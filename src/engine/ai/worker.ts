import { createSession } from './engine-side'
import type { ToWorker } from './protocol'

/**
 * The worker entry point. Plumbing only — every decision lives in
 * `engine-side.ts`, which the tests import directly (ADR-002).
 *
 * Nothing here is worth testing through a worker, and that is the design: a
 * worker file with logic inside it can only be exercised by spinning one up,
 * which in practice means it gets tested differently from how it runs.
 */

const session = createSession()

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const reply = session.handle(event.data)
  if (reply) self.postMessage(reply)
}
