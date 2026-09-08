---
type: research
task_slug: piece-upgrade-acquisition
status: complete
created: 2026-08-31
tags: [chess-craft, research, typescript, progression, collection, game-balance, child-safety]
mtime_warn_days: 7
libs_fetched: []
sources:
  - https://developer.apple.com/app-store/review/guidelines/
  - https://support.google.com/googleplay/android-developer/answer/9858738
  - https://support.google.com/googleplay/android-developer/answer/9893335
  - https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=20865
  - https://www.ftc.gov/news-events/news/press-releases/2025/01/genshin-impact-game-developer-will-be-banned-selling-lootboxes-teens-under-16-without-parental
  - https://supercell.com/en/games/brawlstars/blog/release-notes/candyland-update-release-notes-2/
  - https://support.supercell.com/brawl-stars/en/articles/unlocking-brawlers.html
  - https://playruneterra.com/en-us/news/lor-announce-faq
  - https://chess-upgraded.com/chess-upgraded
  - https://www.sjgames.com/knightmare/kc_rules.pdf
  - https://www.nngroup.com/articles/childrens-websites-usability-issues/
related_docs:
  - "[[RESEARCH-custom-piece-skill-balance]]"
  - "[[PLAN-custom-piece-skill-balance]]"
  - "[[REVIEW-custom-piece-skill-balance-2026-08-08]]"
  - "[[RESEARCH-nonfunctional-polish-benchmark]]"
  - "[[PLAN-nonfunctional-polish-benchmark]]"
  - "[[RESEARCH-piece-skill-creation-ux]]"
  - "[[SPEC-variant-chess-6x6-cards]]"
  - "[[RESEARCH-preset-content-expansion]]"
summary: "Use earned choice-reveals plus direct forging; never sell randomized gameplay power"
---

# RESEARCH — bounded authored pieces and collectible base-piece upgrades

## 🎯 Recommended Direction

**Use an earned reveal plus guaranteed direct forging, not paid gacha and not a real-money power shop.** A completed human match should advance one transparent, non-expiring upgrade currency; at reward milestones the player gets a choice among three *unowned* base-piece upgrades, while the dex always lets them spend that same currency toward a specific upgrade. The reveal supplies anticipation, but direct forging guarantees agency. Duplicates should not occur until the relevant pool is complete, losses must still advance the track, and real-money monetization—if it is added later—should be limited to cosmetics or fixed supporter packs.

This is primarily **user-facing workflow value**: a match leaves behind a useful artifact, the collection gains a purpose, and a player can take an owned upgrade into the next game. It also fits the current product better than a store. Chess Craft is an assets-only, account-free, offline-capable PWA (`wrangler.jsonc`; `src/editor/storage.ts`), targets children and young teens (`[[SPEC-variant-chess-6x6-cards]]`), and stores collection progress per device (`src/collection/record.ts`). Paid random power would therefore require a trusted backend, purchase restoration, identity, parental controls, probability publication, refund handling, and regional compliance before it could be a reliable feature. Apple and Google both require odds disclosure near purchases of randomized virtual items, Korea has required probability-item disclosure since 2024, and the FTC's 2025 Genshin settlement specifically identifies confusing currencies, rare-power odds, and child-directed pressure as consumer-protection risks.

The gameplay model should be **bounded vertical sidegrades**, not raw stat inflation. Each curated upgrade keeps its base piece's identity and adds one constrained tactical option—preferably movement-only, conditional, or once-per-match—so the bonus creates a decision rather than merely making every legal action better. `Chess Upgraded` is useful direct prior art: its rook, bishop, knight, queen, king, and pawn retain their original movement and gain bonus moves that cannot capture. Chess Craft already has the ingredients to price and gate this: declaration-derived `pieceCost`, a closed five-star scale, `costCeiling`, per-room `loadoutBudget`, and fail-closed loadout validation (`src/balance/cost.ts`; `src/balance/legal.ts`; `src/content/load.ts`).

For human-authored pieces, define a **standard-play authoring ceiling** no higher than the strongest non-royal bundled base piece on the canonical 6×6 board. Enforce it live in the maker for understandable feedback and again at the import/load boundary so edited JSON cannot bypass it. Curated upgrades may exceed the authored ceiling by at most one displayed star, must name one exact base-piece family, and must still pay the room's visible loadout budget. Determine curated status from the running bundle/immutable upgrade catalog, never from a forgeable `official: true` field. If unrestricted creativity is still desired, keep it in an explicitly labelled sandbox room that does not earn progression rewards; standard rooms remain capped.

One architectural correction is required before this can feel like ownership. Today's `LoadoutSlot` requires a piece, its replacement, **and a skill card together**, and `placementsFor` replaces **every** same-id piece on that side (`src/content/schema.ts:650-693`; `src/engine/loadout.ts`). A player who owns `Knight+` cannot equip it alone, and equipping `Pawn+` would upgrade the whole pawn line. Upgrade equipment should therefore be independent of the custom skill-card slot and target one starting placement (or explicitly charge per replaced copy). The recommended default is one upgraded starting piece per side, selected by starting square.

## 🔍 Refinement Decisions

`--deep` was not set; no Phase 0 interview ran.

**Discovery lens:** User-workflow / product opportunity first, then technical architecture / implementation, with risk / compliance / child safety as a binding lens. Academic/benchmark work was not used because the decision is dominated by the existing product architecture, official platform rules, and observable acquisition-system precedents.

### Problem boundary

**In scope:** limiting standard-play power for authored pieces; defining curated upgraded versions of base pieces; owning, earning, inspecting, equipping, and replacing with those upgrades; comparing random draw, direct acquisition, and a hybrid; persistence, fairness, and policy requirements that the acquisition loop creates.

**Out of scope for the first release:** real-money payments, accounts, cross-device cloud sync, online matchmaking, trading, an open-ended rarity ladder, duplicate-based level-ups, limited-time banners, and a live-service content schedule. Each would create a subsystem absent from the current app.

### Local capability × player artifact

| Local capability | Player artifact already maintained | Reuse for this feature | Missing piece |
|---|---|---|---|
| `pieceCost`, stars, `costCeiling` | ★ grade shown while making and selecting records | one explainable power scale for authored caps and upgrade budgets | a canonical authoring ceiling independent of the room currently open |
| `preset.loadout` + `loadoutBudget` | a room's per-side brought piece/card | preserve the visible trade-off between a stronger piece and other loadout power | piece and skill ownership are currently inseparable; replacement is by piece id, not square |
| `officialIds` / pristine-bundle comparison | shipped vs. child-made records in the editor | distinguish immutable curated upgrades from forks without storing forgeable provenance | a bundled upgrade-family catalog (`upgradeId → basePieceId`) |
| `collection.v1` (`seen/used/won`) | the dex shelf a child fills through play | natural discovery surface and reward trigger | ownership and currency are different state and need their own versioned store |
| deterministic match RNG | reproducible card offers and replays | deterministic, testable reward offers from a stored reward nonce | idempotent claim ids so React remounts/reloads cannot grant twice |
| content JSON export/import | the rooms and creations a player can back up | precedent for an explicit backup flow | progression is device-only today; ownership needs a separate profile export or an account |
| result screen discovery delta | what one completed match added | place to award progress without a daily-login loop | a non-blocking reward/choice screen with a clear exit |

### Acquisition principles inferred from the sources

1. **Randomness may reveal choices; it must not sell power.** Apple and Google mandate odds disclosure for purchased random virtual goods; Korea's regime adds game/website/advertisement disclosure duties; the FTC settlement shows that disclosure alone does not cure confusing currencies or child-directed pressure.
2. **A deterministic escape hatch is established prior art.** Legends of Runeterra paired random chests with shards and wildcards that unlock a chosen card. Brawl Stars' 2022 Starr Road replaced boxes with credits and a choice among same-rarity characters; its current acquisition support again combines boxes with a guaranteed count and deterministic Starr Road/Trophy Road choices. The useful pattern is not one title's current economy, but *random discovery plus bounded guarantee*.
3. **Do not make stronger equal rarer.** Rarity can describe novelty or acquisition cost, but play legality must continue to use `pieceCost`, stars, exact-base replacement, and the room budget. Otherwise collection luck becomes match strength.
4. **No streak or expiry is needed.** Prior internal research already rejected retention pressure for this age group (`[[RESEARCH-nonfunctional-polish-benchmark]]`). Earned currency and target progress should never expire, and rewards should come from finishing games rather than opening the app on schedule.

## 🛠️ Approaches Found

### Approach A — Paid random draws for upgraded pieces

| Field | Content |
|---|---|
| Approach | Sell pulls from rarity-weighted upgrade pools, optionally with pity and duplicate conversion. |
| Assumption | Revenue and opening excitement justify identity, billing, odds, restoration, regional policy, and child-safety work. |
| Evidence | Gacha is a proven commercial pattern, but every relevant constraint points against it here. Apple and Google require nearby odds disclosure for purchased random items; Korea requires probability information in multiple surfaces; the FTC's Genshin settlement targets misleading odds, layered currencies, limited-time pressure, and child purchases. The app currently has no server, account, billing, parental consent, or restore path. |
| Trade-off | Highest short-term reveal excitement and revenue potential in exchange for the largest technical scope, compliance burden, trust cost, and pay-to-win risk. |
| Compatibility | Very low. It changes an assets-only local PWA into a commerce service and makes permanent ownership depend on browser storage unless a backend ships first. |
| Risk | high |

**Assessment:** reject for this game. Pity, published odds, and duplicate conversion reduce harm but do not solve the product mismatch. A paid draw whose rare result is stronger is the worst variant because luck and spending both enter competitive power.

### Approach B — Deterministic direct forge/shop

| Field | Content |
|---|---|
| Approach | Every completed match grants a known amount of non-paid currency; the player chooses an upgrade in the dex and buys or fills it directly at a displayed price. No random acquisition. |
| Assumption | Agency, fairness, and implementation simplicity matter more than pack-opening anticipation. |
| Evidence | The current collection already turns completed matches into persistent dex progress. Starr Road demonstrates progress toward a chosen same-rarity character; Legends of Runeterra's shards/wildcards demonstrate targeted collection completion. Knightmare Chess shows that a visible point budget is comprehensible prior art for chess-changing powers. |
| Trade-off | Most transparent and easiest to balance, but reward moments can feel like a progress bar rather than discovery unless presentation and preview are strong. |
| Compatibility | High. One local profile store, one dex action, and one independent equipment slot can reuse existing storage, grading, collection, and loadout patterns. |
| Risk | low |

**Assessment:** safest fallback and the right first vertical slice if schedule is binding.

### Approach C — Earned choice-reveal + guaranteed direct forge (recommended)

| Field | Content |
|---|---|
| Approach | Matches grant deterministic currency. At milestones, reveal three unowned upgrades from the eligible tier and let the player choose one; at all times, let the player target any visible upgrade and put currency directly toward it. No paid pulls, no duplicate before pool completion, and a finite guarantee for the targeted upgrade. |
| Assumption | The desired “draw” feeling is anticipation and discovery, not the possibility of wasting money or receiving no useful progress. |
| Evidence | It composes the agency mechanisms used by Starr Road and LoR with the existing dex's visible gaps. Current Brawl Stars support also uses a hybrid of random boxes, an explicit guaranteed count, and deterministic alternatives, showing why a guarantee needs to be part of the acquisition contract rather than an invisible tuning value. |
| Trade-off | More state and UI than direct forge: offer generation, target progress, claim idempotency, pool completion, and migration rules all need definitions. The price is justified only if the reveal itself is a meaningful product goal. |
| Compatibility | High if implemented locally and without payments. Deterministic offers can reuse the engine's seeded-RNG discipline; the profile stays separate from content and the collection tier store. |
| Risk | low–medium |

**Recommended concrete loop (informational, to be locked in PLAN):**

1. A completed human match grants `1` progress unit regardless of win/loss; a win may add a small bonus but must not be required.
2. The result screen shows progress and, only at a milestone, offers three unowned upgrades. It never blocks “play again” or “home”.
3. The dex groups upgrades under Pawn / Knight / Bishop / Rook / Queen. The player can preview exact movement, cost, star delta, and what it replaces before selecting or targeting it.
4. A target receives the same currency directly. The offer mechanic can accelerate discovery but can never make a selected upgrade slower than a stated maximum number of completed matches.
5. An owned upgrade is permanent on that profile. No duplicate levels, merging, breaking, expiry, or consumable copies in v1.
6. Before a match, each side may equip at most one upgrade to one non-royal starting square. The loadout screen shows the resulting total against the room budget.
7. Standard play refuses authored pieces above the authored ceiling and curated upgrades above `base star + 1`; sandbox play may opt out but earns no progression.
8. If monetization arrives later, sell fixed cosmetics or a clearly enumerated content/supporter pack. Do not sell random gameplay power or paid currency that feeds the reveal.

### Suggested initial upgrade roster

These are hypotheses for balance tests, not committed content. Prefer four or five variants before covering every base piece.

| Base | Upgrade concept | Constraint that pays for the benefit | Why it fits |
|---|---|---|---|
| Pawn | one sideways or backward step | move-only; once per match or only before crossing midline | escapes a block without gaining a new capture lane |
| Knight | one orthogonal step | move-only | fills dead squares while preserving the L-capture identity |
| Bishop | one orthogonal step | move-only | escapes colour lock without becoming a rook attacker |
| Rook | one diagonal step | move-only | improves manoeuvring, not capture reach |
| Queen | no v1 upgrade, or one tightly conditional leap | highest base power; must remain within the one-star delta and room budget | avoids making the strongest base piece the obvious first target |
| King | no collectible upgrade in standard play | `royal` is already forbidden from loadout substitution | preserves the loss condition and avoids special-case legality |

The move-only concepts match `Chess Upgraded` prior art, but Chess Craft currently represents move and attack separately, so they can be expressed as distinct movement/attack patterns without adding raw attack coverage. Each candidate still needs engine-driven preview, cost explanation, liveness tests, AI complexity measurement, and self-play smoke tests before shipping.

## ⚠️ Pitfalls

1. **Calling a paid power shop “choice” does not remove pay-to-win.** Direct purchase is fairer than paid random draws only in the consumer-transparency sense. If purchased upgrades alter legal moves, a player who paid still has competitive options a non-payer lacks. Keep money out of gameplay power.
2. **A local-only purchase can disappear.** `localStorage` is the current persistence boundary and the deployed Worker serves assets only. Clearing site data, changing browser/device, or a failed storage write can erase ownership. Do not accept money before server-authoritative entitlements and restoration exist; for free progression, add explicit profile export/import and failure messaging.
3. **The current loadout cannot represent the requested action cleanly.** All three fields are required, so owning only a piece upgrade is impossible; changing one field can clear a partial slot in the form. Separate `equippedUpgrade` from the custom skill loadout rather than making unrelated ownership travel together.
4. **Current replacement multiplies power by copy count.** `placementsFor` replaces every same-id piece on that side. A `Pawn+` may therefore upgrade four or more pieces for one ownership item and one budget term. Select one starting square, or multiply cost by replaced count and say so in the UI.
5. **Room-relative stars make a global shop label unstable.** `costCeiling` is derived from each room's pieces. An upgrade can display different stars across rooms, which is valid for room legality but confusing in a global dex. Show a canonical 6×6 collection grade plus the selected room's effective grade at equip time; never silently reuse one as the other.
6. **Stored provenance is forgeable.** A player-imported record must not gain the curated-upgrade exception by declaring `upgradeOf` or `official`. Derive the catalog from the running bundle, and treat any edited official record as an authored fork, consistent with `src/content/provenance.ts` and `src/editor/fork.ts`.
7. **A UI-only cap is not a cap.** The import path accepts JSON. Live maker feedback is necessary for children, but the authoritative standard-play cap must run at load/equip validation too.
8. **Rarity must not be the balance model.** If “legendary” means both scarce and stronger, acquisition luck controls match power. Cost/stars and room budget remain authoritative; rarity, if kept at all, describes collection cadence.
9. **Duplicates create a deliberately bad outcome.** With a small initial roster, duplicate pulls quickly dominate. Boolean ownership plus duplicate protection is simpler and kinder than shards, ascension levels, or copy counts.
10. **A pity counter is insufficient if the target is hidden.** The player must see the target, maximum remaining matches, eligible pool, offer rules, and duplicate rule. Apple/Google/Korean rules are minimum disclosure references for paid systems; the free system should still meet the same clarity standard.
11. **A reward effect can double-grant.** Result effects may remount, undo, or re-render. Persist a claim id before presenting the reward, and make `claim(matchId)` idempotent. The existing collection write already verifies that persistence actually landed (`src/ui/MatchHost.tsx:432-452`).
12. **Hot-seat has no owner identity.** Collection history is intentionally device-owned. Either both local players choose from the same upgrade shelf, add local profiles, or normalize upgrades in fair hot-seat. “My owned piece” cannot be enforced until PLAN chooses one.
13. **AI and search cost can jump even when stars barely move.** Turning or extra movement expands legal endpoints and search branching. Reuse `src/engine/ai/complexity.ts` and targeted performance gates; a cost formula is not a latency budget.
14. **Progression cannot repair weak content.** Every upgrade needs a distinct tactical role, readable art/name, engine-driven preview, and tests that it works and stays inert where it should. A larger pool of near-identical `+` pieces makes both the dex and acquisition loop worse.
15. **Limited-time banners, expiring currency, and login streaks conflict with the audience decision.** They create pressure without improving the core make→play→collect loop. Internal research already recommends explicit stopping points and non-regressing progress.

## ❓ Open Questions

1. **Hard authoring refusal or sandbox escape?** Recommendation: cap standard-play creations at the strongest non-royal bundled base piece, while an explicit no-progression sandbox may allow more. PLAN must decide whether the user intended a total creation ban instead.
2. **What is one equipment item?** Recommendation: one owned upgrade equips one starting square. Alternative: replace every same-id piece and multiply both budget and ownership requirement by count.
3. **Does upgrade equipment replace or coexist with the current custom piece+skill loadout?** Recommendation: independent slots sharing one room budget; do not require a skill card to equip a piece upgrade.
4. **Who owns upgrades in hot-seat?** Same device shelf for both sides, two local named profiles, or fair-mode normalization? This is the largest product decision because the app has no account boundary.
5. **What does solo AI receive?** Nothing, a budget-matched curated loadout, or difficulty-specific upgrades? A human-only power bonus can make progression feel like lowering difficulty rather than expanding tactics.
6. **Reward cadence and guarantee.** How many completed games per choice, how much target progress per match, and what is the maximum time to a chosen upgrade? These numbers need playtesting; research should not invent them.
7. **Loss reward.** Recommendation: equal base progress for a completed loss, with at most a small win bonus. Otherwise the players who most need new options progress slowest.
8. **First roster.** Which four or five upgrades ship, and is Queen deliberately deferred? Every chosen item needs cost, AI-branching, liveness, and sidegrade-role evidence.
9. **Canonical grade.** Use the bundled default 6×6 room, the maximum across all shipped 6×6 rooms, or a dedicated progression board? The global dex and authoring cap need one stable reference.
10. **Recovery level.** Is a downloadable/importable local profile sufficient, or is cross-device account sync required before calling these items “owned”? The latter expands scope into backend, auth, privacy, and parental consent.
11. **Future money boundary.** Cosmetics only (recommended), fixed gameplay expansion packs, or no monetization? Any real-money gameplay answer should trigger separate legal/product research before implementation.

None of these blocks the recommendation itself. Questions 1–5 block a binding PLAN because they change schema and match setup; questions 6–11 can be locked as staged defaults or explicit non-goals.

## 📚 Sources

- Apple, **App Review Guidelines**, §3.1.1: purchased randomized virtual items must disclose odds before purchase; purchased currencies may not expire and restorable purchases need restoration — https://developer.apple.com/app-store/review/guidelines/
- Google Play, **Payments policy**, items 1–7: Play billing requirements and nearby odds disclosure for purchased randomized items — https://support.google.com/googleplay/android-developer/answer/9858738
- Google Play, **Families Policy Requirements**: child-directed apps have additional content, data, SDK, and legal-compliance duties — https://support.google.com/googleplay/android-developer/answer/9893335
- Ministry of Culture, Sports and Tourism (Korea), **Probability-item information disclosure guide announcement** (2024-02-19; regime effective 2024-03-22) — https://www.mcst.go.kr/site/s_notice/press/pressView.jsp?pSeq=20865
- U.S. FTC, **Genshin Impact settlement announcement** (2025-01): allegations and remedies concerning under-16 purchases, odds, layered currencies, rare prizes, and child-directed pressure — https://www.ftc.gov/news-events/news/press-releases/2025/01/genshin-impact-game-developer-will-be-banned-selling-lootboxes-teens-under-16-without-parental
- Supercell, **Candyland Update / Starr Road** (2022): boxes removed, credits toward chosen characters, same-rarity choices, direct gadget/star-power purchase, and deterministic fallback rewards — https://supercell.com/en/games/brawlstars/blog/release-notes/candyland-update-release-notes-2/
- Supercell Support, **Unlocking Brawlers** (current as fetched 2026-08-31): deterministic Starr/Trophy Road choices coexist with random Brawler Boxes that have an explicit guaranteed count — https://support.supercell.com/brawl-stars/en/articles/unlocking-brawlers.html
- Riot Games, **Legends of Runeterra announcement FAQ**: random chest upgrades alongside shards and wildcards that unlock a player-chosen card — https://playruneterra.com/en-us/news/lor-announce-faq
- **Chess Upgraded** (2026): base chess pieces retain their movement and gain constrained move-only bonus abilities; kings/queens have additional earning constraints — https://chess-upgraded.com/chess-upgraded
- Steve Jackson Games, **Knightmare Chess rules**: visible card point costs and a fixed deck budget as chess-power prior art — https://www.sjgames.com/knightmare/kc_rules.pdf
- Nielsen Norman Group, **Children's UX**: age-band-specific needs around feedback, reading, discoverability, and recovery; used here only as a supporting UX constraint, not as acquisition-economy evidence — https://www.nngroup.com/articles/childrens-websites-usability-issues/

**Source limitations.** No public source can determine the correct reward cadence, upgrade roster, or power cap for this game's rules; those are project-specific and require tests/playtesting. `Chess Upgraded` is direct mechanical prior art but not evidence that its exact abilities are balanced in Chess Craft. Platform and Korean policy references are compliance inputs, not legal advice; applicability depends on distribution, payment flow, audience declaration, and jurisdiction. The Brawl Stars sources show acquisition mechanisms, not an endorsement of its changing live-service economy.

## 🔗 Related Internal Docs

- [[RESEARCH-custom-piece-skill-balance]] — established “constrain first, price second” and documented why editor-only limits, scalar-only limits, and random-agent-only balance gates fail.
- [[PLAN-custom-piece-skill-balance]] — introduced per-side loadouts, grade-matched replacement, room budget, and the structural `royal`/`win` bans. Later source comments record ADR-012's change from measured grade to declaration-derived cost.
- [[REVIEW-custom-piece-skill-balance-2026-08-08]] — loadout-card overlap, measurement symmetry, cache context, and absent-state findings relevant to any new acquisition cache or equipment path.
- [[RESEARCH-nonfunctional-polish-benchmark]] — found that nothing survived a match and recommended the dex collection; rejected streak pressure and emphasized progress that a loss can still move.
- [[PLAN-nonfunctional-polish-benchmark]] — made collection state per-device, monotonic, separate from content JSON, and committed once at match end. Ownership should follow the separation pattern but not overload its `seen/used/won` semantics.
- [[RESEARCH-piece-skill-creation-ux]] — live engine-driven preview, child-readable caps, remix-first creation, and the rule that imported JSON bypasses form-only constraints.
- [[SPEC-variant-chess-6x6-cards]] — target audience, deterministic RNG, data-defined pieces, fail-closed loading, and the original non-goals around accounts/online play/balance tuning.
- [[RESEARCH-preset-content-expansion]] — current bundled content and spare-art constraints; a progression roster needs curated art capacity as well as rules.
- `[wiki:architecture] turning-slide` — movement pricing, AI complexity, and endpoint bounds must share the same movement semantics when an upgrade adds turning movement.
- `[wiki:architecture] card-legibility-and-notice-stack` — reward notices must join the existing ordered notice lifetime instead of competing overlays or handler-only events.
