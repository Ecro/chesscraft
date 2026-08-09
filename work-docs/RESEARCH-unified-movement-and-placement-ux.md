---
type: research
task_slug: unified-movement-and-placement-ux
status: complete
created: 2026-08-09
tags: [strange-chess, research, react, typescript, editor-ux, movement-model, board-placement]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://en.wikipedia.org/wiki/Betza%27s_funny_notation
  - https://www.chessvariants.com/page/MSbetza-notation-extended
  - https://www.chessvariants.com/page/MSinteractive-diagram-piece-sandbox
  - https://raw.githubusercontent.com/fairy-stockfish/Fairy-Stockfish/master/src/variants.ini
  - https://apps.apple.com/us/app/chesscraft/id6739758339
  - https://mooreinteractive.itch.io/super-chesslike-adventures/devlog/152133/piece-movements-in-chesslike-part-2-calculating-movements-and-the-5x5-grid
  - https://musketeerchess.net/site/tools/
  - https://raw.githubusercontent.com/lichess-org/chessground/master/README.md
  - https://www.chess.com/article/view/how-to-use-the-chesscom-diagr
  - https://lichess.org/forum/lichess-feedback/board-editor-ui-feature-request-replace-piece-drag-and-drop-with-highlight-and-click-place
  - https://www.yorku.ca/mack/interact2019.html
  - https://pmc.ncbi.nlm.nih.gov/articles/PMC7303424/
related_docs:
  - "[[PLAN-capture-rules-and-art-fixes]]"
  - "[[PLAN-piece-skill-creation-ux]]"
  - "[[PLAN-unified-create-ux]]"
  - "[[RESEARCH-unified-create-ux]]"
  - "[[RESEARCH-piece-skill-creation-ux]]"
  - "[[SPEC-unified-create-ux]]"
summary: "Make a grid cell carry the ray; reuse the room's 배치 painter for the board record."
---

# RESEARCH — One movement drawing, one placement painter

## 🎯 Recommended Direction

**Movement: put the ray *inside* the cell.** The leap grid and the slide dial are
not two questions — they are one field (a direction vector plus a range) drawn
twice, because the grid has no cell state meaning *"and keep going."* Give a cell
a third state and the dial has nothing left to say; it is deleted rather than
merged. This is the one change that also closes a shipped gap: `piece.charger`
(`maxDistance: 3`) opens **read-only** today and would become authorable.

**Placement: stop building a second board editor.** The UI the user is asking for
already exists and already writes the identical model — it is `RoomDetail`'s
`배치` step. `RecordForm`'s board fieldset is the only surface in the app that
renders a square as the literal text `a6`. Extract the room painter into a shared
component and have the board record use it.

The binding trade-off is not difficulty; it is that **the merge has already been
attempted once and is recorded as failed.** ADR-007 froze the model and tried to
merge only the *rendering*; that attempt was reverted twice and booked as
`NOT MET` (`work-docs/PLAN-capture-rules-and-art-fixes.md:494`). The reason it
failed is stated in the stylesheet post-mortem: making one drawing out of two
controls "means giving the inner grid up as a grid … and that is a model-shaped
change to a control ADR-007 froze, not a stylesheet tweak"
(`src/ui/styles.css:2769-2785`). **The recommendation here is therefore to do the
model-shaped change ADR-007 refused** — that refusal, not the CSS, is what made
the last attempt impossible.

## 🔍 Refinement Decisions

`--deep` not set; Phase 0 / 0.5 skipped.

**Discovery lens:** (1) User-workflow / product opportunity — the reported defect
is a comprehension failure by a child user, so shipped child-facing prior art and
touch-gesture evidence rank above architecture. (2) Technical architecture — the
merge is blocked by a model constraint and a test gate, both of which had to be
read verbatim before any option could be scored. The research/benchmark lens was
used only for Betza notation as a formal model, not as the primary frame.

## 🛠️ Approaches Found

### The measured starting point

The user reports "three expressions." The code has **seven surfaces in one
`<fieldset data-testid="editor-moves">`** (`src/ui/RecordForm.tsx:775`), all
rendered together and unconditionally for `kind === 'piece'`:

| # | Surface | Korean label | Editable? | file:line |
|---|---------|-------------|-----------|-----------|
| 1 | 7×7 leap grid | `어디로 뛰어가나요` | **yes** | `RecordForm.tsx:776`, cells `:803` |
| 2 | 8-direction dial + reach picker + clear + forward | `어느 쪽으로 쭉 미끄러지나요` | **yes** | `:826`, `:858`, `:866` |
| 3 | Engine-computed preview | `이렇게 움직여요` | no (`<span>`, `PiecePreview.tsx:238`) | `RecordForm.tsx:913` |
| 4 | Dex sentence | `도감에는 이렇게 적혀요` | no | `:916` |
| 5 | Two prose notes explaining leap-vs-slide | — | no | `:853-856`, ko `:600` |
| 6 | Separate capture-pattern editor | `어떻게 잡나요…` | **yes** | `:1290` |
| 7 | Read-only refusal view when `readGrid` returns null | — | no | `:976` |
| 8 | Top-of-form one-line summary | — | no | `:601`, rendered `:1180` |

So the count is worse than reported: **three editable writers** of movement
(1, 2, 6 — and 6 writes `d.attack` uncoordinated with the grid's own `commit` at
`:754-755`), plus four derived read-only views. Nothing in `work-docs/` ever
decided the screen should show all of them at once; each was added by its own
justified ADR (ADR-027 split, ADR-028 shared cycling, ADR-032 preview-as-oracle)
and the co-presence is accretion.

### The model constraint that decides everything

`readGrid` (`src/ui/PieceMoves.tsx:153`) collapses to `null` — dropping the whole
editor to surface 7 — on three conditions, verified directly:

- **Reach is shared, not per-direction**: `if (reaches.size > 1) return null`
  (`PieceMoves.tsx:178`). The `PieceGrid.reach` field is documented as
  "Shared cap for every enabled direction" (`PieceMoves.tsx:82`).
- **Only reach 1 / 2 / edge exists**: `REACH_VALUES = [1, 2, 'edge']`
  (`PieceMoves.tsx:76`); `reachOf` yields `null` for anything else, so
  `maxDistance: 3` fails the `reaches.has(null)` guard at `:177`.
- **Slide vectors must be the 8 compass units**:
  `const dir = DIR_BY_VECTOR.get(key(df, dr)); if (!dir) return false`
  (`PieceMoves.tsx:194-195`) — a nightrider-style repeating knight vector is
  unrepresentable in either control.

The third point is the important one for the merge: **because a slide is always
one of the 8 compass rays, a slide is exactly a contiguous line of grid cells
outward from the centre.** The dial carries no information the grid's own
geometry cannot carry. What the grid lacks is only the "beyond ±3" case.

---

### Approach M-A — Ray-cell grid (recommended)

| Field | Content |
|-------|---------|
| **Approach** | Cell gains a ray state. `Cell` becomes off / leap / slide-through, orthogonal to the existing Move-Capture axis. Painting a compass cell as *slide* implicitly owns the ray from the centre to that cell; painting the outermost ring cell as slide with an "and beyond" mark means `edge`. Surfaces 2 and 5 are deleted. Surface 6 is folded into the grid's existing Move/Capture cycling. |
| **Assumption** | That `PieceGrid.reach` may become **per-direction** — a widening of the model ADR-007 froze. |
| **Evidence** | Betza treats leap and slide as one atom plus a repeat count: "if the step can be repeated … an integer suffix is written on the atom to indicate the maximum number of steps" (Wikipedia, Betza). Shipped instance of the exact collapse: Super Chesslike Adventures encodes one 5×5 grid where cells are `1` move-only, `2` attack-only, `3` both, and string values denote "recursive directions" for sliding. Musketeer's Board Painter ships the visual vocabulary — "Circle = can slide to the square … Arrow means, can leap (or jump) to the square." Contra: ChessCraft, the one mass-market child-facing designer, kept them split — "any combination of the 8 bishop or rook slides, plus a 7x7 grid of knight-like hops." |
| **Trade-off** | Buys the single drawing the user asked for **and** closes the `piece.charger` gap (per-direction range makes `maxDistance: 3` expressible for the first time). Pays with a model change that invalidates ADR-007's freeze and forces `tests/editor/vocabulary-coverage.test.ts` to be **re-derived, not edited** — the file whose modification ADR-007 declared the stop signal (`PLAN-capture-rules-and-art-fixes.md:455`). |
| **Compatibility** | `writeGrid` still emits the same `MovePattern[]`; the engine is untouched (`reachFrom` already branches only on `kind === 'slide'`, `engine.ts:122`). Widening is backward-compatible on read: every record that opens today still opens. |
| **Risk** | **high** — but the risk is concentrated in the test gate, which is exactly where the record says it should be. |

### Approach M-B — Delete only the derived views, keep grid + dial

| Field | Content |
|-------|---------|
| **Approach** | Keep surfaces 1 and 2 as-is. Delete or collapse 3, 4, 5, 8 into a single derived view; fold 6 into the grid. |
| **Assumption** | That the user's "3가지" complaint is about *reading four panels*, not about grid-vs-dial. |
| **Evidence** | The expert tools all keep exactly **one editable representation plus one derived read-only view** — chessvariants' sandbox is a single XBetza text field with a generated diagram; Fairy-Stockfish is a single `customPiece1 = p:mfWcfF` string. That asymmetry is the pattern M-B copies. |
| **Trade-off** | Near-zero model risk and shippable in one pass; the coverage gate passes unmodified. But it does **not** satisfy the stated requirement — the user named `어디로 뛰어가나요` as the one that should survive, which is surface 1, and M-B keeps surface 2 alive next to it. ADR-007 already booked this exact cost as accepted-and-then-complained-about (`PLAN-piece-skill-creation-ux.md:107`: "the author must learn that 'does it slide' and 'where does it hop' are different questions"). |
| **Compatibility** | Total. |
| **Risk** | **low** — and low value. Best used as M-A's first stage, not as the answer. |

### Approach M-C — Contiguity compilation (grid alone, no new cell state)

| Field | Content |
|-------|---------|
| **Approach** | No new cell state; infer intent — contiguous lit cells outward from centre compile as `slide`, isolated cells as `step`. |
| **Assumption** | That intent can be inferred from geometry. |
| **Evidence** | Already considered and **rejected on record** (`PLAN-capture-rules-and-art-fixes.md:155`): "elegant, but it makes exactly-distance-3 unexpressible … and rewrites the round-trip the vocabulary gate measures." |
| **Trade-off** | Cheapest visually; ambiguous semantically — a piece that both leaps to (0,2) and steps to (0,1) is indistinguishable from a 2-slide, and `edge` has no encoding at all. |
| **Compatibility** | Breaks round-trip byte-stability. |
| **Risk** | **high**, with no compensating gain. Listed to record that it was re-examined and the prior rejection still holds. |

---

### Approach P-A — Extract the room's 배치 painter and reuse it (recommended)

| Field | Content |
|-------|---------|
| **Approach** | Lift `RoomDetail`'s placement step into a shared component and render it for `kind === 'board'` in `RecordForm`, replacing the algebraic button pair. |
| **Assumption** | That the two write the same model. **Verified: they do.** Both produce `{ square, pieceId, side }` into `boardDef.placements` (`src/content/schema.ts:438-483`), keyed by the same `squareRef` regex (`schema.ts:167-168`). |
| **Evidence** | `배치` is `ui.editor.step.place` (`src/i18n/ko.ts:700`), rendered at `src/ui/RoomDetail.tsx:677`, and it is already a tap-to-place painter: the algebraic string is only an `aria-label`, the cell body is the piece's own art via `<MarkBody>`, side and piece are tile palettes with marks, and there is a live count and a clear-all (`RoomDetail.tsx:695-756`). Its hint already reads exactly like the interaction the user wants: "편과 기물을 고른 다음 판을 눌러 세우세요. 세운 자리를 다시 누르면 치워져요" (`ko.ts:705`). By contrast `RecordForm.tsx:1378-1401` renders **two buttons per square**, one whose visible text is the literal `{sq}` and one showing `·`/`w`/`b`, with `<select>` dropdowns for piece and side. |
| **Trade-off** | One shared component instead of two divergent ones; also resolves a live hazard — **both components already use the same `data-testid` namespace `place-${square}`** (`RecordForm.tsx:1395` and `RoomDetail.tsx:709`), so any selector-based test must currently disambiguate by screen. Cost: `RecordForm`'s board fieldset also paints square *types* (`paint-${sq}`), which the room handles as a separate step (`판 칠하기`), so the extraction must carry a mode, not just a grid. |
| **Compatibility** | High. No schema change. One behavioural difference to decide: the room painter offers only pieces the room lists (`RoomDetail.tsx:732`), the record form offers all pieces in the source (`RecordForm.tsx:1354`) — the standalone board record has no room to scope by, so it keeps the wider list. |
| **Risk** | **medium** — the record warns twice that this fieldset is the board's *only* surface and that deleting its container would silently drop the board editor (`PLAN-unified-create-ux.md:287`, risk row `:848`). |

### Approach P-B — Delete the standalone board record editor

| Field | Content |
|-------|---------|
| **Approach** | Boards are editable only inside the room maker; drop `board` from `EDITABLE_KINDS` (`src/editor/draft.ts:21-29`). |
| **Assumption** | Nobody authors a board outside a room. |
| **Evidence** | Not established. `EditorLibrary` currently offers every kind in a picker (`EditorLibrary.tsx:158`). |
| **Trade-off** | Smallest surface area; removes a whole screen. But it makes a shipped board record uneditable from the library, which is the shape of a recorded failure — a save-block premised on an incomplete survey "made a shipped piece uneditable" (`.claude/memory/failures.md:74`). |
| **Compatibility** | Would need the ADR-006 gate re-derived, since a vocabulary entry may lose its only control. |
| **Risk** | **high**. |

### Approach P-C — Cosmetic swap only

Replace `{sq}` text with the piece mark and the `<select>`s with tile palettes,
leaving the two implementations separate. **Risk low, but it re-authors the
painter a second time** and leaves the `place-${square}` test-id collision in
place. Listed for completeness; P-A dominates it at similar cost.

## ⚠️ Pitfalls

1. **This merge already failed once, in the layout.** The 9×9 ring layout "was
   attempted and REVERTED, twice"; `.move-grid` carries `width: 294px` and
   `.move-cell` `aspect-ratio: 1`, so the outer track sizing and the inner grid's
   intrinsic sizing "each insisted on a different size and the map came out
   clipped" (`src/ui/styles.css:2769-2785`). M-A avoids this only because it
   deletes the ring instead of laying it around the grid — if any design puts
   direction controls *outside* the 7×7, it will hit the same wall.

2. **Deleting a form deletes affordances that were only there.** Two were lost
   the last time and found only by converting the tests: `grid.forward` had lived
   in the model since ADR-027 with no control on the grid, and clear-all vanished
   with `editor-clear-movement`, making a shipped piece's reset "twenty-four taps"
   (`PLAN-unified-create-ux.md:643-652`). Before deleting surface 2, enumerate
   what *only* it can write — today that is `reach`, `forward`, and `piece-clear`.

3. **jsdom cannot see a control that became unreachable.** "Testing-library's
   `fireEvent` does not enforce visibility and Playwright does, so a control moved
   behind a `hidden` panel keeps every jsdom test green while being unreachable to
   a real user" — four regressions rode through on that, with the 71-test coverage
   gate passing **unchanged** (`.claude/memory/failures.md:173`).

4. **The coverage gate currently pins the split.**
   `tests/editor/vocabulary-coverage.test.ts:1041` asserts, in one test named
   *"has ONE set of movement controls"*, that `piece-cell-1,2` **and**
   `piece-slide-n` **and** `piece-forward` are all simultaneously present and
   enabled. Removing the dial fails it. Per ADR-007 that failure is the declared
   stop signal — so M-A must **re-derive** the gate against the new control set,
   and the recorded rule is that a gate "enumerated along one axis is blind to
   extensions along every other axis" (`.claude/memory/failures.md:54`).

5. **Never block save on a record the editor cannot draw.** The standing rule:
   "suppressing the EDITOR for that half is what prevents the flatten … a
   save-block instead made a shipped slice piece uneditable"
   (`.claude/memory/wiki.md:129`). Whatever M-A cannot represent must fall to the
   read-only refusal view (surface 7), not to a disabled save button.

6. **Drag-and-drop is the wrong reflex for P-A.** Do not "upgrade" the painter to
   dragging. Measured on 7–8-year-olds: tap 83%, drag-and-drop 30%, tap-and-hold
   60% (PMC7303424). The FittsFarm authors state the recommendation directly:
   designers "should consider other types of interaction, such as select-and-tap …
   over a drag-and-drop approach," with finger error rates 35% higher than stylus
   and doubling on small targets. The same source's "apps for children aged 8 years
   or less should not use textual prompts" is independent evidence against the
   `a6` labels regardless of interaction style.

7. **A rule documented away from its code does not survive a rewrite**
   (`.claude/memory/failures.md:144`). The leap-vs-slide rationale currently lives
   in a CSS comment and in `PieceMoves.tsx`'s header; if M-A rewrites either file,
   that rationale must move with it or be deliberately retired in writing.

## ❓ Open Questions

1. **Is `reach` allowed to become per-direction?** This is the single decision
   that separates M-A from M-B. It reopens a model ADR-007 explicitly froze, and
   it is the only route by which `piece.charger` (`maxDistance: 3`, "the **only**
   shipped piece" in read-only state — `PLAN-capture-rules-and-art-fixes.md:508`)
   becomes authorable.

2. **How does a cell say "and keep going" past ±3?** Three candidates: an arrow
   glyph on the outermost ring cell (Musketeer's vocabulary), a fourth cycle state
   reachable only on ring-3 cells, or a long-press. Long-press is disqualified by
   the 60% gesture figure above; the choice is between the first two.

3. **Does the capture editor (surface 6) fold into the grid, or is it deleted?**
   It is a second, uncoordinated writer of `d.attack` alongside the grid's own
   `commit`. Folding it in means the Move/Capture cell axis must be able to say
   everything it says; that has not been measured against bundled content.

4. **Do the derived views (3, 4, 8) all survive?** ADR-032 makes the preview a
   verification oracle, not decoration — "the preview cannot drift from match
   behaviour, because it *is* match behaviour." The dex sentence is a text
   generator the author can accept as the record's description. Prior art says keep
   **one** derived view; which one is a product call, not a technical one.

5. **Does the board record keep square-type painting in the same screen?** The
   room splits it into `판 칠하기` and `배치` as separate steps; `RecordForm` does
   both at once with two buttons per square. Parity with 배치 implies splitting —
   which changes the board record's screen shape, not just its widgets.

6. **Which of the two `place-${square}` test-id owners keeps the name?** They
   collide today and the collision is currently harmless only because the
   components never co-render.

## 📚 Sources

- Betza's funny notation — https://en.wikipedia.org/wiki/Betza%27s_funny_notation
- Betza notation (extended) / XBetza — https://www.chessvariants.com/page/MSbetza-notation-extended
- Interactive Diagram Piece Sandbox — https://www.chessvariants.com/page/MSinteractive-diagram-piece-sandbox
- Fairy-Stockfish `variants.ini` — https://raw.githubusercontent.com/fairy-stockfish/Fairy-Stockfish/master/src/variants.ini
- ChessCraft (App Store listing) — https://apps.apple.com/us/app/chesscraft/id6739758339
- Super Chesslike Adventures devlog, 5×5 movement grid — https://mooreinteractive.itch.io/super-chesslike-adventures/devlog/152133/piece-movements-in-chesslike-part-2-calculating-movements-and-the-5x5-grid
- Musketeer Chess Board Painter — https://musketeerchess.net/site/tools/
- Chessground README (click and drag as peer modalities) — https://raw.githubusercontent.com/lichess-org/chessground/master/README.md
- Chess.com diagram editor — https://www.chess.com/article/view/how-to-use-the-chesscom-diagr
- Lichess feedback, select-then-place request — https://lichess.org/forum/lichess-feedback/board-editor-ui-feature-request-replace-piece-drag-and-drop-with-highlight-and-click-place
- FittsFarm, INTERACT 2019 — https://www.yorku.ca/mack/interact2019.html · https://dl.acm.org/doi/10.1007/978-3-030-29387-1_38
- Children's touchscreen gesture capability by age — https://pmc.ncbi.nlm.nih.gov/articles/PMC7303424/

**Not found / not verified:** primary-source usability evidence on redundant
parallel *editable* representations in authoring tools (the argument in M-B rests
on shipped-tool convergence, not on a study); SCID and ChessBase position-setup
docs; any Korean-language children's chess-creation app.

## 🔗 Related Internal Docs

- [[PLAN-capture-rules-and-art-fixes]] — ADR-007 froze the model and merged only
  the rendering; recorded `NOT MET`. The governing prior decision.
- [[PLAN-piece-skill-creation-ux]] — ADR-027 (axes split), ADR-028 (shared
  cycling), ADR-031 (step tabs permitted), ADR-032 (preview calls the engine).
- [[PLAN-unified-create-ux]] — ADR-003 extend-first-delete-last; ADR-006 `jump`
  retirement; the board painter's three scope-outs and risk row R8.
- [[RESEARCH-unified-create-ux]] — measured that a board "has no simple maker."
- [[RESEARCH-piece-skill-creation-ux]] — F2 (`step` and `jump` are the same
  thing), F8 (the room builder was already step tabs).
- [[SPEC-unified-create-ux]] — "The board and room screens are not redesigned"
  (`specs/SPEC-unified-create-ux.md:149`), the exclusion this task reverses.
