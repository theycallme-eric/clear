# ErrorView pilot evidence — issue 601

Canonical owner: `src/ui/view-state.tsx#ErrorView`; existing registry entry: `src/dev/gallery-registry.tsx` → ErrorView. Review `/gallery/app?component=ErrorView`, including the card and dialog specimens.

## Approved visual proposal

Signal gallery specimens: [released](current-signal-error.png) and [approved proposal](proposed-signal-error.png). Released base `65522e93d60d439ad82a545833812a58095f2216`; corrected prototype `c0d5782bf9bec8065b5e224c9d3b4f35a9dded17`. The proposal aligns the accent with the existing semantic error frame/icon. These are design-proposal images, not new final-candidate captures or blanket screen approval.

## Final direct browser observations

The six JSON files are unmodified outputs of `npx playwright test e2e/library-error-role.spec.ts --project=mobile` on frozen candidate source `55843bdbb889a1066d0ea691ea520398177084e0`. All eight named cases executed and passed, zero skips. The source-only suite starts fresh candidate and isolated released-owner Vite servers, never rewrites the candidate owner, and waits for actual applied skins and finished transitions. Each reading retains its skin, width, context and source contract. Auth/account/function traffic is refused or counted; only synthetic clients are used.

- `error-role-baseline.json`: the released mismatch, including inherited AppDialog and actual Generate states.
- `error-role-candidate-gallery.json`: the real shared gallery specimens and AppDialog in four skins at 320/390px.
- `error-role-containment-and-controls.json`: host-card containment and unchanged ordinary-state paint.
- `error-role-candidate-generate-{profile,places}.json`: actual Generate errors, footer Retry and navigation.
- `error-role-candidate-guard.json`: the protected-route account error, separately identified.

Semantics and reduced-motion cases also passed in that same eight-case run. The authenticated Format Preview evidence refresh is separate in `docs/design/evidence-0143/task034-format-preview-library-601/`; its fixture's owner-authorized disposable setup/cleanup is not attributed to these zero-write synthetic ErrorView tests.

Direct final checks: 5909/5909 unit tests (240 files), 128 focused tests, eight browser cases, build/typecheck, lint (0 errors; 151 warnings), design lint and the 52-entry generated index all pass. Old capture groups and both immutable 0.14.3 directories are unchanged.

## Workflow limit

The approved design passed through the actual Requirements Builder, one-task DAG and Runner worker. Runner's independent browser check passed, then full verification held on stale source-bound audit evidence. Eric authorized manual capture/completion and explicitly prohibited invoking Runner again. The failed native history stays intact. The final checks and ordinary PR are operator delivery, not a new native receipt or proof of completed end-to-end Runner delivery. No merge or production release is claimed.
