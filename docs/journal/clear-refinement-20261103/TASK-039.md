# clear-refinement-20261103 · TASK-039: baseline and required-case verification providers

This is the task-owned progress record. Under the owner-selected policy, it satisfies the
repository's shared daily-journal requirement for this body (approved exception; AC-R040-03). The
required contents are unchanged. Only TASK-039 writes this file. The checked-in AGENTS.md and older
frozen bodies are not altered.

## Identity

- Body: `clear-refinement-20261103`. Runner body: `clear-refinement-v2-20261109b`.
- Issue #666, REQ-040, attempt 1, repair round 1.
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
- `evidence/refinement/clear-refinement-20261103/` contains only hash manifests: `BODY.json` and
  `references/<id>/REFERENCE.json` for `accepted-gallery`, `phosphor-echo` and
  `historical-comparisons`. The object bytes are outside Git (see "Repair round 1").
- `evidence/refinement/task-039/required-cases.json` declares 49 required bootstrap cases with
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
  - A passing case carries no file location. With several targets in one run, a case cannot be
    attributed to its file (see "Repair round 1").
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

## Repair round 1 (2026-11-09)

Reviewer defect (TASK-AC-BB6BBF630DDC, not met). For node:test checks with more than one target,
the guard skipped the per-target coverage check and matched required cases by name only, because
TAP gives no file for a passing case. In the reviewer's reproduction, `t/a.test.mjs` runs only
`a only`, and `t/b.test.mjs` runs `b case` and `claimed for a`. The manifest declares
`{file: t/a.test.mjs, name: claimed for a}`. The run `node --test t/a.test.mjs t/b.test.mjs` was
accepted, and the receipt said `t/a.test.mjs > claimed for a: passed`.

Fix:

- The guard now runs each node:test target as its own `node --test` invocation, with the same
  flags. It attributes the parsed cases to that file and merges the results. The exit code is the
  first non-zero code.
- `evaluateResults` always checks per-target coverage. It rejects any native case without a file
  ("cannot be attributed to a file"). Required cases match on the exact file, name and project,
  never on name alone.
- New self-tests:
  - `rejects a required case claimed for one file that only ran in another file` is the exact
    reproduction. It is rejected, and the receipt records the case as `missing`.
  - `attributes node:test cases per file when several targets are requested` is the positive
    case.
  - `rejects a multi-target TAP report that cannot attribute cases to files` covers the evaluator
    on its own.
- The two negative tests failed against the round-0 guard and pass against the new one. This was
  checked by temporarily restoring the old `required-check.mjs`.

Owner decision (recorded in the V2 ledger, 2026-11-09, Eric). Staged reference objects must not
be committed to theycallme-eric/clear, because GitHub storage growth is not sustainable. They are
staged outside Git in the body evidence location, and only small hash manifests are committed. The
verifier finds the store through the V2 worktree layout, with an env-var override, and fails
closed if the store is absent. The owner accepts that these checks run only where the body folder
exists, and states that local paths are now stable after the storage migration. This decision
governs criterion TASK-AC-9E8B5D3DDA20.

Changes for the decision:

- The round-0 objects were removed from the candidate:
  - 94 accepted-gallery objects, including GALLERY-DELIVERY.json;
  - 5 phosphor-echo objects;
  - 3 historical-comparison objects;
  - the staged PINNED-SOURCE.json.
- `stage-references.mjs` was rerun against the approved requirements run (inventory `93cf163b…`).
  It wrote 103 objects to `<runner body>/evidence/clear-refinement-20261103/references/<id>/objects/<sha256>`:
  the same 102 objects as before (byte-identical, compared by sha256), plus PINNED-SOURCE.json as
  object `a1b1f93b…`. The store is about 6.1 MB.
- `REFERENCE.json` for accepted-gallery now pins PINNED-SOURCE.json by sha256 (`manifest.sha256`).
  It lists the 94 delta files as `stagedObjects` (`path -> sha256`). Every other pinned file
  resolves from the integration-base git blob, exactly as before.
- `BODY.json` records the store policy, layout and override variable name. It contains no
  absolute path.
- `lib/references.mjs` adds `resolveObjectStore` and the `CLEAR_REFINEMENT_EVIDENCE_DIR`
  override. Without the override, the store is two levels above `git rev-parse --show-toplevel`,
  then `evidence/`. The resolver fails closed with a message naming the expected location in each
  of these cases:
  - the store is absent;
  - the body's objects are absent;
  - an object is missing;
  - an object's sha256 does not match.

  Guide locations are now `store:<body>/references/<id>/objects/<sha256>` or `git:<base>:<path>`.
- `verify-delivery-evidence.mjs` and `verify-definition-record.mjs` pass the store through. The
  delivery verifier also reports the store and its source.
- New self-tests:
  - `finds the object store through the V2 worktree layout` (the live worktree and a synthetic
    `<body>/worktrees/<task>` git repo);
  - `uses the CLEAR_REFINEMENT_EVIDENCE_DIR override`;
  - `fails closed when the object store is absent` (an absent override, and a store without this
    body);
  - `fails closed on a missing staged object` (a delta object and the PINNED-SOURCE object);
  - `fails closed on a tampered staged object`;
  - `rejects unknown references and drifted reference records`;
  - `keeps staged reference objects out of the repository`.

  The tests use copies of the store, so the real store is never modified.
- `evidence/refinement/README.md` (the dependent-task contract) and `PROJECT_MAP.md` describe the
  store, its location rules and the per-file node:test attribution. The README's old advice to
  "keep names unique" was removed.
- `task-039/required-cases.json` was regenerated from the actual TAP run: 49 cases, each with its
  criterion.

## Verification (this tree, repair round 1)

- `npm ci`: dependencies were already installed in this worktree (`node_modules/.bin/vitest`
  present). The controller runs `npm ci` itself.
- `node scripts/refinement/run-required-check.mjs --task TASK-039 --check bootstrap -- node --test
  scripts/refinement/required-check.test.mjs`: PASSED, exit 0. 49 total, 49 executed, 49 passed,
  0 skipped, 0 todo.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode
  baseline --require-current-source`: PASSED, exit 0. The store was found through the layout.
  1,193 gallery files (94 from the store, 1,099 from the integration base), 5 phosphor-echo files
  and 3 historical files were verified.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode
  references --reference phosphor-echo` (PRE-002's command): PASSED, exit 0.
- The same baseline command with `CLEAR_REFINEMENT_EVIDENCE_DIR=/nonexistent/store`: REJECTED,
  exit 1, with "reference object store is absent: expected /nonexistent/store".
- The reviewer's reproduction through the CLI, in a scratch directory: REJECTED, exit 1, with
  `[missing] t/a.test.mjs > claimed for a`.
- `npm run build`: built. `npm run lint:ds`: exit 0. `npx eslint scripts/refinement`: clean.
- `npm test`: 250 files and 6,067 tests passed.
- `git ls-files evidence/refinement` lists only the hash manifests, the task-039 manifest and the
  receipt. No `objects/` path, PINNED-SOURCE.json or GALLERY-DELIVERY.json is tracked.

## Open assumptions

- The definition-record format (Markdown at `docs/definitions/clear-refinement-20261103/<TASK>.md`
  with fixed header lines and sections) was chosen here. TASK-035, TASK-037 and TASK-038 consume
  it. `--record` and `--require-section` allow a task-specific path or extra sections.
- Receipts are written into `evidence/refinement/<task>/results/` on every guarded run. They are
  deterministic: no timestamps, durations or machine paths. Rerunning on the same tree leaves the
  working tree unchanged.
- Flaky Playwright outcomes (failed, then passed on retry) are rejected as not cleanly passing.
- Two supplied documents mention owner-machine paths as provenance text: PINNED-SOURCE.json
  (`sourceRepository`) and GALLERY-DELIVERY.json (fallbacks). They are now store objects outside
  Git, are never committed, and nothing resolves through those paths.
- Under the owner decision of 2026-11-09, reference checks (baseline `--require-current-source`,
  references, final and `ref:` definition sources) run only where the Runner body folder exists,
  or where `CLEAR_REFINEMENT_EVIDENCE_DIR` points at a copy of the store. Elsewhere they fail
  closed. Baseline mode without `--require-current-source` needs no store.

## Next action

The controller commits this candidate and reruns the listed commands. Dependent tasks then add
their own `evidence/refinement/task-NNN/required-cases.json` and run their checks through the
guard. TASK-042 uses `--mode final`.
