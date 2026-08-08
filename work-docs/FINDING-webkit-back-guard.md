---
type: finding
task_slug: webkit-back-guard
status: open
created: 2026-08-08
found_by: PLAN-piece-info-convenience-ux (ADR-006 added the WebKit e2e project)
severity: potentially-high
tags: [strange-chess, finding, webkit, ios, routing, data-loss]
summary: "WebKit History API: Back left a match without asking, and unknown-path normalization intermittently does not land"
---

# FINDING — routing on WebKit: two symptoms, one subsystem

Both symptoms below are in the app's History API handling and both appeared only
once a WebKit project existed. They are recorded together because they share a
subsystem, and kept apart because **one is deterministic and one is not** —
which changes what each is evidence of.

## Symptom 1 — the back guard did not fire (deterministic)

## What was observed

Adding a `mobile-webkit` Playwright project (ADR-006 of
`PLAN-piece-info-convenience-ux`) turned two previously-unrun tests red:

- `e2e/routing.spec.ts:122` — *Back out of a match › asks first, and cancelling
  keeps both the board and the URL*
- `e2e/routing.spec.ts:149` — *Back out of a match › leaves when the player accepts*

Both fail the same way, at the same assertion:

```
Error: Back left the match without asking
expect(received).toBe(expected)   // confirm.seen() polled to 0, expected 1
```

The guard's `window.confirm` never fired. On Chromium (`mobile-portrait`,
`desktop`) both tests pass.

## Why it may matter more than a red test

`e2e/routing.spec.ts`'s own header states the stakes: `popstate` fires *after*
the browser has already changed the URL, so cancelling has to **undo** a
navigation rather than prevent one, and "if the push-back is missing, the board
stays on screen under a URL that says `/`, and the next reload silently throws
the match away — a failure that looks like nothing at all until someone
reloads."

This product ships as a PWA whose primary device is an iPhone. If the behaviour
reproduces on real iOS Safari rather than only in Playwright's Linux WebKit
build, then the back gesture — the most-used navigation on that device —
discards a match in progress with no prompt.

## What has NOT been established

- Whether real iOS Safari behaves the same as Playwright's WebKit here.
- Whether the cause is the app's `popstate` handler, WebKit's same-document
  traversal timing, or Playwright's dialog interception on WebKit specifically.

Nothing here should be repeated as "iOS loses matches" until one of those is
answered. The claim so far is exactly: *the guard did not fire under WebKit in
this harness.*

## Suggested first steps

1. Reproduce by hand in Playwright's WebKit with the dialog handler logged, to
   separate "no confirm was requested" from "the confirm was not intercepted".
2. If the confirm genuinely is not requested, check whether `popstate` reaches
   the handler at all on WebKit, and whether the push-back runs.
3. Confirm on a real iOS device before deciding severity.

## Symptom 2 — unknown-path normalization intermittently does not land (INTERMITTENT)

`e2e/routing.spec.ts:89` — *URLs › normalizes an unknown path instead of leaving
it in the address bar*:

```
await page.goto('/room/ABC123')
await expect(page.getByTestId('tab-play')).toHaveAttribute('aria-current', 'page')
expect(new URL(page.url()).pathname).toBe('/')
  Expected: "/"   Received: "/room/ABC123"
```

The app renders the correct screen but the address bar keeps the unknown path.

**It is a race, not a hard incompatibility, and the distinction is the finding.**
Measured: 1 failure in 3 repeats at `--workers=1`, and a full clean WebKit run
(116 passed) in which it passed. The screen assertion on the line above it
succeeds, so the app has already routed — what has not happened is the
`replaceState` that rewrites the URL.

The consequence, if it reproduces on iOS: a player who follows a stale or
mistyped link lands on the right screen under a URL that does not describe it,
and a reload or a share sends someone back to the same wrong path. Lower stakes
than symptom 1, same subsystem, and possibly the same root cause — which is the
reason to fix them together rather than separately.

## Current state

Three tests are skipped **on WebKit only** (keyed on `browserName`, not on the
project name, so a second WebKit project inherits the skip rather than going
quietly red), each with a reason naming this document. They continue to run on
both Chromium projects.

The skips are placeholders with an owner. Removing them without resolving this
finding deletes the only record that iOS may be unguarded — and, for symptom 2,
the only record that the failure is intermittent rather than absent.
