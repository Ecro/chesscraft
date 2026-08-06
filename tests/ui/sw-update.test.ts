import { describe, expect, it, vi } from 'vitest'
import { applyUpdate, isUpdateWaiting, registerServiceWorker } from '../../src/ui/sw-update'

/**
 * PLAN Phase 7 — the update-detection state machine, asserted where it can be.
 *
 * The e2e can show that a prompt appeared and that the page did not reload
 * itself. It cannot cheaply drive a worker through `installing → installed`
 * with and without a controller, which is where every wrong version of this
 * lives — and an e2e that fakes the machine loosely rewards the wrong one. So
 * the branch table is here.
 */

describe('what counts as an update waiting', () => {
  it('is a worker that finished installing while another already controls the page', () => {
    expect(isUpdateWaiting('installed', true)).toBe(true)
  })

  it('is NOT the first install, which also reaches `installed`', () => {
    // The negative that matters. A first visit installs a worker and it reaches
    // exactly the same state; there is no controller yet because nothing was
    // there to control. An implementation that checked only the state would
    // greet every new visitor with "a new version is ready".
    expect(isUpdateWaiting('installed', false)).toBe(false)
  })

  it('is not any earlier or later state', () => {
    for (const state of ['installing', 'activating', 'activated', 'redundant', 'parsed']) {
      expect(isUpdateWaiting(state, true), state).toBe(false)
    }
  })
})

/** The minimum of `ServiceWorker` the wiring touches, driveable by hand. */
function fakeWorker(state: string) {
  const target = new EventTarget() as EventTarget & { state: string }
  target.state = state
  return target
}

function fakeContainer(controller: unknown) {
  const registration = new EventTarget() as EventTarget & {
    installing: unknown
    waiting: unknown
  }
  registration.installing = null
  registration.waiting = null
  const container = {
    controller,
    register: vi.fn(async () => registration),
    addEventListener: vi.fn(),
  }
  return { container: container as unknown as ServiceWorkerContainer, registration, spy: container.register }
}

describe('registration wiring', () => {
  it('announces once the found worker reaches installed', async () => {
    const onUpdate = vi.fn()
    const { container, registration } = fakeContainer({})
    await registerServiceWorker(container, onUpdate)

    const worker = fakeWorker('installing')
    registration.installing = worker
    registration.dispatchEvent(new Event('updatefound'))
    expect(onUpdate, 'announced while still installing').not.toHaveBeenCalled()

    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('says nothing on a first install', async () => {
    const onUpdate = vi.fn()
    // No controller — nothing was there before this worker.
    const { container, registration } = fakeContainer(null)
    await registerServiceWorker(container, onUpdate)

    const worker = fakeWorker('installing')
    registration.installing = worker
    registration.dispatchEvent(new Event('updatefound'))
    worker.state = 'installed'
    worker.dispatchEvent(new Event('statechange'))

    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('catches a worker that was already waiting before the page loaded', async () => {
    const onUpdate = vi.fn()
    const { container, registration } = fakeContainer({})
    registration.waiting = fakeWorker('installed')
    await registerServiceWorker(container, onUpdate)
    // No event fires in this case — the state was reached before we attached,
    // so a listener-only implementation would never announce it.
    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('returns null rather than throwing when there is no service-worker support', async () => {
    expect(await registerServiceWorker(undefined, vi.fn())).toBeNull()
  })

  it('returns null when registration itself fails', async () => {
    const container = { controller: null, register: vi.fn(async () => Promise.reject(new Error('nope'))) }
    expect(await registerServiceWorker(container as unknown as ServiceWorkerContainer, vi.fn())).toBeNull()
  })
})


describe('taking the update', () => {
  /**
   * The gating is the whole point of `applyUpdate`, and every wrong version of
   * it passes a test that only checks the button exists: reload immediately and
   * the browser serves the OLD bundle again (the new worker has not taken over
   * yet), so the player clicks "update", loses the match they were in, and gets
   * the same version back. Reload never and the button does nothing.
   */
  function fakeRegistration(waiting: unknown) {
    const container = new EventTarget() as unknown as ServiceWorkerContainer
    return { registration: { waiting } as unknown as ServiceWorkerRegistration, container }
  }

  it('asks the waiting worker to take over, and does NOT reload until it has', () => {
    const reload = vi.fn()
    const postMessage = vi.fn()
    const { registration, container } = fakeRegistration({ postMessage })
    vi.stubGlobal('location', { reload })

    applyUpdate(registration, container)
    expect(postMessage, 'never asked the waiting worker to activate').toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload, 'reloaded before the new worker controlled the page — serves the old bundle').not.toHaveBeenCalled()

    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)

    // `once` — a second controllerchange must not reload again.
    container.dispatchEvent(new Event('controllerchange'))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('reloads straight away when there is nothing waiting', () => {
    // Nothing to hand over to, so waiting for a handover would hang forever and
    // the button would read as broken.
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })
    applyUpdate(null)
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })
})
