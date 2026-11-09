# clear-refinement-20261103 · TASK-039: baseline and required-case verification providers

This is the task-owned progress record. Under the owner-selected policy, it satisfies the
repository's shared daily-journal requirement for this body (approved exception; AC-R040-03). The
required contents are unchanged. Only TASK-039 writes this file. The checked-in AGENTS.md and older
frozen bodies are not altered.

## Identity

- Body: `clear-refinement-20261103`. Runner body: `clear-refinement-v2-20261109b`.
- Issue #666, REQ-040, attempt 1.
- Branch: `v2/clear-refinement-v2-20261109b/task-039-a1`. Base: `03087f7488bee8d7e927534b1b5e656378fe9cb3`.
- Nothing pushed, no PR opened, no `gh` and no service calls.
- Accepted gallery: `eded158cfd928d382c9a9409e2c372270312741d`. This task has a non-gallery
  disposition: the providers are engineering/operational and have no presentation.

## Intended outcome

Provide the early shared providers that every later task's verification uses:

- the strict required-case guard;
- the staged-reference resolver with baseline, references and final modes;
- the definition-record checker;
- their fixtures and the bootstrap self-tests.

The task does not claim any journey is delivered. Final delivered-route proof stays with TASK-042
and the journey completion owners.

## Reconciliation (AC-R040-01, AC-R040-02, AC-GAL-BASE-01)

- The live integration base `03087f7` is present and is HEAD's ancestor. It is the selected
  implementation baseline (effects-delivered main).
- Verified main `94f2c2f` is an ancestor of `03087f7`. It is recorded as a historical comparison
  only.
- Reviewed R7 runtime `2d48f130ef1d508e032d0bf2ae045601d9d21f26` is not in this repository. It is
  recorded from its staged `SOURCE.json` as historical only and is not required.
- Foundation `src/design-system` 0.14.3 is byte-unchanged from the base. Baseline mode now enforces
  this.
- The gallery's source delta against the base is 94 files: 9 changed and 85 added. Only those files
  are staged. The other 1,096 pinned files, plus 3 excluded archived templates, are verified against
  the base's git blobs. Nothing from the preview branch is merged into application code.
- Shared presentation owners are exposed as guides: REUSE.md, LOGGING-FIELDS.md,
  `src/ui/refinements/tokens.css`, the coverage/state map and SOURCE-MANIFEST.json. Later tasks
  adopt them; this task edits no product runtime file.

## Changes

- `scripts/refinement/lib/native-results.mjs` parses Vitest JSON, Playwright JSON and node:test
  TAP.
- `scripts/refinement/lib/required-check.mjs` holds the shared logic:
  - manifest schema;
  - command analysis, which allows only the installed `node_modules/.bin` runner, never an `npx`
    download, and keeps the guard's own reporter flags;
  - fresh-report reading;
  - evaluation;
  - deterministic receipts;
  - receipt staleness checks.
- `scripts/refinement/run-required-check.mjs` is the guard CLI.
- `scripts/refinement/lib/references.mjs` holds the staged-reference resolver, a batched
  git-blob reader and the baseline checks.
- `scripts/refinement/verify-delivery-evidence.mjs` has separate `baseline`
  (`--require-current-source`), `references` (`--reference`, `--show`) and `final` modes.
- `scripts/refinement/verify-definition-record.mjs` checks definition-only records for TASK-035,
  TASK-037 and TASK-038.
- `scripts/refinement/stage-references.mjs` was the one-time staging tool. It checks every byte
  against the approved requirements `SOURCE_MANIFEST.json` (inventory `93cf163b…`) before
  staging. Verification does not use it.
- `scripts/refinement/fixtures/{vitest,playwright,node-test}/` holds the positive and negative
  fixtures, with their own configs. Root Vitest, Playwright and tsc never collect them.
- `scripts/refinement/required-check.test.mjs` contains the 40 bootstrap self-tests. Each is named
  with its criterion id.
- `evidence/refinement/clear-refinement-20261103/` contains `BODY.json` and three staged
  references: `accepted-gallery` (5.8 MB, 94 objects plus verbatim PINNED-SOURCE.json),
  `phosphor-echo` (5 files) and `historical-comparisons` (3 files).
- `evidence/refinement/task-039/required-cases.json` declares 40 required bootstrap cases with
  purpose `setup`. `results/bootstrap.json` is the deterministic receipt.
- `evidence/refinement/README.md` is the provider contract for the dependent tasks.
- `PROJECT_MAP.md` has rows for `scripts/refinement/` and `evidence/refinement/`.

## Format rehearsal findings (installed versions)

- Vitest 4.1.11:
  - A positional file target that does not exist is ignored silently.
  - Cases removed by `--testNamePattern` are reported as `skipped`.
  - `it.todo` is reported as `todo`.
  - A file outside `include` is ignored silently.
- Playwright 1.63.0:
  - A skipped spec, including a runtime `test.skip`, has `ok: true`, so `ok` is never treated as
    proof.
  - `spec.file` is relative to `config.rootDir`.
  - A missing target that sits beside an existing one is ignored silently.
- Node 24.12 TAP:
  - A missing target is ignored silently and the run exits 0.
  - A file with no tests produces one synthetic passing entry named after the file.
  - TODO cases report `ok`.
  - A passing case carries no file location.
  - A guard started inside a node:test process inherits `NODE_TEST_CONTEXT`, which suppressed the
    nested reporter. The guard now clears it.
- The real repository configs were also rehearsed: `npx vitest run src/test/example.test.tsx
  --testNamePattern factories` and `npx playwright test e2e/public-gallery.spec.ts
  --project=mobile --grep "related presentations"` (local Vite server). Both passed through the
  guard with a temporary evidence root and left no committed artifact.

## Failures and corrections

- On the first self-test run, the three node-test runner cases failed with "absent native report".
  The cause was the `NODE_TEST_CONTEXT` inheritance described above. The guard now clears that
  variable, and each final-mode test asserts that its setup run passed, so a spurious pass cannot
  hide the problem again.
- The first bootstrap manifest was a placeholder, so the two bootstrap-manifest cases failed. The
  manifest was regenerated from the actual TAP run, giving 40 cases. A top-level case that did not
  fit the `group > case` naming was removed.

## Verification (this tree)

- `npm ci`: installed.
- `node scripts/refinement/run-required-check.mjs --task TASK-039 --check bootstrap -- node --test
  scripts/refinement/required-check.test.mjs`: PASSED, exit 0. 40 total, 40 executed, 40 passed,
  0 skipped. Running it again produced a byte-identical receipt.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode
  baseline --require-current-source`: PASSED, exit 0. 1,193 gallery files, 5 phosphor-echo files
  and 3 historical files were verified.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode
  references --reference phosphor-echo` (PRE-002's command): PASSED, exit 0.
- `npm run build`: built.
- `npm run lint:ds`: exit 0.
- `npx eslint scripts/refinement`: clean. `npm run lint`: 0 errors and 160 warnings, none in the
  new files.
- `npm test`: 250 files and 6,067 tests passed.

## Open assumptions

- The definition-record format (Markdown at `docs/definitions/clear-refinement-20261103/<TASK>.md`
  with fixed header lines and sections) was chosen here. TASK-035, TASK-037 and TASK-038 consume
  it. `--record` and `--require-section` allow a task-specific path or extra sections.
- Receipts are written into `evidence/refinement/<task>/results/` on every guarded run. They are
  deterministic: no timestamps, durations or machine paths. Rerunning on the same tree leaves the
  working tree unchanged.
- Flaky Playwright outcomes (failed, then passed on retry) are rejected as not cleanly passing.
- Two staged documents are supplied bytes that mention owner-machine paths as provenance text
  (PINNED-SOURCE.json `sourceRepository` and GALLERY-DELIVERY.json fallbacks). Changing them would
  break their pinned hashes. Nothing resolves through those paths.

## Next action

The controller commits this candidate and reruns the listed commands. Dependent tasks then add
their own `evidence/refinement/task-NNN/required-cases.json` and run their checks through the
guard. TASK-042 uses `--mode final`.
