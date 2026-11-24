# TASK-112 — Review's movement hierarchy, actions and compact equipment, with the build's checks back (A3 task 12a, F10)

Task-owned progress note for body `clear-gallery-adoption-v2-20261120`, attempt 1, worktree branch
`v2/clear-gallery-adoption-v2-20261120/task-112-a1`, base `66fb340b` (issue #735). Path per the brief's Rules (the issue
body says `…-20261113`; earlier tasks used this one).

## Intended outcome

The old build's TASK-001 (7) and TASK-002 (11) row checks come back on Round 7's rows, with no new look: /review's
`ReviewExerciseRow` and /workout's `BlockPanel.Movement`/`TimedWorkoutFlow` over `MovementIdentity`, `MovementList` and
`MovementGroupHeader` (equipment inline on the name line, Swap only in Review, sections expanded under static semantic
headings with no toggle, separators only between peers). This task creates `src/ui/movement-list.test.tsx` (TASK-001
block) and adds the TASK-002 block after TASK-118's TASK-029 block in `src/ui/movement-identity.test.tsx`, owning both
files whole; it owns JOURNEY-001/002 through the task-001 and task-002 e2e suites, and a look check for `cards`.
`src/app/Review.test.tsx` and `src/app/review-screen.test.tsx` are TASK-119's and are not touched.

## Changes

Product: none. `git diff 66fb340b -- src` outside tests and `src/test` is empty; no gallery-owned file, no `src/dev/**`.
The routes were already wired to Round 7's owners at the base, so only the tests come back.

Tests and support:

- `src/ui/movement-list.test.tsx` (new): the build's TASK-001 block (7), titles verbatim, on Round 7's DOM and cascade
  (text-roles, movement-presentation, workout-r7 stylesheets). Its own harness (the build's, with anchors) and readers:
  `list()` (Review's standard block is its card's movement group: Round 7 draws no list there), the name element as the
  column, `ordinalOf`/`nameOf` (a live group's ordinal is the name's leading `A1 `/`1. `), `loadOf`,
  `expectUnruledPeers` for Review's standard rows, `sourceDeclaration` for the column's `flex: 1 1 0` (jsdom drops a
  shorthand with a unitless zero basis).
- `src/ui/movement-identity.test.tsx`: the build's TASK-002 block (11) after TASK-029's, titles verbatim. TASK-118's
  shared helpers are reused unchanged (`openReview`, `startWorkout`, `list`, `rows`, `identities`, `nameOf`,
  `expectCompactEquipment`); new readers beside them: `movementName`, `loadOf`, `readings`, `cards`, `headerOf`,
  `metaOf`. The header face reads foundation.css's heading and label rules only, added in the block's own
  `beforeAll` (removed `afterAll`), so TASK-029's block reads the cascade it did. Every TASK-029 body and helper is
  byte-identical to the base.
- `src/test/context-actions-fixture.ts`: the live For Time list is Round 7's `Movements in this FOR TIME`.
- `e2e/refinement/task-001.spec.ts`, `e2e/refinement/task-002.spec.ts`: readers ported to Round 7 (case bodies kept);
  gallery cases read Round 7's cards state (the live EMOM, AMRAP and For Time cards).
- `e2e/refinement/task-112-parity.spec.ts` (new): /review's and /workout's movement rows against the cards state with
  matched data (the state's own blocks, in pounds; Review's hand-off, then Start), at 320 and 390.

Evidence: `evidence/refinement/task-112/` (required-cases: check-01 declares all 26 cases of both files, parity 2;
results; parity receipts; test-ledger), TASK-001/TASK-002 manifest descriptions now name Round 7's owners (cases
unchanged), receipts refreshed for TASK-001 c01/c02, TASK-002 c01/c02, TASK-029 c01, TASK-112 c01/parity.

## Failures and corrections

- First TASK-002 run: loading the whole of foundation.css hid every list from the accessibility tree (its scroll
  region is `visibility: hidden` until measured, which jsdom never does). Now only the heading and label face rules are
  loaded (asserted: 7 rules).
- The build's gallery-state glyph read was scoped to the Review scene; Round 7's state is live cards whose own
  Coaching disclosure has a glyph, so the read is scoped to the headers (no chevron or control in any header).
- Parity first run: Review's `SWAP` (text-action capitals) and the live `10 reps`/`40 reps` were unlabelled; labelled
  AC-C06-01 and AC-R002-03.
- Self-check (b) restored seven reads Round 7 still meets (listed in the ledger's `selfCheck.restoredAfterComparison`),
  including the build's exact last-peer reads and an exact `flex` read where a regex had crept in.
- Look retirements under the 2026-11-23 rule (ledger `rules.retiredAssertions`): Review's standard rows have no rule
  between them; the peer gap token; equipment inline in the name (R132) and the e2e "wraps as one unit"; the header's
  label face; the section heading on every card and the live header as a heading (2026-11-13 decision 2); the block size
  on the line under the header (decision 6); live ordinals in the name's words; the gallery scenes Round 7's state lacks.

## Self-check (TypeScript compiler API; every touched test file and spec, 5)

(a) Titles at the base absent at HEAD: 0. Build titles not carried: 0 (movement-list 7→7; movement-identity 19→19;
task-001 3→3 and task-002 5→5 titles as written; the parity spec is new).

(b) Bodies changed (body or a helper it reaches): 27 (26 with a build counterpart, 8 with a base counterpart). Build
reads not verbatim: 72 (50 distinct); base reads not verbatim: 16 (the e2e reads; base = build there). Each is a Round 7
locator for the same read, a Round 7 look or wording rewrite, an owner decision Round 7 implements, or a gallery scene
Round 7's state does not draw (classified in the ledger). `matchersWeakened: false`.

## Verification (exact)

| Command | Result |
| --- | --- |
| `npm ci` | ok |
| TASK-112 check-01 (both files) | PASSED, 26/26 |
| TASK-001 check-01 (movement-list) | PASSED, 7/7 |
| TASK-002 check-01 (movement-identity whole) | PASSED, 19 executed, its 11 declared passed |
| TASK-029 check-01 (`^TASK-029 `) | PASSED, 8/8 (11 filtered) |
| TASK-001 check-02 (with-lock) | PASSED, 9/9 |
| TASK-002 check-02 (with-lock) | PASSED, 7/7 |
| TASK-112 parity (with-lock), run 1 and run 2 | PASSED, 2/2 each; receipts byte-identical; 18 capture hashes match their files |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-001,TASK-002,TASK-029,TASK-112` | PASSED: current passing receipts for all four |
| CI chain (typecheck, lint, lint:ds, gen-issues --check, gen:types --check, npm test, build, console grep), with-lock, on the committed HEAD 3deac844/da7724ed (only this result line was filled in after) | exit 0; lint 0 errors / 175 warnings (as base; the six touched files lint clean); 71 requirements, 136 edges; 279 files, 6,468/6,468; build ok |

Parity: /workout's rows equal the state's, word for word, element box for box (2 px) and face for face. /review's rows
share every face (name, ordinal, equipment, prescription, load); the visible differences are Review's Swap (AC-C06-01)
and its planned sets × reps where the live card states the minute or pass (AC-R002-03). The state against the base's
cards receipts: no line differs. Every unit case runs well under 2 s (no `HEAVY` needed). Port 5173 free before and after
each browser run.

## Open assumptions

- The Review standard-block separator, the inline equipment wrap, the repeated section headings and the live ordinals
  are Round 7's accepted look (no criterion asks for the build's); listed for Eric's UAT in the ledger's
  `rules.forTask115`.

## Next action

Controller verification and review.
