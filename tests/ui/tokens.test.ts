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

describe('dark mode is reachable both ways', () => {
  const css = () => readFileSync(join(UI_DIR, TOKENS), 'utf8')

  it('follows the OS preference', () => {
    expect(css()).toMatch(/@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)/)
  })

  it('lets an explicit data-theme override the OS in BOTH directions', () => {
    // Only honouring data-theme="dark" leaves a user on a dark OS unable to
    // choose light — the override has to work against the preference, not only
    // alongside it.
    expect(css()).toMatch(/:root\[data-theme=['"]?dark['"]?\]/)
    expect(css()).toMatch(/:root\[data-theme=['"]?light['"]?\]/)
  })
})
