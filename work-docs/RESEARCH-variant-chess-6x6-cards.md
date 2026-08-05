---
type: research
task_slug: variant-chess-6x6-cards
status: complete
created: 2026-08-05
tags: [strange-chess, research, typescript, game-design, chess-variant, card-system, web-to-mobile]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://en.wikipedia.org/wiki/Los_Alamos_chess
  - https://en.wikipedia.org/wiki/Minichess
  - https://www.sjgames.com/knightmare/kc_intro.html
  - https://en.wikipedia.org/wiki/Knightmare_Chess
  - https://www.chess.com/terms/duck-chess
  - https://www.chess.com/terms/fog-of-war-chess
  - https://en.wikipedia.org/wiki/Chessplus
  - https://www.chessplus.com/en-us/pages/chessplus-for-parents-and-educators
  - https://en.wikipedia.org/wiki/Really_Bad_Chess
  - https://store.steampowered.com/app/1142080/Pawnbarian/
  - https://en.wikipedia.org/wiki/Shotgun_King:_The_Final_Checkmate
  - https://store.steampowered.com/app/1064340/Chess_Evolved_Online/
  - https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/ChessEvolvedOnline
  - https://lichess.org/forum/general-chess-discussion/whats-the-most-liked-variant
  - https://blog.cardkingdom.com/essential-mtg-definitions-priority-and-the-stack/
  - https://blog.cardkingdom.com/5-of-magics-most-common-rules-traps/
  - https://github.com/boardgameio/boardgame.io
  - https://capacitorjs.com/solution/react
  - https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026
  - https://machinations.io/glossary/comeback-mechanic
  - https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement
  - https://chigoox.itch.io/ed5-sigil-engine
  - https://dev.to/methodox/data-driven-design-leveraging-lessons-from-game-development-in-everyday-software-5512
related_docs: []
summary: "Web-first pure-TS rules core + hybrid declarative card registry; one-twist rule cards, 1-of-3 skill drafts"
---

# RESEARCH — 6x6 Variant Chess with Rule Cards & Skill Cards

## 🎯 Recommended Direction

**Build a framework-agnostic, deterministic TypeScript rules core (`engine/`) whose legal-move
generation is a pipeline of pluggable *modifiers*, and express both rule cards and skill cards as
entries in a hybrid card registry: a declarative JSON/TS schema for the ~80% of effects that fit
common patterns, with a typed escape-hatch hook for the rest. Ship it as a React web app first and
wrap with Capacitor for the mobile launch.**

Rationale: the binding constraint in this project is *"cards must be easy to add and change"*, and
every card either (a) alters how legal moves are generated, (b) alters the win condition, or
(c) performs a one-shot board mutation. If the engine hard-codes chess rules and the UI reads them,
each new card becomes a cross-cutting edit. If instead the engine exposes a single ordered
`RuleModifier[]` pipeline plus a `GameEffect` executor, a new card is one new file and one registry
line — no engine edit. The web-first + Capacitor path is chosen because the game is turn-based with
no realtime rendering budget: there is no measurable benefit to a native runtime, and Capacitor
lets the same React codebase ship to the store ([Capacitor React docs](https://capacitorjs.com/solution/react);
[2026 comparison](https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026)).

The dominant *design* finding, and the one that should drive the SPEC more than any architecture
decision: **the successful variants for young players are one-sentence twists, not rule bundles.**
Duck Chess went viral in 2022 off a single added object ([Chess.com](https://www.chess.com/terms/duck-chess));
King of the Hill and Three-Check earn millions of games on Lichess off a single changed win condition
([Lichess forum, game counts](https://lichess.org/forum/general-chess-discussion/whats-the-most-liked-variant)).
Rule cards should therefore each be explainable in one line on the card face.

---

## 🔍 Refinement Decisions

`--deep` was not set; no Phase 0 interview ran. Topic was already specific (board size, card model,
draft timing, audience, platform sequence all given).

**Discovery lens:** (1) User-workflow / product opportunity — what actually makes existing chess
variants fun for 초·중학생 — and (2) Technical architecture / implementation — how to make card
definitions data-driven. Risk/compliance lens deliberately skipped: no accounts, payments, or user
data are in scope for the web MVP (revisit at mobile launch for store age-rating and any online play).

Warm memory tier returned no entries (`hm memory_retrieve` → `(no entries matched)`); the repo is
greenfield (only `CLAUDE.md` + harness, no source). Second Brain is disabled in `.claude/harness.yaml`.
So: **no internal prior art exists** — every claim below is external or labeled inference.

---

## 🛠️ Approaches Found

### Part A — Game-design prior art (what makes variants fun)

| # | Source | Mechanic | What we take |
|---|--------|----------|--------------|
| 1 | [Los Alamos chess](https://en.wikipedia.org/wiki/Los_Alamos_chess) | 6x6, no bishops, no castling, no pawn double-step, no en passant | The exact board we're targeting already has a 70-year-old rule baseline — **adopt it verbatim as the base ruleset** instead of inventing 6x6 rules. Bishops are dropped because on 6x6 a color-bound bishop is near-useless. |
| 2 | [Minichess](https://en.wikipedia.org/wiki/Minichess) | Family of small-board variants | Explicit motivation is "simpler and shorter than standard chess" — confirms 6x6 serves the speed goal. |
| 3 | [Knightmare Chess](https://www.sjgames.com/knightmare/kc_intro.html) (SJG, 1996; from *Tempête sur l'échiquier*) | 80 cards, **each card breaks one rule of chess**; mix of one-shot and permanent; hand of 5, play one per move | The closest prior art to our design. Two lessons: (a) card text is always "break *this one* rule", (b) a **point-budget deck build** (150 points) is their balancing lever. |
| 4 | [Duck Chess](https://www.chess.com/terms/duck-chess) | One neutral blocker both players relocate every turn | Proof that a *single* added object generates enormous tactical novelty ("quacktics") with zero added rules to memorize. Also: win by capturing the king removes checkmate stress — relevant for beginners. |
| 5 | Lichess variants: Crazyhouse (~21.2M games), Atomic (~19.6M), Three-Check (~7.25M), King of the Hill (~5.69M) ([forum](https://lichess.org/forum/general-chess-discussion/whats-the-most-liked-variant)) | Drop captured pieces / explosion captures / alternate win conditions | **Alternate win conditions are the single strongest lever for shortening games.** On a 6x6 board they matter even more, since material trades down fast. |
| 6 | [Fog of War / Dark chess](https://www.chess.com/terms/fog-of-war-chess) | You only see your pieces + your legal target squares | High fun, high chaos — but it requires per-player view filtering in the engine and defeats hot-seat play. Treat as a *later* rule card, and design the engine's state serialization to allow per-player redaction from day one (inference: retrofitting this is expensive). |
| 7 | [Chessplus](https://en.wikipedia.org/wiki/Chessplus) — 50k+ copies, school-targeted | Merge two friendly pieces into one that moves as either; split later | Explicitly marketed for education: "makes gameplay easier while enhancing traditional chess skills" ([Chessplus for educators](https://www.chessplus.com/en-us/pages/chessplus-for-parents-and-educators)). A merge/split card is a strong 초등 candidate — it *adds* options rather than *removing* them, which is far friendlier than punishing rules. |
| 8 | [Really Bad Chess](https://en.wikipedia.org/wiki/Really_Bad_Chess) (Zach Gage) | Randomized armies; skill-scaled | "Removes boring restrictions and flips chess on its head" — for novices it *opens up* the game because memorized openings stop mattering. Randomizing the public rule card at game start achieves the same effect for us: **nobody can prepare an opening**. |
| 9 | [Pawnbarian](https://store.steampowered.com/app/1142080/Pawnbarian/) | Chess moves as a *card hand*, 15–30 min runs | Validates the "chess piece = card" framing for a young audience raised on Hearthstone-likes. |
| 10 | [Shotgun King](https://en.wikipedia.org/wiki/Shotgun_King:_The_Final_Checkmate) | ~20-min runs, roguelike upgrade picks between rounds | Session length target confirmation; upgrade-pick loop is exactly our "1 of 3 skill cards". |
| 11 | [Chess Evolved Online](https://store.steampowered.com/app/1064340/Chess_Evolved_Online/) | 500+ units with melee/ranged/passive/**trigger** abilities; **Morale** loss condition; status effects (Poison/Freeze/Petrify); "PvP units have zero RNG" ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/ChessEvolvedOnline)) | Two directly reusable ideas: **Freeze/Petrify as a skill-card status** (a piece can't act for N turns) and a **Morale/secondary track as an alternate loss condition**. Their design rule — *no RNG once the match starts* — is worth adopting: randomize at setup and at draft offers, never inside a turn. |
| 12 | [Comeback mechanics](https://machinations.io/glossary/comeback-mechanic) / [rubber-banding](https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement) | Mario Kart gives the strongest items to trailing players | The **turn-5 second skill pick is the natural catch-up hook**: bias the 3 offered cards toward stronger/defensive options for the player behind on material. Cheap to implement, invisible to the player, keeps 초등 matches from being decided at turn 6. (Design proposal — needs a decision in `plan`.) |

**Session-length reality check (inference, not measured):** 6x6 Los Alamos base + an alternate win
condition + two skill cards should land in the 5–10 minute range. This is an assumption the SPEC
should turn into a measurable AC (e.g. "median AI-vs-AI game ≤ 40 plies") and verify with self-play,
not a fact from any source.

### Part B — Card system architecture (3 alternatives)

#### Approach A — Pure declarative registry (JSON/YAML card definitions + interpreter)

| Field | Content |
|-------|---------|
| Assumption | Every card effect decomposes into `trigger → condition → action` over a fixed vocabulary. |
| Evidence | Sigil Engine: "every card ability is defined in JSON, not code… 21 trigger types (onAttack, onDeath, onTurnStart…), composable conditions and multiple action types" ([itch.io](https://chigoox.itch.io/ed5-sigil-engine)). *Tales of Tribute* keeps all cards in one `cards.json` and generates IDs from it. Data-driven design generally: behavior lives in external data, changeable independently of source ([DEV](https://dev.to/methodox/data-driven-design-leveraging-lessons-from-game-development-in-everyday-software-5512)). |
| Trade-off | Best add-a-card ergonomics (non-programmer editable, hot-reloadable, diff-friendly) — paid for by building and maintaining an interpreter + effect vocabulary up front, and by an ugly wall the first time a card doesn't fit the vocabulary. |
| Compatibility | Greenfield — no constraint. |
| Risk | **medium** — vocabulary design is guesswork before the first ~15 cards exist. |

#### Approach B — One TS module per card, registered via manifest

| Field | Content |
|-------|---------|
| Assumption | "Easy to add" means *one small file, no engine edit* — not *no code*. |
| Evidence | Inference from the modifier-pipeline shape; no direct citation. Analogous to Lichess's per-variant modules and to Knightmare's per-card rule text. |
| Trade-off | Maximum expressive power and full type-checking of every effect — paid for by requiring a build step and a developer for each card, and by losing the possibility of user-authored/remote-config cards. |
| Compatibility | Greenfield; trivially fits a TS engine. |
| Risk | **low** — nothing can be inexpressible. |

#### Approach C — Hybrid: declarative schema for common patterns + typed `custom` hook — **recommended**

| Field | Content |
|-------|---------|
| Assumption | The first 20 cards will cluster into ~6 patterns (movement grant, movement ban, win-condition swap, board mutation, status application, resurrection); the long tail will not. |
| Evidence | Direct read of the 26 candidate cards drafted below: 19 fit ≤6 patterns; ~7 (merge/split, fog, portal squares, counter-a-skill) need bespoke logic. |
| Trade-off | Two code paths to maintain — paid to get JSON ergonomics for the common case without the "inexpressible card" wall of Approach A. |
| Compatibility | Greenfield. Card metadata (id, name, i18n text, art, cost, category, `since` version) is declarative for *all* cards regardless of which path implements behavior — so the catalog, the draft UI, and localization never branch. |
| Risk | **low–medium** — main risk is the hook becoming the default and the schema rotting. Mitigate with a lint/CI rule that reports the ratio. |

**Cross-cutting engine requirements (apply to any approach):**

1. **Deterministic seeded RNG.** All randomness (rule-card draw, 3-card draft offers) derives from one
   match seed, so a match is replayable/reproducible and testable. Matches Chess Evolved's "zero RNG
   once the match starts" stance.
2. **State is serializable and per-player redactable.** Needed for undo, replay, and a future Fog rule.
3. **Engine has zero React/DOM imports.** The whole point of web-first→mobile: the core survives the
   port untouched, only the view layer is re-hosted.
4. **`boardgame.io` decision.** It supplies turn order, immutable state, undo, and multiplayer
   transport, and is view-agnostic with React/React-Native bindings ([GitHub](https://github.com/boardgameio/boardgame.io)).
   Genuinely useful *if* online multiplayer is in scope; if the MVP is hot-seat + local AI, it adds a
   framework dependency for machinery we'd write in ~200 lines. Decide in `plan` — the answer hinges
   on the online-play question below, not on taste.

### Part C — Concrete card proposals (the suggestions you asked for)

Rule cards are **public and shared, 1 drawn randomly at game start**. Skill cards are **private,
1 of 3 drafted at start + 1 of 3 drafted after turn 5**. All are drafts for the SPEC to prune — the
design rule they follow is: *rule card = one line of text; skill card = one button press.*

**Public rule cards** (all on the 6x6 Los Alamos base: no castling, no double-step, no en passant):

| # | Name | One-line text | Pattern | Est. difficulty |
|---|------|---------------|---------|-----------------|
| R1 | King of the Hill | 킹이 중앙 4칸(c3/c4/d3/d4)에 도달하면 즉시 승리 | win-condition | ★ |
| R2 | Three Check | 상대를 3번 체크하면 승리 | win-condition | ★ |
| R3 | The Duck | 매 수 후 중립 오리를 빈 칸으로 옮긴다; 오리 칸은 통과 불가(나이트는 점프 가능) | board mutation | ★★ |
| R4 | Fast Promotion | 폰이 5행(적진 한 칸 앞)에 닿으면 승격 | movement grant | ★ |
| R5 | Pawn Storm | 모든 폰이 첫 이동에 2칸 전진 가능 | movement grant | ★ |
| R6 | Knight Festival | 모든 폰이 게임 중 한 번 나이트처럼 이동할 수 있다 | movement grant | ★★ |
| R7 | Merge & Split | 같은 편 기물끼리 합칠 수 있고, 합쳐진 기물은 둘 중 하나로 움직이거나 분리된다 (Chessplus) | custom | ★★★ |
| R8 | Recycle | 잡은 폰은 자기 뒷줄 빈 칸에 다시 놓을 수 있다 (Crazyhouse-lite, 폰만) | custom | ★★ |
| R9 | Bomb Squares | 대각선 모서리 2칸은 폭탄칸 — 들어간 기물은 사라진다 | board mutation | ★★ |
| R10 | Portal Corners | 네 모서리 칸은 서로 연결되어 있다 | custom | ★★★ |
| R11 | Last Stand | 자기 기물이 킹 포함 3개 이하가 되면 킹이 퀸처럼 움직인다 | comeback / movement grant | ★★ |
| R12 | Blitz Turn | 5턴마다 한 번, 두 플레이어 모두 2수를 연속으로 둔다 | turn structure | ★★ |
| R13 | Half Fog | 상대 진영 두 줄은 보이지 않는다 | custom (redaction) | ★★★ |
| R14 | Royal Bodyguard | 킹에 인접한 자기 기물은 잡히지 않는다 | movement ban | ★★ |

**Private skill cards** (each is one-shot unless marked *passive*; none may be played during the
opponent's turn — see Pitfall 1):

| # | Name | Effect | Pattern | Notes |
|---|------|--------|---------|-------|
| S1 | Teleport | 내 기물 하나를 아무 빈 칸으로 옮긴다 (턴 소모) | board mutation | 가장 직관적, 대표 카드 |
| S2 | Swap | 내 기물 두 개의 위치를 바꾼다 | board mutation | 킹 안전화에 강력 |
| S3 | Shield *(passive)* | 다음에 잡히는 내 기물 하나가 잡히지 않고 살아남는다 (1회) | replacement | 지는 쪽 구제 |
| S4 | Double Move | 이번 턴에 두 번 움직인다 (중간 상태에서 체크 금지) | turn structure | 밸런스 주의 |
| S5 | Revive | 잡힌 내 기물 하나를 뒷줄 빈 칸에 되살린다 (퀸 제외) | board mutation | 컴백 |
| S6 | Freeze | 상대 기물 하나를 2턴간 움직이지 못하게 한다 | status | Chess Evolved의 Freeze |
| S7 | Coronation | 내 폰 하나를 즉시 승격시킨다 | board mutation | |
| S8 | Knight Leap | 내 기물 하나가 나이트처럼 한 번 움직인다 (2회 사용) | movement grant | |
| S9 | Wall | 빈 칸 하나에 3턴간 벽을 세운다 | board mutation | 오리 룰과 상성 |
| S10 | Charge *(passive)* | 내 폰들은 항상 2칸 전진할 수 있다 | movement grant | 지속 효과 예시 |
| S11 | Sacrifice | 내 기물 하나를 버리고, 그에 인접한 상대 기물 하나를 제거한다 | board mutation | |
| S12 | Counterspell | 상대의 스킬 카드 사용 1회를 무효화한다 | custom | **재검토 필요** — 상대 턴 개입 |

**Rendering/UX note (inference).** For 초등 사용자, every card needs (a) 한 줄 텍스트, (b) 아이콘,
(c) **사용 가능한 칸의 하이라이트 미리보기**. The engine should therefore expose a
`previewEffect(cardId, partialTargets) → highlightedSquares` API from the start; bolting preview on
after the fact means re-deriving effect logic in the UI, which is where rule/UI divergence bugs come from.

---

## ⚠️ Pitfalls

1. **Do not build a stack/priority system.** MTG's timing model — priority passing, trigger ordering
   when multiple triggers fire on one event, and replacement effects that *don't use the stack at all*
   — is a documented source of confusion even among human players
   ([Card Kingdom: priority & the stack](https://blog.cardkingdom.com/essential-mtg-definitions-priority-and-the-stack/),
   [5 common rules traps](https://blog.cardkingdom.com/5-of-magics-most-common-rules-traps/)). For an
   초·중학생 audience, adopt the hard constraint: **cards resolve immediately, only on your own turn,
   never in response to another card.** That single rule deletes the entire class of engine bugs.
   It also means S12 (Counterspell) as written violates the constraint and must be redesigned
   (e.g. as a *pre-declared passive*: "상대가 처음 사용하는 스킬은 효과가 없다") or cut.

2. **Card interactions are combinatorial and won't be caught by per-card tests.** 14 rule cards × 12
   skill cards × 2 players ≈ 2,000 combinations. Concrete collisions already visible in the draft
   above: R3 Duck + S9 Wall (two blocker systems), R7 Merge + S5 Revive (what does a merged piece
   revive as?), R13 Half Fog + S1 Teleport (does the opponent see the destination?), R12 Blitz +
   S4 Double Move (four moves in a row). Mitigation: property-based invariant tests over the engine
   (king never disappears, piece count never negative, every generated move is legal, state
   round-trips through serialization) plus randomized self-play — not enumerated pairwise cases.

3. **Knightmare's balance lever is a point budget, not intuition.** SJG balances 80 rule-breaking
   cards via a 150-point deck-build budget ([SJG intro](https://www.sjgames.com/knightmare/kc_intro.html)).
   Give every card a numeric `cost`/`power` field from day one even if the MVP ignores it — adding
   the field later means touching every card definition.

4. **The 6x6 board punishes bishops and rewards knights.** Los Alamos dropped bishops for a reason
   ([Wikipedia](https://en.wikipedia.org/wiki/Los_Alamos_chess)); a color-bound bishop on 6x6 reaches
   18 squares. If bishops are kept for familiarity, expect them to feel weak — and expect
   knight-granting cards (R6, S8) to be overtuned by comparison.

5. **Fog-of-war retrofits are expensive.** R13 requires the server/engine to compute a per-player
   view; if `GameState` is treated as globally visible everywhere (including in the AI and the UI
   store), adding it later touches every layer. Decide *now* whether redaction is in scope, and if
   it might be, keep all state reads behind a `viewFor(player)` accessor.

6. **Capacitor is not free for game feel.** Web-first→Capacitor is the right call for a turn-based
   game, but touch drag-and-drop, safe-area insets, back-button handling, and offline asset loading
   all need explicit work at port time ([Capacitor experience report](https://manaknightdigital.com/blog/capacitor-js-experience-report-react)).
   Budget the port as a real phase, not a build-config change.

7. **Random public rule card = random game length.** R11/R12/R13 change pacing a lot. If a match must
   fit a fixed session budget, the rule-card pool needs a per-card length estimate, or the pool needs
   filtering by a "quick" tag.

---

## ❓ Open Questions

These block `/hm:spec` and `/hm:plan` from locking the design:

1. **Online play in the MVP?** Hot-seat / local-AI only, or networked 2P from the start? This single
   answer decides `boardgame.io` vs. a hand-rolled reducer, whether a server exists, and whether card
   state must be authoritative server-side.
2. **Is there an AI opponent?** A 6x6 alpha-beta search is easy; a 6x6 search *that understands
   arbitrary rule cards* is not — the modifier pipeline makes move generation dynamic, so the AI must
   consume the same pipeline (and every new card silently changes its search space).
3. **Base piece set:** Los Alamos (K, Q, 2R, 2N, 6P — no bishops) or keep bishops on 6x6?
4. **Win conditions:** does the base game use checkmate, or capture-the-king (Duck-Chess style, which
   removes checkmate stress for beginners)? Rule cards R1/R2 replace this — do they *replace* or
   *add* an alternate win condition?
5. **Skill card economy:** one use per card ever, or a per-N-turn cooldown? Does using a card consume
   the whole turn or is it free-then-move? (S1/S2 assume turn-consuming; S3/S10 are passive.)
6. **Turn-5 catch-up bias:** should the second 3-card offer be biased toward the losing player, and by
   what signal (material, mobility, or none)? Biasing is the cheapest fun-preserving lever available;
   it is also invisible-handed and some players dislike it.
7. **Who authors cards after launch?** If it's only you in-repo, Approach B suffices. If designers or
   players should author cards, or if you want to ship new cards without an app-store release,
   the declarative path (A/C) becomes mandatory and cards must be remote-loadable.
8. **Tech stack specifics:** React + Vite + TypeScript is the assumed baseline; state layer (Zustand /
   Redux / boardgame.io) and rendering (DOM grid vs. Canvas) are unresolved. DOM grid is likely
   sufficient for 36 squares and far easier to make accessible.
9. **Localization:** ko-only, or ko+en from the start? Card text is the bulk of user-facing strings —
   if en is ever coming, card definitions need i18n keys, not literals, from card #1.

---

## 📚 Sources

**Game design / prior art**
- [Los Alamos chess — Wikipedia](https://en.wikipedia.org/wiki/Los_Alamos_chess)
- [Minichess — Wikipedia](https://en.wikipedia.org/wiki/Minichess)
- [Knightmare Chess: An Introduction — Steve Jackson Games](https://www.sjgames.com/knightmare/kc_intro.html)
- [Knightmare Chess — Wikipedia](https://en.wikipedia.org/wiki/Knightmare_Chess)
- [Duck Chess — Chess.com](https://www.chess.com/terms/duck-chess)
- [Fog of War chess — Chess.com](https://www.chess.com/terms/fog-of-war-chess)
- [Chessplus — Wikipedia](https://en.wikipedia.org/wiki/Chessplus)
- [Chessplus for Educators and Parents](https://www.chessplus.com/en-us/pages/chessplus-for-parents-and-educators)
- [Really Bad Chess — Wikipedia](https://en.wikipedia.org/wiki/Really_Bad_Chess)
- [Pawnbarian — Steam](https://store.steampowered.com/app/1142080/Pawnbarian/)
- [Shotgun King: The Final Checkmate — Wikipedia](https://en.wikipedia.org/wiki/Shotgun_King:_The_Final_Checkmate)
- [Chess Evolved Online — Steam](https://store.steampowered.com/app/1064340/Chess_Evolved_Online/)
- [Chess Evolved Online — TV Tropes (mechanics detail)](https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/ChessEvolvedOnline)
- [Lichess variant popularity discussion (game counts)](https://lichess.org/forum/general-chess-discussion/whats-the-most-liked-variant)
- [Comeback Mechanic — Machinations glossary](https://machinations.io/glossary/comeback-mechanic)
- [Rubber-Banding as a Design Requirement — Game Developer](https://www.gamedeveloper.com/design/rubber-banding-as-a-design-requirement)

**Architecture / implementation**
- [Sigil Engine — JSON-defined card abilities, 21 trigger types](https://chigoox.itch.io/ed5-sigil-engine)
- [Data-Driven Design: lessons from game development — DEV](https://dev.to/methodox/data-driven-design-leveraging-lessons-from-game-development-in-everyday-software-5512)
- [boardgame.io — GitHub](https://github.com/boardgameio/boardgame.io)
- [Using Capacitor with React](https://capacitorjs.com/solution/react)
- [React Native vs Expo vs Capacitor 2026 — PkgPulse](https://www.pkgpulse.com/guides/react-native-vs-expo-vs-capacitor-cross-platform-mobile-2026)
- [Capacitor.js experience report — Manaknight Digital](https://manaknightdigital.com/blog/capacitor-js-experience-report-react)
- [Priority and The Stack — Card Kingdom](https://blog.cardkingdom.com/essential-mtg-definitions-priority-and-the-stack/)
- [5 of Magic's Most Common Rules Traps — Card Kingdom](https://blog.cardkingdom.com/5-of-magics-most-common-rules-traps/)

## 🔗 Related Internal Docs

None. The repository is greenfield (harness scaffolding + `CLAUDE.md` only); `hm memory_retrieve`
returned no matching wiki/failure entries, and `second_brain.enabled: false` in `.claude/harness.yaml`.
