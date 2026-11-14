# TASK-037 — Retain a scoped platform language and terminology audit (#664)

Body `clear-refinement-v2-20261109b`, attempt 1, base `b4a95f7` (after TASK-035 #710). This is the
task-owned progress note, the approved exception to the shared daily journal for this body. Only
TASK-037 writes this file.

## Intended outcome

REQ-037 (AC-R037-01, AC-R037-02), role independent, explicit non-gallery disposition. Produce the
sourced definition record for the G20 / R45 platform copy pass:

- an inventory of frontend titles, actions, states and helper messages across every route surface;
- every visible `RPE`, with Effort used as the term and numeric historical vs categorical meanings
  kept apart;
- the explicitly selected copy changes and their status at this revision;
- a concise terminology/voice proposal, explicit undecided items and exact owner decisions.

Nothing in product copy or code is changed. It is a definition, not a rewrite.

## Changes

- `docs/definitions/clear-refinement-20261103/TASK-037.md` is the definition record in TASK-039's
  format. It has 68 sources (S01–S68). There are 7 `ref:accepted-gallery/` authority objects. Code
  files unchanged since `03087f7` are `base:`, and files this body changed are `repo:`. The base
  versions of Generate, EMOM, ladder and set-logger are pinned separately, as the "before" of each
  removal. Sections:
  - Inventory I1–I16, one per surface, each split into Titles / Actions / States / Helpers;
  - Effort and RPE E1–E10;
  - Selected copy changes X1–X10;
  - Terminology T1–T6 and voice rules W1–W7, marked "Status: proposal";
  - Undecided items U1–U15;
  - Options N1–N3 / A1–A2 / Y1–Y2 / K1, with none selected;
  - three owner decisions: COPY-VOICE, EFFORT-NUMERIC-READING, COPY-APPLY;
  - Limitations, Non-gallery disposition and Traceability (all 14 evidence ids).
- `scripts/refinement/task-037-definition.test.mjs` (node:test, 9 cases). It calls the shared
  `verifyDefinitionRecord` with five extra sections. It also checks:
  - every claim cites a listed source, and every source is cited;
  - each of the 200+ quoted strings and identifiers occurs in the verified bytes of a cited source
    (JSX text is compared with its whitespace collapsed);
  - the inventory names every router path plus `ONBOARDING_ROUTE` / `FORMAT_PREVIEW_ROUTE`;
  - a TypeScript-AST scan of every frontend string literal (excluding tests, `src/test`, `src/dev`)
    finds every `RPE` literal, and each file holding one must be inventoried in "Effort and RPE";
  - each selected change keeps its status. For an applied change, the removed string is a literal in
    the base file and no literal in the current file (comments don't count). For a change that is
    not applied, the string is still a literal now;
  - the proposal is concise, labelled a proposal and uses Effort, not RPE;
  - the U-items and the three exact decisions are explicit, with no option pre-selected;
  - no rewrite is claimed;
  - the coverage map, delivery crosswalk and gallery crosswalk still record REQ-037 as an explicit
    non-gallery disposition.
- `evidence/refinement/task-037/required-cases.json` declares all 9 cases for check-01. The guard
  wrote the receipt at `evidence/refinement/task-037/results/check-01.json`.

## Findings recorded (sourced, not decided)

- **R09 is not applied.** History's set table still heads the historical per-set number
  `RPE` and reads cells as `RPE 8`. "RPE" also still appears in:
  - the deload banner and reasons;
  - the "why this number" dialog (set readings and rule reads);
  - the read-only format preview.

  The History block effort already reads `Effort N of 10`.
- **R50 is not applied.** AMRAP still says "Nothing to enter now. Record your rounds afterwards if
  you like."
- **No task in the approved DAG applies R09 or R50.** Several tasks carry their evidence ids, but
  only TASK-037 has them as its requirement, and TASK-037 is definition-only. This is recorded as
  owner decision COPY-APPLY.
- **Applied by earlier tasks and verified from the literals:**
  - R23 (TASK-024);
  - R40 and R43 (TASK-011);
  - R70, R71 and R72 (TASK-012; R72 as `×` in the rung tiles);
  - R112 (TASK-017).
- **Inconsistencies listed as undecided:**
  - Retry vs Try again;
  - caption case (PAUSED vs Paused);
  - ending words;
  - the ladder's remaining `NOT STARTED`;
  - the remaining pacing/explanatory sentences;
  - "Clear" the verb vs the CLEAR name;
  - consequence verbs;
  - loading-word exceptions;
  - logged vs recorded;
  - Warmup vs warm-up;
  - Feeling ("How do you feel?") vs History's "Mood";
  - the optional marker on the set sheet;
  - the copy added by this body's tasks (the running summary's "Copy for TASK-037" list);
  - R50 casing;
  - the dormant numeric `BlockEffortDialog`.

## Failures and corrections

- The first run had 3 failures:
  - Two quoted strings wrap across JSX source lines. The test now also matches against
    whitespace-collapsed source, which is how JSX text renders.
  - The X-status case picked the base source when both base and repo versions of a file were cited.
    It now prefers the repo source.
  - "copy rewrite" in a Blocks: line needed "future".
- A backticked file name (`refinement-logging-contract.ts`) and an `RPE` quote cited to the router
  failed the quoted-string rule. I reworded and recited both.
- Mutation check, all reverted:
  - a temporary `src/ui/zz-mutation.ts` with `'RPE 9'`;
  - X5 flipped to "applied";
  - a misquoted title;
  - "Status: approved";
  - a misnumbered U-item.

  Each failed its case with a precise message. With the originals restored, all 9 cases pass.
- `grep` skips `src/state/load-suggestions.ts` as "binary" (macOS grep). The inventory used a
  TypeScript AST extraction and `grep -a` instead.

## Verification

- `npm ci`: OK (the worktree had no `node_modules`).
- `node scripts/refinement/run-required-check.mjs --task TASK-037 --check check-01 -- node --test scripts/refinement/task-037-definition.test.mjs`:
  PASSED, 9 total, 9 executed, 9 passed, 0 skipped.
- `node scripts/refinement/verify-definition-record.mjs --task TASK-037` with the five extra
  sections: PASSED (68 sources verified).
- `npx eslint scripts/refinement/task-037-definition.test.mjs`: 0 problems.
- `node scripts/refinement/verify-delivery-evidence.mjs --body clear-refinement-20261103 --mode final --tasks TASK-001,…,TASK-035,TASK-037`:
  PASSED. TASK-037 has current passing receipts.
- `npm run build`: exit 0. `npm run lint:ds`: exit 0. `npm test`: 269 test files, 6348 tests passed.

## Open assumptions

- Gallery fixtures (`src/dev`) and server-side generation text are not inventoried as frontend
  copy. The inventory is representative per surface; only the RPE sweep is exhaustive.
- `repo:` sources pin this revision. If a later task edits a cited file, re-running check-01 fails
  on the hash until the record is re-sourced. The receipt stays current, because its targets are
  only the test file and the manifest.

## Next action

The owner answers:

- COPY-VOICE: terms, rules and U1–U15;
- EFFORT-NUMERIC-READING: N1, N2 or N3;
- COPY-APPLY: which task applies R09 and R50.

A future copy task then cites this record and those answers.
