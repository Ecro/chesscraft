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
const MAIN = () => readFileSync(join(__dirname, '../../src/main.tsx'), 'utf8')
const DESKTOP = () => readFileSync(join(__dirname, '../../src/ui/desktop.css'), 'utf8')

/**
 * The desktop layer's load order and its reach (ADR-006, ADR-008).
 *
 * Both claims here are structural and neither is visible in a browser until the exact
 * viewport that breaks them. The layer wins ties by coming last in `main.tsx`, so a
 * reordered import — the kind of edit that looks like tidying — silently drops every
 * desktop rule that shares specificity with the one it overrides, at one width, on one
 * kind of screen nobody in the room is using.
 *
 * The height floor is the other half. `[fail:design] condition-narrower-than-its-case` is
 * recorded in this repo for a desktop layout whose query was too NARROW to ever match; the
 * mirror mistake is a query too broad, and there is a concrete viewport that catches it —
 * a 915x412 landscape phone satisfies `min-width: 1280px`'s smaller sibling and would take
 * the desktop layout on a handset held sideways. `e2e/layout.spec.ts` pins the rendered
 * consequence; this pins the rule, because a media query with no floor is wrong before
 * anyone renders it.
 */
describe('the desktop layer (ADR-006, ADR-008)', () => {
  it('loads after the base sheet, so its rules win ties', () => {
    const order = MAIN()
    const styles = order.indexOf("@ui/styles.css")
    const desktop = order.indexOf("@ui/desktop.css")

    expect(styles, 'main.tsx does not import styles.css').toBeGreaterThan(-1)
    expect(desktop, 'main.tsx does not import desktop.css').toBeGreaterThan(-1)
    expect(desktop, 'desktop.css is imported before styles.css — its overrides lose ties').toBeGreaterThan(styles)
  })

  it('is one viewport query, floored on height as well as width', () => {
    /*
     * One query that can REACH a viewport, not one query full stop.
     *
     * ADR-008's "one media query" is about auditability of reach: the point is that
     * "which screens does the desktop layer apply to?" has a single answer visible in one
     * place. A nested capability query — `@media (hover: hover)` around the pointer
     * affordances — cannot widen that reach, only narrow it inside the band, so counting
     * it as a violation would forbid the correct way to write a hover rule. What must stay
     * unique is a query carrying a viewport DIMENSION, since that is the only kind that
     * can claim screens the band did not.
     */
    const queries = DESKTOP().match(/@media[^{]+/g) ?? []
    const dimensional = queries.filter((q) => /width|height|aspect-ratio|orientation/.test(q))

    expect(
      dimensional.length,
      `desktop.css has ${dimensional.length} viewport-dimension queries; ADR-008 says one: ${dimensional.join(' | ')}`,
    ).toBe(1)
    expect(queries[0], 'the band is not the outermost query').toBe(dimensional[0])
    expect(queries[0]).toMatch(/min-width:\s*1280px/)
    /*
     * A floor, and a floor low enough. Both directions have a real viewport behind them:
     * without any floor a short window takes a two-column layout with no room for it;
     * with the frame band's 700px the desktop band misses a maximized browser on a
     * 1366x768 laptop (~630px of viewport height), which is what the deleted
     * `min-width: 900px` block had been covering.
     */
    const floor = Number(/min-height:\s*(\d+)px/.exec(queries[0]!)?.[1])
    expect(floor, 'no height floor — a short window would take the desktop layout').toBeGreaterThan(0)
    expect(floor, `height floor ${floor}px excludes a maximized 1366x768 laptop`).toBeLessThanOrEqual(600)
    expect(floor, `height floor ${floor}px would admit a landscape phone`).toBeGreaterThan(412)
  })

  it('leaves no viewport between the phone frame and the desktop shell', () => {
    /*
     * The absent case, and the reason the 900px block was deleted rather than narrowed.
     * The frame band must end exactly where the desktop band begins: a gap means a range
     * of widths nobody designed, which is what 900-1280 already was, and an overlap means
     * two layouts fighting over the same screen.
     */
    const frame = (CSS().match(/@media[^{]*min-width:\s*480px[^{]*/) ?? [''])[0]

    expect(frame, 'the 480px frame band is gone').toContain('min-width: 480px')
    /*
     * The complement, not an epsilon. `max-width: 1279.98px` against `min-width: 1280px`
     * leaves (1279.98, 1280) matching neither band — viewport widths are fractional — and
     * a viewport in that sliver falls through to the base rules, i.e. an unframed 390px
     * column on a wide window. No integer-width e2e can reach it, so the assertion has to
     * be about the FORM of the bound rather than about a rendered result.
     */
    expect(frame, 'the frame band has no upper bound — it would overlap the desktop band').toMatch(/not\s*\(\s*min-width/)
    expect(frame, 'an epsilon bound leaves a fractional-width gap; use the desktop band’s complement').not.toMatch(
      /max-width:\s*127[0-9]/,
    )
    expect(CSS(), 'the ambiguous 900px band is still here').not.toMatch(/@media[^{]*min-width:\s*900px/)
  })
})

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
