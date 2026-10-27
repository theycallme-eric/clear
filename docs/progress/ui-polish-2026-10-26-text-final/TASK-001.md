# TASK-001 — Shared mobile frame with 16px gutters and header page titles

Issue #521 · REQ-001 · completion-owner for JOURNEY-001 (Home).
Branch `agent-runner/task-001-a1-583168ae`, run `583168ae-c383-4e0f-9633-ef21cdfc9f13`, attempt 1.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

16px symmetric content gutters so cards and actions reach the outer edge the header's Settings
control already sits on, without moving Settings inward. Each screen's header shows the page title
instead of the repeated CLEAR logo. Page/header/footer rules stay separate from card-internal rules.
The 0.14.3 type, chamfers, atmosphere and scanlines stay with the vendored package.

## Prerequisites

- PRE-001: `git merge-base --is-ancestor 7f0a367… HEAD` passed.
- PRE-002: `src/design-system/package.json` is version 0.14.3, and nothing under `src/design-system/` is
  in the diff. A full byte comparison against the approved baseline was not run separately; the audit
  test's `PACKAGE_HASH` assertion (the first line of the failing audit test) did not fail.

## Seams and changes (local, unpublished)

| Seam | Before | After |
| --- | --- | --- |
| `src/styles/shell.css` page gutter | `--page-gutter-*: shell inset + spacing-300` (28px), `+ spacing-400` at 1440px | `--page-gutter-*: var(--shell-inset-*)`: 16px, or the safe area when that is wider, at every width. The header rule and padding are unchanged, so Settings stays put. |
| `src/app/Screen.tsx` | rendered the h1 at the top of the scrolling content; each screen rendered its own `AppHeader` with `ClearLogo` as a sibling | new optional `header` prop (`left` / `meta` / `actions` of the public `AppHeader`). When set, `Screen` renders the `AppHeader` just above `<main>` (same DOM position as before) with the h1 as its title, and leaves the h1 out of the content. `.clr-screen__content--titled-head` opens the first card 16px below the header rule. |
| `src/app/AppChrome.tsx` | route focus went to `main h1` | the h1 lookup now searches `main`'s parent too, so the header title still gets focus |
| Home, Settings, History, Generate, Review, ReviewRoute, Workout, Summary, Login, SessionDetail, LocationSettings, FormatPreview | `<AppHeader>…<ClearLogo/></AppHeader>` | `header={…}` on `Screen`, with the same actions/meta; `ClearLogo` imports removed |
| Welcome, BootSequence | logo is the h1 brand moment, no fixed header | unchanged |

The header title is the h1 the content already showed (Home "Today", Settings "Settings", Review the
workout's title, and so on), so no copy changed. The title uses the package's own h1 display type.
The only header-title CSS is `min-width: 0; overflow-wrap: anywhere`, so a long title wraps beside the
actions instead of pushing them out of the header.

New test: `src/app/app-shell-frame.test.tsx` (17 tests) covers gutters equal to the shell inset,
the unchanged header padding, symmetric content/layer gutters, header titles on six routes with no
CLEAR text in the header and one h1, page rules vs card-internal row rules, and the type, chamfer,
atmosphere and design-system version checks.

`PROJECT_MAP.md`: one sentence on `Screen` owning the fixed header and the gutter.

Nothing changed in GitHub or any external service.

## Failures and corrections

- The first `app-shell-frame` run failed one case: I had assumed the Login title was "Sign in", but
  it is "Get started" (`LOGIN_TITLE`). I fixed the test fixture; the product is unchanged.
- `npm test` fails: the `design-0143-final-audit` source-hash gate (see blocker), plus one intermittent
  failure, below.
- `src/test/goal-focus-journeys.test.tsx` journey 2 failed in 2 of 3 full-suite runs: `findByRole('radio',
  { name: 'Strength' })` hit its 1s default timeout after `/workout → /settings` (once measured at
  1307ms). In the other run it passed. Nothing in the journey touches the header or the title, and it
  navigates with `router.navigate`. This worker could not run that file alone or check it against a
  stashed baseline (both commands were refused), so I can't say yet whether this was already
  happening before my change. Not fixed; out of scope.

## Verification (2026-10-27)

| Command | Result |
| --- | --- |
| `npm test -- app-shell-frame` | pass, 17/17 |
| `npm run lint:ds` | pass |
| `npm run typecheck` | pass |
| `npm run lint` | pass, 0 errors (133 warnings, none new as errors) |
| `npm run build` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |
| `npm test` | **fail**: 2 stale-audit tests in `src/test/design-0143-final-audit.test.ts`, plus the intermittent goal-focus journey 2 (5549–5550 of 5552 pass) |

## Blocker: runtime-source-bound audit evidence

Same blocker as TASK-006 and TASK-007. Any non-test `src/` change alters the runtime-source hash
(now `02fe8910c509f8256c165b0fb7b031483137019e08fe0e73ee3bae6508156f52`). The TASK-034
format-preview AFTER records and `docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` have to name the current
hash, so they have to be recaptured with `e2e/design-0143/format-preview.spec.ts` on a committed tree
against a disposable local authenticated backend. This worker can't do that. I edited no record, hash,
lineage or audit text, because that would fabricate evidence.

## Unresolved / assumptions

- Removing the 1440px `+16px` gutter step is deliberate: the requirement is alignment with the header
  controls' edge, and the header keeps the shell inset at every width.
- Workout's header now holds the title "Workout", the elapsed timer and Abandon. On a 320px phone
  that row is tight. Section 09 (framed menu instead of the visible Abandon) belongs to another task
  and is not changed here.
- The installed-iPhone safe-area / status-bar atmosphere item in the brief is not in this task's
  acceptance criteria and was not attempted. Device proof is still required for it.

## Next safe action

The controller or an operator lane commits this diff. On that commit, it reruns the TASK-034 mobile
format-preview capture into a new group, as the TASK-006/007 recoveries did, re-derives the audit's
runtime hash and lineage, and reruns `npm test`. Separately, it checks goal-focus journey 2 against
the base commit to confirm the intermittent timeout was already happening.

## Operator recovery checkpoint

Initial native controller verification independently passed the 17 shell tests and the goal-focus
journey suite; its full-suite failure contained only the two stale source-bound audit tests. The
worker's separately observed intermittent goal-focus timeout is retained above; no unrelated test
timeout or product behavior was changed. It will be investigated if it recurs in mandatory native
recovery. No second coding attempt was launched.

The approved move of h1 into the fixed header requires browser selectors to follow the route's
unique semantic level-1 heading. Shared fixtures and direct browser assertions were adapted,
including outline/contrast/clipping checks. The active format-preview proof now proves fixed-header
heading visibility separately from the actual inner-scroller zero offset, retaining all route, Axe,
network, overflow and source/PNG checks. Evidence schema and acceptance consumer are unchanged.
83 focused evidence/harness tests, typecheck and diff checks passed. The vendored design-system
diff is empty. The actual browser recapture and all native recovery checks remain pending here.

## Actual operator browser proof

Foreground capture65087 returned exit0: all four mobile skin cases/eight phone-short captures
passed on committed source `649c02d3652529810d3481c09d82f9845e45518c`, runtime `02fe8910c509f8256c165b0fb7b031483137019e08fe0e73ee3bae6508156f52`. The new
group `docs/design/evidence-0143/task034-format-preview-ui-polish-task001` retains actual records/PNGs and unchanged-format input provenance. Its payload
SHA256 is `ca5b1b370b43a8166b536accbb283024a542530bcb3b65fb32d37e18c543b641`; the existing consumer will verify it independently. Prior groups remain
unchanged. Clear phone and mono short images were visually inspected: the title is in the fixed
header, page/card edges align at the 16px gutter, and the inner scroll view remains usable. Zero
generation or preview writes were observed; no deployed/device claim. Full native recovery remains
pending; the source issue and PR are not delivered yet.

The unchanged actual audit consumer independently passed all38 checks on the new group; its actual payload digest matches provenance. Owned local backend stop30113 returned exit0. Native full recovery remains the next gate.

## Journey-test recovery correction

First native recovery97465 failed only journey2; all source-bound audit failures were resolved.
The test navigated Settings after waiting only for acceptance, before the asynchronous Start
handoff/Workout navigation and focus-mode blocker had settled. The same helper and Review.start
sequence exist at tested basea0e2374. The first focused correction (await complete Workout arrival)
exposed the existing intentional blocker deterministically; it still failed rather than masking it.
The final test now waits for actual Workout route/title, attempts Settings, asserts the existing
Abandon workout? confirmation while still on Workout, confirms the synthetic session's abandon,
and only then checks Settings Strength and all original no-profile-write assertions. Product
behavior, timeouts and checks are unchanged; this strengthens the real journey. All7 focused
journey tests passed in10546. The change is test-only and excluded by the existing runtime source
hash/capture driver fingerprint, so genuine source649c02d captures remain current. Another native
recovery is justified by this concrete test-flow correction; no model/attempt reset.
