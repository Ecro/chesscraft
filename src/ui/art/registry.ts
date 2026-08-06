import type { ArtEntry } from './resolve'
import squareBomb from './square-bomb.webp'

/**
 * The art catalogue: art id -> the asset(s) the bundle ships for it.
 *
 * Two rules, both load-bearing.
 *
 * **Assets are imported, never referenced by path** (ADR-009). `public/` is
 * copied outside the Rollup bundle, so the generated service worker's asset
 * list never contains anything from it and every such file has to be
 * enumerated by hand in `vite-plugin-sw.ts` — which its own comment records
 * going stale once already, when the maskable icon was missed. An import makes
 * Vite emit the file with a hashed name INTO the bundle, so the worker
 * precaches it for free and the installed offline app cannot ship art that
 * renders in dev and vanishes on a phone. The consequence to respect: this map
 * must stay a static literal. A template-string path builder would compile and
 * then resolve, at runtime, to a file the bundler was never told to emit.
 *
 * **The UI owns art ids; content owns which one it wants.** ADR-011 forbids the
 * UI from naming a piece, card or square type, and an art id is the UI's own
 * vocabulary: a record points at an entry here, nothing here points back at a
 * record. So an art id names the PICTURE and must never echo a content id: ONE
 * segment after `art.`, the thing depicted, never the `<kind>.<slug>` form the
 * record itself uses.
 *
 * The obvious mistake is to mirror the content id under an `art.` prefix. It
 * looks harmless and is not — the mirrored id then CONTAINS the content id, so
 * `no-content-in-engine.test.ts`, which substring-scans this whole file, reads
 * the catalogue as naming that record. It is right to do so, and it caught
 * exactly that here on the first pass. That scan does not distinguish code from
 * prose, so this comment cannot spell the bad ids out either — which is itself
 * the second thing it caught. `art-key.test.ts` generalises the rule to every
 * entry, which is what will matter when the batch of 43 lands.
 *
 * Mostly empty on purpose. The illustrated batch (ADR-002/ADR-004) is a later
 * phase; the single entry below exists to prove the pipeline end to end
 * (ADR-010), because a contract whose only exercised path is the absent case is
 * the black hole the absent-case rule warns about.
 */
export const artRegistry: ReadonlyMap<string, ArtEntry> = new Map<string, ArtEntry>([
  ['art.bomb', { kind: 'neutral', src: squareBomb }],
])
