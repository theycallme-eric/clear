# TASK-007 — Generate copy removals, Goal/Focus top composition and unit-field integration

Issue #565 · REQ-005, REQ-006 · completion owner for JOURNEY-005 (Home → Generate).
Branch `agent-runner/task-007-a1-f525ca4d`, base `a7fb289` (after TASK-006 and TASK-009).
This is the task-owned progress record. For this body it stands in for the shared daily journal,
under the owner-selected task-owned exception.

## Outcome intended

B05-02: keep the Generate title on one line (02.1). Remove the "Change in Settings" link (02.3), the
Focus recommendation explanation (02.4) and the "Balanced works at 4 to 10." intensity explanation
(02.5). Show Focus beside the Goal at the top of the card (02.6), with Recovery session and Change
focus side by side beneath them (02.7). Integrate TASK-006's unit-field fit for MINUTES (02.9).
Values, behaviour, generation, prescription units and persistence do not change.

## Sources read

- Primary: `sources/source-01-DECISIONS.md`, `sources/source-02-GLOBAL-PATTERNS.md` (rows for
  unit-field fit 02.9 and paired actions 02.7), `sources/source-03-VISUAL-REFERENCE.md` (02.1–02.9).
- Image opened and viewed: `sources/source-05-B05-02-generate.jpg`, 1550×1974, SHA-256
  `9b9f3796547d20c938d89f6022775d7b57748d13ff47ce489b00b5e8603d24b7`.
- Supporting: source-12, source-13 (no preview template exists for the new Generate details),
  source-15/16 (ActionGroup, Chip, Input), source-17 (progress policy).

## Finding: the reference was captured at 430 CSS px, not 390

The phone pane is 910 reference px wide. In the reference, the card frame spans about 841 px. That
matches a 398 px card (430 minus two 16 px gutters) at a scale of 910/430. The unselected RECOVERY
SESSION chip measures about 370 px, and this build lays out the same chip at 175.8 CSS px. Both
measurements give 910/430 = 2.116. At 390 the scale would give a 158 px chip, which the shared fonts
cannot produce. So the "shown phone width" is 430 (Pro Max class). TASK-006's spec assumed 390. Its
MINUTES conclusions still hold: the defect is the word running into the frame's border, and the gutter
check does not depend on scale.

## Changes

| File | Change |
| --- | --- |
| `src/app/Generate.tsx` | Goal and Focus now share one top stack in the same `<p>`/`<strong>` treatment, with no new typography. Recovery session (Chip) and Change focus (quiet Button) are one `ActionGroup` directly beneath them whenever a recommended or overridden Focus exists. With no Focus to change (first workout, history error), Recovery stays a lone chip row. "Use the recommended focus" keeps its own single-action group, and the choices follow below. Removed: the Settings `Link` and `CHANGE_GOAL_LABEL`, `recommended.reason`, and the in-range intensity sentence. The slider has no `aria-describedby` when there is no hint. |
| `src/styles/shell.css` | `.clr-action-group > .clr-bleed > .clr-chip { flex-grow: 1; justify-content: center }`: a chip in an action group fills its cell, like the existing `.clr-bleed > .clr-btn` rule. No width, tokens only. |
| `src/app/Generate.test.tsx`, `src/test/goal-focus-journeys.test.tsx` | Assertions that relied on the removed texts now assert their absence. New tests cover the top composition, the lone Recovery variant and an in-range intensity with no explanation. |
| `e2e/ui-polish-b05-generate.spec.ts` (new) | The focused mobile browser proof described below. |

Decisions:

- **Title kept as "Generate workout".** It renders on one line at 430 and 390. The owner allowed
  "Generate" only "if we need to". Renaming would ripple through about 15 test and design-0143
  evidence files.
- **Plain `ActionGroup`, not `--paired`.** The selected chip carries the 18 px tick (194 px). The
  equal-halves paired treatment gives each half 178 px at 430, so the row would jump to two rows when
  Recovery is switched on. The plain group (also named in AC-047) keeps one row at 430 in every
  state and uses its documented fallback, a full row each, when the labels cannot fit.
- **The clamp notice is retained.** For example, "Strength works at 3 to 10, so 1 is composed as 3."
  This state does not appear in the reference. It discloses that the value sent is composed
  differently, so it is behaviour, not the in-range explanation 02.5 removes.

## Browser proof (`e2e/ui-polish-b05-generate.spec.ts`, mobile project, DSF 3)

The data is synthetic and intercepted. Any request that is not a GET to the local Vite origin or an
explicit API mock is aborted and fails the test. Writes, function calls and blocked generations are
all asserted zero. The route is entered from Home's Generate action (ENTRY-008).

- **Reference test.** Each B05-02 region is measured in the reference's pixels:
  - 02.1: the title is two rows of ink.
  - 02.3/02.4/02.5: the marked texts are drawn.
  - 02.6/02.7: Recovery sits above Focus and Change focus below it, with label rows about 100 CSS px
    apart.
  - 02.9: the right gutter is under 3 px.
- **Captures.** Taken at 430×932 (shown), 390×844 and 320×568 (narrow/short).
  - Title: DOM lines equal pixel ink rows.
  - Removals: absent, and the slider still works.
  - Card top: Goal and Focus fonts are equal and adjacent. Each control's frame fills its cell. Label
    ink rows are measured in the capture.
  - States: recommended, override with choices open, Recovery on.
  - Notes are populated above the pinned, enabled Generate action.
  - MINUTES is checked in four skins. The public Input specimens and logging's Unit Select are
    checked separately.
- **Records.** Each record holds the reference file, hash and region, the capture's sha256, the git
  head and dirty state, the viewport, state, consumer and criterion result. They are in
  `test-results/…/*.json` beside their PNGs.

| Viewport | Title lines | Recovery / Change focus | MINUTES |
| --- | --- | --- | --- |
| 430×932 (shown) | 1 (capture `70900e96…`) | one row: default `9c63777f…`, override `9ca79699…`, Recovery on `8bcbb07f…` | whole, gutter ≥ padding, all skins |
| 390×844 | 1 (`ca077b7b…`) | group fallback, a full row each (`5c54e5ee…`) | whole, all skins |
| 320×568 | **2** (`fe5b45c8…`), observed only | group fallback, a full row each | whole, all skins |

## Verification (final tree)

| Command | Result |
| --- | --- |
| `npx playwright test e2e/ui-polish-b05-generate.spec.ts --project=mobile` | 16 passed (13.5 s) |
| `npx vitest run src/app/Generate.test.tsx` | 110 passed |
| `npm test` | **exit 1**: 5837 passed, 2 failed, both in `src/test/design-0143-final-audit.test.ts` (source-bound audit; see below) |
| `npm run lint:ds` | exit 0 |
| `npm run lint` | exit 0; 0 errors, 149 warnings (pre-existing) |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0; existing chunk-size advisory |
| `npm run gen:types -- --check` | exit 0; current |
| `python3 scripts/gen-issues.py --check` | exit 0 |

During the work, the first spec runs failed for these reasons, all corrected:

- The paired row wrapped at 390.
- The URL key is `override`, not `focus`.
- The tick SVG was being counted as a text line.
- The card top had scrolled out of the clip after the notes were filled.
- The MINUTES ink-width comparison only held at the wrong 390 scale.

## Unresolved

- **Source-bound 0.14.3 audit.** This is the same failure as TASK-002/003/005/006/008/009. Clearing it
  needs the authenticated `e2e/design-0143/format-preview.spec.ts` collector on an owned backend.
  This workspace has neither, and the collector creates an auth user, which is outside this task's
  no-write boundary. No hash was written without a genuine recapture. Next safe action: the controller
  freezes this source and runs the existing recapture recovery for TASK-007, then reruns `npm test`.
- **Owner triage items:**
  - On 390 and narrower phones, Recovery session and Change focus stack (a full row each). They only
    fit side by side at the shown 430 width.
  - At 320 the title wraps. Shortening it to "Generate" (owner-permitted) would fix that.
- **Out of scope.** The empty band between the card and the pinned footer (02.8) belongs to GLOBAL-02.
- **Integration.** `origin/main` was not fetched here; integration remains with the controller.
- **Not a device result.** This is Chromium phone emulation. Physical-iPhone UAT remains pending.
