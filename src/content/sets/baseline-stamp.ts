/**
 * The bundled ids as of commit 1297fbc — the release before `ffbaf31` shipped
 * three more rooms (PLAN-bundled-content-merge, backlog delivery).
 *
 * This is the SYNTHESISED STAMP for an install that has saved and has no stamp
 * of its own — which, on the day the merge shipped, was every install in
 * existence. Synthesising from the CURRENT bundle (the first version) was
 * correct and useless: it made every bundled record "already known", so the
 * thirty records added between this baseline and now stayed invisible on
 * exactly the devices that reported them missing. Pinning the stamp to an
 * older, real release delivers that backlog once, and then never again —
 * the first accepted save writes a real stamp and this list is never consulted
 * on that device again.
 *
 * **It is a snapshot of a past release, so it is FROZEN.** Do not add ids to it
 * when the bundle gains records — that is precisely what would re-hide them.
 * The only reason to touch this file is to move the baseline FORWARD after a
 * backlog has been delivered, and moving it forward is a decision about
 * resurrecting deletions, not a maintenance chore.
 *
 * **The cost, stated because it is real.** An install created AFTER this
 * baseline that deleted one of the thirty records below-the-line gets it back,
 * once: with no stamp, the merge cannot tell "deleted by the author" from
 * "never delivered". Installs that only ever deleted records present in this
 * list are unaffected — those stay deleted, which is the common case, because
 * a record an install never received is not one it can have deleted.
 *
 * Extracted from `git show 1297fbc:src/content/sets/bundled.ts`, not typed by
 * hand; `tests/content/baseline-stamp.test.ts` re-derives the invariants.
 */
export const BASELINE_STAMP_IDS: readonly string[] = [
  // piece
  'piece.king',
  'piece.queen',
  'piece.rook',
  'piece.knight',
  'piece.pawn',
  'piece.archer',
  // square
  'square.bomb',
  'square.portal',
  'square.shrine',
  'square.sanctuary',
  'square.mire',
  // rule
  'rule.king-of-the-hill',
  'rule.three-check',
  'rule.sudden-death',
  'rule.fast-promotion',
  'rule.royal-bodyguard',
  'rule.last-stand',
  'rule.conscription',
  'rule.blood-toll',
  'rule.blitz',
  'rule.knights-honour',
  'rule.duel',
  // skill
  'skill.teleport',
  'skill.swap',
  'skill.revive',
  'skill.freeze',
  'skill.snare',
  'skill.coronation',
  'skill.knight-leap',
  'skill.charge',
  'skill.bulwark',
  'skill.shackle',
  'skill.recall',
  'skill.shove',
  'skill.recruit',
  'skill.volley',
  'skill.sacrifice',
  // board
  'board.los-alamos',
  // preset
  'preset.default',
]
