import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The `dvh` fallbacks survive minification.
 *
 * Asserted over the BUILT stylesheet, never over `src/ui/styles.css`, and the whole
 * value of this file is that distinction. The source can carry a perfectly correct
 * fallback and the app still ship without one, because what decides the answer is the
 * minifier — and this build has already done it once.
 *
 * The bug it guards: `main` was `height: 100dvh` with no fallback, so a browser
 * lacking the unit dropped the declaration, `main` grew to its content, its
 * `overflow: hidden` clipped nothing, and the document scrolled — the tab bar sat
 * below the fold and three of the app's destinations could only be reached by
 * scrolling the page. It was reported from an installed Android app.
 *
 * The fix everyone writes first is `height: 100vh; height: 100dvh` in one rule.
 * esbuild drops the earlier duplicate. That version reviewed clean, tested green at
 * the source level, and shipped a `dist/` with the `vh` line simply absent — the fix
 * was a no-op for exactly the browsers it was written for, and nothing said so. Hence
 * an `@supports` block, which a minifier cannot merge across, and hence this file.
 */

const DIST = join(process.cwd(), 'dist', 'assets')

/** The bundle's stylesheet, whatever this build hashed it to. */
function builtCss(): string {
  expect(
    existsSync(DIST),
    'dist/assets is missing — run `npm run build` first (npm run verify does)',
  ).toBe(true)

  const sheets = readdirSync(DIST).filter((f) => f.endsWith('.css'))
  expect(sheets.length, `expected exactly one built stylesheet, found ${sheets.length}: ${sheets.join(', ')}`).toBe(1)
  return readFileSync(join(DIST, sheets[0]!), 'utf8')
}

describe('the shipped stylesheet keeps its dvh fallbacks', () => {
  it('gives `main` a height on a browser that has never heard of dvh', () => {
    const css = builtCss()
    /*
     * Read from the UNGUARDED cascade — every `@supports` block removed — because that
     * is precisely what a browser without `dvh` sees. A `100vh` that only exists inside
     * the guard is not a fallback; it is the thing being guarded.
     */
    const unguarded = css.replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    const shell = /(?:^|[},])main\{([^}]*)\}/.exec(unguarded)?.[1] ?? ''

    expect(shell, 'no unguarded `main` rule survived the build').not.toBe('')
    expect(shell, `the shipped \`main\` has no dvh-free height: {${shell}}`).toMatch(/(^|;)height:[^;]*\d+vh/)
    expect(shell, 'a browser without dvh would take an unbounded shell and scroll the document').not.toMatch(
      /(^|;)height:[^;]*\d+dvh/,
    )
  })

  it('still upgrades to dvh where the unit exists', () => {
    // The other direction. A fallback that quietly replaced `dvh` everywhere would
    // pass the test above and regress every modern phone, where `vh` ignores the URL
    // bar and the app's bottom edge goes under it.
    expect(builtCss(), 'the dvh upgrade is gone from the build').toMatch(/@supports[^{]*\d+dvh[^{]*\{/)
  })

  it('keeps the board sized off the shorter axis without dvh', () => {
    /*
     * Same failure, different symptom. `.board-frame` is `width: min(100%, 100dvh -
     * 200px)`, and a dropped declaration there does not shrink the board — it removes
     * the cap, so the board takes the full container width and its bottom ranks go off
     * the screen. That is #33's exact criterion failing on a browser, not a viewport.
     */
    const unguarded = builtCss().replace(/@supports[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
    const frame = /(?:^|[},])\.board-frame\{([^}]*)\}/.exec(unguarded)?.[1] ?? ''

    expect(frame, 'no unguarded `.board-frame` rule survived the build').not.toBe('')
    expect(frame, `the shipped \`.board-frame\` has no dvh-free width: {${frame}}`).toMatch(/(^|;)width:[^;]*\d+vh/)
  })
})
