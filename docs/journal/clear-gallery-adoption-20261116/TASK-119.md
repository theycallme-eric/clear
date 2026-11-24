# TASK-119 — Generate and Review's order and Regenerate on Round 7, with the Recovery chip kept visible (A3 task 12b, F10)

Task-owned progress note for body `clear-gallery-adoption-v2-20261120`, attempt 1, worktree branch
`v2/clear-gallery-adoption-v2-20261120/task-119-a1`, base `41dc9aa7` (issue #745). Path per the brief's Rules (the issue
body says `…-20261113`; earlier tasks used this one).

## Intended outcome

The old build's TASK-024 (Generate) and TASK-023 (Review order and Regenerate) checks come back on Round 7's /generate
and /review, with one product change: owner decision 4 of 2026-11-18 ("P1. Recommendations fine.", Q-005) — with a
recommended Focus, collapsing Change focus keeps the Recovery chip, with its note, in view while Recovery is on. This
task owns `src/app/Generate.test.tsx`, `src/test/goal-focus-journeys.test.tsx`, `src/app/Review.test.tsx` and
`src/app/review-screen.test.tsx` whole (decision 3), restores the build's Focus-disclosure reads on Home's recovery case
by name filter (round-07 S4, R7-5), owns JOURNEY-023/024 and the look check for `screens` and `preparation`.

## Changes

Product (one file, gallery-owned by bec4454): `src/app/Generate.tsx` — `recoveryKept` (Round 7 presentation only): with
a recommended Focus and the choices closed, the Focus area keeps the Recovery chip row while Recovery is on (the note
above it was already drawn). Nothing else; `src/dev/**` untouched. Regenerate already followed the Cooldown guide at the
base (Review.tsx unchanged); the TASK-023 checks now prove it on Round 7.

Tests:

- `src/app/Generate.test.tsx`: the build's TASK-024 block (9), its two composition cases, its U28/R23 block (6, beside
  Round 7's own U28 block) and its REQ-005/007/008/U29 bodies, on Round 7's Goal/Focus summary
  (`.clr-v4-program-summary`; the Focus value named Change focus with the value as its text). GENERATE_TITLE,
  GENERATE_ACTION_LABEL, HOME_BACK_LABEL and FOCUS_TERM are test-local literals (Round 7 exports none). New:
  `TASK-119 — the Recovery chip stays in view (owner decision 4, 2026-11-18)` (2 cases), red on the base's Generate.tsx,
  green after.
- `src/test/goal-focus-journeys.test.tsx`: journeys 2, 5, 6 are the build's bodies (`openFocus` on Change focus).
- `src/app/Review.test.tsx`, `src/app/review-screen.test.tsx`: the build's waiting cases (REQ-001/002/003 rows, TASK-023
  placement) on Round 7's block cards, guides (by title), `.clr-timed-meta` and rows; same-title base bodies keep every
  base read (union). TASK-109's seven cross-file bodies are kept.
- `src/app/Home.test.tsx` (TASK-111's file): the recovery case regains the build's reads — the Focus control (named
  Change focus) opens closed (`aria-expanded=false`) and holds Recovery session.
- `e2e/refinement/task-023.spec.ts`, `task-024.spec.ts`: ported to Round 7 (case names unchanged); task-024's returning
  journey adds decision 4's closed-chip read. Gallery cases read Round 7's composed states.
- `e2e/refinement/task-119-parity.spec.ts` (new): /generate vs `screens` and /review vs `preparation` at 320/390, words
  and element boxes, plus the states against the base (`gallery-base-*.json`, taken on a clean export of 41dc9aa7 with
  `TASK119_BASE_READING=1`).

Evidence: `evidence/refinement/task-119/` (required-cases: check-01 declares all 249 cases of the four files, check-02
the Home case, parity 4; results; parity receipts; test-ledger). TASK-023/TASK-024 manifest descriptions now name Round
7's owners (cases unchanged). Receipts refreshed: TASK-023 c01/c02, TASK-024 c01/c02, TASK-111 c01 (Home.test.tsx
changed), TASK-119 c01/c02/parity.

## Failures and corrections

- Gallery `screens` unit case: Round 7's Focus value is wrapped in `.clr-bleed`, and its dialog's radios expose no
  aria-label; read by containment and by role/name.
- review-screen REQ-009: Round 7's prescription row is a `DIV` (build `P`); recorded as a structure rewrite.
- Review overview: Round 7's Required equipment group (TASK-118) labels itself with a `p`, so "no paragraph" became "no
  paragraph above the facts, the one `p` is the equipment label".
- task-024 e2e: a `has:` locator built from `main` resolved absolutely; built from the page instead.
- Parity: the svg `path` key and a closed confirm dialog's action row needed handling; layout intents narrowed to the keys
  that actually differ (Back glyph size, label words, footer action box, title face).
- Self-check (b) restored reads Round 7 still meets: the Focus control's exact text (3), per-card heading counts, the
  sections' heading-run count, the preparation state's exact Cooldown names (unit and e2e), the Goal term in e2e.

## Self-check (TypeScript compiler API; 8 touched test files and specs)

(a) Titles at the base absent at HEAD: 0. Build titles absent at HEAD: 0. One runtime it.each name changes with the
build's row label ("restores the recommendation on dismissing the choices" → "… with the Focus control"), in the ledger.

(b) Bodies changed: 64. Build reads not verbatim: 97 (body level; 92 file level); base reads not verbatim: 24, all in the
two e2e specs where base = build (unit files: 0). All 65 groundwork-waiting tests are present: 22 identical to the
build, 32 rewritten, 11 Round 7 base bodies that already hold every build read in Round 7 form. Each read is classified
in `test-ledger.json` (`matchersWeakenedNote`, entries, `retiredAssertions`). `matchersWeakened: false`.

## Verification (exact)

| Command | Result |
| --- | --- |
| `npm ci` | ok |
| TASK-119 check-01 (four files) | PASSED, 249/249 |
| TASK-119 check-02 (Home, name filter) | PASSED, 1 executed (42 filtered) |
| TASK-023 check-01 (`AC-021`) | PASSED, 5/5 |
| TASK-023 check-02 (with-lock) | PASSED, 5/5 |
| TASK-024 check-01 | PASSED, 129/129 |
| TASK-024 check-02 (with-lock) | PASSED, 6/6 |
| TASK-111 check-01 (Home.test.tsx changed) | PASSED, 119/119 |
| TASK-119 parity (with-lock), run 1 and run 2 | PASSED, 4/4 each; 8 receipts byte-identical; 44 capture hashes match their files |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-023,TASK-024,TASK-111,TASK-119` | PASSED |
| CI chain (typecheck, lint, lint:ds, gen-issues --check, gen:types --check, npm test, build, console grep), with-lock, on the committed HEAD 74b5fbef/5114db2d (only this result line was filled in after) | exit 0; lint 0 errors / 175 warnings (base 41dc9aa7: 0 / 175, measured on a clean export); 71 requirements, 136 edges; 279 files, 6,500/6,500; build ok |

Every case in the four files runs under 0.4 s locally; the two gallery cases carry `{ timeout: HEAVY }` (30 s) as the
build's did. Port 5173 free before and after each browser run.

## Open assumptions

- Accessibility loss, for Eric to decide at UAT: Round 7 names the Focus control "Change focus", so a screen reader no
  longer hears the current Focus value — the visible value (for example "Lower body") is not in the accessible name,
  unlike the build's "Focus: <value>" and the accepted gallery bec4454's value-named button (WCAG 2.5.3, label in
  name). The approved criterion (round-07 S4: "rewritten to Round 7's 'Change focus' naming where only the name
  differs") accepts it; Generate.tsx's name is not changed here. Ledger `rules.focusAccessibleName` and `forTask115`.
- Turning Recovery off from the closed summary removes the chip and its note together (decision 4 covers "while
  Recovery is on"); focus then falls back to the page, as the existing "Use the recommended focus" action does. UAT.
- Round 7's screens state lists Recovery as a fourth Focus choice and names its Back "Back to Home"; the route keeps R10.1
  and R10.5. Gallery-only illustration, not changed (no criterion names it); retirements listed for Eric.
- Round 7's preparation state draws no Regenerate; C50 is proved on /review only.

## Repair round 1 (2026-11-23, tests and evidence only)

The review met all 21 criteria and both journeys; two non-blocking scope items were this task's.

1. Ledger accuracy: the Focus name is now recorded as a known accessibility loss, not a wording change
   (`rules.focusAccessibleName`, `forTask115`, open assumptions above). Generate.tsx unchanged.
2. Conditional helpers: `openFocus`/`chooseRecovery` (the build's) open the choices only when closed, so where they
   replaced the base's plain Change focus click a body lost its implicit "opens closed" check. Every call in a base body
   is now preceded by an explicit read: `aria-expanded=false` before the opening call, `aria-expanded=true` before a
   second Recovery press made while the choices are open, and on a first workout the read that no Focus control
   exists. 16 bodies: Generate.test.tsx 13 (offers the same 1–10 choice; REQ-008 ×6; REQ-009 ×4 through
   `composeRecoveryOverride`; U29 ×2) and goal-focus-journeys.test.tsx 3 (journeys 2, 5, 6); 15 reads added. Round 7
   opens the choices closed on every one of these drafts, so none keeps an unexplained conditional. Listed in the
   ledger (`rules.conditionalHelpers`, the bodies' rows).
3. `forTask115`: the four carried e2e specs that look for a `/^Focus:/` button (ui-polish-b05-generate.spec.ts:195,388;
   ui-polish-home.spec.ts:298,356; design-0143/entry-forms.spec.ts:1059,1063; task-040-entry-settings.spec.ts:569,573)
   recorded as found, not caused (already failing at the base per the review; not run or changed here).

Self-check (b) recounted: titles gone 0/0; bodies changed 64 by text plus 4 through the helper; build reads not
verbatim 97, base reads 24 (e2e only); waiting tests 11 identical to the build, 43 rewritten, 11 base bodies holding
every build read. No read removed or loosened.

Repair verification:

| Command | Result |
| --- | --- |
| TASK-119 check-01 | PASSED, 249/249 |
| TASK-119 check-02 | PASSED, 1 executed (42 filtered); receipt unchanged |
| TASK-024 check-01 | PASSED, 129/129 |
| `verify-delivery-evidence --mode final --body clear-refinement-20261103 --tasks TASK-023,TASK-024,TASK-111,TASK-119` | PASSED (current passing receipts for all four) |
| `npm test` | 279 files, 6,500/6,500 passed |

No e2e spec changed, so no browser run was needed; port 5173 was not used.

## Next action

Controller verification and review.
