import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A button must never be squeezed smaller than the text it carries
 * (PLAN-button-label-truncation, ADR-002/003/005/007).
 *
 * The defect this exists for: `놀러 가기` (`button.primary.xl`, `Home.tsx`) shipped with the
 * bottom of its glyphs cut off. Nothing in the codebase was wrong about that button in
 * particular. Every screen is a column flex container, so every direct-child button carries
 * the default `flex-shrink: 1`; when `.home`'s column overran the shell height the browser
 * shrank its flex items BEFORE engaging `.home`'s own `overflow-y: auto`, and the button
 * bottomed out on its 44px `min-height` — a 2px content box under a 28.8px line box, with
 * the spill clipped by `main`/`.phone`'s `overflow: hidden`. The identical button on the
 * Result screen was fine only because `.result-actions` happens to declare `flex: none`.
 *
 * Four shapes produce that class of clipping, and this file fails on each:
 *
 *   R1  the base `button` rule does not stop itself shrinking
 *   R2  a rule re-enables shrink (`flex: 1`) without clearing its natural height
 *   R3  a rule's inline padding is under its tier's floor (11px, or 5px when dense)
 *   R4  a rule pairs `white-space: nowrap` with `overflow: hidden`
 *
 * WHAT THIS FILE CANNOT DO, stated plainly because a green run here will be read as more
 * than it is (ADR-004): it reads TEXT. It proves the four rule shapes are absent. It does
 * NOT prove that any label actually fits — a long enough label in a correctly-padded,
 * non-shrinking button passes every assertion below. `e2e/a11y.spec.ts` is not the missing
 * half either: its floor is `>= 44px` in both dimensions, and 44px is precisely the clipped
 * height of the button that motivated this file, so it was green throughout. The compensating
 * control is a manual per-family sweep at five viewports, recorded in the PLAN.
 *
 * A fifth rule, R5, closes the axis those four have no row for: a button that pins its own
 * `height`/`max-height` clips a second line no matter how correct its padding and flex are.
 *
 * ONE AXIS IS DELIBERATELY NOT GUARDED, and it is named here rather than left implied.
 * `line-height: 0` collapses a line box independently of everything above, and sixteen rules in
 * the sheet use it — most legitimately, on sprite-bearing controls (`.square`, `.palette
 * button`, `.dex-grid button`) whose text label lives in a child span that sets its own
 * line-height. Telling those apart from a genuine defect needs the parent/child relationship,
 * which this file's flat rule scan does not have, so a guard here would be a large allowlist
 * of legitimate uses — the "allowlist becomes a dumping ground" risk the PLAN records as R4.
 * The gap is real: a text-labelled button given `line-height: 0` would pass every check below.
 *
 * On the enumeration: `[fail:test] gate-enumerates-one-axis-blind-to-others` is recorded in
 * this repo, and a hand-listed set of button selectors is exactly its shape — blind to the
 * next family added. So the set of rules under guard is DERIVED, from two directions: any
 * selector naming the `button` type, plus any selector naming a class that `src/ui/*.tsx`
 * actually puts on a `<button>`. A new button family is therefore covered the day it is
 * written, whether or not anyone remembers this file.
 */

const UI = join(__dirname, '../../src/ui')
const SHEETS = ['styles.css', 'desktop.css']

type Block = { sheet: string; selector: string; body: string }

/** Every rule block in the sheets, as (selector, declarations) pairs. */
function blocks(): Block[] {
  const out: Block[] = []
  for (const sheet of SHEETS) {
    // Comments first: a `/* ... */` sitting above a rule is captured by the selector group
    // otherwise, so `button` stops matching itself and every lookup below silently misses.
    const css = readFileSync(join(UI, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const re = /([^{}]+)\{([^{}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = re.exec(css)) !== null) {
      const selector = m[1]!.trim()
      // `@media (...)` and other at-rule preludes are not selectors.
      if (selector.startsWith('@')) continue
      out.push({ sheet, selector, body: m[2]! })
    }
  }
  return out
}

/** `--space-3: 8px` → 8. Sizes only; this never needs to resolve a colour. */
function tokens(): Map<string, number> {
  const css = readFileSync(join(UI, 'tokens.css'), 'utf8')
  const out = new Map<string, number>()
  for (const m of css.matchAll(/(--[a-z0-9-]+):\s*(-?[\d.]+)px/g)) out.set(m[1]!, Number(m[2]))
  return out
}

/**
 * The classes `src/ui/*.tsx` puts on a `<button>`.
 *
 * Derived rather than listed. A stylesheet's text cannot say which selectors are buttons —
 * `.tabbar .tab`, `.tile` and `.chip` are all `<button>` elements whose CSS never says so —
 * and the JSX is the only place that fact is written down.
 */
function classesFromSource(src: string): Set<string> {
  const out = new Set<string>()
  {
    // `<button ... className=... >` in every form the codebase uses: a plain string, a template
    // literal, and an EXPRESSION — `MatchHost.tsx` writes `className={live.sound ? 'positive'
    // : ''}`, which an earlier string-only regex could not see at all. That miss was masked
    // because `positive` also appears as a literal on six other buttons, so the premise below
    // stayed green while the derivation was incomplete.
    for (const m of src.matchAll(/<button\b[^>]*?className=(?:"([^"]*)"|\{((?:[^{}]|\{[^{}]*\})*)\})/gs)) {
      // An expression contributes whatever string literals it contains — ternary arms, clsx
      // arguments, template chunks. Interpolations themselves name no class.
      const raw =
        m[1] ??
        [...(m[2] ?? '').matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)]
          .map((q) => (q[1] ?? q[2] ?? q[3] ?? '').replace(/\$\{[^}]*\}/g, ' '))
          .join(' ')
      for (const cls of raw.replace(/\$\{[^}]*\}/g, ' ').split(/\s+/)) {
        if (/^[a-z][a-z0-9-]*$/.test(cls)) out.add(cls)
      }
    }
  }
  return out
}

/** The union of `classesFromSource` over every component file. */
function buttonClasses(): Set<string> {
  const out = new Set<string>()
  for (const file of readdirSync(UI).filter((f) => f.endsWith('.tsx'))) {
    for (const cls of classesFromSource(readFileSync(join(UI, file), 'utf8'))) out.add(cls)
  }
  return out
}

/** Does this selector target a button — by element name, or by a class the JSX puts on one? */
function targetsButton(selector: string, classes: Set<string>): boolean {
  return selector.split(',').some((part) => {
    // `::before` / `::after` style a generated child, not the button's own box — a decoration
    // drawn inside a board cell cannot clip the button's label.
    if (/::[a-z-]+/.test(part)) return false
    if (/(^|[\s>+~(])button\b/.test(part.trim())) return true
    for (const m of part.matchAll(/\.([a-z][a-z0-9-]*)/g)) if (classes.has(m[1]!)) return true
    return false
  })
}

/**
 * The inline (left/right) padding a rule DECLARES, in px, or null when it declares none.
 *
 * A rule that declares no padding inherits the base rule's, which is why `.editor-tabs
 * button` and its three siblings are not R3 sites: they say `flex: 1` and nothing else.
 */
function inlinePadding(body: string, tok: Map<string, number>): number | null {
  const px = (raw: string): number | null => {
    const v = raw.trim()
    const varMatch = v.match(/^var\((--[a-z0-9-]+)\)$/)
    if (varMatch) return tok.get(varMatch[1]!) ?? null
    const pxMatch = v.match(/^(-?[\d.]+)px$/)
    if (pxMatch) return Number(pxMatch[1])
    if (v === '0') return 0
    return null
  }
  const decls = [...body.matchAll(/(^|;)\s*(padding(?:-inline|-left|-right)?)\s*:\s*([^;]+)/g)]
  let inline: number | null = null
  for (const d of decls) {
    const prop = d[2]!
    const parts = d[3]!.trim().split(/\s+(?![^(]*\))/)
    if (prop === 'padding') {
      // 1 value → all; 2 or 3 → [block, inline]; 4 → [top, right, bottom, left].
      // The 4-value form has TWO inline values and they can differ, so take the smaller —
      // reading only `parts[1]` let `padding: 18px 11px 18px 2px` pass with a 2px left edge.
      const v =
        parts.length === 1
          ? px(parts[0]!)
          : parts.length >= 4
            ? (() => {
                const r = px(parts[1]!)
                const l = px(parts[3]!)
                return r === null || l === null ? (r ?? l) : Math.min(r, l)
              })()
            : px(parts[1]!)
      if (v !== null) inline = v
    } else if (prop === 'padding-inline') {
      const v = px(parts[0]!)
      if (v !== null) inline = v
    } else {
      const v = px(parts[0]!)
      if (v !== null) inline = inline === null ? v : Math.min(inline, v)
    }
  }
  return inline
}

/**
 * The height a button needs for one line of its own text: vertical padding, both borders, and
 * the line box. Values come from the rule itself where it declares them and from the base
 * `button` rule (and `body`'s line-height) where it does not.
 *
 * This exists because `min-height` PRESENCE proves nothing, and asserting presence was a real
 * defect in the first draft of this file: `.square` and its siblings declare `min-height: 0`,
 * which is the opposite of a guard, and 44px — the value that clipped `놀러 가기` — would have
 * counted as protection too. ADR-005's R2 says "a min-height that CLEARS its natural height",
 * and that clause is only meaningful with a number to compare against.
 */
function naturalHeight(body: string, base: string, tok: Map<string, number>): number {
  const num = (raw: string | undefined): number | null => {
    if (raw === undefined) return null
    const v = raw.trim()
    const varMatch = v.match(/^var\((--[a-z0-9-]+)\)$/)
    if (varMatch) return tok.get(varMatch[1]!) ?? null
    const pxMatch = v.match(/^(-?[\d.]+)px$/)
    return pxMatch ? Number(pxMatch[1]) : v === '0' ? 0 : null
  }
  const decl = (src: string, prop: string) => src.match(new RegExp(`(^|;)\\s*${prop}\\s*:\\s*([^;]+)`))?.[2]?.trim()

  /**
   * Vertical padding, from the shorthand OR the longhands the sheet actually uses —
   * `padding-block`, `padding-top`, `padding-bottom`, eleven of which are `calc(... + env(...))`.
   * `undefined` = the rule declares none (inherit); `null` = it declares one this cannot read.
   */
  const padOf = (src: string): number | null | undefined => {
    const short = decl(src, 'padding')
    const block = decl(src, 'padding-block')
    const top = decl(src, 'padding-top')
    const bottom = decl(src, 'padding-bottom')
    if (short === undefined && block === undefined && top === undefined && bottom === undefined) return undefined
    const vals = [
      short === undefined ? undefined : num(short.split(/\s+(?![^(]*\))/)[0]),
      block === undefined ? undefined : num(block.split(/\s+(?![^(]*\))/)[0]),
      top === undefined ? undefined : num(top),
      bottom === undefined ? undefined : num(bottom),
    ].filter((v) => v !== undefined)
    // An unreadable value (calc/env/%) must NOT resolve to the base rule's — that would
    // UNDERESTIMATE the height and wrongly excuse an inadequate min-height.
    if (vals.some((v) => v === null)) return null
    return Math.max(...(vals as number[]))
  }
  const ownPad = padOf(body)
  if (ownPad === null) return Infinity
  const basePad = ownPad === undefined ? padOf(base) : undefined
  if (basePad === null) return Infinity
  const vpad = ownPad ?? basePad ?? 0

  const borderRaw = decl(body, 'border') ?? decl(base, 'border')
  const borderWidth = decl(body, 'border-width') ?? decl(base, 'border-width')
  const border =
    borderWidth !== undefined
      ? (num(borderWidth.split(/\s+/)[0]) ?? Infinity)
      : borderRaw === undefined || /\bnone\b/.test(borderRaw)
        ? 0
        : (num(borderRaw.split(/\s+/)[0]) ?? Infinity)

  const font = num(decl(body, 'font-size')) ?? num(decl(base, 'font-size')) ?? 0

  // `body { line-height: 1.6 }` — inherited by every button in the app.
  return 2 * vpad + 2 * border + font * 1.6
}

/** The `min-height` a rule declares, in px, or null when it declares none. */
function minHeight(body: string, tok: Map<string, number>): number | null {
  const raw = body.match(/(^|;)\s*min-height\s*:\s*([^;]+)/)?.[2]?.trim()
  if (raw === undefined) return null
  const varMatch = raw.match(/^var\((--[a-z0-9-]+)\)$/)
  if (varMatch) return tok.get(varMatch[1]!) ?? null
  const pxMatch = raw.match(/^(-?[\d.]+)px$/)
  return pxMatch ? Number(pxMatch[1]) : raw === '0' ? 0 : null
}

/** Does this rule re-enable flex shrinking? `flex: 1` is shorthand for `1 1 0%`. */
function reEnablesShrink(body: string): boolean {
  if (/flex-shrink:\s*[1-9]/.test(body)) return true
  const m = body.match(/(^|;)\s*flex\s*:\s*([^;]+)/)
  if (!m) return false
  const parts = m[2]!.trim().split(/\s+/)
  if (parts[0] === 'none') return false
  // `flex: 1` / `flex: 1 1 0%` / `flex: 1 1 auto` — shrink defaults to 1 in the shorthand.
  const shrink = parts.length >= 2 && /^[\d.]+$/.test(parts[1]!) ? Number(parts[1]) : 1
  return shrink >= 1
}

/**
 * Rules that may re-enable shrink (R2).
 *
 * Every one lays its buttons out in a ROW, so `flex: 1` shrinks their WIDTH, not the height
 * that clipped `놀러 가기`. Width pressure is R3's business, not R2's.
 */
const R2_ALLOW: Array<{ selector: string; why: string }> = [
  { selector: '.tabbar .tab', why: 'row: the four nav tabs share one bar and must divide it evenly' },
  { selector: '.notice-actions button', why: 'row: apply/later pair sized against each other' },
  { selector: '.home-secondary button', why: 'row: edit-room and new-room sized against each other' },
  { selector: '.share-row > button:only-child', why: 'row: the lone copy button fills the share row' },
  { selector: '.match-tools button', why: 'row: five to six tools divide the tools bar' },
  { selector: '.result-secondary button', why: 'row: edit-room and home sized against each other' },
  { selector: '.editor-tabs button', why: 'row: editor tab strip divides its width evenly' },
  { selector: '.dex-tabs button', why: 'row: dex tab strip divides its width evenly' },
  { selector: '.build-steps button', why: 'row: five build steps divide one strip' },
  { selector: '.side-picker button', why: 'row: the two side choices divide the picker' },
  { selector: '.reach-picker button', why: 'row: the reach choices divide the picker' },
  { selector: '.boot-actions .primary', why: 'row: the primary action fills beside its sibling' },
  {
    selector: '.room-list li button:first-child,\n.library-list li button:first-child',
    why: 'row: the name button takes the slack beside a fixed delete button',
  },
  { selector: '.slot', why: 'row: the card slots divide the tray; square cells, no text label' },
  { selector: '.slot-chip', why: 'row: the chip takes the slack in a sentence row, beside its label' },
  { selector: '.gallery-row button', why: 'row: template cards divide the gallery, floored by min-width: 8rem' },
]

/**
 * Rules whose buttons are dense enough that the ordinary inline floor would cost more label
 * width than it buys safety (ADR-007). They get the 5px floor instead of 11px.
 */
const R3_DENSE: Array<{ selector: string; why: string }> = [
  { selector: '.match-tools button', why: 'six 9px labels across a 390px row; 11px each would take 132px of it' },
  { selector: '.build-steps button', why: 'five 9px step labels across one strip' },
  { selector: '.palette button,\n.tile', why: 'grid cells at 9px under a 26px mark' },
  { selector: '.dex-grid button', why: 'four columns of 9px names on a 390px screen' },
]

/**
 * Rules excused from R3 entirely: their buttons carry no text label, so there is nothing to
 * clip. Each is an icon, a glyph, or a board cell.
 */
const R3_ICON_ONLY: Array<{ selector: string; why: string }> = [
  {
    selector: '.screen-head .back',
    why: 'a chevron, name on aria-label; its `height: 34px` loses to the base `min-height: 44px`, so it renders at 44',
  },
  { selector: '.carousel-arrow', why: 'a chevron in a 44px box; its name is on aria-label' },
  { selector: '.square', why: 'a board cell; its content is a sprite' },
  { selector: '.build-cell', why: 'an editor board cell; its content is a sprite' },
  { selector: '.move-cell', why: 'a move-grid cell; its content is a sprite' },
  { selector: '.slot', why: 'a card slot; its content is a sprite' },
  { selector: '.foe-card', why: "an opponent's face-down card; no label" },
]

/**
 * Two different numbers, and conflating them was a real mistake caught while writing this.
 *
 * `CLIP_FLOOR` is the FAILURE threshold: below it a label sits under the bevel the base rule
 * draws as an inset shadow over the padding area, which is a clipping risk. It is the bevel's
 * own width plus margin, and it is what every guarded rule is measured against.
 *
 * `REPAIR_*` are the values ADR-007 chose for the families this task repairs. They are
 * targets, not thresholds — a rule already at 8px clears the bevel comfortably and is not a
 * defect, so making 11px the failure line would have flagged six untouched families
 * (`.turn-right`, `.legend`, `.chip`, `.slot-options`, `.slot-detail`, `.draft-cards .card`)
 * that have nothing wrong with them.
 */
const CLIP_FLOOR = '--space-2'
const REPAIR_ORDINARY = '--space-4'
const REPAIR_DENSE = '--space-2'

/** Families Phase 3 repairs, with the ADR-007 tier each must land on. */
const REPAIR_TARGETS: Array<{ selector: string; tier: 'ordinary' | 'dense' }> = [
  // `.tabbar .tab` is deliberately NOT here, though ADR-005's table listed it as a zeroed
  // site. It declares `border: none; background: transparent; box-shadow: none` — it draws no
  // bevel, so its `padding: … 0` puts the label under nothing. Raising it to 11px would move a
  // control that is not broken. Recorded as a PLAN correction rather than dropped silently.
  { selector: 'button.xl', tier: 'ordinary' },
  { selector: '.boot-actions button', tier: 'ordinary' },
  { selector: '.home-secondary button', tier: 'ordinary' },
  { selector: '.result-secondary button', tier: 'ordinary' },
  { selector: '.dex-tabs button', tier: 'ordinary' },
  { selector: '.match-tools button', tier: 'dense' },
  { selector: '.build-steps button', tier: 'dense' },
  { selector: '.palette button,\n.tile', tier: 'dense' },
  { selector: '.dex-grid button', tier: 'dense' },
]

/**
 * A button that draws no bevel has nothing for its label to sit under, so the clip floor does
 * not apply to it. Derived from the rule itself rather than listed: `.piece-strip` is a
 * borderless, shadowless click region whose `padding: 0` is correct, and any future control
 * written the same way is exempt for the same reason without an edit here.
 */
function drawsNoBevel(body: string): boolean {
  return /box-shadow:\s*none/.test(body)
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const listed = (list: Array<{ selector: string }>, selector: string) =>
  list.some((e) => norm(e.selector) === norm(selector))

describe('button label fit (PLAN-button-label-truncation)', () => {
  it('derives its button set from the JSX, so a new family is covered without an edit here', () => {
    const classes = buttonClasses()
    // The premise. If this derivation silently returned nothing, every check below would
    // pass by having no subject — `[fail:test] assertion-equals-its-own-default`.
    expect(classes.size, 'no <button className=...> found in src/ui/*.tsx').toBeGreaterThan(10)
    expect(classes, 'the reported defect\'s own family is missing from the derived set').toContain('xl')
    expect(classes).toContain('primary')
  })

  /**
   * Three branches below exist for shapes the sheets do not currently contain, so the live
   * fixtures cannot reach them: reverting any one of the three would have left the whole suite
   * green. That is `[fail:test] assertion-equals-its-own-default` — the asserted state was
   * already true without the code under test. Synthetic input is what makes them falsifiable.
   */
  describe('the resolvers themselves, on input the sheets do not currently contain', () => {
    it('takes a class that is reachable ONLY through a className={...} expression', () => {
      const src = `<button className={cond ? 'expr-only-family' : ''}>x</button>`
      expect(
        classesFromSource(src),
        'the className expression branch is not extracting classes — a button family written ' +
          'that way would be invisible to every rule below',
      ).toContain('expr-only-family')
    })

    it('takes the SMALLER inline value of a 4-value padding shorthand, not the right one', () => {
      const tok = tokens()
      // top right bottom left — the left edge is the thin one, and it is the one that clips.
      expect(inlinePadding('padding: 18px 11px 18px 2px;', tok)).toBe(2)
      expect(inlinePadding('padding: 18px 2px 18px 11px;', tok)).toBe(2)
    })

    it('refuses to excuse a rule whose vertical padding it cannot read', () => {
      const tok = tokens()
      const base = blocks().find((b) => b.selector === 'button')!.body
      // `calc(... + env(...))` is the sheet's own idiom in eleven places. Falling back to the
      // base rule's padding here would UNDERSTATE the height and excuse a bad min-height.
      expect(naturalHeight('padding-bottom: calc(var(--space-3) + env(safe-area-inset-bottom, 0px));', base, tok)).toBe(
        Infinity,
      )
      // And it reads the longhand forms it CAN resolve, rather than ignoring them.
      expect(naturalHeight('padding-top: 40px; font-size: 10px; border: none;', base, tok)).toBe(96)
    })
  })

  it('finds button rules in the sheets, so the checks below have a subject', () => {
    const classes = buttonClasses()
    const guarded = blocks().filter((b) => targetsButton(b.selector, classes))
    expect(guarded.length, 'no button-targeting rule found — this file is measuring nothing').toBeGreaterThan(20)
  })

  describe('R1 — the base rule stops a button shrinking', () => {
    it('declares flex-shrink: 0 (or the equivalent flex: none) on the bare `button` rule', () => {
      const base = blocks().find((b) => b.selector === 'button')
      expect(base, 'no bare `button` rule in the sheet').toBeDefined()
      expect(
        /flex-shrink:\s*0|flex:\s*none/.test(base!.body),
        'the base button rule lets a column squeeze a button below the height its own text needs — ' +
          'this is the shape that clipped 놀러 가기',
      ).toBe(true)
    })
  })

  describe('R2 — nothing re-enables shrinking unaccounted for', () => {
    it('lists a justification for every allowlisted rule', () => {
      for (const e of R2_ALLOW) expect(e.why.length, `R2 allowlist entry ${e.selector} has no reason`).toBeGreaterThan(20)
    })

    it('measures a min-height against natural height rather than accepting its presence', () => {
      const tok = tokens()
      const all = blocks()
      const base = all.find((b) => b.selector === 'button')!.body
      // The premise. `.square` and its siblings declare `min-height: 0` — if presence were the
      // test, the one declaration that REMOVES the floor would read as protection.
      const zeroed = all.find((b) => /min-height:\s*0/.test(b.body))
      expect(zeroed, 'no `min-height: 0` rule in the sheet — the premise below is untested').toBeDefined()
      expect(minHeight(zeroed!.body, tok)).toBe(0)
      expect(naturalHeight(base, base, tok), 'a plain button needs a real height').toBeGreaterThan(20)
    })

    it('leaves no button rule re-enabling shrink outside the allowlist', () => {
      const tok = tokens()
      const all = blocks()
      const base = all.find((b) => b.selector === 'button')!.body
      const classes = buttonClasses()
      const offenders = all
        .filter((b) => targetsButton(b.selector, classes))
        .filter((b) => reEnablesShrink(b.body))
        .filter((b) => {
          // Excused only by a min-height that actually clears the text (ADR-005 R2), never by
          // one merely being present.
          const mh = minHeight(b.body, tok)
          return mh === null || mh < naturalHeight(b.body, base, tok)
        })
        .filter((b) => !listed(R2_ALLOW, b.selector))
        .map((b) => `${b.sheet}: ${norm(b.selector)}`)

      expect(offenders, 'a button rule re-enables flex shrinking with nothing to stop it').toEqual([])
    })

    it('has at least one allowlisted rule actually present in the sheet, so the list is not fiction', () => {
      const present = blocks().filter((b) => listed(R2_ALLOW, b.selector))
      expect(present.length, 'no R2 allowlist entry matches any rule — the list has gone stale').toBeGreaterThan(8)
    })
  })

  describe('R3 — inline padding clears its tier floor', () => {
    it('lists a justification for every dense-tier and icon-only entry', () => {
      for (const e of [...R3_DENSE, ...R3_ICON_ONLY])
        expect(e.why.length, `R3 entry ${e.selector} has no reason`).toBeGreaterThan(15)
    })

    it('keeps the clip floor above the bevel it exists to clear', () => {
      const tok = tokens()
      // The premise for the threshold itself: a floor at or below the bevel would let a label
      // sit under it and still pass.
      expect(tok.get(CLIP_FLOOR)!, 'the clip floor does not clear the bevel').toBeGreaterThan(tok.get('--bevel')!)
    })

    it('leaves no button rule declaring inline padding under the clip floor', () => {
      const tok = tokens()
      const classes = buttonClasses()
      const floor = tok.get(CLIP_FLOOR)!

      const offenders = blocks()
        .filter((b) => targetsButton(b.selector, classes))
        .filter((b) => !listed(R3_ICON_ONLY, b.selector))
        .filter((b) => !drawsNoBevel(b.body))
        .map((b) => ({ b, pad: inlinePadding(b.body, tok) }))
        .filter(({ pad }) => pad !== null)
        .filter(({ pad }) => pad! < floor)
        .map(({ b, pad }) => `${b.sheet}: ${norm(b.selector)} → ${pad}px`)

      expect(offenders, 'a button rule puts its label under the bevel').toEqual([])
    })

    it('lands every repaired family on the ADR-007 tier value it was assigned', () => {
      const tok = tokens()
      const all = blocks()
      const wrong = REPAIR_TARGETS.map((t) => {
        const b = all.find((x) => norm(x.selector) === norm(t.selector) && x.sheet === 'styles.css')
        if (!b) return `${norm(t.selector)} → rule not found in styles.css`
        const want = tok.get(t.tier === 'dense' ? REPAIR_DENSE : REPAIR_ORDINARY)!
        const got = inlinePadding(b.body, tok)
        return got === want ? null : `${norm(t.selector)} → ${got}px, want ${want}px (${t.tier})`
      }).filter((x): x is string => x !== null)

      expect(wrong, 'a family this task repairs is not on its ADR-007 tier value').toEqual([])
    })

    it('reads a real padding value off a known rule, so the resolver is not silently returning null', () => {
      const tok = tokens()
      const base = blocks().find((b) => b.selector === 'button')
      expect(inlinePadding(base!.body, tok), 'the base rule\'s inline padding did not resolve').toBe(
        tok.get(REPAIR_ORDINARY),
      )
    })
  })

  describe('R5 — no button pins its own height', () => {
    it('leaves no text-labelled button rule declaring a fixed height or max-height', () => {
      const classes = buttonClasses()
      const offenders = blocks()
        .filter((b) => targetsButton(b.selector, classes))
        .filter((b) => !listed(R3_ICON_ONLY, b.selector))
        .filter((b) => /(^|;)\s*(max-)?height\s*:/.test(b.body))
        .map((b) => `${b.sheet}: ${norm(b.selector)}`)

      expect(
        offenders,
        'a button carrying a text label pins its height, so a second line of Korean has nowhere to go ' +
          '(ADR-003 lets a button grow; this is the axis that would stop it)',
      ).toEqual([])
    })

    it('finds the icon-only rules that legitimately pin a height, so the exemption is not fiction', () => {
      const pinned = blocks().filter((b) => listed(R3_ICON_ONLY, b.selector) && /(^|;)\s*height\s*:/.test(b.body))
      expect(pinned.length, 'no exempted rule actually pins a height — R3_ICON_ONLY has gone stale').toBeGreaterThan(0)
    })
  })

  describe('ADR-003 — a Korean label may wrap rather than overflow', () => {
    it('declares overflow-wrap on the base button rule, so keep-all has a valve', () => {
      const base = blocks().find((b) => b.selector === 'button')
      expect(
        /overflow-wrap:\s*(break-word|anywhere)/.test(base!.body),
        'the base button rule has no overflow-wrap, so `body { word-break: keep-all }` leaves a long ' +
          'label no way to wrap and it overflows the button instead (ADR-003)',
      ).toBe(true)
    })

    it('still has the keep-all this valve exists to complement', () => {
      // The premise: overflow-wrap is only the valve BECAUSE keep-all closes the default path.
      const body = blocks().find((b) => b.selector === 'body')
      expect(body!.body, 'body no longer sets word-break: keep-all').toMatch(/word-break:\s*keep-all/)
    })
  })

  describe('R4 — nothing pairs nowrap with a clip', () => {
    it('leaves no button rule combining white-space: nowrap with overflow: hidden', () => {
      const classes = buttonClasses()
      const offenders = blocks()
        .filter((b) => targetsButton(b.selector, classes))
        .filter((b) => /white-space:\s*nowrap/.test(b.body) && /overflow:\s*hidden/.test(b.body))
        .map((b) => `${b.sheet}: ${norm(b.selector)}`)

      expect(offenders, 'a button rule forbids wrapping and clips the overflow it thereby guarantees').toEqual([])
    })
  })
})
