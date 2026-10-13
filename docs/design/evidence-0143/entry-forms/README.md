# CLEAR 0.14.3 — entry and form evidence (TASK-034, #380)

The AFTER record for boot, Welcome, sign-in, onboarding, Generate, its loading screen and the
unmatched route, on the installed 0.14.3 package. It is deterministic local evidence: genuine
auth against the E2E project, model requests held and answered in the browser. It is not live
generation proof and not deployed proof, and says so in every record.

| Path | Holds |
| ---- | ----- |
| `manifest.json` | Derived index: identity, cases, viewport/skin matrix, every state's before and after pictures, dispositions, observations |
| `records/<project>--<case>.json` | One passing case in one project: its captures, keyboard/motion/contract observations and generation counts |
| `screenshots/` | The pictures the records name, at CSS scale |

`e2e/design-0143/entry-forms.spec.ts` produces all of it. A case writes its record and pictures
the first time it passes and leaves them alone afterwards, so a later verification run asserts
the same behaviour without rebinding committed pictures to a different tree. To re-record,
delete `records/` and `screenshots/` and run the spec.

## Identity

- Package `clear-design-system` 0.14.3, hash `e09aa5df…864a1a8`.
- Runtime source hash `40094592…342fef24`: `main` at `3c8490c` plus this task's two route
  corrections below. The records name `3c8490c` as the checked-out commit because the captures
  were taken before the task's own commit existed; the source hash is what binds them.
- Tested deployment: the wrapper's owned local Vite server. No deployed origin was exercised.

## Coverage

216 pictures from 24 passing cases (8 cases in each of `mobile`, `tablet`, `desktop`):
phone 102, tablet 48, desktop 48, short phone (390x320) 18; skin `clear` 165 and `vapour`,
`signal`, `mono` 17 each. The four-skin and short-phone passes run in the phone project on the
states where selection, severity or a pinned action is at stake; they are not a Cartesian
product of every state, skin and viewport.

All 47 baseline states TASK-001 recorded for these screens are accounted for: 40 are pictured
and 7 are source dispositions with no rendered claim (four Generate cold-load branches and
Welcome's session restoring are shown by Boot instead; Loading's pending-before-stage is not a
stable hold; Loading's success hands off to Review, which the workout-lifecycle group owns).
Every picture names TASK-040's BEFORE picture of the same state. Where the before set has no
like-named variant, the state's first before picture is the reference, so a pair can differ in
viewport or skin: the before set is phone-only and mostly `clear`.

## Route corrections made by this task

- `src/app/Onboarding.tsx` no longer overrides `segments`, so the step bar is the package's
  twenty discrete segments, four lit per real step. Value, max and the "Step n of 5" label are
  unchanged.
- `src/app/Generate.tsx` passes `unit="min"` to Time available in place of the "Minutes."
  helper line, so the unit sits inside the field frame and is tied to the input by
  `aria-describedby`.

## Discrepancies recorded, not changed

- No owned route renders the package `RadioButton`: every single choice is a `ChoiceGroup` of
  chips with radio semantics. The solid-square mark is proved on the real `Checkbox`, whose
  `.clr-check__box` rule `RadioButton` shares.
- No field on these routes is disabled or read-only in a reachable state. Disabled is pictured
  on buttons and chips; the `Input` disabled/read-only frame stays with the component tests.
- The specimen cards under `/dev/gallery/ds` load React from a CDN, so they were not driven
  from this lane. Comparison is against the vendored component source and stylesheet the
  package hash identifies, measured in the rendered routes.
- On desktop the atmosphere's endless drift loops are still running at capture. They are
  listed per picture under `matrix.stillMovingAtCapture`; entrances and state changes are
  waited out before every picture.
- The failed boot screen mounts outside the root focus-bracket layer, so Retry there shows the
  browser's own focus treatment rather than brackets.
