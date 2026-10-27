# TASK-012 — Movement countdowns and the global session clock

Issue #532 · REQ-014 · role: completion-owner for JOURNEY-011.
Task-owned progress record; it stands in for the shared daily journal for this task.

## Outcome intended

Give a timed prescription (a hollow-body hold) its own countdown with Start / Pause / Reset on its
movement's card. Keep the countdown separate from the larger elapsed session clock in name, direction
and size. Draw it with the session clock's timer vocabulary and add no double frame or bar. In the
final five seconds, show the low-time treatment and a screen-edge urgency cue, both still under
reduced motion, with no new flashing. Expiry records no result.

## Baseline, as found (HEAD `cabb0d2`, contains `7f0a367`)

- No movement countdown existed. A `modality: 'time'` prescription showed its target only, and the
  athlete had to count against the header's `GlobalTimer` ("Session time", counts up).
- No screen-edge urgency cue existed anywhere in `src/`. The brief says to "preserve" it, but the
  product had none, so this task introduces it narrowly. It is scoped to this countdown and built
  only from shipped parts.
- `GlobalTimer` (EXC-03) hand-drew the shipped timer card. Inside a card it became an element
  frame. `TimerDisplay` cannot be used inside the block card: it always draws its own card and bar.

## What changed (local, unpublished)

- `src/state/movement-countdown.ts` (new) is the countdown state. It banks the remaining
  milliseconds plus a wall-clock start, as rest does. A pause, a resume and a sleeping phone all read
  correctly, and the hook re-reads on `visibilitychange` / `focus` / `pageshow`. It does no writes.
- `src/ui/workout-chrome.tsx`: the EXC-03 markup is extracted into an exported `TimerFrame`. It is
  card-aware: inside a card it is an element frame with no bar, and outside one it is the timer card
  with one bar. It takes the low role and an optional pulse loop. `GlobalTimer` now renders through
  it, and its output is unchanged.
- `src/ui/movement-countdown.tsx` + `.css` (new) are the region "<movement> countdown". It has a timer
  named "Countdown" drawn at `--label-md-size` (the session clock is `--label-lg-size`), spoken as
  "N seconds left", with Start/Pause and Reset buttons.
  - In the final 5 s the frame goes `clr-chamfer--timer-low`, the bleed goes `--border-timer-low`,
    and the shipped `.clr-pulse-micro` runs as the view's one `urgent` loop. A polite status line
    says "Final 5 seconds".
  - While running in the final 5 s, an aria-hidden fixed edge (`.clr-countdown-edge`) is portalled
    to `body`. It is an inset rule in `--border-timer-low` plus the low surface, and it uses the same
    shipped pulse. The CSS has no keyframes, animation, transition or opacity of its own.
  - Under reduced motion the loop is `still` and both stay drawn: this is the static alternative.
  - When paused, the frame keeps the low colour but shows no edge and no pulse. At expiry it shows
    `00:00`, "Countdown done" and a disabled Start. Nothing is logged.
- `src/ui/set-logger.tsx`: when `modality === 'time'` with a fixed or range target, the card draws
  `MovementCountdown`, after the rest note and before the saved rows. This applies in standard,
  superset and circuit blocks. It is keyed by set number, so after Log set the next set gets its own
  prescribed seconds. It lives on the card, not in the sheet, so opening or minimizing the sheet does
  not move it.
- Gallery: `MovementCountdown` is framed in two states: standalone, and on a card.
  `TimerFrame` is exempted with its reason recorded.
- EXC-03 bookkeeping: the ledger row and the production guard's reason now name `TimerFrame`
  (GlobalTimer + MovementCountdown). The guard is still pinned to the same single file.
- Tests (new): `src/state/movement-countdown.test.ts` (5) and `src/app/movement-countdown.test.tsx`
  (11). Both run through the real route tree on a synthetic double: no personal data, no backend.
- Nothing changed in GitHub or any external service. `src/design-system/` is untouched (empty diff).

## Failures and corrections

- The first full run had 3 failures. (1) Gallery coverage: the new `src/ui` exports needed a
  specimen or a recorded exemption. Then the gallery's multi-state rule needed a second specimen,
  so the on-card state was added. (2, 3) Two `design-0143-final-audit` checks failed. See the
  blocker below.
- Discrimination checks, each reverted afterwards: forcing `low = false` failed 2 of 16. Drawing the
  countdown only while the sheet is open failed 8 of 16.

## Verification

| Command | Result |
| --- | --- |
| `npm test -- movement-countdown` | pass, 2 files / 16 tests |
| `npm test` | **fail**: 2 tests, both in `src/test/design-0143-final-audit.test.ts` (blocker below); every other file passes |
| `npm run lint:ds` | pass |
| `npm run build` | pass (existing >500 kB chunk advisory only) |
| `npm run lint` | pass, 0 errors (140 warnings; the 2 new ones are gallery specimen functions, the same `only-export-components` pattern every specimen has) |
| `npm run typecheck` | pass |
| `npm run gen:types -- --check` | pass, types current |
| `python3 scripts/gen-issues.py --check` | pass (71 requirements, 136 edges) |

## Blocker: runtime-source-bound audit evidence

TASK-006, TASK-007, TASK-009 and TASK-011 hit this same blocker. Any runtime change in `src/` changes
the runtime-source hash, which is now `03cefd21…`. The TASK-034 format-preview AFTER records and
`docs/design/CLEAR-0.14.3-FINAL-AUDIT.md` must name that hash. Refreshing them requires committing
the tree and genuinely re-capturing the four-skin mobile format-preview group against a disposable
authenticated backend. This worker cannot do that. No record, hash or audit text was edited, because
that would fabricate evidence. Reverting the feature would turn the suite green but leave every
acceptance criterion unmet.

## Assumptions / open points

- "Preserve the screen-edge urgency cue": no such cue existed on the base. It is implemented as
  described above, narrowly scoped, with no new keyframe.
- A per-movement countdown is drawn for every time-modality prescription that has a fixed or range
  target. That includes circuit and superset movements. Sequence (ladder) targets get none.
- The countdown is component state. Leaving the section or reloading resets it to ready. Nothing
  persists, and nothing is recorded.

## Next safe action

Controller: commit this tree, re-capture the format-preview group the way TASK-009/011 did, update
the audit from those artifacts, then rerun the full verification set.
