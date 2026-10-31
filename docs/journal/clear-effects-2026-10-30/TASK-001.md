# clear-effects-2026-10-30 · TASK-001 — shared Visual effects comfort policy

Task-owned progress record. Under the owner-selected policy this record satisfies the
repository's shared daily-journal requirement for this body; TASK-008 consolidates.

## Identity

- Body: `clear-effects-2026-10-30`, task `TASK-001`, issue #602, REQ-002 and REQ-010.
- Branch: `agent-runner/task-001-a2-54169bd8` (attempt 2 of 2). Nothing pushed, no PR opened.
- Baseline, revalidated before work: `65522e9` (merge of PR #599 `codex/library-motion-lab`).
  That is neither the supplied `ca09595` snapshot nor released `main`. The `codex/library-motion-lab`
  ref is at `d4ac627`, an ancestor of this baseline. The repository default branch is
  `codex/docs-design-system-reading-path`.

## Intended outcome

One shared module resolves the effective policy (effects enabled, motion allowed) from the stored
Visual effects choice (default on, unknown values ignored), the live OS `prefers-reduced-motion`
query and document visibility. A root provider and one `aria-hidden` decorative host are added
to `ContainedShell`. The atmosphere, Settings UI and effect rendering are unchanged, and so is
the 0.14.3 import.

## Changes

- `src/state/visual-effects.ts` (new): `localStorage['clear.visual-effects']` set to `on`/`off`,
  following the `clear.skin` convention. Includes the pure `resolveVisualEffectsPolicy`, where off
  always wins and motion needs effects on, no reduced-motion preference and a visible tab. It
  also has `setVisualEffects`, the live store (media `change`, `visibilitychange`, cross-tab
  `storage`), `VisualEffectsProvider` and `useVisualEffects`.
- `src/app/RootLayout.tsx`: `ContainedShell` wraps in `VisualEffectsProvider` and renders one empty
  `.clr-effects-host` (`aria-hidden`, `data-effects`, `data-motion`) between the atmosphere and the
  shell. Routes, boot and the crash fallback all get it.
- `src/styles/shell.css`: `.clr-effects-host` is fixed, inset 0 and takes no pointer events.
- Tests: `src/state/visual-effects.test.ts` (new, 25 tests) and a new block in
  `src/app/atmosphere.test.tsx` (7 tests).

## Failures and corrections

- First draft kept a page-only `sessionChoice` override and a `persist` option. These were
  speculative and leaked module state between tests, so they were removed and storage is the
  only source of the choice.
- **Unresolved:** `npm test` fails 2 of 5941 tests, both in
  `src/test/design-0143-final-audit.test.ts`. They pin a SHA-256 of every runtime file under
  `src/` (excluding the vendor, test and dev trees) to committed Format Preview browser captures
  and to `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md`. Any runtime change fails them until the
  authenticated collector re-captures eight PNGs from a committed clean tree, using a disposable
  Supabase account with intercepted OTP, and the audit is rebound. This task must add runtime
  source, so the failure cannot be avoided inside its scope. This is very likely also why
  attempt 1 failed controller verification. No `.env` exists in this workspace, and the capture
  writes to an external service, so it was not run. The audit hash was not edited by hand,
  because that would claim evidence that was never captured.

## Verification (this tree)

- `npx vitest run src/state/visual-effects.test.ts`: 1 file, 25 passed.
- `npx vitest run src/app/atmosphere.test.tsx`: 1 file, 51 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0. Warnings are pre-existing, none in the changed files.
- `npm run lint:ds`: exit 0.
- `npm run build`: built successfully.
- `npm test`: **failed**, 240 of 241 files and 5939 of 5941 tests passed. The 2 failures are the
  audit runtime-hash bindings described above.

## Assumptions and next action

- Assumed key `clear.visual-effects` with values `on`/`off` (checked means on). TASK-002 writes it
  through `setVisualEffects`.
- `effectsEnabled` reflects only the stored choice. Visibility and reduced motion affect only
  `motionAllowed`.
- Next safe action, which needs the owner: decide how runtime tasks in this body satisfy the
  0.14.3 audit binding. Either run the authenticated Format Preview collector on the committed
  TASK-001 tree and rebind the audit, or scope or retire that binding for this body. After that,
  rerun `npm test`.


## Owner-authorized evidence recovery — 31 October 2026, source freeze

The unchanged preserved candidate reproduced exactly the two recorded audit failures: `npx vitest run src/test/design-0143-final-audit.test.ts` exited 1 (36 passed, 2 failed). The capture-owner metadata and fresh capture destination are routine evidence upkeep; no runtime behavior, validator, assertion or historical evidence is changed. The unchanged native Requirements Builder reviewed this as an operational supplement adding no product criteria.

Correction to the earlier speculation: attempt 1 was interrupted during the owner-requested pause. Its verification failure cause is unproven. The approved build baseline remains `65522e93d60d439ad82a545833812a58095f2216`; the earlier default/released-branch description is not relied on for approval.

The current native task revision is `477c2ea9f34d52fb76ec3643154963f574f8c50dc2a54c2d0152e441ecabd33b:TASK-001`, confirmed from the read-only native ledger and the selected native provider's graph-hash/task-id construction against the unchanged approved handoff. Requirements revision `559882aca202f024d3ffc0c1170bef59d9e710934d23eb06393400dae126ff96` is the distinct requirements identity bound by that handoff. The status/attempts/ready summaries omit the revision field; no state was edited.

Pre-freeze runtime candidate SHA-256 values (these bytes must stay unchanged):

- `src/state/visual-effects.ts`: `3b75bbd33b35fa39772ba444d0565c740e5c674f316fb30fb133e307d325c6e7`
- `src/state/visual-effects.test.ts`: `22de1c36b2e0197d089303522dba77cfc77af855eb2598fab77553cb08a97b04`
- `src/app/RootLayout.tsx`: `e70b2cac1fc9881cf5ba0ec250456693b1bf3d8a3046fc291e3dcaaac12f31b8`
- `src/app/atmosphere.test.tsx`: `70160b12050e049b267cedeadc48f4f513b5cc49dc9b3429672702920b066ce4`
- `src/styles/shell.css`: `3f1d1dee134eaf82be4b25a9f5927c279c21defeeaa4da537a11ecd9a88f3e61`

The collector will use the existing authorized disposable account fixture and private process environment, with account setup/cleanup separate from the read-only preview. Real capture, post-squash source-continuity rehearsal, native recovery, exact-head CI and protected build-branch delivery are still pending at this checkpoint.


## Genuine capture complete — 31 October 2026

Frozen source `60ab3427de1eb3c269a626fc9f1a3dca079d4814`; existing collector `CLEAR_TASK034_RECORD_AFTER=1 npx playwright test e2e/design-0143/format-preview.spec.ts --project=mobile` exited0: four passed skin cases/eight PNGs in12.8seconds, no skips. Group `docs/design/evidence-0143/task034-format-preview-effects-602-a2`. Runtime `d8541e79196aaaabcc21bcacff672eedda7a9267ac0fd0e077ab9176a6621bde`, driver `ffcca1b002ecd4c3cca0afc8bf44432b09772e201d986c63136c8f1f3467f0b5`, pinned package `e09aa5dfaf7a5e9536e9ffd7b8a00624e38c7702d484dc1e820153e22864a1a8`, payload `c1ce18de435af4bcd340a2c959a746742f4b7f4c64dba2f061db32a37cf7d303`. Actual PNG bytes/hash/dimensions and complete matrix were independently checked.

Actual source-only provenance uses Task001 revision `477c2ea9f34d52fb76ec3643154963f574f8c50dc2a54c2d0152e441ecabd33b:TASK-001`, run `54169bd8-70e5-4ac5-be6e-9ff1de26b17d`, a2, tested base `65522e93d60d439ad82a545833812a58095f2216` and retained branch `agent-runner/task-001-a2-54169bd8`. Zero preview/session generation and preview writes; existing disposable account setup/cleanup is separate. Historical evidence and audit contents remain unchanged. Next: source-continuity rehearsal and native full verification; no native receipt, CI, delivery, phone/UAT or owner visual approval is claimed here.
