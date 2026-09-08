---
type: research
task_slug: upgrade-discovery-fun
status: complete
created: 2026-09-08
tags: [chess-craft, research, progression, children, play]
mtime_warn_days: 7
libs_fetched: []
sources: [https://www.unicef.org/childrightsandbusiness/workstreams/responsible-technology/online-gaming/ritec-design-toolbox, https://www.unicef.org/innocenti/projects/responsible-innovation-technology-children]
related_docs: ["[[PLAN-piece-upgrade-acquisition]]", "[[REVIEW-piece-upgrade-acquisition-2026-09-03]]"]
summary: "Make earned upgrades understandable, collectible, and freely explorable before spending"
---

## 🎯 Recommended Direction

Ship an illustrated choice experience, honest 3/5-Spark progress, an ownership album, and a free engine-backed one-move discovery activity. Preserve the existing free economy and power balance. The primary impact is player-facing comprehension, agency, and competence, not increased session length.

Current strengths, verified in code: loss/draw reward parity; no duplicate offers; one-of-up-to-three choice; direct five-Spark forging; one-square strategic equipment; shared hot-seat ownership; persistent pending choices; honest failure handling. Current weaknesses: candidate buttons show only names (`UpgradeReward`); acquisition has no success feedback; a disabled button does not explain remaining progress or direct-forge alternatives; families are buried in base-piece sheets (`Rules`); a four-item complete collection leaves a dead button; descriptions cannot be tried before spending.

Design inference for elementary-age players: large illustrations, short instructions, concrete progress and a repeatable no-penalty move experiment should reduce reading and uncertainty. Design inference for middle-school players: comparing the exact new move, choosing a preferred style, saving for a specified item, and seeing all four variants should strengthen intentional strategy. These are not measured age-specific enjoyment claims. RITEC chiefly studied ages 8–12; extension to younger children and ages 13–15 needs playtesting.

## 🔍 Refinement Decisions

Discovery lens: user-workflow/product opportunity first, then code architecture and child-centered design evidence. User explicitly delegates recommendations, implementation, review, commit and push without questions.

| Local capability | Existing player artifact | Opportunity |
|---|---|---|
| Immutable catalog + art registry | Candidate offer | Illustrated cards with the actual ability before a separate explicit choice |
| Validated Sparks + ownership | Device collection | Two transparent saving paths and a four-slot album |
| Engine legal actions | Board interaction | Free short discovery activity without progression writes |
| Shared sheet + keyboard handling | Piece detail | Reuse a familiar accessible entry point for both owned and unowned upgrades |

## 🛠️ Approaches Found

| Approach | Assumption | Evidence | Trade-off | Compatibility | Risk |
|---|---|---|---|---|---|---|
| Explain, compare, collect, experiment (recommended) | Understanding and early agency are the immediate gaps | Local UI audit; RITEC autonomy/competence | Small activity and new UI, not additional content volume | Existing engine, catalog, storage | Low-medium |
| More rarities, duplicate levels and faster rewards | Volume drives sustained fun | No project playtest supports this | More balance and grinding; competes with fair strategy | Requires economy redesign | High |
| Daily quests and streak prizes | Return frequency is the goal | Not the user's stated outcome | Timers and lost-progress pressure | New persistent schedule model | Medium-high |

## ⚠️ Pitfalls

UNICEF's toolbox emphasizes autonomy, competence and emotions among eight well-being dimensions; its associated research cautions that effects differ between children. Do not present a design framework as proof this game is fun, or equate more play time with success. Avoid time pressure, near misses, fake rarity, mandatory repeated taps, extra spending to practice, and celebrating unsuccessful saves. Reuse the engine rather than teaching a second movement rule. Pending offers must remain recoverable after leaving. Full collection must offer free exploration instead of more acquisition pressure.

## ❓ Open Questions

None blocking: user delegates choices. Follow-up human playtest, not a release gate: with appropriate adult consent, observe 8–11 and 12–15 groups separately finding the 3/5 choice, explaining one added move, completing an experiment, and equipping a chosen piece. Ask which option they preferred and where they felt confused; do not claim results without conducting it.

## 📚 Sources

- [UNICEF RITEC Design Toolbox](https://www.unicef.org/childrightsandbusiness/workstreams/responsible-technology/online-gaming/ritec-design-toolbox): child-informed design dimensions and guidance; 787 participants, primarily 8–12, across 18 countries.
- [UNICEF Innocenti RITEC research](https://www.unicef.org/innocenti/projects/responsible-innovation-technology-children): choice, mastery, achievement and differing responses between children.

## 🔗 Related Internal Docs

- [[PLAN-piece-upgrade-acquisition]]
- [[REVIEW-piece-upgrade-acquisition-2026-09-03]]
- `[wiki:architecture] piece-upgrade-acquisition`: durable-write and single-equipment invariants.
- `[fail:test] random-full-match-e2e`: use deterministic short browser scenarios.
- `[fail:test] fixture-invalid-so-fallback-satisfies`: validate seeded profiles.
