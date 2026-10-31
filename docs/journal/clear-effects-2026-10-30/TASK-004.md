# TASK-004 — Phosphor Echo applied to eligible outer foreground owners

Body `clear-effects-2026-10-30`, task TASK-004, GitHub issue #605, requirement REQ-004, journeys
JOURNEY-002 (completion owner) and JOURNEY-004. Branch `agent-runner/task-004-a1-e1c7c91a`, on top
of TASK-003 (`a77e074`). Nothing was pushed, no pull request was opened and nothing was written to
an external service.

## Intended outcome

Apply the TASK-003 shared Echo through app-owned bindings to outer foreground artwork that sits
directly on the background, across current screens. `/generate` is the representative proof: the
Screen heading, the framed back action, the workout-selection card and the primary CTA each get one
rear image. Nested content gets none. Prove it with a route test and an Echo-only real-browser spec
in CLEAR, Signal, Vapour and Mono.

## Changes

- `src/ui/foreground-echo.tsx` + `.css` (new): the eligibility rule, decided once.
  `ForegroundEchoFrame` wraps one framed owner in `PhosphorEchoFrame` only when it is on the
  background. That means inside the root effects provider, not inside a Card (`useInsideCard`), not
  inside a dialog (`EchoExcluded`) and not inside an already echoed owner. The echoed owner marks its
  own subtree excluded, so no subtree can be filtered twice. `ForegroundEchoText` does the same for a
  plain-text heading. The CSS passes the screen action row's layout through the wrapper: full-width
  cell, and the primary first when stacked and right from 560px, as the foundation `.clr-actions`
  rules do.
- Shared owners opt in (no screen wraps a target itself):
  - `src/app/Screen.tsx`: the `h1` text, plus the header `left`/`actions` slot element (the framed
    back action on every screen that has one).
  - `src/ui/card.tsx`: the outer Card. An in-card Card is still a ruled sub-group with no echo.
  - `src/ui/composition.tsx` `ActionRow`: each action, including actions inside a fragment. In a
    footer that is the CTA. Inside a card (`CardActions`) it is excluded.
  - `src/ui/app-dialog.tsx`: everything inside a dialog is excluded.
- `src/state/visual-effects.ts`: `useOptionalVisualEffects()`, which returns null outside the
  provider. That lets a Card, ActionRow or Screen rendered alone (unit tests, the gallery outside
  the shell) render exactly as before.
- `src/ui/phosphor-echo.tsx` / `.css` (TASK-003 module; two defects found by the applied proof):
  1. The heading's rear duplicate is now generated content (`data-echo-text` + `::before`), so the
     `h1` `textContent` is "Generate", not "GenerateGenerate". The 0.14.3 evidence harness reads
     `textContent` and failed on the duplicate.
  2. Re-measure now also runs on `disabled`/`aria-*` state attributes and on focus, and again after
     the frame's own CSS transitions finish. Under reduced motion the durations collapse to 0.01ms.
     The measure ran at the transition's start, so an enabled CTA kept the disabled grey echo in
     every skin.
  No preset value changed.
- `src/ui/phosphor-echo.test.tsx`: the heading assertion now reads `data-echo-text` and requires
  `textContent === 'Generate'`. `e2e/effects/echo-standalone-fidelity.spec.ts`: one line reads the
  rear text from `data-echo-text`.
- `src/dev/gallery-registry.test.tsx`: added exemption sentences for `ForegroundEchoFrame`,
  `ForegroundEchoText` and `EchoExcluded`. They render no new appearance; it is PhosphorEchoFrame's
  specimen. The register (`gallery-registry.tsx`) itself is untouched. **Owner check:** the task
  says not to edit "the gallery register". I read that as the register module, not this test's
  exemption list. TASK-003 edited the same list.
- Tests: `src/app/generate-echo.test.tsx` (new, 14 cases, `renderApp` on `/generate` and
  `/settings`) and `e2e/effects/echo-applied-fidelity.spec.ts` (new, 6 cases).

`src/app/Generate.tsx`, RootLayout, Settings, atmosphere, the gallery register, the preset and the
0.14.3 vendor are unchanged. No shared Playwright configuration was edited. The spec starts its own
Vite server from this workspace (port 5660+) with non-secret placeholders and intercepts every API
call. It serves `$CLEAR_EFFECTS_REFERENCE_DIR` read-only by route interception.

## Bleed/glow composition (chosen; owner visual review pending)

Audit on the four targets:
- Card: foundation `.clr-bleed` stroke emission on its `::before`, filtered on that layer only.
- CTA: `.clr-bleed.clr-glow`, a drop-shadow on the button's wrapper span.
- Back action: `.clr-bleed`.
- Heading: inherits body `text-shadow`.

Chosen composition: emission stays the component's own, as shipped. The Echo's source is the
filled silhouette only, drawn as a sibling *beneath* the component's `.clr-bleed` root. So neither
filter's subtree contains the other's, and the echo never copies the bleed or glow.

The real-browser pairs confirm it for the frame owners: nothing changes above or right of any
owner (max channel diff ≤ 2), so no glow is added or doubled.

**Open for the owner:** the heading's rear duplicate inherits the body `text-shadow`, so its echo
source includes the text emission. The Signal heading's left band fits its ink with a negative alpha
(residual 8.1), unlike the frames (alpha ≈ 0.23, residual < 1). I left this as TASK-003 shipped it,
because TASK-003's kernel-identity proof was taken with the inherited shadow. If the owner wants
silhouette-only for text too, the change is `text-shadow: none` on `.clr-echo-text__rear`. That
needs a TASK-003 fidelity rerun.

## Failures and corrections

1. Evidence-harness test failed on the duplicated heading text. Fixed with generated content (above).
2. Gallery coverage test failed on new `src/ui` exports. Fixed with exemption sentences (above).
3. Spec: the heading's "below" band was empty, because a text box ends below its glyphs. The lower
   echo is now checked inside the heading box.
4. Spec: the first loading-state attempt held places, then history. The route guard reads both, so
   that held boot instead. Changed to Generate's real Loading host: the generation POST is
   intercepted and held unanswered, and Cancel restores the form.
5. Spec: colours serialise as `color(srgb …)`/`oklab(…)`. The spec now compares them parsed.
6. Spec found the stale disabled-grey CTA echo (correction 2 in Changes). This was a real defect.
7. Home cards were briefly off their owners while content loaded: a rear re-measures one frame
   after its owner resizes. The live check now reads until settled (≤ 3 s). That is a one-frame lag,
   not a persistent leak.
8. The dialog branch first fell back silently. The boot `h1` satisfied the wait. It is now
   mandatory: it waits for Places' Delete, opens the confirm dialog, and asserts no echo inside it.

## Verification (this workspace, final tree)

- `npx vitest run src/app/generate-echo.test.tsx` — 14/14 passed.
- `npx playwright test --project=mobile e2e/effects/echo-applied-fidelity.spec.ts` — 6/6 passed,
  at DPR 3, 390×844 for the pairs:
  - Pairs, all four skins: every frame interior identical on/off (max ≤ 2), so the top/right
    interior, nested chips/fields/labels, back arrow and CTA label are unchanged. Left and below
    changed. Above and right unchanged. Rear ink equals the painted `::after` / text colour.
    Echo alpha ≤ preset + 0.06. Signal: heading/back/CTA hue is pink, and the card is neon
    yellow-green (`color(srgb 0.776 1 0.180 / 0.9)`). The card echo fits its own ink better than
    the heading's.
  - States at 320/375: no horizontal overflow. Disabled, focus-visible back, chosen chip and the
    urgency error card were each captured readable. The card rear follows the urgency colour.
  - Live: running atmosphere animations, scroll, reduced-motion toggle, hidden/visible tab,
    generation Loading host and cancel, Home, Places, confirm dialog, Visual effects off via the
    real Settings checkbox (0 rear sources), and back on.
  - Captures and records with reference host paths, the preset file SHA-256 (`9785d72a…`), viewport,
    DPR, skin and state are in `test-results/effects-echo-applied-fidel-*/`. Each skin has a
    round-3 host capture at the same viewport/DPR. Historical JPGs are listed as diagnostic only.
- `npm run typecheck` passed. `npm run lint` 0 errors and 154 warnings, the same count TASK-003
  recorded. The one warning this task first added (an exported hook in `foreground-echo.tsx`) was
  removed by unexporting it. `npm run lint:ds` passed. `npm run build` passed.
- `npm test`: 5984/5986. The 2 failures are in `src/test/design-0143-final-audit.test.ts` — the
  runtime-source binding and the Format Preview eight-cell record. The cause is the same source-bound
  audit that TASK-001 and TASK-003 reported: this task must change runtime source. No hash was edited
  and no capture was run. **Blocking finding for owner decision** (genuine re-capture/rebind).
- Not run: `e2e/effects/echo-standalone-fidelity.spec.ts`. The worker's sandbox required approval
  for it, after I changed one line in it and the module it proves. The controller should rerun it.

## Assumptions and next action

- No final visual approval is claimed. The pairs await the owner's comparison, and so does the
  chosen composition, including the heading text-shadow question.
- No CRT field is mounted in this build. "CRT held identical" is satisfied by reduced motion on
  both sides of each pair.
- Eligible owners in this task: Screen heading, header action slot, outer Card, ActionRow actions.
  Outer `ListFrame`/`MetricFrame`/`EmptyState` frames and the set-logging sheet are not bound. The
  task infers no new category, so whether they count is an owner decision.
- Next safe action: controller verification (including the TASK-003 spec), then the owner's visual
  review of the capture pairs, then the owner-authorized audit re-capture.


## Operator checkpoint for supported native continuation — 31 October 2026

The actual first native worker ended error_max_turns after101 turns; no accepted final criterion report or delivery exists. The native turn-candidate check retained the diff, then controller verification passed the14 route cases and failed the4 reference-pair cases solely because CLEAR_EFFECTS_REFERENCE_DIR was absent from its command environment. The other2 browser cases passed. This supersedes any implication that the worker's6/6 alone was native acceptance. No claim/attempt/history was reset.

The existing harness now has a git-ignored .env.runner.local containing only the two approved non-secret reference/settings paths. It contains no credential. Preserve it. An independent necessary TASK003 regression run on this exact saved candidate passed all5 browser cases in6.8s, including exact kernel pixels at DPR1/3 and desktop masking. Its log is retained outside the product in the operator TASK004 checkpoint. No shared Playwright configuration, validator, preset or old evidence was changed.

Scope review to finish under the EXISTING REQ004/AC025, not a new artwork category: the scope is the same eligible outer shared frame/card owner across current screens; Generate is only representative. The prior note's blanket deferral of existing ListFrame/MetricFrame/EmptyState as an owner decision is not justified by the frozen task. Revalidate actual current usages: many list/metric frames are already inside Card and must stay excluded; standalone public EmptyState and LoadingView's ScanLoader are existing card/frame surfaces (src/ui/view-state.tsx and current app call sites), so reconcile their actual on-background instances through app-owned bindings without changing the vendor or inventing unrelated categories. The set-logging sheet resets CardContainmentContext to false for its own nested RestTimerBar (src/ui/set-logging-sheet.tsx, src/ui/workout-chrome.tsx); nested sheet content must remain excluded from an independent Echo because it sits inside a framed surface. Check and close any actual leak. Add meaningful assertions for these actual existing owners/exclusions, not tests that mirror helpers. Preserve the preferred preset and original kernel appearance, including the existing heading-shadow composition pending visual review; no unsolicited numeric or appearance adjustment.

The original task's source-bound audit refresh is routine authorized verification upkeep, not a new owner permission question. Leave authentic recapture to the operator once runtime source is final; do not invent a capture, edit hashes to pass, or access credentials. Retain failed and partial evidence and document actual checks honestly.

Separate observed delivery limitation: hosted preview CI on TASK003 PR614 failed because its private reference input is not provisioned there (1failed,131passed,221skipped). Native/local reference tests passed. Do not hide this with skips, weakened assertions, hardcoded host paths, private checkpoint publication or protected workflow/shared-config edits. Record the limitation for the native workflow handoff; this continuation does not authorize solving it by bypass.


## Native continuation (attempt 2) — 31 October 2026

**Controller failure cause.** The 4 reference-pair failures were caused only by
`CLEAR_EFFECTS_REFERENCE_DIR` being absent from the command environment. With the operator's
git-ignored `.env.runner.local` present, the unchanged spec reads it (exported value first, then
`.env.runner.local` / `.env.audit.local` / `.env.local`) and passes 6/6. No spec logic, shared
Playwright configuration or hardcoded path was changed for this. A missing checkpoint still fails
loudly. It is not skipped.

**Scope closed under REQ-004/AC-025 (existing owners, no new category).** I checked the actual
current usages. Each on-background instance below now binds through `ForegroundEchoFrame`, and the
existing context exclusion keeps in-card, in-dialog and in-sheet instances bare:

- `ListFrame` and `MetricFrame` (`src/ui/composition.tsx`) echo their standalone chamfered frame.
  Inside a Card they stay the bare `--in-card` form with no wrapper. `foreground-echo.css` passes
  grid-cell stretch through for `.clr-metric-grid > .clr-echo`.
- `ListMessage`'s standalone public `EmptyState` is bound.
- `LoadingView`'s standalone `ScanLoader` and `ErrorView`'s standalone failure card and its Retry
  button are bound in `src/ui/view-state.tsx`. The in-card forms are unchanged.
- Direct standalone `EmptyState`/`ScanLoader` call sites are bound: `Generate.tsx` (goal correction,
  no places), `ReviewRoute.tsx` (no review), `LocationSettings.tsx` (no places) and
  `GenerationLoading.tsx` (generation loader). `exercise-swap.tsx` already sits in `AppDialog`
  (excluded) and was not touched.
- **Leak closed:** the set-logging sheet resets `CardContainmentContext` to false, so its
  `RestTimerBar` Card would have taken its own echo. The sheet body is now wrapped in
  `EchoExcluded` (`src/ui/set-logging-sheet.tsx`).
- Not bound (task boundary): `Settings.tsx:170`'s empty `EmptyState`, because this task does not
  edit Settings. That is recorded as a residual for the owner and TASK-008.

**Tests added.** `generate-echo.test.tsx` now has 17 tests: the loader card echoes once with
nothing inside it echoed; the error card and Retry are separate owners; the no-places empty card
echoes; standalone list, metric and empty frames echo once each; inside a Card only the card
echoes. `set-logging-sheet.test.tsx` gains an `effects` mount option and asserts that the sheet's
timer card has no `[data-echo]`.

**Verification on this tree.**
- `npx vitest run src/app/generate-echo.test.tsx`: 17/17 passed.
- `npx playwright test --project=mobile e2e/effects/echo-applied-fidelity.spec.ts`: 6/6 passed.
- `npm run typecheck`: passed. `npm run lint`: 0 errors, 154 warnings (unchanged).
  `npm run lint:ds`: passed. `npm run build`: passed.
- `npm test`: 5988/5990. The 2 failures are the same source-bound
  `src/test/design-0143-final-audit.test.ts` cases (the runtime-source hash and the eight-cell
  Format Preview record). Runtime source changed by design. No hash was edited and no capture was
  invented. As the operator checkpoint directs, an authentic recapture is the operator's step now
  that runtime source is final.

**Next safe action.** Run the operator's authentic Format Preview recapture and audit rebind on this
final source. Then run controller verification, then the owner's visual review of the capture pairs
and of the chosen bleed/glow composition (heading text-shadow included). No visual approval is
claimed.


## Preserved checkpoint at approval boundary

Native claim2 worker succeeded. Criterion/task verification and typecheck/lint/design-lint passed independently; npm test failed only the2 source-bound audit cases. A necessary separate standalone-renderer regression passed5/5 browser cases in6.6s on this same runtime, including DPR1/3 identity and desktop masking. No completed/native verified receipt, PR or delivery is claimed for TASK004.

The attempted evidence-refresh operation was twice rejected by automatic approval review as violating the no-helper/no-assertion-change restriction. Neither rejected command executed. The proposed patch contains only the capture-directory selector and4 source-owner metadata values; it is retained outside the product for explicit review. Capture helper, audit test, generic lineage helper, old evidence, preset, package files, shared config and protected paths remain unchanged. No further retry or alternate execution is used. Source and notes are being committed only to preserve this unpublished native candidate.

The previously noted Settings empty state does not require an additional current-screen decision: router.tsx wraps /settings in Protected; guards.tsx redirects an absent profile to onboarding; guards.test.tsx contains the explicit protected/no-row -> onboarding case, and Settings.tsx itself documents that its empty branch is defensive. No Settings change or new category is inferred. An eventual route change exposing that branch would need the existing rule then.

Final status: source application candidate retained; authentic source-evidence refresh and native recovery are pending the specific metadata approval. Hosted preview CI reference provisioning, owner visual review and future combined-effects/phone gates remain open. No production change occurred.


## Specific capture-binding approval received — 31 October 2026

The owner explicitly approved the previously presented narrow patch: a fresh capture-directory selector and the current task/revision/run/tested-base values. It has now been applied. The earlier two automatic-review denials remain history; neither denied command executed. No validation function, assertion predicate, matrix, hashing, historical record, generic lineage helper, preset or runtime source changed. All21 preserved application/test file digests still match the saved candidate.

Freeze this approved source/binding state before invoking the unchanged real collector into a new group. This is still current native claim2 in the retained a1 source branch; v1 source-only attempt1 identifies that branch slot, not acceptance of the native first claim. Fresh native recovery and acceptance remain separately required. The owner approval grants no third coding attempt, profile/Runner change, private-reference publication, main merge or production release.
