import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * PLAN Phase 1 exit criterion — ADR-021's token structure, asserted rather than
 * asserted-about.
 *
 * The load-bearing property is not "there is a tokens file" (trivially true the
 * moment one is created) but "no component stylesheet can express a colour on
 * its own". Once that holds, dark mode and any later re-skin are data changes,
 * which is the whole reason the ADR chose custom properties over a component
 * library. The colour scan therefore runs over every stylesheet EXCEPT the token
 * file, and a literal smuggled into a gradient or a shadow fails it the same way
 * a `background:` would.
 */

const UI_DIR = join(__dirname, '../../src/ui')
const TOKENS = 'tokens.css'

// #rgb / #rrggbb / #rrggbbaa, rgb(a)(), hsl(a)() — anything that names a colour
// without going through a custom property.
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/

function stylesheets(): Array<[string, string]> {
  return readdirSync(UI_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => [f, readFileSync(join(UI_DIR, f), 'utf8')])
}

describe('colour lives in tokens.css and nowhere else', () => {
  it('ships a token file', () => {
    expect(stylesheets().map(([f]) => f)).toContain(TOKENS)
  })

  it('has no literal colour in any component stylesheet', () => {
    const offenders = stylesheets()
      .filter(([file]) => file !== TOKENS)
      .flatMap(([file, css]) =>
        css
          .split('\n')
          .map((line, i) => [i + 1, line] as const)
          // A comment may legitimately mention a colour it no longer sets.
          .filter(([, line]) => !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
          .filter(([, line]) => LITERAL_COLOUR.test(line))
          .map(([n, line]) => `${file}:${n}  ${line.trim()}`),
      )
    expect(offenders).toEqual([])
  })

  it('defines its tokens as custom properties on :root', () => {
    const css = readFileSync(join(UI_DIR, TOKENS), 'utf8')
    expect(css).toMatch(/:root\s*\{/)
    const declared = [...css.matchAll(/--[a-z0-9-]+\s*:/g)].map((m) => m[0])
    expect(declared.length).toBeGreaterThanOrEqual(12)
  })
})

describe('the palette is single-theme, and says so to the browser', () => {
  const css = () => readFileSync(join(UI_DIR, TOKENS), 'utf8')

  /*
   * This used to assert the opposite — three cascade layers, with an explicit
   * `data-theme` able to beat the OS in both directions. Chess Craft is one dark
   * pixel palette: the bevels ARE the shape of every control and there is no
   * light-theme value for "the lit edge of a raised block". The tests that
   * guarded the old structure are replaced rather than deleted, because the
   * failure they were really protecting against — a half-declared theme — is
   * still reachable, just in the other direction.
   */

  it('declares the scheme, so the browser does not paint chrome light', () => {
    // Without this the scrollbar, the overscroll gutter and every native form
    // control render light around a dark app. It is one line and it is the whole
    // reason a single-theme app does not look broken at the edges.
    expect(css()).toMatch(/color-scheme:\s*dark/)
  })

  it('declares no second theme, in either direction', () => {
    // A half-migrated re-skin leaves one `@media (prefers-color-scheme)` block
    // or one stray `[data-theme]` behind, and it wins over `:root` for whoever
    // happens to match it — so a subset of players get a palette nobody
    // maintains. Either the app is single-theme or it is not.
    expect(css()).not.toMatch(/prefers-color-scheme/)
    expect(css()).not.toMatch(/\[data-theme/)
  })

  it('bundles its font instead of fetching one', () => {
    // The design prototype loads Galmuri from a CDN. This app is installable and
    // has to work with the network gone; an `@font-face` on an external origin
    // is precached by nothing and fails silently offline, leaving a pixel-block
    // UI rendered in the system face.
    expect(css()).toMatch(/@font-face/)
    const external = [...css().matchAll(/url\(([^)]*)\)/g)].map((m) => m[1] ?? '')
    expect(external.filter((u) => /^['"]?https?:/.test(u))).toEqual([])
  })
})
