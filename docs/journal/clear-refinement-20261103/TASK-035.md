# TASK-035 — Retain adaptive-training/progress report definition as explicit follow-up (#662)

Body `clear-refinement-v2-20261109b`, attempt 1, base `ed435ec` (after TASK-028 #708). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-035 writes this file.

## Intended outcome

REQ-035 (AC-R035-01, AC-R035-02), role independent, explicit non-gallery disposition. Produce the
focused, sourced product-definition record for R03 ("there should be a place where users can see
their adaptive training report as well as progress"):

- what the app records today (authoritative completed observations), kept apart from what it
  derives and from the future targets it suggests;
- where those readings already appear;
- placement and content options, with none selected;
- the exact remaining owner decision.

Nothing is implemented. No route, screen, chart, metric set, report frequency, profile, writer,
migration, gallery state or product code is added or claimed.

## Changes

- `docs/definitions/clear-refinement-20261103/TASK-035.md` is the definition record, in TASK-039's
  format. It has 41 sources (S01–S41). Each is a verified `base:` blob at `03087f7`, a `repo:` file
  or a `ref:accepted-gallery/` staged object, with its sha256. Only four sources are `repo:`, the
  files that do not exist at the base: MIG-A, MIG-B, `LOGGING_FIELD_CONTRACT.md` and
  `session-detail.ts`. Everything else is pinned to the immutable base, so later edits by other
  tasks do not break this record. Sections:
  - Scope;
  - Sources;
  - Current observations (O1–O7: set logs, categorical set effort, block results, MIG-A/MIG-B,
    session facts, rest days, as-performed reconstruction);
  - Derived readings (D1–D6: anchors, conditioning score, trend, favorite progression, streak,
    deload signals);
  - Future targets (T1–T6: suggested weight, prescription, generation directive, conditioning
    nudge, deload suggestion, next focus);
  - Where these readings appear today (V1–V7);
  - Options (P1–P5 placement, C1–C6 content categories, K1–K6 constraints kept from R03);
  - Open owner decisions (`R03-PLACEMENT-CONTENT`, Owner: Eric);
  - Limitations;
  - Non-gallery disposition;
  - Traceability.
- `scripts/refinement/task-035-definition.test.mjs` (node:test, 8 cases). It calls the shared
  `verifyDefinitionRecord` with four extra required sections. It also checks:
  - every claim bullet cites a listed source, and every source is cited;
  - every backticked identifier in a claim occurs in the verified bytes of a source that claim
    cites (base blobs, repo files, accepted-gallery store objects);
  - O, D and T items stay apart;
  - there is one exact decision, and no option is pre-selected;
  - every route named exists in `src/app/router.tsx`, and none is a report route;
  - Traceability ids are present, and the accepted coverage map still lists REQ-035 as an explicit
    non-gallery disposition;
  - no implementation claim is made.
- `evidence/refinement/task-035/required-cases.json` declares all 8 cases for check-01. Its receipt
  is `evidence/refinement/task-035/results/check-01.json`, written by the guard.

## Findings recorded in the definition (sourced, not decided)

- Categorical set/block effort is stored beside the numeric scales and never converted. Nothing
  adaptive reads it (S10, S11).
- The shipped timed save path writes `block_results.perceived_effort` as null (S23). The
  conditioning trend's `ready` needs a numeric effort of 7 or less (S22). So a window of only
  newly saved timed results cannot read `ready`. The record states this as a limitation; changing
  adaptive behaviour is outside R03 (S02).
- Deload dismissals are device-local storage (S25).
- CHART-01 was cut in favour of a text delta (S38). It is kept as constraint K4, not as a decision.
- R02 removed the Review "last performance" row because progress belongs in a place for reviewing
  progress. That place does not exist yet (V7).

## Failures and corrections

- First test run: three failures, all real record or test-rule issues.
  - The disposition was a paragraph rather than cited bullets.
  - Route tokens were checked against the wrong sources. Routes are now held to the router by
    their own case.
  - The implementation-sentence rule matched the header and the noun "implement" (equipment).
- The identifier case caught one uncited token (a `repo:` literal in Limitations), which I
  reworded.
- Mutation check: I made a temporary edit with these faults:
  - a dropped citation;
  - a misspelt table name;
  - an invented `/progress` route;
  - "Recommended option".

  It failed four cases with precise messages. The record was restored and all cases passed again.
- `npx eslint` initially downloaded a foreign ESLint because the worktree had no `node_modules`.
  `npm ci` fixed this, and ESLint then ran from the installed package.

## Verification

- `node scripts/refinement/run-required-check.mjs --task TASK-035 --check check-01 -- node --test scripts/refinement/task-035-definition.test.mjs`:
  PASSED, 8 total, 8 executed, 8 passed, 0 skipped.
- `node scripts/refinement/verify-definition-record.mjs --task TASK-035 --require-section "Future targets" --require-section "Derived readings" --require-section "Non-gallery disposition"`:
  PASSED (41 sources verified).
- `npx eslint scripts/refinement/task-035-definition.test.mjs`: 0 problems.
- `npm ci`: OK (the worktree had no `node_modules`).
- `npm run build`: exit 0.
- `npm run lint:ds`: exit 0.
- `npm test`: 269 test files, 6346 tests passed.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-034,TASK-035`
  (the controller's list): PASSED. TASK-035 has current passing receipts.

## Open assumptions

- The record cites the accepted-gallery copies of the R03/G19 authority (byte-identical to the
  approved requirements sources S01/S02). The `ref:` sources resolve only where the project
  reference object store exists. That is by TASK-039 design: it fails closed.
- `TASK-004.md` mentions a "TASK-035 retained-proof validator" from an earlier, unrelated body's
  numbering. This task does not touch it.

## Next action

The owner answers `R03-PLACEMENT-CONTENT` (placement P1–P5 or another place, content from C1–C6,
whether derived numbers such as anchors are shown, and route/frequency only if needed). A future
report task cites this record and that answer.
