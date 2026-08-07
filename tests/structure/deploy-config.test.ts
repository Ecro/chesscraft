import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The three decisions in `wrangler.jsonc` that the rest of the deploy depends on.
 *
 * Not a schema check — wrangler validates its own syntax, and `wrangler deploy --dry-run`
 * is where a malformed file fails. What is asserted here is the small set of choices that
 * are *valid configuration* either way and wrong for this project one of those ways, so
 * nothing downstream would complain:
 *
 * 1. **SPA fallback.** Without `not_found_handling: "single-page-application"` every path
 *    except `/` returns 404 from the edge. The app would still work when opened at the
 *    root, so a smoke test that loads the homepage passes — and every link anyone shares
 *    is dead. This is the whole reason History-API routing (ADR-003) went in before the
 *    first room link rather than with it.
 * 2. **No `main`.** An assets-only Worker means every response is an asset response, which
 *    is what makes `public/_headers` govern the entire origin. Cloudflare does not apply
 *    `_headers` to responses a Worker script generates, so adding `main` silently narrows
 *    the cache policy asserted in `tests/build/deploy-headers.test.ts` to whatever the
 *    script does not handle — and that test would keep passing, because the file it reads
 *    is unchanged. When a Worker script is genuinely added (the Durable Object room layer
 *    is the expected reason), this assertion is the prompt to move the headers into code.
 * 3. **Assets directory.** Pointing at anything but the Vite output ships an empty site.
 */

const ROOT = process.cwd()

/**
 * Read `wrangler.jsonc` as JSON.
 *
 * The comment stripper is deliberate rather than lazy. `wrangler.json` would need no
 * stripping, but this repo's convention is that a decision and the reason for it live in
 * the same file, and a deploy config with no room for prose is where that convention would
 * quietly end. Stripping has to respect string literals — a naive `replace(/\/\/.*$/gm)`
 * would eat the `//` in a URL and produce a parse error that reads as a config typo.
 */
function config(): Record<string, unknown> {
  const file = join(ROOT, 'wrangler.jsonc')
  expect(existsSync(file), 'wrangler.jsonc is missing — the project has no deploy configuration').toBe(true)

  const text = readFileSync(file, 'utf8')
  let out = ''
  let inString = false
  let escaped = false
  let comment: 'line' | 'block' | null = null

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    const next = text[i + 1]

    if (comment === 'line') {
      if (ch === '\n') { comment = null; out += ch }
      continue
    }
    if (comment === 'block') {
      if (ch === '*' && next === '/') { comment = null; i += 1 }
      continue
    }
    if (inString) {
      out += ch
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; out += ch; continue }
    if (ch === '/' && next === '/') { comment = 'line'; i += 1; continue }
    if (ch === '/' && next === '*') { comment = 'block'; i += 1; continue }
    out += ch
  }

  return JSON.parse(out) as Record<string, unknown>
}

describe('wrangler deploy configuration', () => {
  it('serves index.html for unmatched paths, so a shared link to any route resolves', () => {
    const assets = config().assets as Record<string, unknown> | undefined

    expect(assets, 'wrangler.jsonc declares no `assets` block').toBeTruthy()
    expect(
      assets!.not_found_handling,
      'without single-page-application handling every path but / is a 404 at the edge',
    ).toBe('single-page-application')
  })

  it('points at the Vite output directory', () => {
    const assets = config().assets as Record<string, unknown> | undefined
    expect(assets!.directory).toBe('./dist/')
  })

  it('declares no Worker script, so _headers governs every response', () => {
    /*
     * See (2) in this file's header. When this assertion is deliberately broken — because
     * the room layer needs a script — the cache policy must move into that script's
     * responses, and `tests/build/deploy-headers.test.ts` needs a counterpart that reads
     * them. Changing this line alone leaves the policy asserted and unapplied.
     */
    expect(
      config().main,
      'wrangler.jsonc declares `main`; _headers does not apply to Worker-generated responses',
    ).toBeUndefined()
  })

  it('pins a compatibility date, so a platform change cannot alter runtime behaviour silently', () => {
    expect(config().compatibility_date, 'wrangler.jsonc has no compatibility_date').toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
