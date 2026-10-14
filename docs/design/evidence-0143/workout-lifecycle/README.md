# CLEAR 0.14.3 — workout lifecycle evidence (TASK-036, #382)

The AFTER record for Review, every enabled Workout renderer with its rest, timers and coaching,
and Summary with its debrief, on the installed 0.14.3 package. It is deterministic local
evidence: genuine auth and real rows for a disposable namespaced user, workouts persisted from the
existing prescription fixtures through `persist_session`, and scoped synthetic 503s on one
boundary at a time. It is not live generation proof and not deployed proof, and every record
says so.

| Path | Holds |
| ---- | ----- |
| `manifest.json` | Derived index: identity, cases, viewport/skin matrix, every state's before and after pictures, dispositions, observations |
| `records/<project>--<case>.json` | One passing case in one project: its captures, containment/timer/motion/keyboard/contract observations and generation counts |
| `screenshots/` | The pictures the records name, at CSS scale |

`e2e/design-0143/workout-lifecycle.spec.ts` produces all of it. A case writes its record and
pictures the first time it passes and leaves them alone afterwards, so a later verification run
asserts the same behaviour without rebinding committed pictures to a different tree. To
extend coverage, add a distinct owned case/variant and retain the earlier records and pictures.
Do not delete or relabel the saved first-pass evidence. Current native verification and exact
deployed proof are separate obligations, not inferred from this saved index.

## Identity

- Package `clear-design-system` 0.14.3, hash `e09aa5df…22864a1a8`.
- Runtime source hash `8157cfd3…ff9749e70`: `main` at `4a5e512`, unchanged. This task changed
  no route or renderer; every record names the same source hash.
- Tested deployment: the wrapper's owned local Vite server (the port differs per run). No
  deployed origin was exercised.

## Coverage

418 pictures from 18 saved passing case records: the original `review`, `structures`,
`recovery`, `summary`, plus additive `responsive` and `review-boundaries`, in each of
`mobile`, `tablet`, `desktop`. The derived index records phone 163, tablet 114, desktop 114,
short phone (390x320) 27; skin `clear` 211 and `vapour`, `signal`, `mono` 69 each. All 418
pictures name TASK-040's BEFORE picture of the same state. The original 12 records/206 pictures
remain byte-identical. The additional cases were proved in focused diagnostic invocations;
the original full native verification and independent acceptance are not claimed by these
saved passing records alone.

The additive representative pass covers Review, all seven enabled renderers, urgent/reduced
motion and Summary across all four skins at each original width. Short-phone Review/Standard/
Ladder/Summary actions and Favorite retry are also captured in every skin. This is original
required representative coverage, not every combination of state, skin and viewport.

All 35 baseline states TASK-001 recorded for these screens are accounted for: 33 are pictured
and 2 are current source dispositions with no rendered claim:

- Review `swap-confirmation` / `swap-failure`: Review renders no swap control in the current
  source. Swap lives on the Workout exercise card and is pictured there
  (`active-standard-superset-circuit`, variant `swap-options`).

The original Review records' Favorite loading/error source dispositions remain as historical
record context. They are superseded for current rendered coverage by `review-boundaries`:
actual Summary Save as favorite → Home Favorites Start → Review holds/fails the real history
read, retries, and confirms Completed once plus the stored completion counter of 1. Start
remains available and no generation is dispatched. The missing-location fixture also follows
History Restart → confirmed Regenerate → the existing Generate form without a model request.

The renderers pictured are the seven enabled dispatches: Standard, Superset, Circuit, EMOM,
AMRAP, plain For Time and Ladder.

## What is measured, not just pictured

- **Containment.** In every Review, Workout and Summary state, no `.clr-card` sits inside
  another, every field, label and legend is inside a card body, and no framed element is
  rounded.
- **Review.** There are seven section cards plus the overview. A collapsed section has
  `aria-expanded="false"`. Start and Regenerate are pinned outside the scroller. The load
  suggestion is the public `TextAction`: a real button with the chevron and a 40px or larger
  target. It is reached by Tab with `:focus-visible` and opens its dialog on Enter. The anchor
  behind it comes from the app's own `deriveAnchors`, run over the real `anchor_evidence` read and
  stored through `set_load_anchors`.
- **Review actions.** Regenerate asks first. Confirming discards the briefing and starts a
  generation, which is held in the browser and never forwarded. Cancel lands on "Nothing to
  review". A failed Start keeps the briefing behind its blocking dialog. Start lands on
  `/workout`.
- **Timers.** Session time, rest, EMOM/AMRAP (`TimerDisplay`) and For Time are all labelled
  `role="timer"`, none is inside an `aria-live` ancestor, and none sits in more than one card.
  Their digits cross colour over `0.4s` in `steps(4)`. In the low state the timer dims on
  `clr-micro-pulse`, a 4s two-step pulse to an opacity of 0.8, with no box-shadow. The digits'
  text-shadow is the package's global `body` emission and nothing added.
- **Timing.** Playwright's clock was paused at two points six seconds apart. Session time
  advanced by 6 and the rest counted down by 6. EMOM read 40s and then 8s at +20s and +52s, and
  For Time read 45s at +45s.
- **One loop.** With coaching loading beside an urgent rest, only the rest holds `data-loop="run"`
  and the loading region is stilled but still busy. Under reduced motion the urgent rest keeps
  its words, digits and low colours, and no animation runs.
- **Coaching.** Cues, regression and the note field share one card, with their labels inside.
- **Workout semantics.** A logged set reads back as one database row. A sustained set-sync
  failure keeps the set on the device behind one factual notice, and the retry leaves exactly one
  row. Re-entry resumes the same session with the same `started_at`. A failed completion or
  abandon leaves the session `active`. Finish completes it and lands on Summary; abandon marks it
  `abandoned` and lands Home. On the 390x320 short phone, Finish workout sits inside the
  viewport, which executes the containment condition TASK-040 recorded.
- **Summary.** Duration and Streak are each their own small card. The mood choice and notes share
  one debrief card. Save and close is pinned outside the scroller. Worn/Flat/Ready/Peak draw the
  public Frown/Meh/Smile/SmilePlus exactly: the mouth path is compared with the vendored
  `icons.tsx`, with one path and three circles. SmilePlus has no plus, and no app source defines a
  face of its own. Mood is a keyboard radio group. Save writes mood 5 and the notes to the
  completed row, and reopening Summary reads them back.

## Discrepancies recorded, not changed

- No generic pause exists. A rest is extended or skipped, and timed blocks start and finish.
  "Paused" is evidenced as the clock held at exact points, not as a pause control.
- The original located regeneration fixture is retained. The additive `review-boundaries`
  case now pictures the existing missing-location fallback to `/generate` in all skins/widths.
- In the `recovery` case, the queued set is resent either by Try now or by the queue's own retry,
  whichever comes first once the fault is lifted. The spec now records which one ran. The
  committed `recovery` records predate that note: they come from the first passing run, in
  which Try now was clicked. A later run where the queue's own retry won the race is why the
  step tolerates both.
- The atmosphere's endless loops and an active timer's pulse are still running at capture. They
  are listed per picture under `matrix.stillMovingAtCapture`. Entrances and state changes are
  waited out before every picture.
