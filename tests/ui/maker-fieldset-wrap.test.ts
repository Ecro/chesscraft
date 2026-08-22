import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The maker's column-direction fieldsets must not wrap (PLAN Phase 2, ADR-005).
 *
 * `fieldset` carries `flex-wrap: wrap` in the base rule, which is right for the
 * row-direction ones — measured, not assumed: forcing `nowrap` on them makes one grow by
 * 267px and reflows another. It is wrong for a column-direction one, and the reason is not
 * obvious from either declaration:
 *
 * A column-direction MULTI-LINE flex container takes each flex line's main size from the
 * container's own content-box height. A single child in that line therefore receives a
 * DEFINITE block size — and a CSS grid with a definite block size and `align-content:
 * normal` distributes that height across its auto rows instead of leaving them at content
 * height. The art picker's rows measured 264.7px against 54px of content, giving 225px of
 * blank under every 26px sprite and a 1926px fieldset on an 844px screen.
 *
 * So `flex-wrap: nowrap` on those rules is not tidying. It is a load-bearing assertion,
 * and this file exists because of `[fail:render] rewrite-dropped-a-documented-guard`
 * (recorded here): a guard whose necessity is documented anywhere other than the file it
 * lives in does not survive a rewrite of that file. The rule carries its own comment in
 * `styles.css` for the same reason.
 *
 * This is the cheap half of the gate. It reads TEXT, so it cannot see layout — the
 * geometric claim is measured in a real browser in `e2e/maker-anchors.spec.ts`, which
 * enumerates the form's actual fieldsets and so also catches a fifth one added later that
 * this hard-coded list does not know about.
 */

const CSS = () => readFileSync(join(__dirname, '../../src/ui/styles.css'), 'utf8')

/** Every rule block in the sheet, as (selector, declarations) pairs. */
function blocks(css: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: m[1]!.trim(), body: m[2]! })
  }
  return out
}

/**
 * The maker's fieldsets, by class.
 *
 * Hard-coded rather than derived, because a stylesheet's text does not say which selectors
 * are `fieldset` elements. The e2e counterpart reads the rendered DOM and needs no list,
 * which is what keeps this one from silently going stale.
 */
const MAKER_FIELDSETS = ['.art-picker', '.piece-moves', '.card-recipe', '.sentence', '.turning-slide-editor']

describe('the maker fieldsets (PLAN Phase 2, ADR-005)', () => {
  it('gives every fieldset a wrap by default, which is what the column ones must override', () => {
    // The premise. Without it, the assertions below could pass because nothing wraps at
    // all — `[fail:test] assertion-equals-its-own-default`, recorded in this repo.
    const base = blocks(CSS()).find((b) => b.selector === 'fieldset')
    expect(base, 'no bare `fieldset` rule in the sheet').toBeDefined()
    expect(base!.body).toMatch(/flex-wrap:\s*wrap/)
  })

  it('turns wrapping off in every block that makes a maker fieldset a column', () => {
    const offenders = blocks(CSS())
      .filter((b) => b.body.includes('flex-direction: column'))
      .filter((b) => MAKER_FIELDSETS.some((cls) => b.selector.split(',').some((s) => s.trim() === cls)))
      .filter((b) => !/flex-wrap:\s*nowrap/.test(b.body))
      .map((b) => b.selector)

    expect(offenders, 'a column-direction maker fieldset can still wrap').toEqual([])
  })

  it('finds at least one such block, so the check above is not vacuous', () => {
    const guarded = blocks(CSS())
      .filter((b) => b.body.includes('flex-direction: column'))
      .filter((b) => MAKER_FIELDSETS.some((cls) => b.selector.split(',').some((s) => s.trim() === cls)))

    expect(guarded.length, 'no maker fieldset is declared a column — this file is measuring nothing').toBeGreaterThan(0)
  })

  it('says in the sheet what the rule defends against, so the next rewrite has the reason', () => {
    const css = CSS()
    const at = css.indexOf('.art-picker')
    expect(at).toBeGreaterThan(-1)
    // The 900 characters before the rule — where a block comment would sit.
    const preamble = css.slice(Math.max(0, at - 900), at)
    expect(preamble, 'the nowrap rule has no comment naming why it exists').toMatch(/definite|stretch|wrap/i)
  })
})
