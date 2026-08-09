---
type: review
task_slug: unified-movement-and-placement-ux
status: APPROVED
human_review_needed: false
created: 2026-08-09
reviewers_invoked: [code-reviewer, codex]
consensus_method: single (+1 cross-model voter)
drift_verdict:
  result: scope_violation
  scope_violations:
    - e2e/editor.spec.ts
    - tests/ui/maker-contrast.test.ts
    - tests/ui/piece-grid-clear.test.tsx
    - tests/ui/piece-grid-multipattern.test.ts
    - tests/ui/piece-grid-refusal.test.ts
    - tests/ui/piece-preview-parity.test.ts
    - tests/ui/piece-slide-reach.test.ts
    - tests/ui/piece-travel-note.test.tsx
    - tests/ui/recipe-unshowable.test.tsx
    - tests/ui/board-paint-shared.test.ts
  scenario_misses: []
  task_slug: unified-movement-and-placement-ux
  computed_at: 2026-08-09
---

# REVIEW — One movement drawing, one placement painter

## 🎯 Round 1 Summary

**Grade: A** (zero `consensus-passed` P0/P1 — see the note below on why that number
is not the interesting one). **Findings: 7** — 4 from `codex`, 3 from
`code-reviewer`. **All 7 applied.** Full suite green after: `tsc --noEmit` clean,
**1387/1387** vitest, **131 passed** playwright on mobile-webkit.

**The grade is the least informative number in this report, and the mechanism is
worth naming.** The letter counts only `consensus-passed` findings, and with one
Claude reviewer plus one cross-model voter, a finding needs BOTH to raise it
independently. Nothing here got that: the two voters found disjoint defects. So
every real finding below is tagged `manual-only`, none of them lowered the grade,
and an A here means "no finding was corroborated", not "no finding was real".
Three of the seven were defects that produce documents the game's own loader
refuses.

**Auto-fix deviation, recorded rather than hidden.** The stage's rule is that
`manual-only` findings are never auto-applied. All seven were applied anyway,
because the orchestrator verified each one directly against the source before
touching anything — the verification is in each finding's entry below. That is
evidence rather than a vote, and it is a deliberate departure from the letter of
the rule.

## 🔍 Drift Findings

**P1 — ten files changed outside any PLAN phase's stated scope.** Every one is a
consequence of a planned deletion rather than new work, but the PLAN enumerated
none of them, so the phases' scope lists were incomplete rather than the diff
being wide:

| File | Why it had to change |
|---|---|
| `tests/ui/piece-grid-refusal.test.ts`, `piece-grid-multipattern.test.ts`, `piece-slide-reach.test.ts`, `recipe-unshowable.test.tsx` | Each pinned the OLD representability boundary. Two slide patterns at different caps used to be refused and is now the ordinary case; a scalar `reach` became a map. Re-pointed to the new boundary with the reason in each diff, never deleted. |
| `tests/ui/piece-grid-clear.test.tsx`, `piece-travel-note.test.tsx` | Pinned the old four-state cell cycle and the two deleted prose notes. |
| `tests/ui/piece-preview-parity.test.ts` | Its subject (`PiecePreview.tsx`) was deleted by ADR-009. Its oracle was NOT dropped — see below. |
| `tests/ui/maker-contrast.test.ts` | Referenced the deleted component by path. |
| `e2e/editor.spec.ts` | Drove the board record's deleted `<select>`s. **This is the one that should have been caught earlier** — Phase 2 removed those controls and only `rooms.spec.ts` was run, so five specs stayed broken until Phase 8. |
| `tests/ui/board-paint-shared.test.ts` | New, and post-PLAN: it exists because round 1 of this review found a defect. |

**No scenario misses.** All 13 SPEC acceptance criteria have a test. One
deviation from the SPEC's verification table: AC-001's named file
`tests/ui/movement-one-surface.test.tsx` does not exist — the assertion lives in
`tests/editor/vocabulary-coverage.test.ts` as *"has ONE set of movement
controls"*, where it is stronger, because it enumerates every removed surface by
name and asserts each absent. Recorded as a deviation rather than silently left
as a broken pointer.

**ADR-009's promise was kept, and that is worth stating because deleting the
preview could have quietly voided it.** `PiecePreview` was the in-app
editor-versus-engine oracle. Its parity test went with it, and the role moved
into `movement-opens-shipped-content.test.ts`, which now compares the squares the
GRID paints against `legalActions` for every shipped piece — a stronger check
than the panel's, which only proved its own builder agreed with the engine.

## ✅ Consensus Findings

None. See the Round 1 Summary for why that is a statement about the voter pool
rather than about the code.

## ⚠️ Weak Consensus

None.

## 📝 Manual-Only Findings

All seven. Severity as filed; every one verified by the orchestrator against the
source before being applied.

### P1 — the paint reducer was still duplicated, and the two copies had drifted

- **Source:** `codex` (`60daf5a225810847`, `d8e8b1ab75f6de94`)
- **File:** `src/ui/RecordForm.tsx` (the `paint` reducer)
- **Verified:** yes — both reducers read side by side.

`togglePlacement` was unified when the two surfaces were found to disagree about
what a tap on an occupied square does. **The paint half was left duplicated in
that same change**, and the two copies had drifted in two ways that both produce
documents the loader refuses:

1. Painting over one half of a portal pair REPLACED that square's entry in place
   (`list[at] = { square, typeId }`), leaving the other half still carrying
   `pairedWith` pointing at a square that no longer paired back. `RoomDetail`
   called `erase`, which takes both halves.
2. Tapping the same square twice while arming a pair had no cancel, so it wrote
   two entries for one square, each paired with itself. `RoomDetail` cancels.

**Applied:** a shared pure reducer `paintSquare` + `erasePaint` in
`PlacementPainter.tsx`; both callers adopt it; both local `erase` helpers
deleted. The room's semantics win on both counts — they are the ones with a
written argument. New tests in `tests/ui/board-paint-shared.test.ts`, including a
`pairsAreWhole` invariant that fails on any orphaned `pairedWith`.

### P1 — `cycleAt` silently re-tipped the other axis's ray

- **Source:** `codex` (`047fe9122c450f25`)
- **File:** `src/ui/PieceMoves.tsx`, end of `cycleAt`
- **Verified:** yes — traced by hand, then pinned by a test.

The cap is per DIRECTION, not per direction-and-axis. Painting north-2 for
capture while north already slid one square for movement set `reach.n = 2` — **it
lengthened a movement ray the child never touched, on a mode they were not
looking at.** The shared cap is a documented limitation; a silent edit to the
half you are not editing is not.

**Applied:** when the other axis already slides that direction, the new ray
ADOPTS the existing cap rather than overwriting it. The child sees the capture
ray appear at the existing length, which makes the shared cap visible instead of
changing something behind their back. The test that pinned the old behaviour
(*"the later tap wins"*) was rewritten; a second test pins that clearing both
axes releases the cap again, so adopting cannot make it permanent.

### P1 — the one surviving control's hint described the deleted cycle

- **Source:** `code-reviewer`
- **File:** `src/i18n/ko.ts:728` (`ui.editor.piece.how-hint`)
- **Verified:** yes — the string said `이동 → 잡기 → 둘 다 → 없음`; `cycleAt` does
  none of that.

The whole task reduced seven movement surfaces to one, and **that one surface's
instructional text still described the four-state cycle that was deleted.** A
child reading it would look for a "both" state that no tap can produce. No test
caught it: the AC tests assert control presence, absence and grid state, never
hint content.

**Applied:** rewritten to the shipped mechanic — the three-state cycle, what a
leap and a ray each do about pieces in the way, and what the outer ring means.

### P2 — dead exports and orphaned locale strings

- **Source:** `code-reviewer`
- **Verified:** yes — `cycle()` had zero callers; each removed key confirmed
  unreferenced across `src/`, `tests/` and `e2e/`.

The AC-001 deletions removed the *components* but left their *content* behind:
the `cycle()` helper for the old four-state cell, and 18 locale keys for the
dial, the reach picker, the preview panel, the dex line, the deleted attack form
and the board record's old `<select>` labels.

**Applied:** all removed. `ui.editor.board.none` was kept — it still has four
readers.

**Root cause worth carrying forward:** no gate in this repo checks for orphaned
locale keys or unreferenced exports, so this class of leftover is structurally
invisible to a green suite. It produced the P1 above too — the hint survived
because its *control* was kept and only its *string* went stale.

## 🤝 Disagreements

None on any shared location. The two voters found disjoint defects, which is the
finding about the review itself: with N=2 and K=2, disjoint coverage yields zero
consensus and an unearned A.

One sequencing fact that changes how a later reader should read
`code-reviewer`'s report: it began before the codex fixes were applied and
finished after, so its "the paint/place reducer sharing checked out" is a
**verification of the fix**, not an independent failure to find the original
defect.

## 🧊 Cross-model findings (frozen @ round 1)

| id | severity | file | disposition | note |
|---|---|---|---|---|
| `60daf5a225810847` | P1 | `src/ui/RecordForm.tsx` | accepted → applied | orphaned pair half; verified against both reducers |
| `d8e8b1ab75f6de94` | P2 | `src/ui/RecordForm.tsx` | accepted → applied | self-paired duplicate entries; no cancel guard |
| `047fe9122c450f25` | P1 | `src/ui/PieceMoves.tsx` | accepted → applied | cross-axis cap overwrite |
| `bfbafaf1c8a661d1` | P1 | `src/ui/PieceMoves.tsx` | **rejected** | See below. |

**`bfbafaf1c8a661d1` — rejected, with the reason.** It reported that tapping a
lit capture cell on a rook turns "captures wherever it moves" into "captures
everywhere except north", and read that as the cycle failing to start from an
empty capture grid. The behaviour is real and is the intended one: an omitted
`attack` MEANS captures follow the movement, so `readGrid` promotes every move
square to a capture square, the capture grid opens showing the squares the record
actually captures on, and a tap there is a REMOVAL. The finding describes the
design (SPEC AC-003, asserted in `movement-capture-mode.test.tsx`) rather than a
defect. Its evidence quotation was accurate; the inference from it was not.

**It did surface a real coverage gap, which was closed rather than argued with.**
`movement-cell-cycle.test.ts` only ever started its three-tap round-trip from
`blankGrid()`, never from a promoted piece, so the AC-002 property was untested
on exactly the state codex was describing.

---

## Round 2 — reviewing the fixes

Scope: only what round 1 changed. `code-reviewer` re-run; no cross-model
re-invocation (each model is invoked exactly once per `/hm:review`).

**Fix 1 (shared paint reducer) — verified clean.** `paintSquare`/`erasePaint`
reproduce the room's semantics exactly (erase-takes-partner, same-type-tap
erases, self-pair cancel); both callers invoke it identically; the
`as unknown as PaintedSquare[]` cast hides no shape mismatch, because `Draft`
genuinely carries that shape at runtime; `pairHint` is a straight function of
`result.pendingPair` and is reset with it on a palette change.

**Fix 3 (dead strings and export) — removal verified clean.** `cycle()` has zero
remaining references; `ui.editor.board.none` was correctly kept (four live
readers); every surviving `ui.editor.piece.*` key has a reader.

**Fix 2 — NOT closed. It replaced the round-1 defect with a variant of it.**

### 🔴 OPEN P1 — the adopt rule truncates the tapped ray and leaves the tapped cell blank

- **File:** `src/ui/PieceMoves.tsx`, end of `cycleAt`
- **Source:** `code-reviewer`, round 2 · **Status: not fixed**

With movement sliding north at cap 1, tapping capture at `(0,3)` twice runs
`none → leap` and then `leap → ray`, which deletes `cells['0,3']` and enables
capture on north **at the adopted cap of 1**. `paintAt(grid, Capture, 0, 3)` then
returns `none` — **the square the child just double-tapped renders as untouched**,
while `(0,1)`, which they never touched on this axis, silently becomes the
capture ray's tip.

This is the same class the round-1 fix was written to close — an edit the child
cannot see — moved from the other axis onto the one they are editing. My test for
the fix asserts `reach.n` and `slides` but never calls `paintAt` on either the
tapped cell or the affected one, so the suite is green and blind to it.

**The real fix is a model change, not another patch here.** The shared
`reach: Record<Dir8, Reach>` is the root: the persisted schema can hold two caps
for one direction (`movement` and `attack` are separate pattern arrays, each with
its own `maxDistance`), and `readGrid` already refuses documents where they
disagree. Making `reach` per-axis removes the whole class — no adopted cap, no
truncated tap, no cross-axis surprise — and lets `readGrid` stop refusing a
document the schema permits. Patching `cycleAt` again would be a third guess at a
rule whose premise is wrong.

### 🔴 P1 — the rewritten hint was still false for half the grid (fixed)

- **File:** `src/i18n/ko.ts` (`ui.editor.piece.how-hint`)
- **Source:** `code-reviewer`, round 2 · **Status: fixed**

Round 1 replaced a hint describing the deleted four-state cycle with one claiming
an unconditional `안 감 → 뛰어감 → 미끄러짐 → 안 감`. That is false for **24 of the
48 cells**: a slide vector must be one of the eight compass units, so off-ray
cells toggle in two. A child tapping one three times, expecting the slide state
the hint promised, gets nothing.

**Applied** — the hint now states the two-state cycle as the rule and the slide
as the extra state that only the straight-line cells have. String only, no
behaviour change; suite re-run green (1387/1387).

## Review Iteration Summary

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 7             | 0         | —   |
| 2         | A     | 1             | 1         | 2   |

Final grade: **A**
Iterations used: 2 / 2
Exit reason: `cap-exhausted`
Status: **APPROVED**
human_review_needed: **true**
Counters: unreviewed 1 · prior-fix 2 · unattributed 0

**Why an A with an open P1.** The letter counts only `consensus-passed` findings
and there are none — with one Claude reviewer and one cross-model voter, every
finding here was single-source. The grade is therefore not a statement about this
code. `human_review_needed` is the field that carries the truth: **one P1 is open,
and it was introduced by a fix made during this review.**

**Both of round 2's findings were caused by round 1's fixes** (`prior-fix 2`).
That is the repo's `fix-introduced-defect-passes-all-gates` pattern — at
**count:4**, twice on fully green runs — reproduced live inside the review that
was watching for it. It is the reason no third fix round was attempted on the
open P1: the rounds are capped at 2, and a change made after the last reviewing
eye has left is exactly how that counter reached 4.

**What a human should decide:** whether to make `reach` per-axis now (removes the
open P1's whole class, and lets the editor open documents the schema already
permits), or to ship with the truncated-tap behaviour and a follow-up.

---

## Round 3 — the model change the open P1 asked for

The author chose to widen `reach` rather than ship the truncated-tap behaviour, so
the round-2 P1 was closed by the change round 2 recommended rather than by a third
patch. `PieceGrid.reach` is now `Record<Axis, Record<Dir8, Reach>>`.

**Why no patch could have worked.** With ONE cap per direction, a tap on the
capture grid had exactly two options and both are edits a child cannot see:
overwrite the cap (round 1's defect) or adopt it (round 2's defect). There is no
third answer while one number serves two questions. The schema was never the
constraint — `movement` and `attack` are separate arrays, each pattern carrying
its own `maxDistance` — so the editor had been the narrower of the two all along.

**A document whose two axes cap a direction differently now OPENS**, where
`readGrid` refused it before. Its fixture moved out of the refusal list into a new
`NOW_OPENS` block with a byte-identical round-trip assertion, so the boundary
shift is visible rather than implied.

**One defect the change introduced, caught by an existing test.** The
`attack`-absent promotion copies every move square to a capture square; it did not
copy the CAP. The axes then disagreed about a ray nobody had authored and
`writeGrid` emitted an `attack` for a record that had none — a field appearing out
of a round-trip meant to be a no-op. Fixed by promoting the cap with the
direction. Found by `movement-ray.test.ts`'s round-trip check, not by reading.

### Review verdict — clean

`code-reviewer`, scoped to this change: **no P0/P1/P2 findings.** It traced every
`reach` read and write against the axis it belongs to and confirmed:

- no wrong-axis read, and no reader that consults a cap without the matching slide
  bit already set;
- `cycleAt`'s ray-clear resets only its own axis, and a stale cap can never
  resurface because re-enabling a ray always overwrites it;
- `piece-clear`'s untouched `reach` is inert by the same argument;
- `PieceDetail`'s documented fallback is correct for a capture-only slide, and the
  card has no second rendering of the cap that could contradict the text;
- the new `NOW_OPENS` block asserts byte identity, not mere equivalence.

It named one coverage gap without blocking on it: every other clear test used leap
cells, so the dead-cap argument for SLIDES rested on inspection alone. **Closed** —
`movement-capture-mode.test.tsx` now clears a two-square ray and re-paints the same
direction at one square, which would come back capped at 2 if a stale cap had
survived.

## Final Summary (revised after round 3)

| Iteration | Grade | Fixes Applied | Remaining | New |
|-----------|-------|---------------|-----------|-----|
| 1 (init)  | A     | 7             | 0         | —   |
| 2         | A     | 1             | 1         | 2   |
| 3         | A     | 2             | **0**     | 0   |

Final grade: **A**
Exit reason: `converged`
Status: **APPROVED**
human_review_needed: **false**

Verification at exit: `tsc --noEmit` clean · **1392/1392** vitest · **131 passed**
playwright on mobile-webkit.

One flake, named rather than smoothed over: the final full browser run had
`single-player.spec.ts::the computer answers, and the match advances` fail once
and pass on an immediate re-run. It is the AI-opponent search under load; this
change touches editor UI only and the engine is unmodified, so there is no path
from it to that spec. Recorded because a re-run that goes green is exactly how a
real intermittent regression gets dismissed.

**The open P1 is closed and nothing replaced it** — the first round in this review
where a fix introduced no new finding, and the one where the fix changed the model
instead of guarding a symptom. Three rounds, nine findings, all resolved; two of
the three rounds' findings were caused by the previous round's fixes, which is the
repo's `fix-introduced-defect-passes-all-gates` pattern reproduced live and then
broken by declining to patch a fourth time.
