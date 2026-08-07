import { beforeEach } from 'vitest'

/**
 * Puts the URL back to `/` before every test.
 *
 * `App` reads `window.location.pathname` to decide which screen opens (ADR-003), and jsdom
 * keeps one `window` for a whole test FILE. So a test that drives the app to the board
 * leaves `/play` in the address bar, and the next test in the same file renders a fresh
 * `<App />` that dutifully opens on the board — with no navigation anywhere in its own body
 * to explain why. That is how it first appeared: `strings-overlay.test.tsx` looked for the
 * home screen's room card and got a match, in a test that had done nothing but render.
 *
 * Registered globally through `vitest.config.ts` rather than imported per file. The
 * alternative — a `beforeEach` in each file that happens to render `App` — is correct in
 * every file where someone remembers it, and silently wrong in the next one added. A
 * cross-test leak is exactly the kind of thing whose absence must be structural.
 *
 * Harmless in the `node` environment, where there is no `window` to reset.
 */
beforeEach(() => {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', '/')
})
