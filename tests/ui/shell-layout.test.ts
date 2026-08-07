import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PLAN Phase 6b — the safe-area half of the exit criterion (#32).
 *
 * The criterion is worded to exclude the cheap version on purpose: "the shell
 * CONSUMES `env(safe-area-inset-*)` rather than merely declaring
 * `viewport-fit=cover`". `index.html` has declared `viewport-fit=cover` since
 * the scaffold, and that declaration alone does the opposite of what it looks
 * like — it opts the page INTO drawing under the notch and the home indicator
 * without moving any content out from under them.
 *
 * The trap this file has to avoid is its own: `env(safe-area-inset-bottom)`
 * already appears in `styles.css`, on the draft sheet added in the previous
 * phase. A test that scanned the whole stylesheet for that string would have
 * been green before a line of this phase was written — `[fail:test]
 * assertion-equals-its-own-default`, recorded in this repo. So the assertions
 * below are scoped to the SHELL's own rule and check all four edges.
 */

const CSS = () => readFileSync(join(__dirname, '../../src/ui/styles.css'), 'utf8')
const HTML = () => readFileSync(join(__dirname, '../../index.html'), 'utf8')

/** The declaration block of a top-level rule, by exact selector. */
function ruleBody(css: string, selector: string): string {
  const re = new RegExp(`(^|\\n)${selector.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*\\{([^}]*)\\}`)
  const m = re.exec(css)
  return m?.[2] ?? ''
}

describe('the app shell keeps its content out from under the notch (#32)', () => {
  it('still opts into drawing edge to edge', () => {
    // Not the deliverable — the precondition. Without it the insets are all 0
    // and every assertion below would pass while doing nothing.
    expect(HTML()).toMatch(/viewport-fit\s*=\s*cover/)
  })

  it('consumes every inset on the shell, not just the one a sheet needed', () => {
    const body = ruleBody(CSS(), 'main')
    expect(body, '`main` must have a rule of its own').not.toBe('')
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      expect(body, `main must consume safe-area-inset-${edge}`).toContain(`safe-area-inset-${edge}`)
    }
  })

  it('keeps a fallback so a browser without the env() still gets padding', () => {
    // `env(x)` with no second argument resolves to 0 where unsupported, which
    // would silently remove the padding the shell had before this phase.
    const body = ruleBody(CSS(), 'main')
    const uses = [...body.matchAll(/env\(safe-area-inset-[a-z]+([^)]*)\)/g)]
    expect(uses.length).toBeGreaterThanOrEqual(4)
    for (const [whole, args] of uses) {
      expect(args, `${whole} needs a fallback value`).toMatch(/,\s*\S/)
    }
  })
})

/**
 * Two rules the editor's scrolling turned out to depend on, both found by
 * scrolling the editor and finding that it would not.
 */
describe('the phone shell bounds its content', () => {
  it('gives `main` a height, not only a minimum', () => {
    // `.phone` is `flex: 1 1 auto`, and a flex item only SHRINKS against a
    // parent that has a height. With `min-height` alone the shell grew to fit
    // the editor's 4,700px of forms, its `overflow: hidden` clipped nothing,
    // and every inner scroller had an unbounded parent to grow inside instead.
    const body = ruleBody(CSS(), 'main')
    expect(body).toMatch(/(^|\s|;)height:\s*100dvh/)
  })

  it('lets each screen decide whether it scrolls', () => {
    // `.phone > section { overflow: hidden }` outranks a bare `.editor` or
    // `.home`, so one declaration silently won over every screen that had asked
    // to scroll. The match screen clips itself; nothing above it may do so on
    // its behalf.
    expect(ruleBody(CSS(), '.phone > section')).not.toMatch(/overflow/)
  })

  it('never overrides `display` on a panel the editor has hidden', () => {
    /*
     * `Edit` keeps both panels mounted and marks the inactive one `hidden` —
     * that is what lets a half-assembled room survive a trip to the library, and
     * what the ADR-006 vocabulary gate relies on to drive controls the child has
     * not opened. A `display` on the panel selector outranks the UA's
     * `[hidden] { display: none }` and undoes all of it silently: the library
     * renders underneath the rooms panel and the editor doubles in height.
     */
    const css = CSS().replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|\})([^{}]*\.editor\s*>\s*div[^{}]*)\{([^}]*)\}/g)]
    expect(selectors.length, 'no rule targets the editor panels — has the selector moved?').toBeGreaterThan(0)
    for (const [, , selector, block] of selectors) {
      if (!/display\s*:/.test(block ?? '')) continue
      expect(selector, `${selector!.trim()} sets display without excluding [hidden]`).toMatch(/:not\(\[hidden\]\)/)
    }
  })
})
