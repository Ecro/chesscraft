import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The e2e suite's warm-up, asserted because its absence is invisible.
 *
 * `npm run dev` transforms modules on demand. Playwright starts it, then starts
 * every worker at once, and N browsers request the whole module graph from a
 * Vite that has compiled nothing yet. The first requests queue behind that
 * work, and a spec unlucky enough to be first waits past its budget for an
 * element that is late rather than missing. That produced one or two failures
 * per full run, a different pair each time, always at a navigation click — and
 * every one of them passed in isolation, which is what made it read as a
 * mystery rather than as a cause.
 *
 * `e2e/global-setup.ts` removes it by pulling the graph through Vite once
 * before any worker starts. Three consecutive full runs at the default worker
 * count went green afterwards, at 5.5-5.8 minutes — faster than the
 * `--workers=4` workaround it replaced.
 *
 * Why this file exists: the warm-up is deliberately NOT a gate. It catches
 * every error and warns, because a warm-up that could fail would turn a slow
 * first request into a red suite. That is the right call and it has a cost —
 * deleting the `globalSetup` line, or renaming the file it points at, brings
 * the flake back with nothing failing to say so. The suite would simply become
 * unreliable again, and the next reader would be told it always had been.
 *
 * Text assertions, not a Playwright run: this must fail in the unit suite, in
 * under a second, without starting a browser.
 */

const ROOT = join(__dirname, '../..')
const CONFIG = join(ROOT, 'playwright.config.ts')
const SETUP = join(ROOT, 'e2e/global-setup.ts')

describe('the e2e suite pre-warms the dev server', () => {
  it('wires a globalSetup, and the file it names exists', () => {
    const config = readFileSync(CONFIG, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = config.match(/globalSetup\s*:\s*'([^']+)'/)
    expect(declared, 'playwright.config.ts must declare a globalSetup').not.toBeNull()

    // Resolved from the declared path rather than from a constant, so a rename
    // that updates one side and not the other fails here instead of at 3am.
    const target = join(ROOT, declared![1]!)
    expect(existsSync(target), `globalSetup points at ${declared![1]} which does not exist`).toBe(true)
  })

  it('loads the app in a browser rather than fetching a URL', () => {
    /*
     * The distinction is the whole point of the warm-up. Requesting `/` returns
     * `index.html` and compiles nothing — the module graph is pulled by the
     * browser's module loader, one import at a time. A future simplification to
     * `fetch(baseURL)` would look equivalent, run faster, and warm nothing.
     */
    const setup = readFileSync(SETUP, 'utf8')
    expect(setup, 'the warm-up must drive a real browser').toMatch(/chromium\.launch\(/)
    expect(setup, 'and must wait for a rendered control, not just navigation').toMatch(/waitFor\(/)
  })

  it('never fails the run', () => {
    /*
     * A warm-up that can go red is worse than the flake it replaces. Pinned
     * because "wrap it in try/catch" is exactly the kind of defensive shape a
     * later tidy-up removes as noise.
     */
    const setup = readFileSync(SETUP, 'utf8')
    expect(setup, 'the warm-up must catch its own errors').toMatch(/catch\s*\(/)
    expect(setup, 'and report them rather than throwing').toMatch(/console\.warn/)
    expect(setup, 'a rethrow would make it a gate').not.toMatch(/throw\s+(error|err|e)\b/)
  })
})
