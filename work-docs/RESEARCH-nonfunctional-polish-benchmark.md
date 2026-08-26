---
type: research
task_slug: nonfunctional-polish-benchmark
status: complete
created: 2026-08-26
tags: [chess-craft, research, child-ux, retention, game-feel, collection, ugc]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://www.nngroup.com/reports/children-on-the-web/
  - https://www.nngroup.com/articles/childrens-websites-usability-issues/
  - https://www.nngroup.com/articles/usability-of-websites-for-teenagers/
  - https://www.nngroup.com/articles/children-ux-physical-development/
  - https://support.chesskid.com/en/articles/12552532-how-do-stars-and-gems-work-on-chesskid
  - https://www.chesskid.com/learn/articles/make-your-kids-active-on-chesskid
  - https://www.chesskid.com/learn/articles/chesskid-customizable-avatars-are-here
  - https://support.chess.com/en/articles/9714718-what-are-streaks
  - https://support.chess.com/en/articles/8708990-how-does-the-daily-puzzle-work
  - https://lichess.org/page/storm
  - https://www.psychologytoday.com/us/blog/the-mind-of-a-collector/202311/children-who-collect-are-not-uncommon
  - https://www.psychologytoday.com/us/articles/200003/pokemon-craze-challenges-docs
  - https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5264129/
  - https://dl.acm.org/doi/fullHtml/10.1145/3555858.3555868
  - https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678797
  - https://www.museumofplay.org/blog/designing-for-productive-failure-what-play-materials-reveal-about-how-children-persist/
  - https://tocaboca.com/about/
  - https://fairplayforkids.org/pf/prodigy/
  - https://files.eric.ed.gov/fulltext/ED562235.pdf
  - https://arxiv.org/pdf/2201.02558
  - https://www.mogef.go.kr/nw/enw/nw_enw_s001d.do?mid=mda700&bbtSn=712710
  - https://www.hankyung.com/article/2026010640857
related_docs:
  - "[[PLAN-skill-legibility-and-onboarding]]"
  - "[[PLAN-piece-skill-creation-ux]]"
  - "[[RESEARCH-piece-skill-creation-ux]]"
  - "[[PLAN-custom-piece-skill-balance]]"
  - "[[PLAN-content-provenance-and-room-delete]]"
  - "[[PLAN-ui-ux-productization]]"
  - "[[SPEC-variant-chess-6x6-cards]]"
summary: "Nothing survives a match. Turn the dex into a collection the child fills, and make it hold what they made."
---

# RESEARCH — Why a child comes back tomorrow

> **Scope note.** This document replaces an earlier pass on infrastructure-shaped
> non-functional gaps (crash handling, store surface, bundle size, localization).
> The user redirected: the question is the child's **fun** and the **reason to
> return** — which is partly UI quality and partly retention structure. The
> infrastructure findings are not repeated here; three of them were closed by user
> decision (not a commercial product · content never leaves the device · losing an
> in-progress match is acceptable).

## 🎯 Recommended Direction

**TL;DR — When a match ends, nothing survives it. Turn 도감 from a static reference book into a collection the child fills, make what the child *made* the centrepiece of that collection, and shorten the make→play loop for pieces and cards from five actions to one.**

The moment-to-moment craft is genuinely good. There is a landing slide, an arrival ring, an impact ring on every square a card touched, an infinite pulse on a royal in check, and — the best single detail in the codebase — a 1600 ms pulse on any card that can be played right now, written down as *"a card that can be played right now, pulsing so a child notices they HAVE one"* (`src/ui/styles.css:2044-2049`). None of that is the problem.

The problem is what happens at the end. `src/ui/Result.tsx` shows `'{name} 승리!'`, one reason line, and three numbers — 둔 수 and each side's capture tally — and those numbers are compared to nothing, beat nothing, and are gone the instant 한 판 더 is pressed, which mints a fresh seed and discards the whole `GameState` (`src/ui/MatchHost.tsx:592-611`). Across the whole app there are six `localStorage` keys and **not one of them accumulates**: content, bundle stamp, hidden ids, three settings fields, two seen-flags. There is no games-played counter, no record, no streak, no seen-list, no timestamp. The one thing that grows across sessions is the content the child authored — and the child is never shown that it grew.

That is the exact shape the developmental literature says this age band is built to enjoy. Collecting behaviour "often begins around **6 to 8 years of age**, which correlates with the time children begin developing executive skills and a sense of control over their surroundings", and Piaget filed collecting under the concrete-operational stage; the Pokémon analysis in the same journal is blunt about the mechanism — children are drawn to "ordering, computing and categorizing", and they "memorize the names, spellings and shared characteristics of the characters". The app already renders a four-tab grid of every piece, square, rule card and skill card in `src/ui/Rules.tsx`, whose own intro string already promises *'새로 만든 것도 여기에 바로 나와요.'* The shelf is built. It is just not a collection, because no entry carries any state — no seen, no used, no won-with, no made-by-me.

Making it monotonic solves the other half at the same time. ChessKid's currency design is explicit and worth copying verbatim: **"Stars are never lost or deducted; they only increase!"** — separated from a spend-currency (Gems) that is "never purchased with real money". A count that only goes up is what lets a **lost** match still leave something behind, which is the single hardest problem in shipping chess to children. Common Sense's own ChessKid review names it as the entry barrier: chess "requires patience, strategic thinking, and the **emotional resilience to lose repeatedly** while learning." Today a child who loses sees the same screen as a child who wins with the title flipped, hears no sound at all (the `win`/`draw` tone fires on the *action* that ended it, not on the screen — `src/ui/MatchHost.tsx:104`), and receives nothing.

**Binding trade-off:** the obvious retention lever — a daily task with a streak — is the one to be most careful with here, and not for design reasons. 여성가족부's 2025 진단조사 (1.47 million participants) puts **중학생 at 85,487 — the largest single overdependence-risk cohort**, above high-schoolers (70,527) and elementary (57,229), and 콘텐츠진흥원's 2025 실태조사 (19,000 respondents) puts game use among 초4~고3 at **88.6%**. For a non-commercial family project aimed at exactly that band, an explicit, satisfying **stopping point** is a better product than an open-ended streak — and the collection framing gives one for free ("오늘 두 개 발견했다") in a way an infinite ladder does not.

## 🔍 Refinement Decisions

`--deep` was not set. This is the second pass on this slug; the topic was narrowed by the user mid-stage from "all non-functional gaps" to "the child's fun and the reason to return".

**Discovery lens:** ① User-workflow / product opportunity — how children of 8–14 actually behave in UI and what makes them re-open something (primary) · ② Technical architecture — what reward/feedback/persistence surfaces already exist in the codebase.

**Settled by user decision before this pass, not re-litigated:** not a commercial product · user-created content never leaves the device · losing an in-progress match is acceptable. Consequently: no accounts, no server, no leaderboard, no online sharing, no daily-login economy, and no match-resume anywhere in this document.

## 🛠️ Approaches Found

### Approach A — Make 도감 a collection, and make it hold what the child made *(recommended)*

| Field | Content |
|---|---|
| **Approach** | Give every dex entry persistent per-child state (본 것 / 써 본 것 / 이걸로 이긴 것 / 내가 만든 것), show a filled-vs-empty count, and silhouette the undiscovered. Counts only ever increase. |
| **Assumption** | This age band's primary engine is classification and completion, and the child needs one place that proves time spent turned into something. |
| **Evidence** | Collecting begins at 6–8 and maps to Piaget's concrete-operational stage; the Pokémon draw is "ordering, computing and categorizing" and memorizing names and shared characteristics; "There's a search for meaning and control, as children express power through valued cards." ChessKid's monotonic Stars ("never lost or deducted; they only increase!") is the shipped precedent. On our side the surface already exists — `src/ui/Rules.tsx:70-75` builds the four sets from the loaded content, and the engine *already computes* the raw material per side per match: `everOffered`, `held`, `used` in `GameState.drafts` (`src/engine/types.ts:76-80`). It is discarded rather than absent. |
| **Trade-off** | Adds the first genuinely persistent game state to a codebase whose storage discipline is currently "one document, one settings blob". Needs its own versioned key and a decision about what happens when a piece the child recorded is later deleted. |
| **Compatibility** | High. `chess-craft.*.v1` key convention, quota-refusing writes, and legacy-namespace migration are all established patterns (`src/editor/storage.ts:21-41`, `src/ui/onboarding.ts:54`). The dex already includes authored records with no code change. |
| **Risk** | **low** |

### Approach B — Close the make→play loop and give the creation an identity

| Field | Content |
|---|---|
| **Approach** | Add "바로 해보기" to a piece/card the way rooms already have it, and give the created thing a single show-off screen — a card with its name, art, movement grid and ★ grade. |
| **Assumption** | The Minecraft thesis is create→play; with sharing off the table, the loop must close on *playing with what you made*, immediately. |
| **Evidence** | The asymmetry is measurable in the codebase: a room goes from saved to playing in **one tap** — `src/ui/RoomDetail.tsx:852-864`, `'ui.editor.room.play': '바로 해보기'`, routed straight past the lobby with the comment *"asking them to name two players first is the wrong thing to put between the two"*. A piece has **no play button at all**; it is born orphaned and the UI says so — `src/ui/EditorLibrary.tsx:219`, `'ui.editor.library.unused': '어느 방에도 안 들어감'`. Getting it into a match takes roughly five actions after the save. Minecraft-side commentary attributes creative-mode pull to self-imposed milestones and then "**show off their creations by giving tours**" [weak source]; the project's own prior research already names this as unresolved — `RESEARCH-piece-skill-creation-ux.md:147`: *"'Create → immediately play' is the UGC retention moment — and it is still open."* Identity has separate support: after playing anthropomorphized games, "children manifested a statistically significant increase in anthropomorphizing of **real** trains", i.e. a face turns an object into an agent. And with no network, the show-off channel is a phone turned around — which needs one screen readable in three seconds. |
| **Trade-off** | "Play this piece right now" needs a target board. Either a scratch room is generated (new concept, new failure modes) or the child is sent through room-editing anyway, which is the current five steps wearing a different hat. This is the design question, and it is real. |
| **Compatibility** | Medium — the room path is a solved precedent, but pieces have no equivalent container. |
| **Risk** | **medium** |

### Approach C — A daily/session structure with a number to beat

| Field | Content |
|---|---|
| **Approach** | 오늘의 판 (a fixed daily seed), a small daily target, a personal best. |
| **Assumption** | Return is driven by a reset that happens without the child, and by an unbeaten number. |
| **Evidence** | ChessKid's daily ask is deliberately tiny — **"Solve at least 3 puzzles per day to earn an online trophy"** — roughly a minute. Chess.com's Daily Puzzle must be completed "within **48 hours**", and its general streaks carry "a **two-day grace period**… paused instead of resetting immediately". Lichess Storm punishes without ending the run: a wrong answer means "the combo bar is depleted, and you lose 10 seconds", not game over. Ours already has the ingredient — one seed drives the rule-card draw, both draft offers, awards, and AI sampling (`src/engine/match.ts:75-82`, `src/engine/rng.ts:30`), and the seed is already surfaced and copyable with the string *'이 번호를 알려주면 똑같은 판을 다시 할 수 있어요.'* (`src/i18n/ko.ts:320`). **But there is no input to enter one** — only copy. A shared seed is currently write-only. |
| **Trade-off** | This is the axis the Korean data argues against pushing hard: 중학생 is the largest overdependence-risk cohort (85,487 of 213,243). A streak that resets is a pressure device aimed squarely at that band. Also, unlike A and B, a daily is closer to a *feature* than to non-functional polish, which is outside what the user asked for. |
| **Compatibility** | High mechanically (the seed pipeline is done), questionable in intent. |
| **Risk** | **medium** |

---

### The findings, by axis

**[G]** = gap · **[OK]** = already good · **[?]** = needs a decision

#### 1. The end of a match — the biggest single gap
- **[G] Nothing is compared to anything.** `Result.tsx:78-92` shows 둔 수 and each side's 잡음 count. No previous match, no best, no target. `[G]` No "next thing" beyond 한 판 더 / 이 방 고치기 / 처음으로.
- **[G] The loser gets nothing and hears nothing.** Same screen, flipped title. The `win`/`draw` tone fires on the action that ended the match, not on the result screen (`MatchHost.tsx:104`), so the child who lost hears the opponent's win sound and then silence.
- **[G] A rematch discards everything** — new seed, fresh deal, `awardCount`/`held`/`everOffered`/`used` gone (`MatchHost.tsx:592-611`).
- **[OK]** `CaptureReveal` holds the final board for 2400 ms before the result (`CaptureReveal.tsx`, `CAPTURE_REVEAL_MS = 2400`) — a real ending beat exists.
- **[OK]** The three loss reasons are named in child language: `'왕을 잡았어요'` / `'카드로 이겼어요'` / `'기물이 더 많아요'` (`ko.ts:327-329`).
- The literature says the loss screen is where the design work is: children "voluntarily engage in games that provide feedback on whether they are making mistakes" — hiding the loss is not the answer; the answer is that "**The game doesn't judge you**" (the title of the ACM designer-interview study), i.e. failure framed as a system event rather than a verdict on the child. Miyamoto's Pikmin framing is the same move: "there's always an end to a life but a new beginning will follow shortly."

#### 2. Nothing accumulates
- **[G] Six `localStorage` keys, zero progress.** `chess-craft.content.v1` · `.bundle-stamp.v1` · `.hidden.v1` · `.settings.v1` (exactly `{sound, haptics, names}`) · `.coach.seen.v1` · `.match-intro.seen.v1`. No games played, no record, no streak, no history, no timestamps.
- **[G] Awards are announced and forgotten.** `AwardBanner` fires when `awardCount` grows every `SKILL_AWARD_INTERVAL = 5` completed turns (`engine.ts:1693-1706`, `MatchHost.tsx:625-631`), shows for 1800 ms, and is never recorded. **It also has no sound** — `SOUND_EVENTS` has no award event (`sound.ts:17`).
- **[G] Difficulty resets to 보통 on every lobby visit** — `Lobby.tsx:74` `useState<Difficulty>('medium')` in a component `App` unmounts on route change, and `Settings` has no field for it. A child who found 어려움 has to find it again every time.
- **[OK]** The one thing that does grow is the authored document — and it grows in the one place the child can see it (도감, 만들기).

#### 3. 도감 is a reference book, not a collection
- **[G] No per-entry state of any kind.** `Rules.tsx:70-75` builds four sets straight from `content`; every entry always shows in full. No seen / used / won-with / made-by-me. No count, no empty slots, no silhouettes.
- **[G] The child's own creations are not distinguished here.** The official-vs-authored split exists only inside the editor (`EditorLibrary.tsx:216`).
- **[OK]** The shelf and its promise already exist: `'ui.rules.title': '무엇이 있나요'` and the intro ending `'새로 만든 것도 여기에 바로 나와요.'`
- **[OK]** The engine already computes what a collection would need — `everOffered` per side per match (`engine.ts:1701`).

#### 4. The creation loop
- **[OK] Rooms are exemplary.** One tap from saved to playing, with the save deliberately bundled into the button: *"Saving first is the point of the button — 'try it now' that played an unsaved room would show the child something they could not get back to"* (`RoomDetail.tsx:852-864`). Five clear steps: 판 칠하기 → 기물 → 배치 → 카드 → 이름 (`RoomDetail.tsx:132`).
- **[G] Pieces and cards have no play route.** No `onPlay` in `EditorLibrary.tsx`. ~5 actions from save to played.
- **[OK] Immediate feedback on a draft exists** — a live ★ grade with an explanation while editing (`RecordGrade.tsx:24-27`, `useGrades.ts:58`).
- **[OK] Remix is already the default entry** — `MakerGallery` opens with 무엇부터 시작할까요 and offers remix / template / blank (`RecordForm.tsx:1191`, `ko.ts:900`).
- **[G] No single show-off screen for a created piece.** With no network, the sharing channel is turning the phone around; there is no one screen that reads in three seconds.

#### 5. Variety between sessions
- **[OK]** One seed drives four independent streams — the match's rule card, each side's 3-card draft offer (`DRAFT_OFFER_SIZE = 3`), the periodic awards, and AI sampling. The tagline already sells it: `'판마다 규칙이 달라져요.'`
- **[G] The seed is write-only.** It is displayed and copyable with `'이 번호를 알려주면 똑같은 판을 다시 할 수 있어요.'` (`ko.ts:320`) — but there is **no input to enter one**. The string promises something the UI cannot do. This is the cheapest fix in this document and it is also the only no-network way for two children to play *the same board*.
- **[G] The board itself never varies within a room** — layout, piece set and placements are fixed (`match.ts:84-85`). All variety is in cards.

#### 6. Moment-to-moment feel — the strongest axis
- **[OK]** `land` 170 ms · `arrive` 260 ms · `impact` 420 ms on every square a card touched, gated to exactly the card banner's lifetime · `check-pulse` 300 ms infinite on a royal in check · `pop` 120 ms legal-move dots · `deal` 300 ms · idle `bob` 2200 ms. All suppressed under `prefers-reduced-motion`.
- **[OK] The best detail in the app:** `styles.css:2044-2049` pulses any card that is playable *right now*, at 1600 ms, "so a child notices they HAVE one". This is precisely the NN/g finding — children scan rather than read and "mine-sweep the screen"; an affordance that moves is one they will find.
- **[OK] Notices never collide** — one ordered pick at `MatchHost.tsx:1147-1157`; the hand-off curtain was deliberately removed as "too much for what it bought" (`MatchHost.tsx:1172`).
- **[G] Silence on the two most emotional moments.** No sound on award, none on check (the check chip is `aria-live="assertive"` but audio-silent), none on entering the result screen.
- **[G] Sound is off by default** (`settings.ts:53`) for a documented and correct reason (a classroom), but nothing ever asks the child once whether to turn it on.
- **[?]** Celebration length is unmeasured. NN/g on both bands points the same way — young children "Want instant gratification", teens have "Dramatically lower levels of patience" and "Hate waiting for things to load". Any win flourish should be skippable on tap.

#### 7. The age split is a real design constraint
- The audience is 초·중학생 — which the research says is **two audiences**. NN/g: "distinguish between young (3–5), mid-range (6–8), and older (9–12) children", and "**Children are acutely aware of age differences**". For 9–12, reading is "Scanning"; text size 12pt.
- Teens are a different species: "Nothing deters younger audiences more than a cluttered screen full of text", "Avoid anything that sounds condescending or babyish", "**The word 'kid' is a teen repellent**", and — directly relevant to any celebration work — "ease up on the heavy animations and garish color schemes".
- **[inference, but well-supported]** The safe resolution is an **intensity** control, never an age control: label it by taste (차분하게 / 화려하게), default it to the middle, and keep the words 어린이 / 저학년 out of the UI entirely. Asking a 13-year-old to turn off "어린이 모드" brands the app.
- **[OK]** The project already refuses to shrink text to fit (`PLAN-button-label-truncation.md:176`) and enforces 44 px targets in e2e. NN/g's 2 cm recommendation for younger children is stricter than 44 px (~1.1 cm) — worth knowing, though a phone-width board cannot satisfy it geometrically.

#### 8. Two children, one phone — already the right shape
- **[OK]** Hot-seat is the default (`'ui.lobby.mode.human': '둘이서'`), both names persist across sessions with a documented rationale — "the same two children play on the same phone over and over" (`settings.ts:26-38`) — and those names then appear in the turn bar, both banners, the check warning, the capture reveal and the result screen. Empty falls back to 파란 편 / 빨간 편.
- **[OK]** Board flip for the child sitting opposite; a hand-off toast with no curtain.
- This matches the research unusually well: children sharing one tablet "**preferred turn-taking** rather than crowding", and shared-device play makes parents and children "sit **side by side**". Turn-based chess on one phone is the configuration the literature predicts is best for this band.
- **[?] Parents are an unexploited retention channel.** Co-play correlates with "higher levels of family connection", and children's stated reason for playing with an adult is that "**it is more fun**" — but they "prefer games which require **full cooperation** with others rather than merely simultaneous play". Everything here is competitive. A co-op shape (parent and child on the same side against the AI, or building a room together) has no equivalent today.

#### 9. Identity — pieces are things, not characters
- **[G]** A piece has a name, a mark and ability text, reachable in-match via long-press and the selection strip. It has no personality, no reaction, no voice, no state of its own.
- The anthropomorphism study is the relevant hard evidence: exposure to anthropomorphized game objects significantly increased children's anthropomorphizing of the *real* referent. The CHI PLAY attachment work adds that attachment is not one thing — among "seven distinct forms" is admiring a character's "gameplay competency", which maps neatly onto a strong custom piece.
- **[?]** The practical test is linguistic: does the child say *"내 폭탄기사가 잡았어"* or *"저 파란 거"*? The former means identity design is working.

#### 10. What kills it — checked against this codebase
| Failure mode | Source | Our exposure |
|---|---|---|
| Cluttered text | "Nothing deters younger audiences more than a cluttered screen full of text" | Low — 도감 and sheets are mark-first grids |
| Waiting | "especially offensive to young audiences who expect instant gratification" | Low — `AI_MIN_THINK_MS = 650` is a deliberate floor, not a stall |
| Babyish tone | "The word 'kid' is a teen repellent" | **Unchecked** — no audit of the ko strings against the teen half of the band |
| Precision input | 2 cm targets for young children | Partly mitigated (44 px, tap-not-drag) |
| Stuck with no exit | children's recovery is "refresh the page, close and reopen the app" | Watch — `[fail:design] mode-with-no-way-out` already fired once here |
| Shell/substance split | "Children learn to love the game and tolerate the math" (Prodigy) | **Structurally safe** — the fun *is* the chess; no wrapper economy |
| Zero friction | removing friction "may reduce opportunities… retrying, revising, and adapting" | Watch — argues against auto-easing difficulty |
| Repeated losing | "the emotional resilience to lose repeatedly" | **High** — this is the open gap (§1) |
| Streak that resets hard | industry answer is a 48 h / two-day grace | N/A today; a reason to be careful adding one |

## ⚠️ Pitfalls

1. **A streak is the wrong lever for this specific audience.** 여성가족부 2025: 중학생 is the largest overdependence-risk cohort at 85,487. 콘텐츠진흥원 2025: 88.6% of 초4~고3 play games. For a family project, an explicit stopping point ("오늘 두 개 발견") is a feature; an open ladder is a liability. If a daily is added at all, copy Chess.com's **two-day grace period** rather than a hard reset.
2. **Celebration that patronises the older half.** The same flourish reads as "satisfying" at 9 and "for babies" at 13, and NN/g says children are "acutely aware of age differences" and detect content aimed younger than them. Use an intensity control, never an age control, and never the word 어린이 in the UI.
3. **Making losing not-hurt by lying about it.** Children *want* mistake feedback; the frame that works is "the game doesn't judge you" — a system event, not a verdict. Do not soften the result line; add something the loss still earns.
4. **Smoothing away the friction that builds persistence.** "Designed to minimize friction… may reduce opportunities for children to engage in retrying, revising, and adapting." This argues specifically against silently lowering AI difficulty after losses.
5. **Distinct-is-not-distinguishable.** `[fail:test] distinct-is-not-distinguishable` — a checker-pattern test asserted two colours were different *strings*; they were, imperceptibly, and shipped invisible. A collection's filled-vs-empty state is exactly this shape: assert the perceptual difference, not the attribute.
6. **A styled set with one member from another technology inherits nothing.** `[fail:render] glyph-opts-out-of-its-styling` (count 3) — `text-shadow`, `color`, `font-weight` are all silently inert on `<img>`. A silhouetted/greyed dex tile is a filter over an `<img>`, so it must be verified in pixels, not in CSS.
7. **A mode with no way out.** `[fail:design] mode-with-no-way-out` already fired here (an armed skill card that could strand the player). Any new celebration overlay or collection sheet needs its exit designed first — and children's default recovery is to close the app.
8. **A fixed overlay intercepts everything it only meant to dim.** `[fail:render] fixed-overlay-blocks-what-it-only-dims` (count 2). A full-screen "새로 발견!" flourish is the shape that reoffends.
9. **The promise the UI cannot keep.** `'이 번호를 알려주면 똑같은 판을 다시 할 수 있어요.'` ships today with no way to enter a seed. Shipping a string that describes an absent capability is worse than shipping neither.
10. **Every new count is a migration.** A collection keyed to record ids breaks when the child deletes or renames a piece; `SCHEMA_VERSION` is at 16 and content-schema migration is already a solved-but-nontrivial area here. Decide the absent/deleted case before writing the key — the project's own most-recurring recorded failure class is the absent case going undefined.

## ❓ Open Questions

1. **Which of A / B / C, and in what order?** A is the lowest-risk and reuses the most; B is closest to the product thesis but has an unsolved design question (what board does a lone piece play on?); C is the most conventional and the one the Korean data argues against.
2. **What counts as "collected"?** Seen in a match? Played? Won with? Made by me? Each is a different persistence shape, and the count the child sees should be the one that is easiest to move — a count that never moves is worse than no count.
3. **What happens to a collection entry when the underlying record is deleted or renamed?** Keep it as a ghost, drop it silently, or refuse the delete? The absent-case rule says pick one explicitly.
4. **Does a lost match earn something, and what?** This is the crux of §1. Options: the same discovery credit as a win, a smaller amount, or a different currency entirely.
5. **Sound on the emotional beats — award, check, result-screen entry?** Adding events is cheap (the synth table is one object), but sound is off by default, so this only lands if something asks the child once.
6. **Is a co-op shape in scope?** Research says children prefer full cooperation with an adult over simultaneous play, and everything here is competitive. Parent-and-child versus the AI is the obvious form.
7. **Should difficulty persist?** One `Settings` field. The counter-argument is pitfall 4 — persisting is not the same as auto-adjusting, and only persisting is proposed.
8. **Does a piece get a personality, and how far?** A name and a face is one decision; a reaction on capture is another; a voice is a third and collides with ADR-023 (no audio assets).
9. **Does the seed get an input field?** Cheapest item here, and the only no-network way for two children to play the identical board. Also the answer to a shipped-but-unkeepable promise.

## 📚 Sources

**Children's and teens' UX**
- NN/g, *Children (Ages 3–12) on the Web* (4th ed., 156 guidelines, 80+ sites / 36 apps): https://www.nngroup.com/reports/children-on-the-web/
- NN/g, *Children's UX: Usability Issues in Designing for Young People* (age-band behaviour table: reading, feedback, discoverability, error recovery): https://www.nngroup.com/articles/childrens-websites-usability-issues/
- NN/g, *Teenagers (Ages 13–17) on the Web* ("The word 'kid' is a teen repellent"; patience; text density): https://www.nngroup.com/articles/usability-of-websites-for-teenagers/
- NN/g, *Design for Kids Based on Their Stage of Physical Development* (2 cm targets; drag/scroll mastery by 9–12): https://www.nngroup.com/articles/children-ux-physical-development/

**Collection and identity**
- *Children Who Collect Are Not Uncommon*, Psychology Today (onset 6–8; Piaget's concrete-operational stage): https://www.psychologytoday.com/us/blog/the-mind-of-a-collector/202311/children-who-collect-are-not-uncommon
- *Pokemon Craze Challenges Docs*, Psychology Today (ordering/computing/categorizing; memorizing names and shared characteristics; power and control): https://www.psychologytoday.com/us/articles/200003/pokemon-craze-challenges-docs
- Anthropomorphism transfer to real referents after anthropomorphized game play: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5264129/
- CHI PLAY, seven forms of player–character emotional attachment (incl. gameplay competency): https://dl.acm.org/doi/abs/10.1145/3311350.3347169

**Failure, persistence, and tone**
- ACM, *"The game doesn't judge you"* — designer interviews on framing failure: https://dl.acm.org/doi/fullHtml/10.1145/3555858.3555868
- ACM, *A Game Design Approach to Failure to Enhance Learning Games* (children seek mistake feedback): https://dl.acm.org/doi/fullHtml/10.1145/3665463.3678797
- The Strong National Museum of Play, *Designing for Productive Failure* (minimizing friction reduces persistence): https://www.museumofplay.org/blog/designing-for-productive-failure-what-play-materials-reveal-about-how-children-persist/
- Toca Boca, *About* ("play… instead of gaming"; make, tear down, start over): https://tocaboca.com/about/
- Fairplay for Kids on Prodigy (shell/substance split; upsell density): https://fairplayforkids.org/pf/prodigy/

**Retention structures**
- ChessKid, *How do Stars and Gems work* ("Stars are never lost or deducted; they only increase!"): https://support.chesskid.com/en/articles/12552532-how-do-stars-and-gems-work-on-chesskid
- ChessKid, *Engage Your Kids* ("Solve at least 3 puzzles per day"): https://www.chesskid.com/learn/articles/make-your-kids-active-on-chesskid
- ChessKid, *Customizable Avatars*: https://www.chesskid.com/learn/articles/chesskid-customizable-avatars-are-here
- Chess.com, *What are Streaks?* (two-day grace period): https://support.chess.com/en/articles/9714718-what-are-streaks
- Chess.com, *How does the Daily Puzzle work* (48-hour window): https://support.chess.com/en/articles/8708990-how-does-the-daily-puzzle-work
- Lichess, *Puzzle Storm* (combo bonuses; −10 s instead of run-end): https://lichess.org/page/storm

**Co-located and family play**
- *Strengthening Parent–Child Relationships Through Co-Playing Video Games*, ERIC ED562235 (family connection; children prefer full cooperation): https://files.eric.ed.gov/fulltext/ED562235.pdf
- *Project IRL*, arXiv (shared-device play and "side by side" proxemics): https://arxiv.org/pdf/2201.02558
- *Tablet for Two* (children prefer turn-taking over simultaneous multi-touch) — via ResearchGate [weak]

**Korean market**
- 여성가족부, 2025년 청소년 미디어 이용습관 진단조사 (1.47M participants; 과의존 위험군 213,243 — 중학생 85,487 / 고교생 70,527 / 초등학생 57,229): https://www.mogef.go.kr/nw/enw/nw_enw_s001d.do?mid=mda700&bbtSn=712710
- 한국콘텐츠진흥원, 2025 아동청소년 게임행동 종합 실태조사 (19,000 respondents; 게임 이용군 88.6%) — press coverage: https://www.hankyung.com/article/2026010640857

**Weak or unobtained.** ChessKid's "feels like it was built in 2013" is an aggregator review. Minecraft/Roblox creation-retention claims come from blogs and parent guides, not first-party developer commentary — that primary source was **not obtained**. Also not found: any quantitative study splitting celebration tolerance by age (8 vs 12) — the direction here is inferred from the NN/g teen findings and is labelled as such; and ChessKid's official documentation of its *loss* UI.

## 🔗 Related Internal Docs

- [[RESEARCH-piece-skill-creation-ux]] — already names the unresolved item at the centre of Approach B: *"'Create → immediately play' is the UGC retention moment — and it is still open."* Also asks how a reach cap is expressed to a nine-year-old.
- [[PLAN-piece-skill-creation-ux]] — the maker gallery, remix-first entry, and the ★ grade surface.
- [[PLAN-custom-piece-skill-balance]] — the grade/duel-legal machinery behind `RecordGrade`; a grade is explicitly "a local number, not a rating".
- [[PLAN-skill-legibility-and-onboarding]] — the card-fired banner, the impact flourish, and the ADR-007 non-goals (no particles, no screen shake) that bound any new celebration work.
- [[PLAN-content-provenance-and-room-delete]] — bundled vs. child-made already separated in the editor; *"Make 'what we shipped' and 'what the child made' two visibly different things"*. Approach A extends that distinction into 도감.
- [[PLAN-ui-ux-productization]] — Phase 3 FTUE scoped **out** "achievements" explicitly (`:551`); Phase 10 (preview, playtest, staged complexity) was cancelled by the user. Worth re-reading before proposing progression.
- [[PLAN-button-label-truncation]] — "The app targets children and the size tokens are [sized for that]"; shrinking text to fit was rejected on the record.
- [[SPEC-variant-chess-6x6-cards]] — 초·중학생 target; the "변형 체스계의 마인크래프트" thesis; Non-Goals exclude accounts, ranking, leaderboards.
- `.claude/memory/failures.md` — `[fail:test] distinct-is-not-distinguishable` · `[fail:render] glyph-opts-out-of-its-styling` (3) · `[fail:render] fixed-overlay-blocks-what-it-only-dims` (2) · `[fail:design] mode-with-no-way-out`.
