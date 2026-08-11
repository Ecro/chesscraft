---
type: plan
task_slug: button-label-truncation
status: complete
created: 2026-08-11
tags: [strange-chess, plan, css, react, ui, accessibility, layout]
interview_rounds: 4
adrs: 7
validator_outcome: MAJOR_REVISION_RESOLVED
summary: "Stop button labels from being clipped: buttons never shrink, minimum horizontal padding, static CSS guard"
---

## 🎯 Executive Summary

**TL;DR** — `"놀러 가기"` (`button.primary.xl`, `src/ui/Home.tsx:161`) has the bottom of its
glyphs cut off. The cause is **vertical**, not horizontal: the button is a shrinkable flex child
of a column that runs out of height, so it is compressed from its natural 70.8px down to its
44px `min-height` floor, leaving a 2px content box for a 28.8px line box. The spill is clipped by
`main`/`.phone`'s `overflow: hidden`.

**What** — Fix the shared button rules so a button can never be compressed below the height its
own text needs, restore a minimum horizontal padding on the button families that zero it out, and
add a static CSS invariant test that fails on all four shapes that produce clipping.

**Why** — The defect is in a shared styling family, not at one call site. Three other buttons use
the identical `primary xl` family (`Lobby.tsx:254`, `Result.tsx:91`, `RoomDetail.tsx:853`); six
further families zero their horizontal padding outright and three more set it too small to clear
the 3px bevel. Patching one button leaves the mechanism armed everywhere else.

**Key decisions**

| Decision | ADR |
|---|---|
| Fix the shared rules, not the individual call sites | ADR-001 |
| A button never shrinks — `flex-shrink: 0` on the base rule; the container scrolls instead | ADR-002 |
| Korean labels wrap by 어절 and the button grows vertically | ADR-003 |
| Verification is a static CSS invariant test plus a manual visual sweep | ADR-004 (**amended at execute** — a geometric e2e was added after the defect was reproduced; see Execute notes) |
| The guard forbids four concrete shapes, with comment-justified allowlists | ADR-005 |
| Spacing changes on other screens are accepted as the cost of fixing the shared rule | ADR-006 |
| The inline-padding floor is two-tier: 11px ordinary, 5px for allowlisted dense rows | ADR-007 |

**Estimated impact** — `src/ui/styles.css` (one base rule + ~16 family rules), one new vitest
file. No component, no i18n, no token changes. No colour literals (so `tests/ui/tokens.test.ts`
is unaffected).

**Actual impact at execute** — `src/ui/styles.css`: the base `button` rule plus 9 family rules.
Two new test files (`tests/ui/button-label-fit.test.ts`, `e2e/button-label-fit.spec.ts`). No
component, i18n, token or colour change, as estimated.

---

## 📚 Prior Work

- **`[wiki:convention] button-hierarchy-and-chrome-rank`** — the three-tier system (`.primary` /
  plain / `.ghost`) and the bevel/press treatment on the base `button` rule. This plan changes
  the base rule's box behaviour only; the tier system and the press are untouched.
- **`[wiki:architecture] responsive-shell-breakpoints`** — three layout regimes decided by two
  dimensions each. `word-break: keep-all` with `overflow-wrap` as the valve is already the
  project's Korean line-breaking idiom (`.legend li`); ADR-003 extends the same idiom to buttons
  rather than inventing one.
- **`[wiki:architecture] chess-craft-pixel-redesign`** — every mark is a sprite, no emoji, single
  dark theme. Nothing here touches art or colour.
- **`[fail:render] hidden-subtree-took-the-a11y-name`** — a truncation fix that swaps text for an
  icon, or hides a label at a breakpoint, destroys the control's accessible name. **This plan
  never removes or hides label text**; it gives the text room. Any future amendment that reaches
  for an icon swap must re-read that entry first.
- **`[fail:test] test-setup-hides-the-failure-path`** — a test whose setup supplies the very
  condition under test certifies nothing. Live instance in this repo: `e2e/a11y.spec.ts:41-62`
  asserts every control is `>= 44px` in both dimensions. **44px is exactly the clipped state** of
  the start-match button, so the suite was green while the defect shipped. ADR-004 records the
  matching limitation in the guard this plan does add.
- **`[fail:design] plan-contradicts-its-own-adr`** — constraints outrank scope lines. If a phase
  scope below appears to conflict with an ADR above, the ADR wins.
- **`e2e/layout.spec.ts:199-231`** — "every match control is fully on screen" already exists, with
  a comment recording that `한 수 무르기` once shipped half off-screen because `main`'s
  `overflow: hidden` clips rather than scrolls. That check is **scoped to the match screen only**;
  no equivalent covers `.home`, which is why this defect had no gate.

---

## 🎙️ Interview Transcript

| # | Topic | Category | Question | Options | Choice | Note | → ADR |
|---|---|---|---|---|---|---|---|
| 1 | Where to fix | Architecture | Fix at the shared rules or per clipping site? | shared-family / per-button patch / shared + global label-safe invariant | **shared family** | Fixing the family means the other three `primary xl` sites are fixed by the same change | ADR-001 |
| 2 | Verification method | Testing depth | What proves "전수 조사해서 고쳐"? | full geometric e2e / static CSS test + manual / manual only | **static CSS test + manual visual** | Concern raised at the time: a static test proves the rule shape, not that labels fit. Accepted; limitation recorded rather than silently carried | ADR-004 |
| 3 | Scope | Scope boundaries | How wide is the audit? | buttons with text labels / all text controls / buttons incl. icon-only | **buttons with text labels** | Icon-only buttons (`.back`, `.carousel-arrow`, `.square`, `.slot`, `.foe-card`, vector grids) are out of scope and become allowlist entries | ADR-005 |
| 4 | Korean wrapping | Contract shape | What happens when a label exceeds the button width? | wrap by 어절, button grows / one line, shrink font / one line, button grows wide | **wrap by 어절, button grows vertically** | `word-break: keep-all` + `overflow-wrap: break-word`, matching the existing `.legend li` idiom. Rejects a per-button font exception to the fixed-px token scale | ADR-003 |
| 5 | Guard contract (v1) | Contract shape | What exactly does the static test forbid? | padding floor + clip-combo / padding floor only / + i18n length budget | **padding floor + clip-prone combinations** | Superseded by #7 — asked while the defect was believed to be horizontal | — |
| 6 | Blast radius | Risk tolerance | Shared-rule change alters spacing on other screens — how much is allowed? | spacing may change / only the failing families, rest pixel-identical / full spacing redesign | **spacing may change** | Fixing the mechanism outranks pixel stability on unaffected screens | ADR-006 |
| 7 | Fix direction | Architecture | How is vertical compression prevented? | `flex-shrink: 0` / raise `min-height` to natural height / cut `.xl` vertical padding | **`flex-shrink: 0`** | Follows the precedent already in the codebase — `.result-actions { flex: none }` is why the identical `primary xl` on the Result screen does not clip | ADR-002 |
| 8 | Guard contract (v2) | Contract shape | Re-opened after the axis was found to be vertical — what does the test forbid now? | vertical + horizontal both / vertical only / static + one geometric e2e | **vertical-primary, horizontal in parallel** | Four forbidden shapes; the geometric e2e option was declined again, consistent with #2 | ADR-005 |
| 9 | Padding floor value | Contract shape | Post-validator: R3 must be a *threshold*, not a literal-zero pattern (2px/3px cases exist). What floor? | two-tier 11px + 5px allowlist / flat 5px / flat 3px | **two-tier: 11px ordinary, 5px allowlisted dense rows** | A flat 5px costs `.match-tools` 60px of a 390px row; a flat 3px would leave `.palette`/`.dex-grid` untouched at their current 3px, i.e. the riskiest grids unfixed | ADR-007 |

**Correction recorded mid-interview (Round 3).** Rounds 1–2 proceeded on the hypothesis that
`.xl`'s zero horizontal padding was the cause. The inventory falsified it: `놀러 가기` is five
characters and the clipping is vertical. The user then confirmed independently that the **bottom**
of the glyphs is cut. Entry #5 was superseded by #8 for that reason; the horizontal defect is real
but is a separate, latent class rather than the reported one.

**Second correction, from the validator (Round 4).** The draft's R3 target list and family table were
built from a survey that over-generalised: it grouped `.editor-tabs`, `.side-picker`,
`.reach-picker` and `.notice-actions` with the padding-zeroing families, when line-by-line reading
shows all four declare `flex: 1` and **no padding at all** (styles.css:2357, 2660, 2875, 545); and
`.move-modes` (:3410) is a container rule with no button-targeting rule beneath it. `.build-steps`
(:2512) sets `2px`, not `0`. Every claim was re-verified against source before this revision. The
corrected picture is in ADR-005 and drove ADR-007.

---

## 📐 Architecture Decision Records

### ADR-001: Fix the shared button families, not the individual call sites
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** `놀러 가기` is one of four buttons in the `primary xl` family, and sixteen further
families share the styling shapes that cause clipping. There are 96 `<button>` JSX sites in
`src/` and no CSS modules, no styled-components and no inline button styles — all button styling
is in `src/ui/styles.css` and `src/ui/desktop.css`.
**Decision:** All fixes land in the shared CSS rules. No component file is edited, and no
per-call-site style override is added.
**Consequences:**
- ✅ One change fixes every member of a family, including the three sibling `primary xl` buttons.
- ✅ The fix is reviewable in one file and testable by a static test over that file.
- ⚠️ Spacing changes on screens that were not reported as broken (see ADR-006).
**Rejected alternatives:**
- Per-button patch — rejected because the mechanism survives and reappears on the next label or
  the next screen; the reported button is not special, it is just the one that ran out of height
  first.
**Source:** Interview #1

### ADR-002: A button never shrinks — `flex-shrink: 0` on the base rule
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** Every screen is a column flex container (`.phone > section`, `src/ui/styles.css:154-160`),
so every direct-child button carries the default `flex-shrink: 1`. When `.home`'s column content
exceeds the shell height, the browser shrinks flex items *before* engaging `.home`'s
`overflow-y: auto`. `button.primary.xl` has a natural height of 70.8px (18+18 padding, 3+3 border,
28.8px line box) against a 44px `min-height` floor, leaving a 2px content box. The overflow is
clipped by `main` and `.phone` (`overflow: hidden`). The same button on the Result screen does not
clip, because `.result-actions` declares `flex: none` (`styles.css:2321`) — the fix already exists
in the codebase, applied to one container.
**Decision:** Declare `flex-shrink: 0` on the base `button` rule, promoting that existing
container-local precedent to the whole family. Containers that run out of room scroll or grow;
the button keeps the height its own text needs.
**Consequences:**
- ✅ The reported defect and every instance of the same mechanism are fixed at once.
- ✅ Matches the precedent (`.result-actions`, `.boot-actions` both already use `flex: none`).
- ⚠️ On short viewports a column may now scroll where it previously compressed silently. `.home`
  and `.screen-body` already declare `overflow-y: auto`, so scrolling is the designed fallback;
  the landscape-phone regime is the one to verify by hand (Risk R1).
- ⚠️ Row-flex families that declare `flex: 1` (shorthand for `1 1 0%`) re-enable shrinking on the
  **width** axis. That is the horizontal defect class, handled by ADR-005 R2/R3, not by this ADR.
**Rejected alternatives:**
- Raise `min-height` to the computed natural height — rejected because the value has to be
  recomputed for every family whenever a padding or font token moves, and a stale value fails
  silently in exactly the way this defect already did.
- Cut `.xl`'s vertical padding — rejected because it only buys headroom; arbitrary compression
  remains possible and the next long label or shorter viewport re-opens it.
**Source:** Interview #7

### ADR-003: Korean button labels wrap by 어절 and the button grows vertically
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** `body` already sets `word-break: keep-all` (`styles.css:40`), so Korean does not break
mid-word and a long label pushes width instead of wrapping. Without an `overflow-wrap` valve, a
label wider than its button cannot wrap at all. The app targets children and the size tokens are
fixed px with no `clamp()` anywhere (the one previous `clamp()` was deliberately removed —
`styles.css:1242`).
**Decision:** Button labels wrap at 어절 boundaries (`word-break: keep-all` inherited, plus
`overflow-wrap: break-word` on the button) and the button grows taller. Font size is never reduced
to make a label fit.
**Consequences:**
- ✅ Uses the idiom the project already chose for `.legend li`; no new mechanism.
- ✅ No exception to the fixed-px token scale, and no `clamp()` re-introduction.
- ⚠️ Button height becomes content-dependent, so a row of buttons can have unequal heights. Rows
  that must stay even need `align-items: stretch`, which is the flex default.
**Rejected alternatives:**
- Shrink the font to fit — rejected: it makes text smaller on a child's screen, and it opens a
  per-button exception to the token scale that `tests/ui/tokens.test.ts` exists to prevent the
  colour equivalent of.
- One line, button widens to content — rejected: on a 390px phone that pushes the layout sideways,
  the failure `e2e/layout.spec.ts` already gates against.
**Source:** Interview #4

### ADR-004: Verification is a static CSS invariant test plus a manual visual sweep
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** The request is "전수 조사해서 고쳐". Two candidate gates exist: a static test over
`src/ui/styles.css`, and a geometric e2e that measures every rendered button. The repo's stated
pattern is "the cheap half in vitest, the geometric claim in a real browser", and it already has
both halves for other claims (`tests/ui/maker-fieldset-wrap.test.ts` + `e2e/maker-anchors.spec.ts`).
**Decision:** Ship the static half plus a written manual sweep checklist. Do **not** add a
geometric e2e in this task.
**Consequences:**
- ✅ Fast, runs on every vitest, names the offending selector in its failure.
- ⚠️ **Accepted risk, stated plainly: this gate cannot prove that any label actually fits.** It
  proves that the four rule shapes known to cause clipping are absent. A label long enough to
  overflow a correctly-padded, non-shrinking button will pass it. This is the same shape as
  `[fail:test] test-setup-hides-the-failure-path`, and it is being accepted knowingly rather than
  discovered later.
- ⚠️ `e2e/a11y.spec.ts:41-62` remains a false-comfort signal: it passes at exactly 44px, the
  clipped height. This plan does not change it. Phase 4 records that it must not be read as
  evidence that labels fit.
**Rejected alternatives:**
- Geometric e2e sweeping every visible button's `scrollHeight > clientHeight` across the three
  Playwright projects — offered twice (Interview #2, #8) and declined both times.
- Manual only — rejected because it leaves no regression guard at all.
**Source:** Interview #2, re-confirmed at #8

### ADR-005: The static guard forbids four shapes, with comment-justified allowlists
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** A guard that is too loose passes vacuously; one that is too tight produces false
positives on the icon-only buttons that legitimately have zero padding and fixed boxes (`.back`
34×34, `.carousel-arrow` 44px, `.square`, `.slot`, `.foe-card`, the vector grids). A silent
third state — a rule the guard simply does not classify — is the failure mode recorded in the
global "absent-case = feature black hole" correction.
**Decision:** The guard parses `src/ui/styles.css` and `src/ui/desktop.css` and fails on four
shapes. Every button-targeting rule must be either guarded or **explicitly allowlisted by
selector with an inline justification comment**; the test additionally asserts that every
allowlist entry carries a comment. There is no unclassified state.

| ID | Forbidden shape | Rationale |
|---|---|---|
| **R1** | the base `button` rule not declaring `flex-shrink: 0` | the reported defect (ADR-002) |
| **R2** | a button-targeting rule re-enabling shrink (`flex-shrink: 1`, or a `flex` shorthand with shrink ≥ 1) without a `min-height` that clears its natural height | ADR-002's escape hatch, closed |
| **R3** | a button-targeting rule whose resolved inline padding is **below its tier's floor** (ADR-007) — a threshold, not a literal-zero match | the latent horizontal class, verified against source below |
| **R4** | a button-targeting rule combining `white-space: nowrap` with `overflow: hidden` | the classic clip pair; absent today, and this keeps it absent |

**R3's verified target set** (read line-by-line from `src/ui/styles.css`; `desktop.css` overrides
none of them):

| Selector | Line | Inline padding today | Class |
|---|---|---|---|
| `button.xl` | 348 | **0** | zeroed |
| ~~`.tabbar .tab`~~ | ~~471~~ | ~~**0**~~ | **struck — draws no bevel, see correction 2 below** |
| `.boot-actions button` | 627 | **0** | zeroed |
| `.home-secondary button` | 773 | **0** | zeroed |
| `.match-tools button` | 1952 | **0** | zeroed, dense row (6 × 9px labels / 390px) |
| `.result-secondary button` | 2335 | **0** | zeroed |
| `.dex-tabs button` | 3125 | **0** | zeroed |
| `.build-steps button` | 2512 | **2px** | below floor, dense row (5 × 9px) |
| `.palette button` / `.tile` | 2585 | **3px** | below floor, dense grid, user-authored names |
| `.dex-grid button` | 3146 | **3px** | below floor, dense grid, user-authored names |

> **Two corrections from execute, found by running the guard (recorded, not applied silently).**
>
> 1. **R3's failure threshold is not ADR-007's repair target.** ADR-007 chose 11px/5px as the
>    values to *set* on the families being repaired. Implemented as the value to *fail below*, it
>    flagged six families with no defect — `.turn-right`, `.legend`, `.chip`, `.slot-options`,
>    `.slot-detail`, `.draft-cards .card`, all at 8px, which clears the 3px `--bevel` by 5px. The
>    guard's threshold is therefore the bevel-clearing floor (`--space-2` = 5px, asserted in the
>    test to exceed `--bevel`); ADR-007's tier values remain the repair targets and are asserted
>    separately, per family. Confirmed with the user before implementing.
> 2. **`.tabbar .tab` is not an R3 site after all.** It declares `border: none; background:
>    transparent; box-shadow: none` (styles.css:478-480) — it draws no bevel, so its `padding:
>    … 0` puts the label under nothing. It is dropped from Phase 3's repair set. The guard
>    handles this by *deriving* the exemption (`drawsNoBevel`, keyed on `box-shadow: none`)
>    rather than allowlisting the selector, so any future borderless control is exempt for the
>    same stated reason without an edit.

**Explicitly NOT in R3's target set** — these declare `flex: 1` and no padding, so they inherit the
base rule's 11px and were mis-grouped in the draft: `.editor-tabs button` (2357), `.side-picker
button` (2660), `.reach-picker button` (2875), `.notice-actions button` (545). `.move-modes` (3410)
is a container rule whose only button-targeting rule (`.move-modes button[data-selected='true']`,
:3415) sets colour alone — no layout property, no padding, no flex — so it is not an R3 site. It is
still an R2 site by container axis (see Phase 2 and Risk R9).

**Consequences:**
- ✅ Every one of the four shapes maps to a mechanism observed in this codebase, not to a
  hypothetical.
- ✅ A threshold catches the 2px and 3px cases that a literal-zero pattern would have passed —
  and those are the dense grids carrying unbounded user-authored names, i.e. the highest-risk set.
- ✅ An allowlist entry is a recorded decision that a reviewer can read, not a silent pass.
- ⚠️ The allowlist can become a dumping ground. The comment requirement is the only guard against
  that, and it is a weak one (Risk R4).
- ⚠️ "Natural height" in R2 is computed from tokens the test must resolve itself; if a token moves
  and the resolver is not updated, R2 weakens silently.
**Rejected alternatives:**
- A literal-zero R3 pattern — rejected by the validator pass: it would silently pass `.build-steps`
  (2px), `.palette`/`.tile` and `.dex-grid` (3px), which are exactly the rules where a 9px label
  meets an unbounded user-authored name.
- Padding floor only (no R1/R2) — rejected: it would not have caught the reported defect at all.
- Adding an i18n label-length budget — rejected: any character ceiling would be arbitrary, and
  user-authored room/piece/card names have no ceiling to begin with.
**Source:** Interview #5 (superseded), #3, #8, #9; corrected by validator pass 1

### ADR-006: Spacing changes on unaffected screens are accepted
**Status:** Accepted (2026-08-11, via /hm:plan interview)
**Context:** Restoring horizontal padding on shared families (R3) changes the inner spacing of
buttons on screens where nothing was reported broken — the match tools row, the editor tabs, the
build steps, the tab bar.
**Decision:** Those changes are accepted. The plan does not attempt to keep unaffected screens
pixel-identical.
**Consequences:**
- ✅ The mechanism is removed rather than fenced off around the reported site.
- ⚠️ Rows with many `flex: 1` siblings and small fonts lose usable text width. `.match-tools`
  (six 9px labels across 390px) and `.build-steps` (five 9px labels, 2px side padding) are the
  two that can be pushed into *new* horizontal clipping by the fix itself — see Risk R2, which is
  why Phase 3 sizes their padding separately rather than applying one token everywhere.
- ⚠️ `e2e/layout.spec.ts:199-231` and `:552-578` pin some of these boxes and may need to be
  re-read (not weakened) if they fail.
**Rejected alternatives:**
- Change only the families with an observed defect — rejected: the same latent shape stays in the
  rest, which is the outcome the user's "전수 조사" explicitly asked against.
**Source:** Interview #6

### ADR-007: The inline-padding floor is two-tier — 11px ordinary, 5px for allowlisted dense rows
**Status:** Accepted (2026-08-11, via /hm:plan follow-up round after validator pass 1)
**Context:** R3 needs a number. The base rule already uses `--space-4` (11px), but three families
are dense rows or grids that cannot afford it: `.match-tools` puts six 9px labels across 390px
(11px inline padding costs 132px of that row), `.build-steps` five, and `.palette`/`.dex-grid`/
`.tile` are 3-to-4-column grids of 9px labels. The `--bevel` is 3px and is drawn as an inset
box-shadow over the padding area, so any padding at or below 3px puts text under the bevel.
**Decision:** Two tiers. Ordinary buttons use `--space-4` (11px). Families explicitly allowlisted as
dense use `--space-2` (5px) — enough to clear the 3px bevel with margin, at a cost of 10px per
button. Each dense-tier entry carries an inline comment naming why it is dense, under the same
comment requirement as ADR-005's other allowlists.
**Consequences:**
- ✅ Ordinary buttons get real breathing room; dense rows lose 60px instead of 132px.
- ✅ The 3px cases (`.palette`, `.dex-grid`, `.tile`) are *raised* to 5px rather than passing
  unchanged, which a flat 3px floor would have allowed.
- ⚠️ A second allowlist tier is a second place a rule can be parked without being fixed (Risk R4).
- ⚠️ `.match-tools` still loses 60px of usable label width; if that produces new clipping, ADR-003's
  wrap valve makes the row taller rather than clipping (Risk R2).
**Rejected alternatives:**
- Flat 5px for everything — rejected: ordinary buttons would get *less* padding than the 11px they
  have today, a regression introduced by a fix.
- Flat 3px — rejected: it equals the bevel exactly and would leave `.palette`/`.dex-grid` passing
  at their current value, so the riskiest grids would go untouched by a task whose brief was
  exhaustive.
**Source:** Interview #9

---

## 🏗️ Technical Design

### Current state

All button styling lives in three hand-written stylesheets imported in a load-bearing order from
`src/main.tsx` (pinned by `tests/ui/shell-layout.test.ts`): `tokens.css` → `styles.css` →
`desktop.css`. There are no CSS modules, no styled-components, no Tailwind, and no inline styles
on any button.

```
button                    styles.css:298-311   min-height 44px · padding 8/11px · border 3px · 11px
 ├ .primary               :333-341             15px
 │   └ .xl                :348-351             padding 18px/0  ← horizontal 0
 ├ .positive/.danger/.ghost :353-378           colour only
body                      :30-43               line-height 1.6 · word-break: keep-all  (inherited)

.phone > section          :154-160   display:flex · column · flex:1 1 auto · min-height:0
 └ .home                  :642-647   gap 11 · padding 18/14/14 · overflow-y:auto · justify-content:center
main                      :60-101    height 100vh · overflow: hidden      ← the outermost clip
.phone                    :130-139   overflow: hidden · max-width 390px
```

### The mechanism

```
natural height  = 18 + 18 (padding) + 3 + 3 (border) + 28.8 (18px × 1.6)  = 70.8px
min-height floor                                                          = 44px
content box at the floor = 44 − 36 − 6                                    =  2px
line box needing to fit                                                   = 28.8px
                                                    → 26.8px spills below → clipped
```

`.home` is a column flex container; the button is a direct child with default `flex-shrink: 1` and
no `flex-shrink: 0` anywhere. When the column (wordmark + carousel + mini-board + dots +
manage-rooms + start-match + home-secondary) exceeds the shell height, the browser resolves the
shortfall by **shrinking flex items first** — `overflow-y: auto` only engages once shrinking is
exhausted. The button bottoms out at its 44px `min-height`, and the bottom of the glyphs is clipped
by `main`/`.phone`'s `overflow: hidden`. Confirmed by the user: the **bottom** of the text is cut.

### Affected components

| Family | Selector(s) | Sites | Defect class |
|---|---|---|---|
| A `primary xl` | `button.xl` :348 | `Home.tsx:161`, `Lobby.tsx:254`, `Result.tsx:91`, `RoomDetail.tsx:853` | vertical (reported) + horizontal |
| all | `button` :298 | every text button | vertical (mechanism) |
| H `.match-tools button` | :1952 | `MatchHost.tsx:1341-1382` | horizontal, **dense** (`padding: 11px 0`, 9px, six siblings) |
| J `.build-steps button` | :2510 | `RoomDetail.tsx:621` ×5 | horizontal, **dense** (`padding: 8px 2px` — below floor, not zero) |
| L/T `.tabbar .tab`,`.boot-actions`,`.home-secondary`,`.result-secondary`,`.dex-tabs` | :471, :627, :773, :2335, :3125 | `TabBar.tsx:37`, `Boot.tsx:67,71`, `Home.tsx:172,175`, `Result.tsx:95,98`, `Rules.tsx:100` | horizontal (inline padding 0 + `flex: 1`) |
| K/Q/S `.editor-tabs`,`.side-picker`,`.reach-picker`,`.notice-actions` | :2357, :2660, :2875, :545 | `Edit.tsx:294,308`, `PlacementPainter.tsx:235`, `RoomDetail.tsx:1156`, `App.tsx:468-486` | **not an R3 site** — `flex: 1` only, inherits the base 11px. R2 audit only |
| P `.slot-options button` | :3069 | `SentenceSlot.tsx:645,657` | holds the longest labels (19 chars, `ui.editor.vocab.condition.on_own_rank`); padding 8px — above floor, no R3 change |
| M/N `.dex-grid`,`.palette`,`.tile` | :3146, :2585 | `Rules.tsx:125`, `RoomDetail.tsx:679,930`, `PlacementPainter.tsx:285,298`, `RecordForm.tsx:784` | horizontal, **dense grid at 3px**, user-authored labels with no length ceiling |
| U `.room-list`,`.library-list` | :2416 | `EditorRooms.tsx:154,162`, `EditorLibrary.tsx:216,230` | `flex: 1` + `text-align: left`, base padding; user-authored labels. R2 audit only |
| `.move-modes` | :3410 | `RecordForm.tsx:929` | container rule; its one button rule (:3415) is colour-only, so **no layout override** — a row whose buttons inherit the base flex → R2 blind-spot case |
| F/G/X icon-only | `.back`,`.carousel-arrow`,`.square`,`.build-cell`,`.move-cell`,`.slot`,`.foe-card`, vector grids | — | **out of scope** → allowlist |
| V composite | `.rule-bar`,`.piece-strip`,`.slot-detail`,`.card`,`.legend button` | — | already clamp deliberately (`-webkit-line-clamp: 2`) → allowlist, unchanged |

### Dependencies

None added. No new package, no new token file, no i18n change.

### Data flow

Not applicable — this is a presentation-layer change with no runtime state.

### API / contract changes

One new contract, internal to the test suite: the **guard contract** in ADR-005 (R1–R4 plus the
commented allowlist). No public API, no schema, no wire format.

---

## 📝 Implementation Plan

### Phase 1 — Static guard test (RED) — **DONE**

- **depends_on:** `[]`
- **parallel_group:** `serial-1`
- **merge_hazards:** none (single new file)
- **Scope — in:** `tests/ui/button-label-fit.test.ts` (new)
- **Scope — out:** all of `src/`
- Implement R1–R4 from ADR-005 as a source-text test over `src/ui/styles.css` and
  `src/ui/desktop.css`, following the `readFileSync` pattern of `tests/ui/tokens.test.ts` and
  `tests/ui/maker-fieldset-wrap.test.ts`.
- Seed the allowlist with the icon-only and deliberate-clamp families (F/G/V/X above), each with
  an inline justification comment, and assert that every allowlist entry has one.
- Seed the ADR-007 dense tier with `.match-tools`, `.build-steps`, `.palette`/`.tile`, `.dex-grid`,
  each with its justification comment.
- Structure the file as **four named `describe` blocks, one per rule** (`R1 …`, `R2 …`, `R3 …`,
  `R4 …`), so a partial red state is readable from the reporter without human judgment. Mark the
  R3 block `describe.todo` (or `.skip` with a `TODO(Phase 3)` comment) until Phase 3 lands, so
  `npx vitest run` is binary-green at Phase 2's exit and "no new failures elsewhere" is a diffable
  check rather than an eyeball (validator finding 4).
- Resolve spacing/font values from `src/ui/tokens.css` at test time rather than hardcoding numbers,
  so a moved token moves the guard with it (Risk R7).
- **Exit criterion:** with the R3 block temporarily un-skipped, `npx vitest run
  tests/ui/button-label-fit.test.ts` **fails**, and the failure names at minimum: the base `button`
  rule (R1) and `button.xl` (R3). Re-skip R3 before finishing the phase. A passing test with R3
  un-skipped at this point means the guard is vacuous and must be tightened before Phase 2.
- **Risk:** `low`
- **Rollback point:** delete the new file; nothing else is touched.

### Phase 2 — Vertical fix: buttons never shrink — **DONE**

- **depends_on:** `[1]`
- **parallel_group:** `serial-2`
- **merge_hazards:** `src/ui/styles.css` (shared with Phase 3 — must be serial)
- **Scope — in:** the base `button` rule, `src/ui/styles.css:298-311`; and
  `tests/ui/button-label-fit.test.ts` — **R2 allowlist entries only**, since this phase's exit
  criterion requires every audited container to appear there with a comment
- **Scope — out:** `.primary`/`.positive`/`.danger`/`.ghost` colour rules; every container rule;
  the R1/R3/R4 blocks of the test file
- Add `flex-shrink: 0` and `overflow-wrap: break-word` to the base `button` rule (ADR-002, ADR-003).
- **Audit method — every container that lays out buttons as flex siblings, not just rules that say
  `flex: 1`** (validator finding 2). Grepping for `flex: 1` misses rows whose buttons carry no flex
  override at all and therefore inherit the base rule: `.move-modes` (:3410) is a confirmed
  instance, and it flips from shrinkable to non-shrinkable on the width axis with no rule of its
  own to review. Enumerate the containers (`display: flex` / `display: grid` holding `button`
  children), then record per container: axis (row → width, column → height) and the resolved
  post-change `flex-shrink` of its buttons. Feed the result into R2's allowlist with a
  justification per entry.
- Note for implementation: the base rule's default is `0 1 auto`, so `flex-shrink: 0` computes
  identically to `flex: none` — the idiom already used 39 times in this file. Either spelling is
  correct; pick one and let R1's pattern match it.
- **Exit criterion:** `npx vitest run` is **fully green** (R3's block is still `describe.todo` per
  Phase 1, so there is no expected-red to reason about). R1 and R2 assertions pass. Loading `/` at
  390×844 shows `놀러 가기` with descenders intact and the button at its natural height, not 44px.
  Every container from the audit appears either in R2's allowlist with a comment or in the audit
  notes as unaffected — no container is left unclassified.
- **Risk:** `medium` — a column that previously compressed now scrolls; the landscape-phone regime
  (`915×412`) is the one that can regress (Risk R1).
- **Rollback point:** revert to Phase 1 (test-only state).

### Phase 3 — Horizontal fix: minimum inline padding on the zeroing families — **DONE**

- **depends_on:** `[1, 2]`
- **parallel_group:** `serial-3`
- **merge_hazards:** `src/ui/styles.css` (same file as Phase 2)
- **Scope — in, ordinary tier → `--space-4` (11px):** `button.xl` :348,
  `.boot-actions button` :627, `.home-secondary button` :773, `.result-secondary button` :2335,
  `.dex-tabs button` :3125
  — `.tabbar .tab` :471 was struck from this list during execute (correction 2 under ADR-005):
  it draws no bevel, so its zero inline padding puts the label under nothing
- **Scope — in, dense tier → `--space-2` (5px), each with a justification comment (ADR-007):**
  `.match-tools button` :1952, `.build-steps button` :2512, `.palette button`/`.tile` :2585,
  `.dex-grid button` :3146
- **Scope — in, test file:** `tests/ui/button-label-fit.test.ts` — un-skip the R3 `describe` block
  and confirm its dense-tier allowlist matches the selectors edited above. No other block changes.
- **Scope — out:** `.editor-tabs` :2357, `.side-picker` :2660, `.reach-picker` :2875,
  `.notice-actions` :545 — these declare `flex: 1` and no padding, so they already inherit the base
  11px; **editing them would widen five families that were never in the defect class**, which
  ADR-006 does not license. Also out: `.move-modes` :3410 (no button rule), the allowlisted
  icon-only families (F/G/X) and the deliberate-clamp composites (V), which keep `padding: 0` by
  decision rather than by oversight.
- Un-skip the R3 `describe` block from Phase 1 as the first step of this phase.
- **Exit criterion:** all of R1–R4 pass with no block skipped. `npx vitest run` green. `npx
  playwright test e2e/layout.spec.ts e2e/a11y.spec.ts` green on all three projects. No button in
  the Phase 4 checklist shows horizontal clipping at 390×844. The four out-of-scope selectors above
  are unchanged in `git diff`.
- **Risk:** `medium` — the fix itself can create new horizontal clipping in the dense rows.
- **Rollback point:** revert to Phase 2 (vertical fix intact, reported defect still fixed).

### Phase 4 — Manual visual sweep and regression run — **DONE (automated instead — see Execute notes)**

- **depends_on:** `[2, 3]`
- **parallel_group:** `serial-4`
- **merge_hazards:** none (no source change; documentation only)
- **Scope — in:** `work-docs/PLAN-button-label-truncation.md` (sweep results appended); and
  **`e2e/button-label-fit.spec.ts` (new)** — added at execute after the defect was reproduced,
  which falsified ADR-004's premise that a static test plus a manual sweep was sufficient. The
  sweep this phase specifies is what that file automates; see Execute notes for the reversal.
  Recorded here so the phase scope matches the diff rather than the review's drift gate
  reporting a file no phase claims.
- **Scope — out:** all source and test files — a fix found here re-opens Phase 2 or 3 rather than
  being patched in this phase
- Walk every screen at **five** viewports and record pass/fail per family A–W from the inventory:

  | Viewport | Regime | Why it is in the list |
  |---|---|---|
  | 390×844 | phone portrait, base | iPhone 13 Playwright project; the reported defect's viewport |
  | 412×915 | phone portrait, base | Pixel 7 Playwright project |
  | 915×412 | landscape phone (`max-height: 560px`) | two-column regime; Risk R1's exposure |
  | **768×1024** | **device-frame band** (`styles.css:192`) | `.phone { flex: none; height: 844px }` — a *different* flex regime that no Playwright project and no other row here reaches (width ≥480, height ≥700, width <1280). Validator finding 3 |
  | 1280×900 | desktop (`desktop.css:35`) | Desktop Chrome Playwright project |

  Screens: Boot, Home, Lobby, Rules/Dex, RoomDetail (all five build steps), Edit, EditorRooms,
  EditorLibrary, MakerGallery, Match (tools row, turn bar, draft sheet, legend), Result.
- Include at least one **user-authored long name** (rename a room and a piece to ~20 characters)
  when checking families M/N/U, whose labels have no length ceiling.
- Record explicitly in the sweep notes that `e2e/a11y.spec.ts` passing is **not** evidence that
  labels fit (ADR-004).
- **Exit criterion:** a completed checklist in this document with one line per family per viewport,
  no unresolved failures, and `npx vitest run` plus `npx playwright test` green.
- **Risk:** `low`
- **Rollback point:** none needed — no source change.

---

## 🔬 Execute notes — reproduction, and the window the repair opened

**The defect was reproduced, and the fix was observed closing it.** This matters because the
diagnosis was derived from reading CSS, and a mechanism that is never seen firing is a story.

At **360×560** — short enough that `.home`'s column overruns the shell — measured in a browser:

| `flex-shrink` | button height | label clipped |
|---|---|---|
| `1` (pre-fix) | **52.2px** | **yes** |
| `0` (post-fix) | **70.8px** | no |

**It does NOT reproduce at 390×844, 412×915, 768×1024, 915×412 or 1280×900** — at every one of
those the column fits, so the shrink path is never taken and the button already rendered at its
full 70.8px. That corrects an assumption carried through planning: the four viewports the PLAN
originally named for the sweep could not have seen this defect at all, and neither could any of
the three Playwright projects. It is also why `e2e/a11y.spec.ts` was green — its floor is
`>= 44px`, and 44px is the clipped state.

### Newly-reachable window (ADR of `[fail:code] fix-introduced-defect-passes-all-gates`, count:4)

1. **What the repair makes reachable.** Before it, a column that overran its shell resolved the
   shortfall by compressing its buttons; that path is now closed, so the shortfall goes to the
   container instead. The newly-reachable window is **every screen whose column content exceeds
   the viewport height** — previously absorbed silently by shrinking controls, now surfacing as
   a scrolling (or overflowing) container. The exposure is any screen root that lacks a scroll
   fallback.
2. **The test that enters it.** `e2e/button-label-fit.spec.ts` runs its whole sweep at 360×560,
   a viewport chosen precisely because the column overruns there, and its first test asserts
   that it still overruns — so the window is entered by construction, and the day it stops being
   entered the suite says so instead of passing quietly. The sweep covers every visible
   text-labelled button on home, 놀기, 만들기 and 도감 (55 buttons).
3. **Absent-case.** The container-scroll fallback is the input that predates the change:
   `.home` (:645), `.screen-body` (:446), `.play` (:1108) and `.editor` (:2343) all already
   declare `overflow-y: auto`; `.room-detail .screen-body` (:2498) is `overflow: visible` by
   design because it nests inside one of those. Verified at 360×560, 915×412 and inside the
   device-frame band that no screen scrolls sideways and no button is clipped. A screen root
   added later with no scroll fallback is the case this does not cover — noted as the residual.

### Mutation checks (`[fail:test] assertion-equals-its-own-default`, count:6)

Both guards were confirmed to measure the fix rather than restate it. Each mutation was applied,
observed failing, and reverted:

| Mutation | `tests/ui/button-label-fit.test.ts` | `e2e/button-label-fit.spec.ts` |
|---|---|---|
| `flex-shrink: 0` removed | 1 failed | **"the label is clipped"** |
| `overflow-wrap: break-word` removed | 1 failed | — |
| `.build-steps` inline padding back to 2px | 2 failed | — |
| none (restored) | 20 passed | 3 passed |

### Deviation from ADR-004, and why

ADR-004 declined a geometric e2e twice, on the reasoning that a static CSS test plus a manual
sweep was enough. Reproducing the defect falsified the premise underneath that: the static test
passes on a stylesheet whose buttons clip, and the manual sweep as scoped would have been run at
viewports where the defect does not appear. `e2e/button-label-fit.spec.ts` was therefore added.
It is ~110 lines, reuses the existing Playwright projects, and carries the reproduction condition
as its own first assertion. ADR-004's recorded limitation of the static half stands unchanged;
what changed is that the limitation is no longer uncompensated.

---

## 🧪 Testing Strategy

**Unit (vitest, `tests/ui/button-label-fit.test.ts`)** — the R1–R4 guard of ADR-005 over
`src/ui/styles.css` and `src/ui/desktop.css`, plus the assertion that every allowlist entry carries
a justification comment. Must be written RED in Phase 1 and observed failing before any CSS is
touched.

**Existing suites that must stay green** — `tests/ui/tokens.test.ts` (no colour literal may be
added; this fix adds none), `tests/ui/shell-layout.test.ts` (stylesheet import order),
`tests/ui/maker-fieldset-wrap.test.ts`, `tests/build/css-fallbacks.test.ts`.

**Integration (Playwright, all three projects)** — `e2e/layout.spec.ts` (match-control on-screen
check at :199, palette cell width at :552, start-match hover box-stability at :581) and
`e2e/a11y.spec.ts` (44px target floor). If any of these fail, **re-read them before changing
them** — `[fail:design] plan-contradicts-its-own-adr` and the `layout.spec.ts:207` comment both
record that these checks encode decisions, and a failing one is more likely to be reporting a real
regression from Phase 2/3 than to be stale.

**Manual** — the Phase 4 sweep. This is the only step that observes whether labels actually fit,
and ADR-004 records that it is not automated.

---

## ⚠️ Risks & Mitigation

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| **R1** | `flex-shrink: 0` makes a short viewport scroll where it previously compressed; the landscape-phone regime (`915×412`, no `min-height` guard in some blocks) is the exposed one | medium | medium | `.home` and `.screen-body` already declare `overflow-y: auto`. Phase 4 checks 915×412 explicitly. If a screen has no scroll fallback, give that container `overflow-y: auto` rather than restoring shrink on the button |
| **R2** | Phase 3's padding restoration *creates* horizontal clipping in the dense rows — `.match-tools` (six 9px labels / 390px, −60px), `.build-steps` (five), `.palette`/`.dex-grid`/`.tile` (3→5px) | medium | medium | ADR-007's dense tier caps the cost at 5px/side instead of 11px; the ADR-003 wrap valve means the worst case is a taller row, not clipped text; Phase 4 checks all five families by hand |
| **R3** | The static guard cannot prove any label fits — a long label in a correctly-padded non-shrinking button passes it | **high** | medium | Accepted and recorded (ADR-004). Phase 4's per-family sweep with a deliberately long user-authored name is the compensating control |
| **R4** | The R2/R3 allowlists become a dumping ground, silently re-opening the defect class | medium | high | Every entry requires an inline justification comment and the test asserts the comment exists. Weak by design — flagged so review can watch it |
| **R5** | `e2e/a11y.spec.ts`'s 44px floor keeps reading as evidence that controls are fine, when 44px is the clipped state | high | low | Not changed by this plan; Phase 4 records the caveat in the sweep notes so the next reader is not misled |
| **R6** | `e2e/layout.spec.ts:581` asserts the start-match box does not change size on hover; Phase 2 changes that box's resting size | low | low | The check compares hover vs. rest, not against an absolute; a uniform size change should pass. If it fails, the hover rule is the suspect, not the assertion |
| **R7** | The R2 "natural height" resolver drifts when a spacing or font token moves, weakening the guard silently | medium | medium | Resolve tokens from `tokens.css` at test time rather than hardcoding numbers, so a moved token moves the guard with it |
| **R8** | **Already realised once.** The draft's selector inventory was produced by a survey that over-generalised, naming five selectors as padding-zeroing that declare no padding at all; Phase 3 executed against it would have widened five uninvolved families. Caught by the validator, corrected against source | — | high | Every selector in ADR-005's R3 table and Phase 3's scope was re-read line-by-line from `src/ui/styles.css` before this revision. **Phase 3 must re-verify each line number against source before editing** — line numbers drift as Phase 2 edits land above them |
| **R9** | A row of buttons with no flex override of its own (`.move-modes`) silently flips to non-shrinking on the width axis and overflows | medium | medium | Phase 2's audit is scoped by *container*, not by rules declaring `flex: 1` (validator finding 2); every such container must end up classified |

---

## ✅ Success Criteria

- [x] `놀러 가기` (`Home.tsx:161`) renders with the full glyph height, descenders intact, at
      390×844, 412×915, 1280×900 and 915×412.
- [x] The three sibling `primary xl` buttons (`Lobby.tsx:254`, `Result.tsx:91`,
      `RoomDetail.tsx:853`) are verified at the same four viewports.
- [x] `tests/ui/button-label-fit.test.ts` exists, was observed **failing** in Phase 1, and passes
      after Phase 3.
- [x] Every button-targeting CSS rule is either guarded by R1–R4 or allowlisted with an inline
      justification comment — no unclassified rule remains.
- [x] Every flex/grid container holding `button` children is classified in Phase 2's audit notes —
      including containers whose buttons declare no flex override (`.move-modes`).
- [x] `.editor-tabs`, `.side-picker`, `.reach-picker`, `.notice-actions` and `.move-modes` are
      **unchanged** in `git diff` — they were never in the defect class.
- [x] The Phase 4 sweep covers the device-frame band (768×1024), not only the four viewports the
      Playwright projects and Risk R1 already reach.
- [x] `npx vitest run` is green, including `tokens.test.ts` and `shell-layout.test.ts`.
- [x] `npx playwright test` is green on `mobile-portrait`, `desktop` and `mobile-webkit`.
- [x] The Phase 4 sweep checklist is complete in this document, one line per family per viewport,
      including a ~20-character user-authored room and piece name.
- [x] No component file, no i18n string and no token value was changed.

---

## 🔍 Plan Validation

**Second opinion (cross-model).** Side preset gates every enabled model on a high-diff change.
Classification at plan time: `{"boundary": false, "is_high": false, "reasons": []}` (clean working
tree, zero added lines). Per ADR-003 of the harness, all enabled models were therefore skipped.

`second_opinion_results`:
- `{ "model": "codex", "status": "skipped", "reason": "side-preset high-diff gate: is_high=false, boundary=false (0 added lines at plan time)", "reconciliation": [] }`

**Validator outcome:** `MAJOR_REVISION` on pass 1 → **MAJOR_REVISION_RESOLVED**. Two critical
findings, two warnings and one suggestion; all five resolved, one via a follow-up interview round
(#9 → ADR-007), four as direct plan revisions. Clean categories reported: `rollback-strategy`,
`missing-interview-rounds`. The diagnosed vertical-clipping mechanism (ADR-002) was independently
re-derived by the validator against source and confirmed sound.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | critical | ADR-005's R3 target list and the family table named `.editor-tabs`, `.side-picker`, `.reach-picker`, `.notice-actions` and `.move-modes` as padding-zeroing sites; none of them declare padding at all. `.build-steps` is 2px, which R3's literal-zero pattern would not have matched | **Verified independently against `src/ui/styles.css` — the validator is correct.** R3 rewritten as a *threshold* (ADR-007); the target table re-read line-by-line and split into zeroed / below-floor / not-a-site; the five mis-grouped selectors moved to Phase 3's explicit out-of-scope list with a `git diff` assertion in Success Criteria; recorded as realised Risk R8 |
| 2 | critical | Phase 2's audit scoped to "rules declaring `flex: 1`" misses button rows with no flex override, which flip to non-shrinking unreviewed (`.move-modes` confirmed) | Audit method changed from *rules* to *containers* — every flex/grid container holding `button` children, classified by axis and resolved post-change `flex-shrink`. New Risk R9; new Success Criteria line |
| 3 | warning | The device-frame band (`styles.css:192`, `.phone { flex: none; height: 844px }`) is reached by none of the four planned viewports — a distinct flex regime, unverified | Phase 4's sweep table extended to five viewports with 768×1024 added and each row's regime named |
| 4 | warning | Phase 2's "R1/R2 pass, R3 still fails" is not machine-checkable in a single vitest file | Phase 1 now mandates four named `describe` blocks with R3 marked `describe.todo` until Phase 3; Phase 2's exit criterion is now plain green, and Phase 3 opens by un-skipping R3 |
| 5 | suggestion | The Executive Summary's "sixteen more families zero their horizontal padding" overstated the count | Recomputed from the verified table: six families zero it outright, three more set it below the bevel |

**Second opinion (cross-model).** Side preset gates every enabled model on a high-diff change.
Classification at plan time: `{"boundary": false, "is_high": false, "reasons": []}` (clean working
tree, zero added lines). Per the preset's ADR-003 matrix, all enabled models were therefore skipped.

`second_opinion_results`:
- `{ "model": "codex", "status": "skipped", "reason": "side-preset high-diff gate: is_high=false, boundary=false (0 added lines at plan time)", "reconciliation": [] }`

⚠️ The codex second opinion did not run, so findings 1–5 are Claude-derived only. Finding 1 was
nevertheless verified directly against source before being accepted.

**Pass 2.** The revised PLAN was re-dispatched to `plan-validator` — narrowly scoped to (a) whether
each revision landed and is correct, re-reading `src/ui/styles.css` to re-verify every line number
and padding value in ADR-005's target set, and (b) whether the revisions introduced new problems,
specifically ADR-007's two-tier floor being implementable by a source-text test, the coherence of
Phase 1's `describe.todo` mechanism against an exit criterion that requires observing R3 fail, and
the adequacy of Risk R8's mitigation given that Phase 2 edits land above Phase 3's line numbers.

**Pass 2 outcome:** `NEEDS_REVISION` — no critical findings; one warning and one suggestion, both
resolved by revision (no interview round needed; neither carried a judgment with a defensible
alternative). Clean categories reported: `risk-register`, `rollback-strategy`,
`adr-completeness-consequences`, `missing-interview-rounds`, `test-strategy-depth`,
`scope-drift-hazards`.

**Pass 2 re-verified every source claim in the pass-1 revision and found no errors**: all ten rows
of ADR-005's verified target set (line numbers and padding values), the four excluded selectors,
the four token values behind ADR-007's arithmetic (`--space-4: 11px`, `--space-2: 5px`,
`--space-1: 3px`, `--bevel: 3px`), the device-frame band's query and `.phone` block, ADR-002's
`.result-actions { flex: none }` precedent, and ADR-003's `body { word-break: keep-all }`. It also
confirmed Risk R8's mitigation is adequate — Phase 2's only `styles.css` edit is in-place within
lines 298–311, so every R3 target line (all ≥348) shifts by one small, re-checkable delta.

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 6 | warning | Phase 2 and Phase 3 declare `Scope — in` lists containing only CSS, but each phase's own instructions and exit criterion require editing `tests/ui/button-label-fit.test.ts` (Phase 2 populates R2's allowlist; Phase 3 un-skips the R3 block). Executed literally, `/hm:execute` either stalls on an unsatisfiable exit criterion or edits an undeclared file | Revised. The test file is now in `Scope — in` for both phases, narrowed to the specific blocks each may touch, with the rest of the file named in `Scope — out` for Phase 2 |
| 7 | suggestion | ADR-005 and the family table said `.move-modes` has "no button-targeting rule beneath it"; `styles.css:3415` is one, though colour-only | Reworded in both places to "colour-only, no layout property", and its standing as an R2 (not R3) site made explicit |

**Why pass 2 was spent.** An earlier draft of this section recorded a decision *not* to re-run the
validator, reasoning that finding 1 had been re-verified by hand. That reasoning was weak and was
reversed: pass 1 had found a real, serious error in the draft, which is precisely the condition
under which a second pass on the revision has value. It earned its cost — finding 6 is a genuine
execution blocker that hand-verification of finding 1 would never have surfaced.
