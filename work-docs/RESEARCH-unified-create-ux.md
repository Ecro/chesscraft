---
type: research
task_slug: unified-create-ux
status: complete
created: 2026-08-08
tags: [strange-chess, research, react, typescript, editor-ux, progressive-disclosure, information-architecture]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://en.wikipedia.org/wiki/Progressive_disclosure
  - https://www.nngroup.com/articles/progressive-disclosure/
  - https://docs.blockly.com/publications/papers/TipsForCreatingABlockLanguage.pdf
related_docs:
  - "[[RESEARCH-piece-skill-creation-ux]]"
  - "[[REVIEW-piece-skill-creation-ux-2026-08-08]]"
  - "[[PLAN-ui-ux-productization]]"
  - "[[RESEARCH-ui-ux-productization]]"
  - "[[REVIEW-chess-craft-pixel-redesign-2026-08-07]]"
  - "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
summary: "Delete the 쉽게/자세히 tabs; make the sentence builder total (4 additions cover 100% of bundled content)."
---

# RESEARCH — One maker screen, no easy/advanced split

## 🎯 Recommended Direction

**The tabs are not the disease. They are the scar tissue over one fact: the easy
surface cannot say everything, so a second surface had to exist to say the rest.**
Remove the tabs without closing that gap and the maker gets worse, not better —
the child would meet the hard form by scrolling instead of by tapping.

The direction with the best cost-to-relief ratio is to **make the sentence
builder total, then delete the tab strip and the indexed-palette form behind
it.** The gap is far smaller than the split implies, and it is fully enumerable
from the bundled content:

- **Pieces: the gap is already closed.** All **6 / 6** bundled pieces round-trip
  through the easy move grid — `readGrid` refuses none of them (measured
  2026-08-08 against `bundledContentSource`). Everything else the expert tab
  holds for a piece is two scalars (`royal`, `promotion`) plus effects.
- **Cards: 8 of 26 refuse**, and for exactly four reasons, not for "the grammar
  is deep":

  | Cause | Cards | What it needs on one screen |
  |---|---|---|
  | `forEach: piece` quantifier | 6 (`king-of-the-hill`, `fast-promotion`, `royal-bodyguard`, `last-stand`, `knights-honour`, `skill.charge`) | one more slot — "누구마다" |
  | two actions in one effect | 1 (`skill.sacrifice`) | a "그리고 또" repeat |
  | 2-target action (`swap_pieces`) | 1 (`skill.swap`) | a second 누구 slot, only for that action |
  | compound condition (`all`) | 1 (`king-of-the-hill`, same card) | 그리고/또는 chips on the 이럴 때만 slot |

- **Multiple effects per record: used by zero bundled cards.** Every one of the
  26 has exactly one `effects` entry. The multi-effect machinery — the
  `editor-effect-{i}` index cursor, `editor-action-{i}`, the selected-effect
  state — is the most confusing thing in the form and it authors a shape nothing
  in the game uses.

Close those four and the easy surface expresses **100%** of shipped content;
the "자세히" tab then has nothing left that a child could not reach, and
`ui.editor.card.complex` ("위쪽 '자세히' 탭에서 고쳐 주세요") stops pointing at a
tab that no longer exists.

Impact is user-facing, not maintainer-facing: this is the screen a child spends
the most uninterrupted time on.

## 🔍 Refinement Decisions

`--deep` was not set — no Phase 0 interview. Discovery lens: **User-workflow /
product opportunity** (primary) + **Technical architecture / implementation**
(secondary). The equivalent of the capability × artifact matrix for a local game
with no external artifacts is the surface × record-kind map below.

**What each record kind's whole content actually is** (`src/ui/RecordForm.tsx`):

| Kind | Picture | Structure | Scalars | Has tabs today |
|---|---|---|---|---|
| piece | art picker | move grid (`PieceMoves`) + effects | royal, promotion | ✅ 쉽게/자세히 |
| ruleCard | art picker | effects | — | ✅ |
| skillCard | art picker | effects | uses | ✅ |
| squareType | art picker | effects | paired | ❌ one screen already |
| board | — | paint/place grid | width, height | ❌ |
| preset | — | selects | — | ❌ |

Half the app already lives on one screen. `hasSimple = kind === 'piece' ||
kind === 'ruleCard' || kind === 'skillCard'` (`RecordForm.tsx:292`) is the whole
of the split, and the reason recorded in the comment at `RecordForm.tsx:1414` is
"a board and a room have no simple maker" — i.e. the tabs exist where an easy
surface happened to be built, not where authoring is genuinely two-tiered.

Note the consequence nobody chose: **`squareType` gets the hardest editor with
no easy front door at all.** Its effects are authored only through the indexed
palette (`editor-add-effect` → `palette('condition')` → `palette('action')` →
`actionParams()`), because the recipe view is gated to `ruleCard | skillCard`
(`RecordForm.tsx:1235`). Unifying on the sentence builder fixes that as a side
effect rather than as extra work.

## 🛠️ Approaches Found

### A — Totalize the sentence, then delete the tabs *(recommended)*

| Field | Content |
|---|---|
| Approach | One scrolling screen per record: picture → sentence(s) → scalars → preview → save. The four-slot recipe grows a quantifier slot, a "그리고 또" action repeat, 그리고/또는 condition chips, and a second target slot for `swap_pieces`. The indexed-palette effects form is deleted. The same builder serves piece / squareType / ruleCard / skillCard, since `EFFECT_HOSTS` is already all four (`controls.ts:37`). |
| Assumption | Every record's meaning is expressible as one or more readable sentences. Bundled content supports this: 26/26 cards are one effect, and 25/26 are one action. |
| Evidence | Measured refusal set above; `optionsFor()` already derives every slot's options from `VOCABULARY_CONTROLS` (`CardRecipe.tsx:57-73`), so widening a slot is removing a filter (`WRAPPING`, `EXCLUDED_ACTIONS`), not writing a second vocabulary. Blockly's own guidance is that readable sentences "can be used to express more complex concepts than icons, while still feeling familiar" — depth is affordable in a sentence, it does not need a second mode. |
| Trade-off | The largest change. ~47 vocabulary entries plus their parameters (`duration`, `forEach.pieceId/side`, `destination.offset df/dr`, `on_square.squares`) must each find an inline home, and ADR-006's coverage gate (`tests/editor/vocabulary-coverage.test.ts`) must be re-pointed control by control. Four e2e specs reference `form-tab-expert`. |
| Compatibility | No schema change. No content migration. `writeRecipe` already writes through the real validator, and the live-validation + engine preview pipeline (ADR-033, `PiecePreview`) is orthogonal and keeps working. |
| Risk | medium |

### B — One scroll, inline `<details>` instead of tabs

| Field | Content |
|---|---|
| Approach | Keep both surfaces, drop the tab strip, put the expert controls under a `<details>` disclosure right beneath the easy control they detail — the same idiom `ui.editor.form.advanced` already uses for the two key fields (`RecordForm.tsx:1387`). |
| Assumption | The user's complaint is about the *mode choice*, not about the hard form's existence. |
| Evidence | Progressive disclosure's documented conditional form is exactly this ("hiding certain elements until the user explicitly requests them"); the pattern's own pitfall is that it should defer *advanced* features, not *essential* ones — and `forEach` is essential here, it is 6 of the 8 refusals. |
| Trade-off | Cheap and low-risk, but it does not deliver "모두 설정 가능하고, 최대한 쉽게". The indexed palette stays; a child who needs `forEach` still meets it. It relabels the cliff rather than removing it. |
| Compatibility | Highest — test ids survive, gate untouched, e2e needs one selector change. |
| Risk | low |

### C — Generate the form from the Zod schema

| Field | Content |
|---|---|
| Approach | Derive controls mechanically from `content/schema.ts` so coverage is structural and there is one surface by construction. |
| Assumption | A generated form can be as legible as a hand-written sentence. |
| Evidence | Against: ADR-006 explicitly bought the opposite trade — the coverage test's header calls itself "the price that ADR paid for hand-crafted forms", accepting a three-place edit (schema, table, editor) to keep the forms hand-written. A generated form also produces a field per schema key, which is precisely the shape the child cannot read. |
| Trade-off | Kills the legibility this whole task is about. |
| Compatibility | Would reverse a standing ADR. |
| Risk | high — **not recommended**, listed to close it. |

## ⚠️ Pitfalls

1. **Removing the tab without closing the gap makes it worse.** The refusal
   notes literally name the tab (`'ui.editor.card.complex-hint'`: "위쪽 '자세히'
   탭에서 고쳐 주세요"). Any residual refusal must become an *inline, in-place*
   explanation of what the record does, not a pointer to a destination that no
   longer exists. A pointer to nothing is worse than a tab.

2. **Silent flattening is the failure this codebase already refused once.**
   `readGrid` / `readRecipe` return `null` rather than dropping information
   (`PieceMoves.tsx:25-31`, `CardRecipe.tsx:88-95`), and the recorded reason is a
   child opening `rule.royal-bodyguard` and seeing a card quietly reduced to a
   third of itself. Any new slot must round-trip, proven by test, before it is
   allowed to open a record it previously refused.

3. **The absent case is where the feature disappears.** (Learned correction
   2026-06-08, count 8.) Every new optional slot needs its absent behaviour
   stated: no `forEach` = "모든 것에" or a hidden slot? no second action = the
   "그리고 또" affordance still visible? `takesTarget()` false = the 누구 slot
   disabled-but-present (today's choice, `CardRecipe.tsx:51`) or removed? Pick
   per slot and write it down.

4. **A single long form is exactly the shape that broke the shell.**
   `[fail:render] unbounded-parent-defeats-inner-scroll` — 4,700px of editor form
   inside a `min-height: 100dvh` shell scrolled nothing, and only the tallest
   screen surfaced it. Merging two panels into one scroll makes the tallest
   record taller still. Any layout change must be re-measured on the longest
   record, not on a fresh empty draft.

5. **The coverage gate is reachability *in the render*, not in a table.**
   `vocabulary-coverage.test.ts` asserts each control is present **and enabled**,
   writes its own value at its own JSON path, and round-trips. Both panels stay
   mounted today specifically so the gate can reach expert controls while hidden
   (`RecordForm.tsx:1394-1399`). Deleting the expert panel deletes the gate's
   current handholds — the gate must move with the controls in the same change,
   or coverage silently drops.

6. **jsdom cannot see this class of bug.** The `uses` field sat in the wrong
   panel and jsdom passed it — `fireEvent` ignores visibility, Playwright does
   not (`RecordForm.tsx:1443-1447`). Panel-membership and reachability claims
   need an e2e assertion, not a unit one.

## ❓ Open Questions

1. **Total, or total-minus-a-tail?** Closing all four gaps reaches 100% of
   bundled content. Multi-*effect* records (zero in bundle, still schema-legal)
   and arbitrary `movement` patterns outside the grid model would remain
   unauthorable. Accept a read-only "이건 지금 화면에서 못 고쳐요" for those, or
   author them too?
2. **Where do the raw palettes go?** Deleted outright, or kept as a per-slot
   bottom sheet? The app already owns a focus-trapped `Sheet` (`src/ui/Sheet.tsx`,
   used only by `MatchHost` and `Rules` today) — a slot that opens a sheet of
   pictured options is more tappable on a 390px phone than a `<select>`, but it
   is a second interaction model to teach.
3. **Does the piece get sentences too?** `EFFECT_HOSTS` admits piece effects, and
   no bundled piece uses them. Unify now, or leave piece = grid + scalars and
   defer?
4. **What stays pinned on a phone?** One long scroll needs an anchor — the
   engine preview, the save button, or the live-error list. Today all three are
   in flow.
5. **Test-suite scope.** Re-point ADR-006's table + rewrite `e2e/editor-refusal.spec.ts`
   (its whole subject is the refusal→tab handoff), or retire it and replace with a
   round-trip spec per newly-openable shape?
6. **Is 자세히's disappearance reversible?** Once the tab strip and `form-panel-expert`
   go, the four e2e specs and the gate lose their selectors. Worth a single
   commit boundary so a revert is one commit, not a reconstruction.

## 📚 Sources

- [Progressive disclosure — Wikipedia](https://en.wikipedia.org/wiki/Progressive_disclosure) — the pattern's three implementations (step-by-step / conditional / contextual) and its stated pitfall: defer *advanced* features, never *essential* ones.
- [Progressive Disclosure — Nielsen Norman Group](https://www.nngroup.com/articles/progressive-disclosure/) — Nielsen's 1995 formulation; carried over from [[RESEARCH-piece-skill-creation-ux]].
- [Tips for Creating a Block Language — Blockly (Pasternak et al.)](https://docs.blockly.com/publications/papers/TipsForCreatingABlockLanguage.pdf) — natural-language sentence blocks express more complex concepts than icons while staying familiar. *Cited from search summary; the PDF did not extract to text on fetch, so treat the wording as indicative rather than verbatim.*

## 🔗 Related Internal Docs

- [[RESEARCH-piece-skill-creation-ux]] — the axis split that made the piece grid total; this doc is its card-side sequel.
- [[REVIEW-piece-skill-creation-ux-2026-08-08]]
- [[PLAN-ui-ux-productization]] / [[RESEARCH-ui-ux-productization]]
- [[REVIEW-chess-craft-pixel-redesign-2026-08-07]] — recorded that both makers "REFUSE to open on a record they cannot round-trip … and the screen points at the detailed form".
- [[VOCAB-GAPS-variant-chess-6x6-cards]] — the vocabulary this screen must stay total against.
- Memory: `[wiki:architecture] piece-maker-split-axes`, `[fail:render] unbounded-parent-defeats-inner-scroll`.
