# Evidence — the desktop assertions can fail

Phase 5 of [[PLAN-web-server-deployment]] requires a one-time check that the new desktop
assertions are not vacuous, with the failing run recorded rather than self-reported. The
PLAN's R5b records why this is a one-time check and not a CI job, and what that leaves
open.

**Why it was required.** The assertions this phase replaced could not fail. `at desktop
(1440x900) › uses the width instead of leaving a phone column in the middle` asserted
`mainWidth > 700`, and `main` is `width: 100%` unconditionally — true at 1440px whatever
the layout did, including the phone column the test was written to forbid. Adding new
assertions without proving they can fail would have reproduced exactly that.

## Method

1. Delete the `import '@ui/desktop.css'` line from `src/main.tsx` — the whole desktop layer,
   removed at one point (ADR-008 is what makes this a single line).
2. Run the desktop assertions.
3. Restore the import and confirm green again.

## Result — 2 failed, 2 passed, and the split is the point

```
✘  [desktop] e2e/layout.spec.ts:396:5 › at the desktop boundary › at it (1280x900)
                                      › has become the desktop shell
✘  [desktop] e2e/layout.spec.ts:269:3 › at desktop (1440x900)
                                      › gives the shell the width, with no frame around it

✓  [desktop] e2e/layout.spec.ts:384:5 › at the desktop boundary › one pixel below it (1279x900)
                                      › is still the phone in its frame
✓  [desktop] e2e/layout.spec.ts:408:5 › at the desktop boundary › on a landscape phone (915x412)
                                      › stays a phone, because the desktop band has a height floor

2 failed
2 passed
```

Unit, same removal:

```
❯ tests/ui/shell-layout.test.ts (9 tests | 1 failed)
  × loads after the base sheet, so its rules win ties
Tests  1 failed | 8 passed (9)
```

**Both directions are covered, and only the desktop side moved.** The two failures are the
assertions that claim the desktop shell exists; the two passes are the assertions that
claim the phone layout still holds below the boundary and on a landscape handset, which
are true with or without the layer and *should* be. A one-sided test suite would have
shown four failures and told us less: it is the pair that pins the media query's bounds
rather than its contents, so a layer applied at every width — which would hand a phone the
desktop shell — fails just as loudly as a layer applied at none.

After restoring the import: `tests/ui/shell-layout.test.ts` 9 passed,
`e2e/layout.spec.ts` 30 passed / 2 skipped.

## What this does not cover

Nothing re-runs this. If a later change makes these assertions vacuous again — the way the
ones they replaced became vacuous when the Chess Craft redesign removed the two-column play
layout out from under them — no gate catches it. That is recorded as accepted risk **R5b**
in the PLAN, not as a mitigated one. The standing defence is the two-sided design above,
which is structural rather than procedural; the standing gap is that nothing enforces it
stays that way.
