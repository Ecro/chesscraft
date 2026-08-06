/**
 * Service-worker registration and update detection (PLAN Phase 7).
 *
 * The detection rule is a pure function on purpose. Its whole difficulty is a
 * state machine that a browser drives and a test cannot easily reproduce, and
 * an e2e that fakes the machine badly rewards the WRONG implementation: fire a
 * bare `updatefound` and an app that prompts on any such event passes, while an
 * app that correctly waits for a worker to reach `installed` does nothing and
 * fails. So the rule lives here, where its transitions are asserted directly,
 * and the e2e is left to check the two things only a browser can show — that
 * the prompt appears, and that the page does not reload itself.
 */

/**
 * Whether a worker reaching a given state means a NEW build is waiting.
 *
 * `hasController` is the load-bearing half and the easy thing to omit. A worker
 * reaches `installed` on a FIRST visit too — that is the initial install, when
 * there is nothing to update from and no controller yet. An implementation that
 * only checked the state would show "a new version is ready" to every first-time
 * visitor, which is the same nag-on-every-check defect from the other end.
 */
export function isUpdateWaiting(workerState: string, hasController: boolean): boolean {
  return workerState === 'installed' && hasController
}

/** What the app does when an update is found. Injected so tests need no globals. */
export type OnUpdate = () => void

/**
 * Wires registration and update detection.
 *
 * Takes the container rather than reading `navigator` so the wiring is callable
 * with a stub. Returns `null` when service workers are unavailable — an older
 * browser or an insecure context — rather than throwing: the app works without
 * one, it just does not work offline.
 */
export async function registerServiceWorker(
  container: ServiceWorkerContainer | undefined,
  onUpdate: OnUpdate,
  url = '/sw.js',
): Promise<ServiceWorkerRegistration | null> {
  if (!container) return null
  let registration: ServiceWorkerRegistration
  try {
    registration = await container.register(url)
  } catch {
    // A failed registration must not take the app down with it.
    return null
  }

  const watch = (worker: ServiceWorker | null) => {
    if (!worker) return
    const check = () => {
      if (isUpdateWaiting(worker.state, container.controller != null)) onUpdate()
    }
    worker.addEventListener('statechange', check)
    // A worker can already be `installed` by the time we attach — the event
    // would then never fire and the prompt would never appear.
    check()
  }

  registration.addEventListener('updatefound', () => watch(registration.installing))
  // And one may be waiting from before this page loaded.
  watch(registration.waiting)

  return registration
}

/**
 * Takes the waiting worker: tell it to activate, then reload ONCE it controls
 * the page. Reloading before that serves the old bundle again.
 */
export function applyUpdate(registration: ServiceWorkerRegistration | null, container?: ServiceWorkerContainer): void {
  const waiting = registration?.waiting
  if (!waiting) {
    location.reload()
    return
  }
  const reloadOnce = () => location.reload()
  // ORDER IS LOAD-BEARING: listen first, then ask. `controllerchange` can fire
  // synchronously off the new worker taking over, so attaching afterwards can
  // miss it entirely — and the visible result is a button that does nothing,
  // forever. A test cannot see this ordering (it dispatches the event by hand,
  // after the call returns), so the comment is the guard.
  container?.addEventListener('controllerchange', reloadOnce, { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}
