/**
 * Domain-separated deterministic randomness (ADR-014).
 *
 * "All randomness derives from one match seed" is necessary but not sufficient.
 * With a single mutable stream the self-play agent's draws would advance the
 * same stream the draft offers consume, so a different action history would
 * silently change the second offer — making offers depend on board position and
 * breaking AC-006's no-bias clause and AC-004's replay guarantee.
 *
 * Instead every consumer derives its own keyed substream from (seed, domain).
 * There is no module-level global PRNG anywhere.
 */

/** FNV-1a over the domain key, folded into the seed. */
function deriveSeed(seed: number, domain: readonly (string | number)[]): number {
  let h = 0x811c9dc5 ^ (seed >>> 0)
  for (const part of domain) {
    const s = String(part)
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    h ^= 0x2f // separator so ['ab','c'] and ['a','bc'] differ
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 — small, fast, and stable across engines. */
export function rngFor(seed: number, ...domain: readonly (string | number)[]): () => number {
  let a = deriveSeed(seed, domain)
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic sample of `n` distinct items, preserving no input order. */
export function pickDistinct<T>(rng: () => number, items: readonly T[], n: number): T[] {
  const pool = [...items]
  const out: T[] = []
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rng() * pool.length)
    out.push(pool.splice(i, 1)[0]!)
  }
  return out
}
