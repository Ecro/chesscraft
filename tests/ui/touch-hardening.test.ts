import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * AC-008, the half no browser in this matrix can check.
 *
 * `-webkit-touch-callout` is an iOS-only property. Playwright's WebKit is the
 * same engine built for Linux, which does not implement it — it is dropped at
 * parse time, so it is absent from the computed style, from `cssText` and from
 * the CSSOM. Asserting it in the e2e would fail against a correct
 * implementation, which is how a test gets deleted rather than fixed.
 *
 * So the claim is made where it is true: the declaration SHIPPED, and it is
 * scoped to the board's squares rather than sprayed at `html`. That scoping is
 * itself the interesting part — declaring it globally would also make a room
 * code unselectable, and a child who cannot copy the code cannot share the
 * room.
 *
 * This is deliberately a source-text assertion and it is worth naming what that
 * does NOT prove: that iOS honours it at runtime. WebKit regression 231161 says
 * the magnifier can appear anyway. That residue is R4 in the PLAN and is
 * detected by a manual pass on a real device, not by this file.
 */
describe('AC-008: the board opts out of the OS long-press UI', () => {
  const css = readFileSync(new URL('../../src/ui/styles.css', import.meta.url), 'utf8')

  /** The one rule that hardens the board, pulled out so each claim reads alone. */
  const squareRule = (() => {
    const start = css.indexOf('.board .square {')
    if (start === -1) return null
    const end = css.indexOf('}', start)
    return end === -1 ? null : css.slice(start, end)
  })()

  it('has a rule scoped to the board squares', () => {
    // Guards the vacuous pass: every assertion below is about this block, and
    // a null block would make `undefined.includes` the failure instead of the
    // missing rule.
    expect(squareRule, 'expected a `.board .square` rule in styles.css').not.toBeNull()
  })

  it('suppresses the iOS callout and the selection handles together', () => {
    // Both, not either. The callout property hides the action sheet; only
    // `user-select` stops the selection handles and the text loupe. Shipping
    // one of the two is the documented half-fix.
    expect(squareRule).toContain('-webkit-touch-callout: none')
    expect(squareRule).toContain('user-select: none')
  })

  it('keeps the board pannable', () => {
    // `manipulation`, never `none`. `none` would pass a naive "is touch-action
    // set" check while disabling the scroll the e2e separately asserts still
    // works — a hardening that breaks the thing it protects.
    expect(squareRule).toContain('touch-action: manipulation')
    expect(squareRule).not.toContain('touch-action: none')
  })

  it('does not harden the whole document', () => {
    // A global opt-out would take the room code with it.
    expect(css).not.toMatch(/^html\s*\{[^}]*-webkit-touch-callout/m)
  })
})
