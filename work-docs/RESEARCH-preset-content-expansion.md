---
type: research
task_slug: preset-content-expansion
status: complete
created: 2026-08-08
tags: [chess-craft, research, content-authoring, pixel-art, game-balance, vocabulary]
mtime_warn_days: 7
libs_fetched: []
sources: []
related_docs:
  - "[[VOCAB-GAPS-variant-chess-6x6-cards]]"
  - "[[PLAN-custom-piece-skill-balance]]"
  - "[[PLAN-mobile-grade-graphics]]"
  - "[[ART-SPEC-mobile-grade-graphics]]"
  - "[[RESEARCH-custom-piece-skill-balance]]"
summary: "Add rooms first, then records; generate a curated SPARE sprite pool — the art picker is 100% claimed today"
---

# Research — expanding piece / skill / rule presets, and building an art surplus

## 🎯 Recommended Direction

**TL;DR — split into two independent tracks. Content: add *presets* (rooms)
before adding records, and fix the 4 known-broken cards before authoring on top
of them. Art: the picker has exactly zero unclaimed pictures on every surface,
so the first deliverable is a curated *spare pool* of sprites in `pixels.ts` +
`registry.ts`, produced with a generator that runs the existing gate predicates
before anything is committed.**

Two facts set the direction. First, the perceived monotony is not primarily a
record-count problem: the app ships **one** preset (`preset.default`,
`src/content/sets/bundled.ts:695`) holding **all** 6 pieces, 11 rule cards and 15
skill cards on one 6×6 board. Every match therefore draws from the same pool, so
adding a 27th card raises variety far less per unit of work than a second room
that recombines what already exists. Second, the art complaint is literally
measurable and exactly as bad as stated: the record form's art picker is
`[...artRegistry.entries()].filter(entry.kind === 'pixel' && entry.surface ===
surface)` (`src/ui/RecordForm.tsx:967`), and the catalogue holds **6 piece / 5
square / 26 card** entries against **6 pieces / 5 square types / 26 cards** of
content — a 1:1 claim on every surface. A user creating a new piece today can
only steal another piece's picture or fall back to the `'?'` monogram
(`src/ui/art/resolve.ts:130`).

The binding trade-off on the content track is **not** effort — it is the
silent-no-op class of defect this repo has hit five times
(`[fail:design] declared-but-inert-vocabulary`). Authoring more cards against a
vocabulary with 4 known-inert entries multiplies that class rather than adding
variety.

## 🔍 Refinement Decisions

`--deep` was not set; no refinement interview ran.

**Discovery lens:** *Technical architecture / implementation* (primary — the
authoring vocabulary, the art pipeline and the gates that admit new content are
all internal and authoritative) + *User-workflow / product opportunity*
(secondary — the complaint is about what an author sees in the record form and
what a player sees across matches).

**Local capability × author artifact** — what the app can already do vs. what a
content author actually touches:

| Author artifact | Local capability today | Gap that produces the complaint |
|---|---|---|
| A new **piece** in the record form | Full movement editor; cost auto-priced from the declaration (`src/balance/cost.ts`) | **No unclaimed picture** — 6 piece sprites, all 6 taken |
| A new **skill / rule card** | Trigger + condition + action vocabulary, `duration`/`uses` params | 26 card sprites, all 26 taken; 4 vocabulary paths silently inert |
| A new **room** (preset) | Preset picker already handles a list (`src/ui/App.tsx:285`) | Only one preset ships, so recombination value is unrealised |
| A new **board** | `boardDef` takes arbitrary `width`/`height` + placements | Only `board.los-alamos` (6×6) ships |
| Custom text | ko strings overlay; every declared text key is enumerated and must resolve | ko-only (`src/i18n/ko.ts` is the sole locale bundle) |

**No external sources were fetched.** The topic is entirely governed by this
repo's own schema, gates and prior PLANs; a web search would have returned
generic advice that the gate list below already supersedes. This is a deliberate
scope call, not an oversight — see Open Question 5 for the one place where it
costs something.

## 🛠️ Approaches Found

### Track A — content breadth

#### A1. Add more records to the single default preset

| Field | Content |
|---|---|
| Approach | Author additional pieces / rule cards / skill cards into `bundledContentSource` and list them in `preset.default` |
| Assumption | Variety scales with record count |
| Evidence | `src/content/sets/bundled.ts:693-738` — one preset lists every record; the draft therefore samples from one pool. `src/balance/cost.ts` prices any new record instantly from its declaration, so no measurement rig blocks the addition |
| Trade-off | Cheapest per record, but dilutes each record's draft probability and grows the surface the AI and the balance model must behave on. Against the current vocabulary ceiling, card N+1 tends to read as a re-skin of an existing card |
| Compatibility | Perfect — no engine, schema or UI change |
| Risk | **medium** — highest exposure to the inert-vocabulary failure class |

#### A2. Add new presets (rooms) and boards, recombining existing records

| Field | Content |
|---|---|
| Approach | New `presetDef` entries (curated subsets, themed card pools, different `loadoutBudget`) and new `boardDef`s (sizes other than 6×6) |
| Assumption | The UI and engine are already list-driven rather than single-preset |
| Evidence | `src/ui/App.tsx:172,285` selects from `presetIds` with the bundled id as a *fallback*, not a constant; `boardDef` takes arbitrary `width`/`height` (`src/content/schema.ts:438`). Constraint: **a preset needs ≥6 skill cards or the draft deadlocks** (`work-docs/VOCAB-GAPS-variant-chess-6x6-cards.md` G-8) |
| Trade-off | Highest perceived variety per unit of work, but each room needs its own curation judgement, and a non-6×6 board exercises engine/AI paths no shipped content has exercised |
| Compatibility | Good — data-only, except for whatever a larger board costs the AI's search |
| Risk | **low–medium** (medium only for new board sizes, which are unvalidated — see OQ-4) |

#### A3. Extend the effect vocabulary first (close G-3…G-7 + the 4 broken cards)

| Field | Content |
|---|---|
| Approach | Engine work: `on_capture` binding order for `blood-toll`; `boundSubject` in `runEvent`'s `EvalCtx`; route the card-play branch of `apply` through `bindEffect`; then close the medium-severity gaps G-3 (subject vs. own owner), G-4 (square referencing itself), G-5 (per-instance layer-2 subject), G-6 (`spawn_piece` skips entry), G-7 (`check_count_at_least` inert) |
| Assumption | Monotony is expressive, not numerical — new cards feel similar because the grammar can only say a few things |
| Evidence | `[fail:design]` 5th instance: an empirical 26-card survey found **22 live, 4 broken, from 3 root causes**, pinned by `tests/engine/card-liveness.test.ts` — which asserts *current* behaviour on purpose, so it goes red the moment any of them is fixed. `VOCAB-GAPS` G-3…G-7 list the remaining expressive gaps with severities |
| Trade-off | Highest ceiling and the only path that makes *new kinds* of card possible, but it is engine semantics work under ADR-002 event ordering — the most expensive and the most regression-prone |
| Compatibility | Touches the interpreter, not the schema (mostly) |
| Risk | **medium–high** |

**Recommended sequencing for Track A:** A2 → (A3 narrow: just the 3 root causes behind the 4 broken cards) → A1. A2 buys the most variety with no engine risk; the narrow A3 slice is a prerequisite for A1 being trustworthy, because every new card authored today can land in the same inert class without any signal.

### Track B — art surplus

#### B1. Hand-author sprites into `pixels.ts` (current practice)

| Field | Content |
|---|---|
| Approach | Keep writing 12 rows of 12 characters by hand |
| Assumption | Sheet coherence needs a human eye |
| Evidence | `src/ui/art/pixels.ts:1-30` — 41 sprites share one deliberately small palette so "a bomb and a crown read as the same world" |
| Trade-off | Best coherence, worst throughput. "대량 생성" is precisely what this does not do |
| Compatibility | Perfect |
| Risk | low |

#### B2. Raster / externally-generated illustration assets

| Field | Content |
|---|---|
| Approach | Use `ArtEntry`'s surviving raster path (`kind: 'sided' \| 'neutral'`, `src/ui/art/resolve.ts:25-27`) |
| Assumption | Real illustration beats 12×12 |
| Evidence | The raster path is kept but **nothing bundled uses it** (`src/ui/art/registry.ts:32-37`): a sprite costs the bundler nothing to emit, the service worker nothing to precache and `vite-plugin-sw.ts` nothing to enumerate. ADR-007 additionally requires the two armies to separate by hue **and** weight **and** lightness, which a raster inherits none of — hence *two* assets per piece |
| Trade-off | Loses offline-free, re-introduces precache enumeration (whose comment already records going stale once), doubles per-piece asset count, and moves surface-checking back onto filename prefixes (`tests/content/art-key.test.ts:172`) |
| Compatibility | Supported but actively regressed-away-from |
| Risk | **high** |

#### B3. Generator-assisted sprite pool, curated then committed *(recommended)*

| Field | Content |
|---|---|
| Approach | A scratch-time script emits candidate 12×12 sprites (silhouette template × motif × palette ramp), self-rejects anything failing the repo's own gate predicates, and a human picks the keepers into `pixels.ts` + `registry.ts` under a spare naming convention |
| Assumption | The gates are mechanically checkable — they are, and all of them are cheap pure functions |
| Evidence | Gates a candidate must pass: exactly 12×12 and palette-only characters, non-blank, ≤60 rects per sprite, and **sheet-wide** `runs < pixels / 1.8` (`tests/ui/pixels.test.ts:16-87`); contrast against each surface it can land on (`tests/ui/art-contrast.test.ts:105-129`); art id must be one segment after `art.` and must not echo any content id (`tests/content/art-key.test.ts:131,158`) |
| Trade-off | Generated pixel art at 12×12 tends toward noise, and noise is exactly what the compression gate punishes — curation is mandatory, not optional polish |
| Compatibility | Perfect — output is the same data the sheet already holds |
| Risk | **low**, provided the generator runs the gates |

**Spare entries are legal today — verified, not assumed.** The catalogue gates
run *content → registry* (`art-key.test.ts:147`, "registers every art id the
bundled set actually declares") and *registry → sheet*
(`art-key.test.ts:211`, "gives every registered entry something that will
actually draw"). There is **no** reverse requirement that a registry entry be
claimed by a record, and `pixels.ts` already carries 4 unregistered sprites
(`nav-play`, `nav-build`, `nav-dex`, `erase`). A spare pool therefore needs no
new escape hatch — and because `art-contrast.test.ts` iterates *registered pixel
entries*, every spare gets legibility-gated the day it lands, before an author
ever picks it.

## ⚠️ Pitfalls

0. **CORRECTION (2026-08-08, found in `/hm:plan`) — the "4 broken cards" claim
   below is false of `master`.** It was taken from the `[fail:design]` memory
   entry without re-verification. Running the rig gives 32/32 with `intended ===
   current` on all 29 probes, and all three root causes are closed in code
   (`engine.ts:505`, `engine.ts:855`, `effects.ts:43`). Pitfalls 1–3 remain worth
   reading as a *defect class*; treat their card-specific claims as historical.
   The memory entry itself warns about exactly this — "a stale entry keeps looking
   confirmed" — and needs updating at wrapup.
1. **Declared-but-inert content is this repo's most recurring defect (count: 5).**
   A card can pass every schema check, draw, play and do nothing. The rule that
   would have prevented all five instances: every vocabulary entry needs a test
   driving it end-to-end from real content, or an explicit validation-time
   refusal. `[fail:design] declared-but-inert-vocabulary`.
2. **Liveness is the wrong probe.** The same survey found 3 of the 4 broken cards
   *do* change state — the wrong state. A did-anything-happen assertion clears
   two of them. The sharp probes assert a card stays **inert where it must**, and
   must place the subject where the *correct* behaviour is provably nothing (a
   probe first written with the pawn on rank 5 was confounded because promotion
   was legal under both the buggy and the correct engine).
3. **`tests/engine/card-liveness.test.ts` is green on the broken engine on
   purpose.** It pins current behaviour, so any Track-A3 fix turns it red by
   design. Do not read that red as a regression.
4. **The compression gate is sheet-wide, not per-sprite.** `runs < pixels / 1.8`
   across the whole sheet (`tests/ui/pixels.test.ts:83`) means a batch of noisy
   generated sprites can break the gate *globally* while each individual sprite
   passes its own ≤60-rect check. Mass generation is exactly the shape of change
   that trips this.
5. **An art id that mirrors a content id fails a substring scan.** `registry.ts`
   is scanned whole by `tests/structure/no-content-in-engine.test.ts`, and the
   scan does not distinguish code from prose — naming a spare after the piece you
   intend to build with it is the trap, and the registry's own comment cannot
   even spell the bad form out.
6. **A preset with fewer than 6 skill cards deadlocks the draft** (`VOCAB-GAPS`
   G-8). Any curated-subset room hits this immediately.
7. **Stale memory — correct before relying on it.** `[wiki:architecture]
   shipped-grades-and-hash-keys` describes `src/balance/shipped-grades.ts` and a
   preset-level `grading` declaration. Neither exists on `master`:
   `src/balance/` holds `cost.ts`, `grading-agent.ts`, `legal.ts`, `measure.ts`,
   and `src/content/schema.ts:84` records "Bumped 9 → 10 (ADR-012): `preset.grading`
   is gone." Cost is now computed from the declaration, instantly, with no
   shipped table — which *helps* this task: new records are priced for free.
8. **ko-only i18n.** `src/i18n/ko.ts` is the only locale bundle, and
   `tests/ui/i18n.test.ts:17` enumerates every player-facing text key the content
   declares. Every new record is a ko strings obligation; there is no en bundle
   to keep in parity.
9. **`loadoutBudget: 6` is tuned to the current price spread** (pieces 1–4 stars,
   cards 1–2; `src/content/sets/bundled.ts:712-720`). A new 5-star piece or
   3-star card changes what pairs are legal in every existing room, not just the
   new one.

## ❓ Open Questions

1. **What does "preset 확장" mean to you — more rooms, or more records in the
   existing room?** The two produce different work and different risk (A2 vs A1).
   This is the one answer that changes the plan's shape.
2. **Fix-first or add-in-parallel?** Should the 3 root causes behind the 4 broken
   cards (`blood-toll` on_capture ordering; `boundSubject` missing from
   `runEvent`'s context; the card-play branch of `apply` never calling
   `bindEffect`) land before new content, or run as a parallel phase?
3. **How many spares, and split how across surfaces?** "대량" needs a number and a
   piece/square/card quota. Note the bundle cost: `pixels.ts` is ~16 KB of source
   for 41 sprites, and no build-size budget test exists to catch growth.
4. **Board sizes beyond 6×6 — validated or not?** `boardDef` accepts any
   `width`/`height`, but no shipped content exercises another size, and the AI's
   search cost at 8×8 is **unknown**. This research did not measure it.
5. **Art style scope.** Do spares stay inside the existing 25-colour shared ramp
   (coherence, and what the contrast gate is tuned against), or is a palette
   extension in scope? Extending the ramp re-opens the contrast gate for the
   whole sheet.

## 📚 Sources

None external. Every claim above is cited to a file:line in this repository or to
a memory entry; the two paragraphs labelled as inference (AI cost at larger board
sizes, generated-pixel-noise tendency) are marked as such.

## 🔗 Related Internal Docs

- [[VOCAB-GAPS-variant-chess-6x6-cards]] — G-1…G-8, the expressiveness limits found by authoring the vertical slice
- [[PLAN-custom-piece-skill-balance]] / [[RESEARCH-custom-piece-skill-balance]] — ADR-012, the declaration-derived cost model
- [[PLAN-mobile-grade-graphics]] / [[ART-SPEC-mobile-grade-graphics]] — schema v7 `artKey`, ADR-006/007, the sprite-sheet redesign
- [[PLAN-skill-then-move-and-effect-visibility]] — the most recent skill-card semantics change
- `[fail:design] declared-but-inert-vocabulary` — 5 instances, incl. the 26-card liveness survey
- `[wiki:architecture] shipped-grades-and-hash-keys` — **stale**, superseded by ADR-012 (see Pitfall 7)
