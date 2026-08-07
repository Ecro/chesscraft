import type { CachedGrade, GradeCache } from './cache'

/**
 * The grades of the bundled content, measured once and shipped (ADR-007, refined).
 *
 * These are constants, not claims. The bundled records never change between
 * installs, so re-deriving them on every device is 24,000 self-play matches
 * spent to rediscover a number that was already known — about a minute of "세는
 * 중…" on the one screen where a player most wants an answer.
 *
 * **Why this does not reopen what ADR-007 closed.** That decision keeps grades
 * out of the content DOCUMENT, because a document is importable and an imported
 * one can claim whatever grade suits it. This table is neither: it is source,
 * it is keyed by the same content hash `keyForRecord` computes, and
 * `tests/balance/shipped-grades.test.ts` RE-MEASURES every entry and fails when
 * one drifts. The distinction from `cost` — the field this whole feature
 * replaced — is exactly that: `cost` was a number nobody verified, and every
 * number here is verified by the same rig that produced it.
 *
 * Self-invalidating by construction. The key hashes the record, the room, its
 * board, both reference records, the seed count and `MEASUREMENT_REVISION`, so
 * editing any of them yields a key this table does not contain and the record
 * falls through to a real measurement. There is no path where a stale entry is
 * served as current.
 *
 * Regenerate by running the balance suite and copying what the test reports;
 * never hand-edit a delta.
 */
export const SHIPPED_GRADES: Readonly<Record<string, CachedGrade>> = {
  '9af6cabb-dd1': { contentId: 'piece.archer', delta: 20.083333333333332, stderr: 2.5627874152824868, n: 600, everChanged: true },
  '809885a7-d0d': { contentId: 'piece.knight', delta: 4.583333333333333, stderr: 2.728125850248662, n: 600, everChanged: true },
  'f6fa58bc-d56': { contentId: 'piece.pawn', delta: 0, stderr: 0, n: 600, everChanged: false },
  '37ae058c-d08': { contentId: 'piece.queen', delta: 8.5, stderr: 2.6011266340332484, n: 600, everChanged: true },
  'dc4da6a2-ce8': { contentId: 'piece.rook', delta: 2.3333333333333335, stderr: 2.56074412993173, n: 600, everChanged: true },
  '1ce92e8b-d48': { contentId: 'skill.bulwark', delta: -0.8333333333333334, stderr: 1.0675349484951646, n: 600, everChanged: true },
  'c661644a-dc8': { contentId: 'skill.charge', delta: -0.25, stderr: 1.018010460515219, n: 600, everChanged: true },
  'ee0df51a-d71': { contentId: 'skill.coronation', delta: -1.8333333333333333, stderr: 1.0523092942082415, n: 600, everChanged: true },
  '25f35171-d3d': { contentId: 'skill.freeze', delta: -0.75, stderr: 0.9540974227207063, n: 600, everChanged: true },
  '7bf21749-db9': { contentId: 'skill.knight-leap', delta: -2.083333333333333, stderr: 1.1312033980702194, n: 600, everChanged: true },
  '85c0d3d0-d5b': { contentId: 'skill.recall', delta: 1.25, stderr: 1.1575434285990935, n: 600, everChanged: true },
  '2defbf35-d59': { contentId: 'skill.recruit', delta: 1.5, stderr: 0.9849309809749957, n: 600, everChanged: true },
  '6cf6f618-d68': { contentId: 'skill.revive', delta: 0.33333333333333337, stderr: 1.0145482275883992, n: 600, everChanged: true },
  'c9a7572b-d7d': { contentId: 'skill.sacrifice', delta: 0.8333333333333334, stderr: 1.1551622941397692, n: 600, everChanged: true },
  '1bc34d8d-d48': { contentId: 'skill.shackle', delta: -1.3333333333333335, stderr: 1.0062870441801108, n: 600, everChanged: true },
  '15c0ab9f-d68': { contentId: 'skill.shove', delta: -0.5833333333333334, stderr: 1.096734457397357, n: 600, everChanged: true },
  '528b5ff5-d3b': { contentId: 'skill.snare', delta: -1.1666666666666667, stderr: 0.9714673646913502, n: 600, everChanged: true },
  '80fadbc1-d4c': { contentId: 'skill.swap', delta: -0.25, stderr: 0.8706915550782476, n: 600, everChanged: true },
  'bc48042d-d5c': { contentId: 'skill.teleport', delta: 0, stderr: 0, n: 600, everChanged: false },
  '78ee4417-d36': { contentId: 'skill.volley', delta: 2.75, stderr: 1.0588715499892984, n: 600, everChanged: true },
}

/**
 * The shipped table under a writable cache.
 *
 * Reads fall through to the shipped constants, writes never reach them — a
 * measurement performed on this device belongs to this device, and a shipped
 * value is not something a running app gets to revise. A record the table does
 * not know is measured and stored in the writable layer as before.
 */
export function withShippedGrades(writable: GradeCache): GradeCache {
  return {
    read: (key) => writable.read(key) ?? SHIPPED_GRADES[key],
    write: (key, grade) => writable.write(key, grade),
  }
}
