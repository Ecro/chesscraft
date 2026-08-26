/**
 * What this device has met, used, and won with (ADR-006).
 *
 * Its own key, deliberately, and the reason is written out in
 * `src/editor/hidden.ts`: `importContent` rebuilds `ContentSource` field by
 * field, so an unknown top-level field is silently dropped on the very next
 * read. A collection stored on the document would survive exactly one save.
 * The second reason `hidden.ts` gives applies just as much — a document handed
 * to another child should not carry this device's history of play.
 *
 * There is no legacy `strange-chess.collection.v1` twin. Unlike the four keys
 * that predate the rename there was never an older name for this one, and
 * reading a key that has never existed would be a comment claiming a safeguard
 * nobody built.
 *
 * Failure direction, everywhere: absent, corrupt, wrong shape, denied — all
 * resolve to an empty collection, and no write ever throws. That direction is
 * the safe one. The cost of a lost read is a shelf the child re-fills by
 * playing; the cost of the other direction is erasing play that already
 * happened, which nothing can recover.
 */

import { STORED_TIERS, type Observation, type StoredTier, type Tier, rankOf } from './tiers'

export { rankOf, type Observation, type Tier }

export const COLLECTION_KEY = 'chess-craft.collection.v1'

/**
 * The stored shape. One id set per stored rung; `unencountered` is membership
 * in none of them.
 *
 * An id may appear in several sets at once and that is not a contradiction —
 * `tierOf` reads the HIGHEST rung an id appears in, so the sets are a record of
 * what happened rather than a partition.
 */
export interface Collection {
  readonly seen: ReadonlySet<string>
  readonly used: ReadonlySet<string>
  readonly won: ReadonlySet<string>
}

export function emptyCollection(): Collection {
  return { seen: new Set(), used: new Set(), won: new Set() }
}

/**
 * The rung an id has reached, or `unencountered`.
 *
 * Highest-wins rather than first-match. A payload that lists an id under `won`
 * but not under `seen` is not corrupt — it is a hand edit, an older writer, or
 * simply a match in which the card was awarded and immediately decisive — and
 * reading it as `unencountered` would silently demote it, which is the one
 * thing AC-005 forbids.
 */
export function tierOf(collection: Collection, id: string): Tier {
  let best: Tier = 'unencountered'
  for (const tier of STORED_TIERS) {
    if (collection[tier].has(id) && rankOf(tier) > rankOf(best)) best = tier
  }
  return best
}

/**
 * Fold one match's observation into the stored collection.
 *
 * Union per rung, which is what makes AC-005 structural rather than checked: a
 * set union cannot remove a member, and `tierOf` takes the highest rung, so no
 * sequence of merges can lower an entry. There is deliberately no code path
 * that removes an id — the absence of a remover is the guarantee.
 */
export function mergeUp(base: Collection, observation: Observation): Collection {
  const fold = (tier: StoredTier): ReadonlySet<string> => {
    const next = new Set(base[tier])
    for (const id of observation[tier]) next.add(id)
    return next
  }
  return { seen: fold('seen'), used: fold('used'), won: fold('won') }
}

/** Ids that reached a rung they had not reached before — what a match ADDED. */
export function newlyReached(before: Collection, after: Collection): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const tier of STORED_TIERS) {
    for (const id of after[tier]) {
      if (rankOf(tierOf(after, id)) > rankOf(tierOf(before, id))) ids.add(id)
    }
  }
  return ids
}

/**
 * The longest id worth keeping, and the most ids worth keeping.
 *
 * Content ids are `<kind>.<slug>` and the shipped set has four kinds totalling
 * 90 records, so these are two orders of magnitude of headroom for a child who
 * authors relentlessly — and a hard stop for a payload nobody's play produced.
 *
 * The bound exists because the read path is not the write path. `observe` can
 * only ever emit ids that appear in a match, but `loadCollection` reads whatever
 * is under the key: a hand-edited value, or one that arrived with a friend's
 * pasted document. Without a cap, one such payload makes the fold-and-write at
 * the end of every match — synchronous, on the main thread, at the exact moment
 * the result screen should appear — proportional to it.
 */
const MAX_ID_LENGTH = 128
const MAX_IDS_PER_TIER = 10_000

/** A string id worth storing. Empty is not one; nor is anything non-string. */
function readIds(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set()
  // Filtered rather than rejected wholesale, the same choice `loadHidden` makes:
  // a list with one bad entry reads as a version skew far more often than as a
  // corrupt file, and discarding the good entries would erase real play. The
  // caps are part of that filter rather than a reason to reject: an over-long id
  // is one bad entry, and a list past the cap keeps the entries it can.
  const ids = new Set<string>()
  for (const id of value) {
    if (typeof id !== 'string' || id === '' || id.length > MAX_ID_LENGTH) continue
    ids.add(id)
    if (ids.size >= MAX_IDS_PER_TIER) break
  }
  return ids
}

/**
 * The stored collection, or an empty one when there isn't a usable answer.
 *
 * Reads only. A load that wrote a default would turn the first render of 도감
 * into a save, stamping an empty collection over whatever was there — and every
 * install alive today is in the absent case.
 */
export function loadCollection(storage: Storage): Collection {
  let raw: string | null
  try {
    raw = storage.getItem(COLLECTION_KEY)
  } catch {
    return emptyCollection()
  }
  if (raw === null) return emptyCollection()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyCollection()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyCollection()

  const source = parsed as Partial<Record<StoredTier, unknown>>
  return { seen: readIds(source.seen), used: readIds(source.used), won: readIds(source.won) }
}

/**
 * Replace the stored collection. Never throws.
 *
 * Sorted, so two equal collections serialise to one string and a match that
 * discovered nothing does not churn the key.
 *
 * Silent on failure for the same reason `saveHidden` is: by the time this runs
 * the match is already over and the result screen is already rendering, and a
 * browser that denies storage would otherwise turn the end of a game into a
 * crash. The cost of a lost write is one match's discoveries.
 */
export function saveCollection(storage: Storage, collection: Collection): void {
  try {
    storage.setItem(
      COLLECTION_KEY,
      JSON.stringify({
        seen: [...collection.seen].sort(),
        used: [...collection.used].sort(),
        won: [...collection.won].sort(),
      }),
    )
  } catch {
    // Intentionally silent — see above.
  }
}
