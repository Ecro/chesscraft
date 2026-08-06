// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ko } from '../../src/i18n/ko'
import { App } from '../../src/ui/App'
import { makeTranslate } from '../../src/ui/i18n'

/** The chrome is bundle text — `ui.*` keys never live in a content overlay. */
const translate = makeTranslate()

/**
 * PLAN Phase 1 exit criterion — the UI chrome goes through the same key
 * indirection the content already uses (RESEARCH gap #36).
 *
 * The static half is a Hangul scan rather than a JSX-text-node parse on purpose:
 * every comment in `src/ui/` is English, so a Hangul codepoint in a .tsx file
 * IS a hardcoded player-facing string, and the check cannot be defeated by a
 * literal that happens to sit in an attribute rather than a text node. The
 * behavioural half then proves the replacement actually resolves — a key
 * indirection that renders `ui.tab.play` on screen is worse than the literal it
 * replaced, and `translate` falls back to the key loudly by design.
 */

const UI_DIR = join(__dirname, '../../src/ui')
const HANGUL = /[가-힣ᄀ-ᇿ㄰-㆏]/

function uiSources(): Array<[string, string]> {
  return readdirSync(UI_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => [f, readFileSync(join(UI_DIR, f), 'utf8')])
}

describe('UI chrome carries no hardcoded player-facing text', () => {
  it('has no Hangul literal anywhere under src/ui/*.tsx', () => {
    const offenders = uiSources()
      .map(([file, src]) => {
        const lines = src.split('\n')
        const hits = lines
          .map((line, i) => [i + 1, line] as const)
          .filter(([, line]) => HANGUL.test(line))
          .map(([n, line]) => `${file}:${n}  ${line.trim()}`)
        return hits
      })
      .flat()
    expect(offenders).toEqual([])
  })

  it('has no English text node left in the chrome this phase owns', () => {
    // The Hangul scan above cannot see `play`, `preset` or `content failed to
    // load`, and the exit criterion names English literals too. This reads JSX
    // TEXT NODES rather than the whole file, so an identifier called `preset`
    // is not mistaken for the word rendered next to the picker — after the
    // phase every one of these positions holds `{translate(...)}`, and a brace
    // is what the capture stops at.
    //
    // Scoped to the two files Phase 1 owns. `Edit.tsx` renders `kind`, `open`,
    // `mover`, `opponent` and more, and it belongs to Phase 9 (ADR-019) — a
    // scan that pulled it in here would either fail this phase for work it does
    // not own or push that work forward untracked. Phase 9 adds it to this list.
    // `Play.tsx` became `MatchHost.tsx` in Phase 2 and `Home.tsx` joined it;
    // the list tracks the files, not the names they had when it was written.
    const PHASE_1_CHROME = ['App.tsx', 'MatchHost.tsx', 'Home.tsx']
    // Backtick and `$` join the list because a template literal in ordinary TS
    // (`return `${a} — ${b}``) is not JSX and matched the capture as a false
    // positive the moment Phase 2 added one.
    // `:` joins the list because a multi-line TypeScript signature puts
    // `, after:` between a `}` and a `{`, which is the same shape as a JSX text
    // node to this scanner.
    const CODE_FRAGMENT = /[()=";`$:]/
    // Third instance of the same blind spot, after the template literal and the
    // multi-line signature: a `return {` that follows a closing brace is `}`,
    // text, `{` to this regex. A bare JS keyword is never a JSX text node, so
    // filtering the keyword list costs nothing and closes the shape rather than
    // this one occurrence. The real fix is a JSX parser instead of a regex; this
    // stays a regex because the file it guards is 3 files long and a parser
    // dependency for that is worse than the third exception.
    const BARE_KEYWORD = /^(return|const|let|var|else|try|catch|finally|do|break|continue)$/

    const offenders = PHASE_1_CHROME.flatMap((file) => {
      const src = readFileSync(join(UI_DIR, file), 'utf8').replace(/^import[\s\S]*?from\s+'[^']+'$/gm, '')
      return [...src.matchAll(/[>}]([^<>{}]+)[<{]/g)]
        .map((m) => m[1]!.replace(/\s+/g, ' ').trim())
        .filter((text) => /[A-Za-z]/.test(text))
        .filter((text) => !CODE_FRAGMENT.test(text))
        .filter((text) => !BARE_KEYWORD.test(text))
        .map((text) => `${file}: ${text}`)
    })
    expect([...new Set(offenders)]).toEqual([])
  })

  it('routes every chrome string through a ui.* key that the ko bundle resolves', () => {
    const used = new Set<string>()
    for (const [, src] of uiSources()) {
      for (const m of src.matchAll(/'(ui\.[a-zA-Z0-9._-]+)'/g)) used.add(m[1]!)
    }
    // The phase is not done if the chrome was simply deleted rather than keyed.
    expect(used.size).toBeGreaterThanOrEqual(10)
    const unresolved = [...used].filter((key) => ko[key] === undefined)
    expect(unresolved).toEqual([])
  })
})

describe('the shell renders resolved chrome, not raw keys', () => {
  it('shows the translated title and tab labels', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(translate('ui.app.title'))
    expect(screen.getByTestId('tab-play').textContent).toBe(translate('ui.tab.play'))
    expect(screen.getByTestId('tab-edit').textContent).toBe(translate('ui.tab.edit'))
  })

  it('leaks no unresolved ui.* key into the rendered document', () => {
    const { container } = render(<App />)
    expect(container.textContent ?? '').not.toMatch(/\bui\.[a-z]+\./)
  })
})
