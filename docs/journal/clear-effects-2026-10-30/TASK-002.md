# Effects TASK-002 — Visual effects checkbox in Settings

## Intended outcome and identity

- Task: requirements task TASK-002 (REQ-001), GitHub issue #603, completion owner for JOURNEY-001.
- Workspace branch: `agent-runner/task-002-a2-d40e6763`, attempt 2 of 2, on base `26885c9`
  (TASK-001 merged, #612).
- Outcome: one design-system `Checkbox` labelled "Visual effects" in the Settings Appearance card.
  It is checked when on and checked when nothing is stored. It is device-local through TASK-001's
  `setVisualEffects`/`useVisualEffects`, with no account write and no save status.

## Changes (local only; nothing pushed, no PR)

- `src/app/Settings.tsx`: `AppearanceSection` reads `effectsEnabled` from `useVisualEffects()` and
  renders `<Checkbox label="Visual effects">` under the Skin picker. Its `onChange` calls
  `setVisualEffects(!effectsEnabled)`. Loading, error, retry and the other cards are unchanged.
  No Reduce motion control and no tuning knobs.
- `src/app/visual-effects-settings.test.tsx` (new, 11 tests, `renderApp` on `/settings`):
  - checked with nothing stored; an unknown stored value falls back to checked; a stored off shows
    unchecked;
  - pointer and keyboard (Tab to reach, Space to operate) uncheck, then re-check, each followed by a
    remount reload;
  - it is the native input inside `.clr-check` in the Appearance region and card, and exposes its
    checked state;
  - toggling makes zero `preferenceWrites` and shows no alert, status or save text;
  - there are no other effect controls;
  - after a profile load failure, the error view and retry are shown, and the checkbox appears once
    the retry succeeds.

## Findings and corrections

- Attempt 1's `npm test` failure has the same cause as TASK-001's. `src/test/design-0143-final-audit.test.ts`
  binds the Format Preview AFTER evidence records and `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` to
  the hash of all runtime `src`. Any product change to `Settings.tsx` therefore makes these two
  cases fail until someone runs a new genuine authenticated capture
  (`CLEAR_TASK034_RECORD_AFTER=1 npx playwright test e2e/design-0143/format-preview.spec.ts --project=mobile`
  on a frozen commit, using the disposable account fixture and private env). The capture also needs
  source-lineage provenance and an audit rebind. In TASK-001 that was an owner-authorized evidence
  recovery. This attempt cannot do it: only the listed commands are permitted, the capture writes to
  a backend account, and making up records or hashes would be false evidence. Validators and
  assertions were left alone.
- `/settings` profile failure: the route guard renders its own error, "Your account didn’t load"
  with "Try again", before Settings' own error view and "Retry" can appear. The recovery test
  follows the real route and accepts either label.

## Verification (on this tree, uncommitted)

- `npx vitest run src/app/visual-effects-settings.test.tsx`: 1 file, 11/11 passed.
- `npx vitest run src/app/Settings.test.tsx`: 1 file, 53/53 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 (0 errors, 149 warnings, none in the changed files).
- `npm run lint:ds`: exit 0.
- `npm run build`: built successfully.
- `npm test`: **exit 1**. Only `src/test/design-0143-final-audit.test.ts` was reported failing, with
  2 of 38 cases:
  - "requires the complete actual eight-cell mobile group…" failed with `stale or missing
    source/package/origin identity`;
  - "is bound to the package and runtime source of this tree…" failed because the audit does not
    name the runtime hash `47b14b8dcd3528283e9162a46263c35f3ff96ea2e4c83ad101cc03250a9f7869`.

## Unresolved and next safe action

- Assumes TASK-001's key `clear.visual-effects` with `on`/`off`, and that the guard's error view
  counts as the "existing error view with Retry" in JOURNEY-001.
- Next action needs the owner: authorize the Format Preview evidence recovery for this tree, or
  scope or retire the 0.14.3 runtime-hash binding for this body. Then rerun `npm test`.


## Owner-authorized source-evidence upkeep — 31 October 2026

Both configured attempts reached the same two source-bound audit failures; current attempt2 stopped at native project `npm test` with `verification-failed` after successful focused checks. The preserved Settings implementation and its tests are unchanged. This repeats the genuine recapture and existing source-owner bookkeeping pattern already reviewed for this body; no product criteria, assertions, helper, policy, profile, attempts or protected path changes are added.

Actual native identity: Task002 revision `477c2ea9f34d52fb76ec3643154963f574f8c50dc2a54c2d0152e441ecabd33b:TASK-002`, run `d40e6763-2c26-496e-b6d2-c61dfb99d158`, a2, base `26885c920f10b9c79c358b34789deab7d68bdb8c`, retained branch `agent-runner/task-002-a2-d40e6763`. The new group will be `docs/design/evidence-0143/task034-format-preview-effects-603-a2`; prior groups and audit contents remain unchanged.

Preserved candidate SHA-256 values:

- `src/app/Settings.tsx`: `692e5717b6fd3a901a9a8e9e882b22903a98a9aff4067eed093bc0b535c54d40`
- `src/app/visual-effects-settings.test.tsx`: `4bca33f8829aacb083db113d679c28cc6225a41243e31eb3fac244e6d791cc16`

The existing authenticated collector will use a fresh owned loopback source server on a separate port, with browser-safe configuration only in that server and private test credentials confined to the collector. Existing disposable setup/cleanup is separate from zero preview writes/generation. Capture, local source-continuity rehearsal and native recovery/receipt, CI and build-branch delivery are pending. No extra model attempt is requested.
