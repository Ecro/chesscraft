import type { WorkerLike } from './client'

/**
 * The browser's worker factory (ADR-002).
 *
 * **The shape of the call below is load-bearing, not stylistic.** Vite only
 * detects a worker when `new URL()` appears *directly inside* the `new Worker()`
 * expression and every option is a static literal. Hoist the URL into a
 * variable, or compute `{ type }`, and the build silently stops emitting a
 * chunk — it falls back to fetching the module at runtime instead. That still
 * works in development and in a served build, so the failure surfaces only
 * offline, where the service worker has nothing to serve because
 * `vite-plugin-sw` precaches emitted assets and this was never one.
 *
 * `tests/build/ai-worker-precache.test.ts` asserts the emitted chunk is in the
 * precache list, so the silent version of this failure cannot ship.
 */
export function spawnSearchWorker(): WorkerLike {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
}
