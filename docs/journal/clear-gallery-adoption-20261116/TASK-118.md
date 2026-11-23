# TASK-118 — Overview facts, required equipment and equipment assets on real rows (A3 task 10b, F8 part 2)

Task-owned progress note for body `clear-gallery-adoption-v2-20261120`, attempt 1, worktree branch
`v2/clear-gallery-adoption-v2-20261120/task-118-a1`, base `779618a0` (issue #744). Path per the brief's Rules
(the issue body says `…-20261113`; earlier tasks used this one).

## Intended outcome

/review's Overview facts carry their `FactKind` and Round 7's `SummaryFacts` orders and glyphs them by kind, not
word (TASK-004, TASK-AC-010B47E192B5). /history/:id's Overview draws the same composition over the record and gains
Round 7's `EquipmentSummary` built from the saved `equipment_used` (TASK-AC-BF12C17FC7BF). The equipment asset
inventory keeps its checks, and every equipment kind reads as a label beside its name in Review and Workout
(TASK-029). This task owns `src/ui/summary-facts.test.tsx` whole and creates `src/ui/movement-identity.test.tsx`
with the build's TASK-029 block only (TASK-112 adds TASK-002's). Look check for `overview` and `assets`.

## Changes

Product (gallery-owned files marked *):

- `src/ui/composition.tsx`* — `SummaryFacts` takes `facts` that carry their `FactKind` (`SummaryFactReading`)
  and orders, glyphs and sets each reading's term visibility by kind (glyph table, order and self-describing set
  moved here from Review's label-keyed tables), marked `data-overview-facts`. With children only (the overview
  state) it draws exactly as before.
- `src/app/Review.tsx`* — the Overview hands its facts with their kinds (and `movements`) to `SummaryFacts`;
  the label-keyed glyph, order and term tables are gone. Same readings drawn.
- `src/app/SessionDetail.tsx`* — the saved facts carry their kinds (Review's glyphs, order and term visibility
  over the record's own values) and the Overview card gains `EquipmentSummary` from `view.equipment` (each saved
  `equipment_used` once, bodyweight excluded) above the provenance line. The per-section equipment stays.
- `docs/design/library/refinements-2026-11-04/authority/EQUIPMENT-ICON-WANTED-LIST.md` (not gallery-owned) — the
  build's TASK-029 text carried back (verified family of 75, status in the application build, explicit follow-up),
  plus one sentence on Round 7's inline placement. `equipment-assets.ts` was already the build's.
- No `src/dev/**` change; no stylesheet change. Every equipment kind already read beside its name on Round 7
  (inline in the name element), so no product change was needed for that, and nothing was added to the /workout
  ladder summary (R132 carry-forward).

Tests: `src/ui/summary-facts.test.tsx` (new, the build's 10), `src/ui/movement-identity.test.tsx` (new, the
build's TASK-029 block of 8 and a Round 7 harness: `openReview`, `rows`, `identities`, `nameOf`,
`expectCompactEquipment`), `e2e/refinement/task-004.spec.ts` (5 cases), `e2e/refinement/task-029.spec.ts`
(13 cases), `e2e/refinement/task-118-parity.spec.ts` (new, 4). Evidence: `evidence/refinement/task-118/`
(required-cases, results, parity receipts with the base readings of both states, test-ledger), TASK-004 and
TASK-029 manifests (description; TASK-029 check-01 command now `--testNamePattern "^TASK-029 "`) and receipts.

## Failures and corrections

- The build's gallery cases read state variants (Saved, Bodyweight only) and scenes (Review, Workout, Setup)
  that Round 7's overview and assets states do not draw. Rewritten to Round 7's states; the variant reads are
  proved on the real routes (test-update rule; ledger `retiredAssertions`).
- task-029.spec: Round 7's inline label breaks across lines ("cable / machine") on Review at 320 and 390, so the
  build's "wraps as one unit" failed. No criterion of this task asks for unit wrapping and the R132 carry-forward
  says to leave the gallery's look, so the read became Round 7's inline flow (every part inside the name column,
  starting beside the name or the next line). The contrast read then hit-tested the middle of the whole box,
  between the two parts; it now reads each line box. Listed for UAT.
- Parity: `innerText` includes visually hidden terms, so Review's hidden `Anchor` showed as a line; labelled.
  The first base reading ran on an export whose `node_modules` was a symlink outside Vite's allowed root, so fonts
  were not served there and every box differed; retaken with an APFS clone of `node_modules`. The Echo backdrop's
  measured size is left out of the DOM identity; the state's element boxes are compared instead.
- Self-check restored three reads Round 7 still meets (the name's words directly before the equipment, the metric
  grid's class, the two shipped glyphs' count).

## Self-check (parser; TypeScript compiler API, every touched test file and spec, 5)

(a) Titles at the base absent at HEAD: 0 (task-004 4→4, task-029 6→6 titles as written; summary-facts,
movement-identity and the parity spec are new). Build titles not carried: 11, the TASK-002 block of
movement-identity (TASK-112's; ledger rows `deferred`).

(b) Bodies changed (body or a helper it reaches): 28 (26 with a build counterpart, 8 with a base counterpart).
Build reads not verbatim: 91; base reads not verbatim: 34 (the same e2e reads; base = build there). Each is a
Round 7 locator for the same read, a Round 7 look or wording rewrite (`rules.forTask115`), or a gallery variant
or scene Round 7's state does not draw (`rules.retiredAssertions`). `matchersWeakened: false`.

## Verification (exact)

| Command | Result |
| --- | --- |
| `npm ci` | ok |
| TASK-118 check-01 (summary-facts) | PASSED, 10/10 |
| TASK-004 check-01 (summary-facts) | PASSED, 10/10 |
| TASK-004 check-02 (with-lock) | PASSED, 5/5 |
| TASK-029 check-01 (`^TASK-029 `) | PASSED, 8/8 |
| TASK-029 check-02 (with-lock) | PASSED, 13/13 |
| TASK-118 parity (with-lock), run 1 and run 2 | PASSED, 4/4 each; receipts byte-identical; 26 capture hashes match their files |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-004,TASK-029,TASK-118` | current passing receipts for all three |
| Related suites (Review, SessionDetail, Summary, History, Home, router, composition, gallery, final audit; 15 files) | 437/437 |
| CI chain (typecheck, lint, lint:ds, gen-issues --check, gen:types --check, npm test, build, console grep), on the committed tree (only this result line was filled in after) | exit 0; lint 0 errors / 175 warnings (as base); 71 requirements, 136 edges; 278 files, 6,450/6,450; build ok |

Parity (overview, 320 and 390): Review's and the saved Overview's equipment groups and shared readings
(Intensity, Movements) match the state's element by element; the labelled differences are Review's Goal
(AC-C12-01), each view's own focus term (TASK-AC-010B47E192B5), the record's date and status in place of a
movement count (AC-C14-01, AC-R004-03), and Summary's key-number face (height only, AC-C15-01). Assets: Setup's
sixteen choices equal the inventory's kinds; Review's Required equipment draws the state's shipped Dumbbell;
every Review and Workout label is words. Gallery against the base: both states' words, DOM and element boxes are
unchanged at 320 and 390. Port 5173 free before and after each browser run. Every unit case runs well under 2 s.

Receipts: TASK-004 c01/c02, TASK-029 c01/c02, TASK-118 c01/parity rewritten. The scan of every
`required-cases.json` for a target this task changed also finds TASK-002 check-01 (movement-identity whole):
stale since the base (target absent) and still not passable until TASK-112 adds its block; left as is.

## Open assumptions

- The look differences between the composed overview state and the routes (Goal, hidden terms, Summary's
  key-number face) are Round 7's own route components, unchanged by this task except the saved Overview, which now
  draws Review's composition. Listed for UAT.
- TASK-112 (owner of AC-C03-01 "readable wrapping") may want Eric to confirm that a two-word equipment label may
  continue on the next line.

## Next action

Controller verification and review. UAT items are in the ledger's `rules.forTask115`.
