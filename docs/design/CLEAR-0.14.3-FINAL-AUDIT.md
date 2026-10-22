# CLEAR Design System 0.14.3 — Final Application Audit

## Current scope — owner decision 2026-10-22

CLEAR and its CLEAR-specific design-system compositions are mobile-only. Future
verification explicitly selects `--project=mobile`, retaining normal390×844,
short390×320 and narrow320×568 phone behavior, touch, keyboard and accessibility.
The existing protected `Preview E2E (mobile + desktop)` identifier is unchanged;
its label does not authorize a wider-device run. All functional/security checks,
exact-head proof, independent review and protected delivery gates remain.

The wider-device numbers and commands below are retained historical provenance,
not instructions to recapture them. The Task034 twelve-case/sixteen-PNG group at
`docs/design/evidence-0143/task034-format-preview/` is preserved byte-for-byte
from `eb61b9daf21848c2727eaa6fa2c5e203f4effd7b` (29 files, sorted path/byte-hash
manifest `1e0edab78fc87e6ddc10d8a3b21873179723a3a3adca449d20ddb171470ec48e`).
No former failure becomes a pass when a viewport leaves current scope.

Current Task034 capture acceptance is a **new**, separately scoped group at
`docs/design/evidence-0143/task034-format-preview-mobile/`: four actual mobile
skin cases and eight unique phone/short PNG cells. The same real-session,
no-generation/no-write, route/Back, accessibility, motion/layout, pixel/byte and
source/driver identity predicates remain mandatory. New mobile captures and
native exact-head verification are pending; no old picture is rebound.

**Status:** the three route evidence groups are complete and aggregated here. Local same-source
proof is executed by the protected wrapper on the committed head. Exact deployed proof and owner
acceptance are open; see [Exact deployed proof](#exact-deployed-proof) and
`docs/design/CLEAR-0.14.3-OWNER-QA.md`.
**Authority:** CLEAR Design System 0.14.3, vendored at `src/design-system/`, and the owner
component authority. Current specs: `docs/specs/design/ATOMIC.md`,
`docs/design/CLEAR-0.14.3-RECONCILIATION-LEDGER.md`.
**Tracking issue:** #373 (TASK-027). REQ-003, REQ-004, REQ-005, REQ-006, REQ-009, REQ-011,
REQ-014, REQ-030, REQ-031.

This document creates no capture, harness or screen change. It aggregates what TASK-034, TASK-035
and TASK-036 recorded, names the identities each picture is bound to, maps every cross-route
criterion to the lane that proves it, and lists every exception. Its numbers are held to the
committed manifests, records and picture bytes by `src/test/design-0143-final-audit.test.ts`; an
audit that drifts from them fails the unit suite.

## Identities

| Identity | Value |
| --- | --- |
| Package | `clear-design-system` 0.14.3 |
| Package hash (all 63 records and this tree) | `e09aa5dfaf7a5e9536e9ffd7b8a00624e38c7702d484dc1e820153e22864a1a8` |
| Runtime source hash of this audit's tree | `718ed686c533fb00082ed23516ff8603ccabc79df905a8ff942e656d2c1a79c0` (audited at `a8838839392987358ad668cf0a3f6c6fde193a8fb226674823107cef36feedf9`, plus TASK-029, TASK-001, TASK-037, TASK-002, TASK-003, TASK-018, TASK-019, TASK-022, TASK-024, TASK-026, TASK-004, TASK-006, TASK-007, TASK-025, TASK-008, TASK-009, TASK-010, TASK-011, TASK-015, TASK-023, TASK-027, TASK-017, TASK-038, TASK-012, TASK-028, TASK-013, TASK-039, TASK-032, TASK-014, TASK-020, TASK-021, TASK-033 and TASK-034 changes below) |
| Application base of this audit | `main` at `cb333caf53c86e28b65f688e556d6f6cb6228b72` (TASK-026, #434) |
| Tested deployment of every picture | the wrapper's owned local Vite server (`http://127.0.0.1:<port>`); no deployed origin |

Each group was captured on an earlier tree and is not rebound to this head. The hashes are the
binding; the commit is what was checked out when the pictures were taken.

| Group | Application commit at capture | Runtime source hash at capture |
| --- | --- | --- |
| `entry-forms` | `3c8490c33876abef43b9595be7ac9198ae36e474` | `40094592ceed8a18f41ba82864c4194922febaeea76655d79fcc75ea342fef24` (`3c8490c` plus TASK-034's Onboarding and Generate corrections) |
| `collections-settings` | `4a5e512ffe96fae223a205c72284021d627dbcca` (original 15 records); `10e9b806d955d53efae85cd87b968c5476bdce4b` (additive 6) | `8157cfd3e33ce7e9ad3aaa91994e45072f02cd15adfd2864a17b2adff9749e70` |
| `workout-lifecycle` | `4a5e512ffe96fae223a205c72284021d627dbcca` | `8157cfd3e33ce7e9ad3aaa91994e45072f02cd15adfd2864a17b2adff9749e70` |

Runtime source (`index.html` and `src/` less the vendor, tests and gallery) between the capture
trees and this head, from `git diff`:

- `8157cfd3…` (`4a5e512`) to this head: only `src/app/Home.tsx`, TASK-026's `.clr-hit` target on
  the Home header Settings link.
- entry-forms' tree to `4a5e512`: TASK-034's own Generate and Onboarding corrections (already in
  its hash), then TASK-030/021/022 changes to `src/app/Summary.tsx`, `src/ui/amrap-block.tsx`,
  `src/ui/circuit-block.tsx` and `src/ui/exercise-swap.tsx`. None renders on an entry route; all
  are pictured by workout-lifecycle at `4a5e512`.
- `a8838839…` (the audited head) to `0afa5587…`: TASK-029 makes block-completion effort optional
  in `src/state/block-completion.ts`, `src/state/block-completion-provider.tsx` and
  `src/data/workout.ts`. No markup, style or copy changed, and the effort dialog flow is the same,
  so no picture is affected.
- `0afa5587…` to `bc2c65d7…`: TASK-001 (REQ-001) repairs the shared phone shell in
  `src/styles/shell.css` and `src/ui/composition.tsx`, and sizes equivalent footer actions alike in
  `src/app/Login.tsx`, `src/app/Onboarding.tsx` and `src/app/Review.tsx`. This **does** change
  rendering on every route: full-width header, band and pinned-action rules, card-width row
  rules, a header rule, full-width button surfaces, and equal footer action heights. The pictures
  above predate it and are not rebound (EX-13); `e2e/contained-shell.spec.ts` measures the
  repaired geometry on this head.
- `bc2c65d7…` to `faf1f323…`: TASK-037 carries an existing rule's supported rep
  increase through `src/state/load-suggestions.ts` and Review's data handoff. Review
  displays the same adjusted target it accepts; no markup/control or timer is added.
  This can change prescribed rep text for eligible historical data. Earlier pictures
  remain bound to their capture trees and are not rebound or claimed as new proof.
- `faf1f323…` to `c38914a7…`: TASK-002 (REQ-001, JOURNEY-002) applies one spacing rhythm,
  the enlarged data-label tier, count/unit binding, in-card `ActionGroup`s and concise empty
  states through `src/styles/shell.css`, `src/ui/composition.tsx`, `src/ui/history-list.tsx`
  and the Home, History, Settings and Generate routes. This **does** change rendering and
  copy on those routes. The pictures above predate it and are not rebound (EX-13);
  `e2e/design-0143/accessibility.spec.ts` and `e2e/app-shell.spec.ts` measure the JOURNEY-002
  geometry on this head.
- `c38914a7…` to `3a1c044e…`: TASK-003 (REQ-001, JOURNEY-003, U12) draws rest days in the
  skin's information role (the per-skin `--*-toast-info` tokens, which Mono re-points to its
  structure rung) and trained days in the existing completed (selection) role, each with its
  own glyph, through `src/ui/week-strip.tsx`; Summary's streak now renders through the same
  strip. Today's doubled border no longer recolours a finished today. This **does** change
  rendering on Home and Summary. The pictures above predate it and are not rebound (EX-13);
  `e2e/design-0143/accessibility.spec.ts` measures the JOURNEY-003 roles in every skin on
  this head.
- `3a1c044e…` to `43f30eb3…`: TASK-018 (REQ-010, JOURNEY-017, U31) removes the generated
  workout overview and section introductions from Review through `src/state/review.ts` and
  `src/app/Review.tsx`; Workout, History and Session Detail already rendered neither. Labels,
  block notes, coaching cues and all structured work are unchanged, and legacy prose stays in
  the data. This **does** change rendering on Review for workouts that carried prose. The
  pictures above predate it and are not rebound (EX-13).
- `43f30eb3…` to `8042672f…`: TASK-019 (REQ-011, JOURNEY-018, U11/U32/U33) labels sections
  by type (`sectionTypeLabel` in `src/state/onboarding.ts`) in Review, Workout and the
  favorite progression measures instead of the generated `section_title`, which stays in the
  data; Review frames supersets, circuits and timed structures as numbered groups with the
  round count in the badge and the shared rest beside it, drops the bare `STANDARD` badge,
  and moves tempo into a collapsed per-section `Tempo` detail. This **does** change
  rendering on Review and Workout. The pictures above predate it and are not rebound
  (EX-13).
- `8042672f…` to `480fcdc6…`: TASK-022 (REQ-013, JOURNEY-021, U39) makes the Workout
  footer's Next section / Finish workout the one forward action: it saves every block in the
  open section as an explicit `block_results` completion with its observed outcome and a
  `null` effort, then continues or finishes, and a failed save stays on the section with a
  retry. The per-block Complete / Record buttons and the effort dialog (with its
  like-for-like comparison) are gone from Workout; renderers report outcomes through
  `src/ui/block-completion-control.tsx`, which says `Block saved` once saved. Changed:
  `src/app/Workout.tsx`, `src/state/block-completion.ts`,
  `src/state/block-completion-provider.tsx`, `src/ui/block-completion-control.tsx`,
  `src/ui/block-renderers-frame.tsx` and the AMRAP, circuit, EMOM and For Time renderers'
  completion labels. This **does** change rendering on Workout. The pictures above predate it
  and are not rebound (EX-13).

  The TASK-022 recovery also makes forward progression wait for the existing durable
  set-log queue, joining an in-flight save and retaining the same ids on retry. Confirmed
  block rows drive section progress without changing measured work or exercise statuses;
  restoration reads them through the existing active-session `asPerformed` reader. The
  initial circuit counter is not saved as a measured zero. Additional runtime changes are
  `src/state/set-logging.ts`, `src/state/set-logging-provider.tsx` and
  `src/state/workout-progress.ts`. Current acceptance evidence is the REQ-013 component
  journey, not a rerun or rebinding of the historical effort-dialog capture cases. Individual
  format browser proof remains with those format tasks.
- `480fcdc6…` to `4a035b0a…`: TASK-024 (REQ-014, JOURNEY-023, E01) makes EMOM execution
  hands-off. The EMOM renderer no longer draws the set-entry form (with its RPE field) or
  `Minute done`; each movement states the target its scheduled minute prescribes — fixed,
  or one rung of a `target_sequence` per turn — read off the stored start against the wall
  clock, so background and refresh restore the minute, rotation, target and end-of-minute
  cue. The EMOM supplies no outcome, so its `block_results.minutes_completed` stays `null`
  rather than being filled from the timer; a stored legacy `workDoneMinute` still parses and
  is ignored. Changed: `src/state/emom.ts` and `src/ui/emom-block.tsx`. This **does** change
  rendering on Workout. The pictures above predate it and are not rebound (EX-13). Current
  acceptance evidence is `e2e/design-0143/workout-emom.spec.ts` on the mobile project and the
  EMOM renderer/state tests.
- `4a035b0a…` to `68f80dcb…`: TASK-026 (REQ-014, JOURNEY-025, U40) makes circuit execution
  hands-off. The circuit renderer shows every movement in prescribed order with its per-round
  target, the total rounds and the shared rest, and no longer walks a `Next movement` position
  or marks a movement `Now`. Recording a round is one optional secondary tap that starts the
  shared rest and can be taken back; time, rest expiry and the prescription never add a round,
  so an untouched circuit's `block_results.rounds_completed` stays `null`. Load entry is one
  quiet action per movement that opens the shared set logger for that movement only, with no
  per-movement rest. Changed: `src/ui/circuit-block.tsx`. This **does** change rendering on
  Workout. The pictures above predate it and are not rebound (EX-13). Current acceptance
  evidence is `e2e/design-0143/workout-circuit.spec.ts` on the mobile project and the circuit
  renderer tests.
- `68f80dcb…` to `62161e8d…`: TASK-004 (REQ-002, JOURNEY-004, U13, U14) gives Welcome one
  Get started entry for new and returning accounts, inside the one card under the wordmark, with
  the wordmark and card centred as one group (`Screen centered`, `justify-content: safe center`,
  so a short height or enlarged text scrolls instead of clipping). Welcome no longer pins a
  footer. `/login` is titled `Get started` with no create-account mode (an old `?mode=create`
  link renders the same screen); the code step names the address and puts an inline
  `Change email` action beside it in the card, which returns focus to the kept address; the
  footer `Use a different email` action is gone. The wrong- and expired-code sentences now name
  Resend as the recovery. Changed: `src/app/Welcome.tsx`, `src/app/Login.tsx`,
  `src/app/Screen.tsx`, `src/data/otp.ts`, `src/styles/shell.css`. This **does** change
  rendering on Welcome and OTP Login. The pictures above predate it and are not rebound (EX-13).
  Current acceptance evidence is `e2e/auth-otp.spec.ts` on the mobile project and
  `src/app/Welcome.test.tsx` / `src/app/Login.test.tsx`.
- `62161e8d…` to `2abda6c0…`: TASK-004 protected preview found two of five Welcome
  action-frame sample points unclickable on phone/tablet. Its new in-card entry was inside
  the retained `clr-boot` transform. The card/action are now stationary; only the decorative
  line uses the same shipped boot vocabulary. The single-card/single-entry composition is
  unchanged. A new structural regression fails on the prior tree; the existing U04 hit
  samples and three-row stagger assertions are retained. Local phone checks pass; fresh
  exact-head protected CI remains required to confirm the platform-specific correction.
- `2abda6c0…` to `79423cfd…`: TASK-006 (REQ-004, JOURNEY-006, U10, U16) replaces onboarding's
  goal-step section checkboxes with a read-only preview: a captioned plain list of the chosen
  goal's sections (no control, nothing focusable) that follows a goal change, with one line
  saying a workout may leave an enabled section out and that Settings edits them. Onboarding
  commits the goal's sections unchanged; equipment and Settings' section toggles stay
  editable. Changed: `src/app/Onboarding.tsx`, `src/state/onboarding.ts`. This **does** change
  rendering on Onboarding's goal step. The pictures above predate it and are not rebound
  (EX-13). Current acceptance evidence is `src/app/Onboarding.test.tsx` and
  `src/test/generation-reliability/legal-state-matrix.test.ts`.
- `79423cfd…` to `ac446d93…`: TASK-007 (REQ-005, JOURNEY-007, U15, U23) removes the tier
  selection and tier label from Locations: a new place opens with nothing ticked (starter
  presets stay in onboarding), an edited place keeps its stored tier as metadata, and the saved
  ticks remain what candidate retrieval reads. Each place card shows its name as the only
  identity, leads its framed action row with Edit and puts a quiet Delete beneath it; the editor
  says what saving does. Writes and rollback are unchanged. Changed:
  `src/app/LocationSettings.tsx`, `src/state/locations.ts`. This **does** change rendering on
  `/settings/locations`. The pictures above predate it and are not rebound (EX-13). Current
  acceptance evidence is `src/app/LocationSettings.test.tsx`, `src/state/locations.test.ts`
  and `e2e/settings-locations.spec.ts`.
- `4a035b0a…` to `483047f8…`: TASK-025 (REQ-014, JOURNEY-024, E02) makes the AMRAP window
  hands-off. The round counter is no longer drawn while the clock runs; once the window
  closes the athlete may record rounds and a partial round or leave both blank. Blank rounds
  are `null` in the stored state and in `block_results.rounds_completed`, distinct from an
  entered zero, and never block the forward action. The completed state shows the score
  and the like-for-like comparison from `conditioning_history` only where an identical
  piece was scored; no round goal or expected-round range is drawn. A stored record with a
  numeric round count still restores. Changed: `src/state/amrap.ts`,
  `src/state/workout-persistence.ts` (the AMRAP record guard admits `null` rounds) and
  `src/ui/amrap-block.tsx`. This **does** change rendering on Workout. The pictures above
  predate it and are not rebound (EX-13). Current acceptance evidence is
  `e2e/design-0143/workout-amrap.spec.ts` on the mobile project and the AMRAP
  renderer/state and conditioning tests.

- Current merged Task025 tree: runtime `16f9d543e6b44bdcb1594d4f2adaba555ff7d028f9cd6051bc6d48a1ef1ea333`. The normal current-base reconciliation conflicted only in this audit and the journal; both histories are retained. App changes are the already-approved AMRAP task plus current main. Fresh full native checks and criterion evidence remain required.
- `16f9d543…` to `34b94f96…`: TASK-008 (REQ-006, JOURNEY-008, U18, E05) replaces Home's
  text Settings link with the package's framed icon-only `IconButton` (accessible name
  "Settings", package focus ring and target) and gives Settings a header Back. Back returns
  to the previous in-app screen, or replaces Settings with Home when Settings is the first
  entry the app wrote (direct visit, installed-PWA launch). Locations' way back returns to
  the Settings entry it was opened from, or replaces itself with Settings when opened from
  elsewhere, so Settings' Back is never trapped between the two. Changed: `src/app/Home.tsx`,
  `src/app/Settings.tsx`, `src/app/LocationSettings.tsx` and `src/state/settings.ts`. This
  **does** change rendering on Home and Settings headers. The pictures above predate it and
  are not rebound (EX-13). Current acceptance evidence is `src/app/Settings.test.tsx`,
  `e2e/settings-locations.spec.ts` and `e2e/app-shell.spec.ts` on the mobile project.
- `34b94f96…` to `cb8988b2…`: TASK-009 (REQ-005, JOURNEY-009, U17) gives limitations durable
  wording: Onboarding's step asks "Any ongoing limitations?", both Onboarding and Settings say
  limitations apply to every workout until changed, and the note's placeholder no longer
  implies a few weeks. The note's guidance says it is context only once a movement is ticked,
  and to tick a movement first while none is — the note is stored on the pattern rows, so
  Settings no longer reports "Saved" for a note with nowhere to persist, and unticking the last
  movement clears the note with it. Pattern ticks remain the hard exclusions candidate
  retrieval reads through `constraints_in_force`. Changed: `src/app/Onboarding.tsx`,
  `src/app/Settings.tsx` and `src/state/onboarding.ts`. This **does** change rendering on
  Onboarding's limitations step and Settings' Limitations card. The pictures above predate it
  and are not rebound (EX-13). Current acceptance evidence is `src/app/Settings.test.tsx`,
  `src/app/Onboarding.test.tsx` and `src/data/constraints.test.ts`.
- `cb8988b2…` to `1e68491d…`: TASK-010 (REQ-006, JOURNEY-010, U24) offers explicit skins only.
  The System option is gone from the Settings skin picker, and the OS contrast preference no
  longer selects a skin: the `index.html` head bootstrap applies the stored explicit choice or
  the product default (`clear`), and no longer calls `skin.js`'s `initSkin`, which resolved and
  followed `prefers-contrast`. An unset or legacy `system` preference resolves to the default;
  Mono stays an explicit "enhanced contrast" choice. Changed: `index.html`,
  `src/state/appearance.ts`, and comments in `src/ui/appearance-picker.tsx`,
  `src/app/Settings.tsx`, `src/app/favicon.ts` and `src/main.tsx`. This **does** change rendering on Settings' Appearance card and, for a user whose
  OS asks for more contrast with no stored choice, on every route (CLEAR instead of Mono). The
  `appearance-system-or-skin` pictures above predate it and are not rebound (EX-13). Current
  acceptance evidence is `src/state/appearance.test.ts`, `src/app/Settings.test.tsx` and
  `e2e/settings-appearance.spec.ts` on the mobile project.
- `1e68491d…` to `56a3b8df…`: TASK-011 (REQ-007, JOURNEY-011, U25) repairs the rest-day
  reason control in Home's week card. The prompt is shortened to "Not training today?" and a
  marked day reads "Today: <reason>."; the trigger carries a glyph and is a disclosure
  (`aria-expanded`/`aria-controls`) that moves focus into the native picker, and Save, Cancel
  or Escape return focus to it. Cancel is now a framed secondary action, and the pair uses the
  new `.clr-action-group--paired` modifier: two equal halves of one row, or two full rows when
  a label does not fit its half. The control also stays mounted on its last day while a save
  refetches the marks, so focus and the saved status are not dropped. Changed:
  `src/app/Home.tsx` and `src/styles/shell.css`. This **does** change rendering of Home's
  week card; the Home pictures above predate it and are not rebound (EX-13). Current
  acceptance evidence is `src/app/Home.test.tsx` and the post-import REQ-007 case in
  `e2e/design-0143/task-040-home-review.spec.ts` on the mobile project. That case is
  desktop-engine phone emulation; a real phone's native picker is a separate manual check.
- `56a3b8df…` to `3e197ecd…`: TASK-015 (REQ-009, JOURNEY-015, U26/U28/U29) shortens
  Generate's copy. The goal reads "Goal: <label>" without its description; the first-workout
  guidance ("First workout: choose a starting focus.") shows only with no completed history and
  no anchor chosen, and stale history gets no helper line. The time field's unit is spelled
  "minutes"; the place and notes helpers and the notes placeholder are shorter. A Recovery
  draft says "A lighter workout, for today only." beside a shorter Power refusal; the recovery
  goal, 1–3 range and refused Power are unchanged. Changed: `src/app/Generate.tsx` and
  `src/state/generation-form.ts`. This **does** change rendering of Generate's form card; the
  Generate pictures above predate it and are not rebound (EX-13). Current acceptance evidence
  is `src/app/Generate.test.tsx` and `src/state/generation-form.test.ts`.
- `3e197ecd…` to `8c3c0b5c…`: TASK-023 (REQ-013, JOURNEY-022, U34/U35) removes Workout's
  separate "Sections" card. The active section's header card now carries its name, the
  "Section n / N · status" line, the session progress bar, its structure badges and an "All
  sections" disclosure. The jump list behind it starts collapsed, is `inert` while collapsed,
  and collapses again after a jump. Previous, Next and a jump move focus to the opened
  section's heading; a restored section leaves focus to the route. None of these saves anything
  or reads the session clock. Primary source review additionally proved and fixed reselecting
  the already-open section: focus leaves the now-inert list for that same heading without
  changing section position or recording work. Changed: `src/app/Workout.tsx` and `src/ui/workout-chrome.tsx`.
  This **does** change rendering on Workout; the Workout pictures above predate it and are not
  rebound (EX-13). Current acceptance evidence is `src/app/Workout.test.tsx`,
  `src/ui/workout-chrome.test.tsx` and `src/state/workout-progress.test.ts`.

- `3e197ecd…` to `5d0fb72b…`: TASK-027 (REQ-015, JOURNEY-026, U36) removes the set logger's
  RPE field and `Warmup set` checkbox. Strength and superset sets take only weight and the
  prescribed measure, both optional. The set writer sends `rpe: null`; warm-up classification,
  the nullable columns and historical values are kept. Changed: `src/ui/set-logger.tsx`,
  `src/state/set-logging.ts` and `src/state/set-log-queue.ts`, with restoration notes in
  `docs/specs/generation/OPTIONAL_FEEDBACK_RESTORATION.md`. This **does** change rendering of
  the workout's set-entry form; the Workout pictures above predate it and are not rebound
  (EX-13). Current acceptance evidence is the logger, superset, set-logging, provider and queue
  tests together with `src/app/Workout.test.tsx`.

- `5d0fb72b…` to `8b6b6284…`: the TASK-027 Codex review-authored correction adds a compact native
  per-set Unit choice and preserves an observed weight's own unit on resume. The provider strips
  the typed UI override before queuing one canonical unit; retries never rederive it from profile.
  Logger/provider/queue tests include the actual next write, zero/null references and unchanged
  numbers on explicit relabel. This changes the workout form; existing pictures remain historical
  (EX-13). Fresh native exact-head verification and independent review are still required.

- Combined current-main tree: `8c3c0b5c…` to `b6fbe7c5…` adds the corrected TASK-027 logging flow to protected-merged TASK-023 main `730190c`. The two candidate histories above are preserved, not represented as a single linear sequence. Existing pictures remain historical (EX-13); fresh combined-head native task/project verification, criterion evidence and independent delivery review are required.

- `b6fbe7c5…` to `9e1b78b4…`: TASK-017 (REQ-009, JOURNEY-016, U27) makes intensity one requested
  1–10 choice for every goal. The slider no longer narrows to the goal's range; the hint states the
  goal's range and, when the choice is outside it, the number the workout is composed at
  ("Recovery works at 1 to 3, so 7 is composed as 3."). The requested number is carried unchanged
  through the request; §2.2's table moved to `src/state/intensity.ts` and is applied downstream
  as the effective intensity (prompt 5.2.1). Changed: `src/app/Generate.tsx`,
  `src/state/generation-form.ts`, `src/state/intensity.ts`. This **does** change rendering of
  Generate's intensity control; the Generate pictures above predate it and are not rebound (EX-13).
  Current acceptance evidence is `src/app/Generate.test.tsx`, `src/state/generation-form.test.ts`,
  `src/test/generation-prompt.test.ts`, `src/test/generation-validation.test.ts` and the two
  generation-reliability matrix suites.

- `9e1b78b4…` to `91995231…`: TASK-028 (REQ-015, JOURNEY-027, U37/U38) moves exercise swaps to
  Review. The active workout mounts no swap provider and its set-logger and EMOM rows draw no swap
  or undo control; Review's rows offer one, reading `generation_candidate_sets` for the
  composition's user, focus and location and narrowing to the slot's section and away from
  movements already in the workout. A swap changes only the movement and equipment of the
  in-memory composition (and clears that row's load override); Start persists it, and undo
  returns to the composed movement. The catalog coaching panel attributes its cues and regression
  to the exercise library and states blank cues/regressions as answers. Changed:
  `src/app/Review.tsx`, `src/app/Workout.tsx`, `src/state/swap.ts`, `src/state/swap-provider.tsx`,
  `src/state/swap-context.ts`, `src/state/review.ts`, `src/ui/exercise-swap.tsx`,
  `src/ui/exercise-coaching.tsx`, `src/ui/set-logger.tsx`, `src/ui/emom-block.tsx`. This **does**
  change rendering of Review rows and workout movement rows; the pictures above predate it and are
  not rebound (EX-13). Current acceptance evidence is `src/app/Review.test.tsx`,
  `src/app/Workout.test.tsx` and `src/ui/exercise-coaching.test.tsx`.

- `91995231…` to `ea109c62…`: Task028's review-authored eligibility correction replaces the
  app-wide swap-alternatives cache with fresh disclosure-owned reads and selects the existing
  goal-scoped retrieval using the workout's goal, retaining legacy null-goal behavior. Exact-head
  author unit evidence is in `src/data/candidates.test.ts` and `src/app/Review.test.tsx`; no rendered
  evidence is rebound. Independent review and full native verification remain separate gates.

- `9e1b78b4…` to `0c1ffb63…`: TASK-012 (REQ-007, U19/U20, JOURNEY-012) keeps the weekly strip,
  streak and history, removes the repeated weekly count, and replaces immediate Quick Start plus
  Use this/Dismiss with one next-workout entry. Its pinned action opens Generate with prior
  request minutes and a still-owned place; the current standing Goal, recommendation, requested
  intensity and explicit Recovery choice remain Generate's. Opening the form makes no generation
  call. First-use, sparse, stale, recovery, changed-goal and missing-place checks are owned by the
  Home, session-suggestion and Generate suites. The mobile Home-to-Generate case is explicitly
  selected alongside the existing Review and rest-day cases. This changes Home and Generate;
  the historical pictures remain bound to their original trees (EX-13), not to this runtime.

- `9e1b78b4…` to `ed68fef0…`: TASK-038 (REQ-018, E03) adds the optional block-level
  `ladder_timing` boundary — `scheduled_starts`, free-paced `for_time` and `capped_window`, with
  variable round count and interval length — to `src/state/schemas.ts`, and an edge gate in
  `supabase/functions/_shared/validate.ts` that refuses it in generated output until TASK-039 and
  TASK-032. Legacy payloads parse unchanged. No prompt, persistence, duration, dispatch or renderer
  change; this does **not** change rendering of any route. Current acceptance evidence is
  `src/state/schemas.test.ts` and `src/test/generation-validation.test.ts`.

- `ed68fef0…` to `8ff175a2…`: TASK-038 independent review correction. The inactive generation gate
  also rejects an explicit null timing key, keeping generated blocks inside old strict 4.1.0 readers'
  closed key space. The owner's clarification makes `capped_window` one whole-ladder/block cap equal
  to the block clock, separate from the unchanged global session timer, not a per-round cap. Added
  null-key, closed-wire-key, cap consistency and multi-sequence/fixed-companion regressions; the
  focused schema/backend command passes 193 tests. No renderer, persistence, prompt or clock module
  is changed, and no historical picture is rebound to this head.

- Combined Task028/Task038 tree: `2cdfb3e4…`, after merging actual main `5d392c0` into the
  local Task028 candidate. Both histories above are retained; the shared vendor is unchanged.
  The digest labels current source only, not fresh browser or deployed evidence.

- `2cdfb3e4…` to `364f7814…`: the disclosure-owned read also retains its signed-in user identity,
  so an old user's pending/read result cannot be displayed under another user. Current runtime
  proof remains separate from historical rendered evidence.

- Combined TASK-012/current-main tree: `6b8661ac…` adds the preserved Home/Generate-prefill
  changes to protected-merged TASK-038 main `5d392c0`. Both candidate histories above remain
  intact, not represented as one linear sequence. Historical pictures remain historical;
  combined-tree task/project verification and independent exact-head acceptance are required.

- `6b8661ac…` to `55450010…`: TASK-039 (REQ-018, E03) persists and restores explicit ladder
  timing. Migration `20261021000025_ladder_timing_persistence.sql` adds nullable
  `workout_blocks.ladder_timing` with a shape check and has `persist_session` write it;
  `src/data/database.types.ts` follows from the existing generator, and `workoutBlockRowSchema`
  in `src/state/schemas.ts` reads it back instead of stripping it. The generation gate stays
  closed, and no prompt, duration, dispatch, renderer or global-clock code changed. This does
  **not** change rendering of any route. Current acceptance evidence is
  `src/test/generation-hydration.test.ts`, `src/test/generation-persistence.test.ts` and
  `src/state/workout-persistence.test.ts`.
  Codex's bounded cleanup restored TASK-038's readonly contract and shared factories exactly,
  placed catalog choices in a TASK-039-only fixture, and retained the latest-definition guard
  for all four location functions. These are offline source/unit results, not an applied live
  migration, enabled generation format, new rendered capture or native delivery acknowledgement.
  Subsequent independent review found the new SQL shape CHECK lacked the unchanged reader's
  safe-integer ceilings. Its rounds/interval/cap bounds now match `z.int()`; boundary, overflow,
  null and strict-key fixtures bind an offline transcription to the SQL text. PostgreSQL was
  not executed, and the browser runtime digest is unchanged by this migration/test correction.

- `6b8661ac…` to `6f681250…`: TASK-013 (REQ-008, JOURNEY-013, U21/U44) retains Home's existing
  full Favorites list and keeps its selected tab in the URL, including a real return from Review.
  The conditional preview-limit requirement has no baseline preview cap to expose; no arbitrary
  cap or redundant Show-all/Show-fewer controls are introduced. Same-screen query/state updates
  retain tab focus and page scroll; actual pathname arrivals still focus and announce the screen.
  The earlier `1ca975b8…` worker candidate was held before delivery for its contradictory cap and
  tab-focus regression, not accepted merely because its old-head checks were green. Recent-workout
  rows on Home and History share one hierarchy — title with its status, then day and focus, then
  requested minutes, actual minutes when recorded, and intensity — and long titles wrap inside the
  row. Zero, one and many favorites, real back-navigation, and long-name, status and duration
  contexts, are owned by the Home and History suites. This changes Home and the shared history
  row; the historical pictures remain bound to their original trees (EX-13), not to this runtime.

- Combined TASK-013/protected-main TASK-028 tree: `de268781a6fbdcbaba976f54c5097340b07ee49cb98751777e6d935042749d42`
  preserves corrected TASK-013 runtime `6f681250…` and delivered TASK-028/TASK-012 runtime
  `ff6001a0…` after merging actual main `dbe1d7c00c18366dc7340d05457957356f730e22` into
  corrected local Task013 source `a226dbf`. The two complete audit and journal histories are
  retained. Only their shared documentation conflicted; Task013's owned source and test bytes
  are unchanged. This is an integration binding, not new native acceptance, a picture rebind,
  deployed proof or owner UAT. Original full task/project checks and fresh criterion evidence
  remain required on the new committed candidate.

- Combined TASK-039/protected TASK-028 and TASK-013 main tree:
  `971bf55f8ce46dd900b2c413120a605a7bbe1572b6ccbf5d1a06b50d5fe239cb` preserves the
  frozen TASK-039 source `eeb5538` plus actual protected main `d52f5834`. Only shared audit and
  journal text conflicted; both full histories are preserved and no product/test behavior was
  rewritten. This is a local source integration binding, not native verification, an applied
  PostgreSQL migration, deployed proof, a new capture or owner UAT. Full original native checks,
  fresh criterion evidence and independent exact-head review remain required before delivery.

- `971bf55f…` to `2e2009f5…`: TASK-032 (REQ-018, E03) closes the ladder timing contract. Prompt
  `5.3.0` and its mirrored `PROMPT_v4.md` ask for `ladder_timing`; the contract moves to `4.2.0`
  with `4.1.0` still registered in `SNAPSHOT_SCHEMAS`; the existing edge gate is explicitly enabled
  with its original refusal branch/error invariant retained. Duration reads
  the timing's own clock, `src/state/ladder.ts` precomputes each round's target, companions and
  scheduled start (never a free-paced round from elapsed time), `BlockProgress` carries the stored
  timing, and `blockRendererFor` sends a timed ladder under any timed structure to `LadderBlock`.
  Changed runtime: `src/state/ladder.ts`, `src/state/workout-progress.ts`, `src/state/schemas.ts`,
  `src/ui/block-renderers.tsx`. This changes which renderer draws a timed ladder under `emom` or
  `amrap`; legacy blocks dispatch and render unchanged, and per-mode visible behavior is TASK-033.
  The pictures remain historical (EX-13). Current acceptance evidence is `src/state/ladder.test.ts`,
  `src/test/generation-validation.test.ts`, `src/test/generation-duration.test.ts`,
  `src/test/generation-prompt.test.ts` and `src/ui/block-renderers.test.tsx`.
  Independent diagnosis held the failed worker's partial for removing the coordinated gate and
  leaving an existing section-swap consumer unbound to the new timing. The bounded correction
  restores the original refusal logic with only its constant enabled, preserves shared fixtures,
  and — after explicit owner approval — includes original timing in the existing swap directive
  and compares mode/rounds/interval/cap by value before the existing exercise-only persistence.
  Offline single/unit no-persist regressions reproduce and reject the mismatch. No endpoint, RPC,
  provider lifecycle, persistence or global-clock behavior is redesigned. This backend/test change
  does not move the browser-source digest; native exact-head evidence and delivery remain separate.

- `971bf55f…` to `ff9d8937341f4155b406837cef014b16f4225150844a4f90f08039153f1de122`: TASK-014
  (REQ-008, JOURNEY-014, U22) gives the shared save-as-favorite control on Summary and Session
  Detail a quiet Remove from favorites action once saved. It uses the Favorites tab's existing
  semantics — the same `favorites.remove` hard delete behind the same critical confirmation, now
  one shared `RemoveFavoriteDialog` that Home also renders — and cancelling changes nothing. On
  success the favorites cache drops the row and that favorite's progression cache is invalidated;
  history caches and the session row are not touched. A delete already in flight blocks a second
  one, and a failed delete is reported in place with the favorite still saved. The Summary and
  History suites own the cancel, remove, repeated-press, failure and still-in-history cases. The
  historical pictures remain bound to their original trees (EX-13), not to this runtime.

- `ff9d8937…` to `a1a55d157896cd61c50c5e82071cd78d1c2f012b59e9f7ecd4675cad8f52a44b`:
  TASK-014 acceptance review found stale shared-list writes after deferred save/remove and a
  Home removal path that retained the deleted favorite's progression cache. `FavoriteToggle`
  now reads the current public query-cache state at mutation settlement; if that list is not
  ready, it invalidates for the real reader instead of inventing an empty/partial list. Home
  invalidates the same favorite-runs key on successful removal. Confirmation, failure/retry,
  in-flight protection, sessions/history, markup and Task013 navigation remain unchanged.
  New component regressions use the real route tree for deferred Summary removal across Home
  removal and Session Detail save, the reverse deferred-save settlement, and Review Back → Home
  remove → Forward. These are offline author checks, not fresh native criterion, deployed,
  PostgreSQL or owner proof. Historical pictures and the prior7ada native receipt are not rebound.

- `a1a55d15…` to `fcf5eadf81c4a443d634a34378d84a2e226342af8f29d2aca414130636d877f5`: TASK-020
  (REQ-012, JOURNEY-019, U41/U42) recomposes Summary's results. The session title now heads the
  result card as a display-face h2 (`--heading-h2-size`, wrapping anywhere for long titles), and
  the shared favorite control renders compact, so "favorite" is said once before saving and once
  (status plus its way back) after. Duration and Streak stay two small cards in the metric grid
  with one enlarged display-face value size (`--heading-h4-size`); a duration nothing could measure
  keeps its card as a dash with spoken words instead of disappearing. The streak's loading and
  error stay in its card. The squeezed trailing seven-day strip is replaced by Home's own week —
  `weekStrip` over the shared history read with HOME-02's marks, drawn by the shared `WeekStrip` —
  in its own card with four states, so a day trained before a broken run keeps its tick and a
  marked rest day keeps its reason. Copy that e2e specs pin (`<title>, done.`, the empty-streak
  sentence) is unchanged. The Summary suite owns these cases; these are offline author checks, not
  fresh native criterion, deployed or owner proof. Historical pictures are not rebound.

- Combined TASK-032/protected TASK-014 main tree:
  `d85a9f691aac904df57cf930a8f9eb6f200934b4923cebb6c9ba75f09916b273` preserves frozen
  TASK-032 source `2e2b086` plus actual protected main `b9adb2a5`. Only the shared audit and daily
  journal conflicted; both complete histories are preserved. No runtime or test behavior was
  rewritten during integration. The historical captures and earlier single-branch test results
  are not rebound. Current combined-head native task/project verification, fresh criterion evidence
  and independent exact-head acceptance remain required before protected delivery.

- Combined TASK-020/protected TASK-032 main tree:
  `25779dbf09c6ffa444f2c9e3e16a1f171b4f039cb4686b2ed9aa06a509cfc387` preserves frozen
  TASK-020 source `a8b8cd0` plus actual protected main `bb777ac9`. The ordinary merge conflicted
  only in this audit's current identity/appended history and the daily journal. Both histories
  are retained; TASK-020 source/tests and all incoming TASK-032 non-documentation bytes remain
  unchanged. This is an integration source binding, not new native task/project/criterion proof,
  deployed proof or owner acceptance. All original checks require fresh execution on the final
  combined head. Historical pictures and earlier single-branch receipts are not rebound.

- TASK-033 (#468, E03/JOURNEY-029) runtime source:
  `52625dde41b9e171e6823d3f2d2d279050e7cb46a8f4e2942e4f0f86beb4e9b6` on base `90287c6`. Only
  `src/ui/ladder-block.tsx` changed at runtime: ladders with explicit `ladder_timing` render
  precomputed rounds (start offsets for scheduled starts, per-round rung targets, fixed companion
  work), a wall-clock-restored schedule countdown for `scheduled_starts` only, no clock-driven
  progress for free-paced `for_time` or `capped_window`, and the stated cap. Legacy ladders are
  unchanged; the global session clock is not read or changed. Task-local phone proof is
  `e2e/design-0143/workout-ladder.spec.ts`; historical pictures are not rebound.

- TASK-034 (#469, E06/JOURNEY-030) runtime source:
  `718ed686c533fb00082ed23516ff8603ccabc79df905a8ff942e656d2c1a79c0` on base `c31ef86`. Adds the
  protected `/settings/formats` route (`src/app/FormatPreview.tsx`), a Workout formats card in
  Settings linking to it, and exports `timingSummary`/`PACING_NOTES` from `src/ui/ladder-block.tsx`
  and `STATUS_LABELS` from `src/state/session-detail.ts` without changing them. The preview holds no
  client and reads no query; fixed format-only data is drawn through History's `SessionSectionCard`
  and read-only `LadderRungs`. It is absent from the router and independent required-route
  inventory at full baseline commit `c31ef865f60811df076db396a40f90517701380e`; it therefore has
  no BEFORE preview picture. That absence is not an AFTER-coverage waiver. Its separate
  introduced-route group is `docs/design/evidence-0143/task034-format-preview/` and its actual
  canonical-top AFTER proof has12 actually passed browser cases and16 actual PNGs on
  `5b84f43b3a2b146a8cf4a564fdaddc9297bb7532`, unchanged runtime
  `718ed686c533fb00082ed23516ff8603ccabc79df905a8ff942e656d2c1a79c0`, and capture-driver
  `9771dd8282446fd9d81e344a6f31b02ccbf1688f5bbbe07dcdd07b3cd49eb72b`.
  All records retain their real capture commit/process/time/checkout identity, not this later
  evidence commit. Every cell proves actual ScrollRegion top/left0 and visible heading,
  all original accessibility/short-viewport checks, and zero generation requests or writes.
  Prior32987806 real but noncanonical-scroll captures remain outside this product as history.
  Native lint rejected the prior artifact fixture's empty destructuring. The bounded fixture
  correction retains every rule and additionally checks final Settings before recording.
  Its fresh actual matrix passed all12 cases in session22661; full lint also passed with
  zero errors before capture. The prior9fc matrix remains history outside the product,
  unchanged in Git history; it is not relabelled or mixed with this corrected-driver proof.
  `src/app/FormatPreview.test.tsx` proves no client call or `fetch` across Settings → preview →
  Back in every skin; historical pictures and their three aggregate rows remain unchanged.

  The added task-local `e2e/design-0143/format-preview.spec.ts` uses the existing real
  authenticated-session fixture, deterministic skin/motion setup and reached-state/motion
  capture driver. The exact canonical-top matrix passed with workers1/retries0, no failures
  and no skips (session22661). Its records retain actual process/time/checkout identities.
  The command was:

  ```sh
  CLEAR_TASK034_RECORD_AFTER=1 npx playwright test e2e/design-0143/format-preview.spec.ts --project=mobile --project=tablet --project=desktop --workers=1 --retries=0
  ```

  It produced all sixteen actual AFTER captures: clear/vapour/signal/mono at 390×844,
  768×1024, 1280×720 and 390×320. Each explicit CSS-scale full-page PNG retains its real pixel
  dimensions and byte hash, real route/heading/state, settled reduced-motion frame, no horizontal
  overflow, source/package/driver identity, actual capture process/time, and the real session
  journey's non-secret counts. The fixture owns only its disposable authentication/onboarding;
  the preview walk refuses data writes and generation and checks disclosures, accessibility,
  Settings entry/Back, direct-entry Back and unchanged athlete storage. Records preserve the
  actual captured source commit and dirty-status digest; a later evidence/journal commit must
  not be substituted for that identity. Runtime and capture-driver bytes are independently
  checked against this tree. No session token, email or athlete storage value is recorded.
  Every new capture has `before: null` and a source-hashed c31 route-absence disposition,
  never a baseline Not Found image. Missing trusted configuration is non-proof, not a pass.
  The strict audit now requires the complete new group, real PNG files and hashes; it remains
  held until those artifacts exist and their actual identities are recorded here. Existing
  records are never overwritten. Recording requires the explicit marker above; ordinary
  browser runs still execute every journey/capture assertion and attach their actual outcomes,
  but cannot rewrite the committed historical records. This lane is not live-generation,
  deployed or owner-UAT proof.

- `25779dbf…` to `d8be20efd31b176ed2c3bf7c0e0e86e2cf1087a122053572a0c06a28d247225d`: TASK-021
  (REQ-012, JOURNEY-020, U43) replaces Summary's five face-and-word mood chips with
  `src/ui/feeling-row.tsx`: one non-wrapping row of five evenly sized numeric options 1–5 over the
  same `ChoiceGroup` radiogroup (one tab stop, arrows, Home/End, tick on selection). Only the
  number is drawn; each option's accessible name is the number and `MOOD_SCALE`'s existing word
  ("4, Ready"), visually hidden by the shared `.a11y-hidden` utility. No answer stays the opening
  state, and a Clear control (shown only once something is chosen) returns it to `null`, which
  saves as `workout_sessions.mood = null`. Storage, the 1–5 range and HIST-01's `MoodReading` are
  unchanged; the debrief writes `mood` and `session_notes` only, never an effort field. Changed:
  `src/app/Summary.tsx`, `src/ui/feeling-row.tsx`, `src/ui/feeling-row.css`. This **does** change
  rendering of Summary's debrief card; historical pictures are not rebound (EX-13). Current
  acceptance evidence is `src/app/Summary.test.tsx`, `src/data/summary.test.ts` and the
  JOURNEY-020 case in `e2e/design-0143/accessibility.spec.ts`.

- TASK-021 later native verification event3546 genuinely failed the complete mobile
  accessibility command: 16 cases, 11 passed, 5 failed, no flaky cases or skips. JOURNEY-020
  passed; one populated-Home geometry sample found no streak count before an explicit readiness
  assertion, and four cases failed with fixture OTP verification HTTP429 before reaching UI
  assertions. The bounded correction awaits the real populated streak before retaining all
  original count/unit, containment and enlarged-text checks. It changes no runtime bytes:
  `d8be20efd31b176ed2c3bf7c0e0e86e2cf1087a122053572a0c06a28d247225d`, 183 files by the
  canonical method. The separately preserved safe failure summary remains failed evidence.
  The original focused unit command passed 55 tests and related Home/workout-chrome suites
  passed 78 tests after this correction; Typecheck and diff checks passed. No browser was rerun
  by the correction author, and neither these author checks nor the earlier green author run
  replaces fresh complete original browser/native/current-criterion proof on the committed head.
  Historical captures and all original attempts, deadlines and failure events remain unchanged.

The pictures are not rebound to this head. The original browser lane supplied the three groups'
evidence below. Later behavior changes listed above require their current acceptance evidence;
the historical captures alone do not certify those later heads.

## Aggregated AFTER evidence

| Group | Task | Records | Pictures | Phone | Tablet | Desktop | Short | Clear | Vapour | Signal | Mono | With BEFORE | Model requests forwarded |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `entry-forms` | TASK-034 | 24 | 216 | 102 | 48 | 48 | 18 | 165 | 17 | 17 | 17 | 216 | 0 |
| `collections-settings` | TASK-035 | 21 | 354 | 145 | 81 | 81 | 47 | 202 | 49 | 49 | 54 | 354 | 0 |
| `workout-lifecycle` | TASK-036 | 18 | 418 | 163 | 114 | 114 | 27 | 211 | 69 | 69 | 69 | 418 | 0 |
| **Total** | | **63** | **988** | **410** | **243** | **243** | **92** | **578** | **135** | **135** | **140** | **988** | **0** |

Phone is 390x844, tablet 768x1024, desktop 1280x720, short phone 390x320. Every picture names the
TASK-040 BEFORE picture of the same state under `docs/design/0143-intake-baseline/screenshots/`,
and every BEFORE and AFTER file still matches the SHA-256 in its record. All 63 records passed;
none is a live generation and none is deployed proof. The skin and short-phone passes are
representative, chosen where selection, severity or a pinned action is at stake, not a Cartesian
product of every state, skin and width.

Group indexes: `docs/design/evidence-0143/{entry-forms,collections-settings,workout-lifecycle}/`
(`README.md`, `manifest.json`, `records/`, `screenshots/`).

### Routes and states

| Route | Group | States pictured (BEFORE/AFTER pairs) |
| --- | --- | --- |
| Boot (all routes) | entry-forms | checking, failed read and Retry, ready, reduced-motion handoff |
| `/welcome` | entry-forms | Welcome, signed-in redirect |
| `/login` | entry-forms | Sign in and Create account, credentials, invalid and expired code, busy and disabled Send/Verify |
| `/onboarding` | entry-forms | every step, selection with ticks, kept draft, held commit, typed refusal, Retry |
| `/generate` | entry-forms | Goal and Focus, missing goal, no place, deload confirmation, selection, disabled, validation, recovery |
| Loading (in `/generate`) | entry-forms | held request, slow threshold, actionable failure, kept draft |
| `/` | collections-settings | Train today, This week, Recent and Favorites, Suggested next (Use this, Dismiss), favorites failure and Retry, active-session Resume |
| `/history` | collections-settings | empty, populated, filtered, selected, loading and error on Load older, Retry |
| `/history/:id` | collections-settings | loading, as performed, error and Retry, missing or not yours, favorite save failure |
| `/settings` | collections-settings | five sections, held save, typed refusal and rollback, reload, four skins and System under more contrast, focus |
| `/settings/locations` | collections-settings | equipment loading, error, Retry, create, rename, default, refusals, delete confirmation and delete |
| `/review` | workout-lifecycle | briefing, collapsed sections, load suggestion, Regenerate confirm and held generation, Start busy and failure, Favorites read held and failed |
| `/workout` | workout-lifecycle | Standard, Superset, Circuit, EMOM, AMRAP, For Time, Ladder; rest, urgent rest, timers, coaching, swap options, set-sync failure and Retry, re-entry, finish and abandon failure |
| `/summary` | workout-lifecycle | Duration and Streak cards, debrief, four public moods, save busy, error, persisted |
| unmatched (`*`) | entry-forms | Not Found and its way back |

The manifests record 20 source dispositions with no rendered claim: 7 in entry-forms, 8 in
collections-settings and 5 in workout-lifecycle. Each names its reason and the source or mounted
test that owns the branch. Some are kept as history but superseded by later additive pictures
(Home Suggested next; Review's Favorites read held and failed), as each group's README explains.
They are summarised in EX-06.

### First use and the workout lifecycle

- **First use** — entry-forms walks a genuinely provisioned new user through Welcome, Create
  account, code entry, all five Onboarding steps and Generate, with the model request held in the
  browser. The bounded live lane walks the same path with one real generation (below).
- **Lifecycle** — workout-lifecycle persists real rows through `persist_session`, then walks
  Review, Start, every enabled renderer, logging, failures and recovery, Finish and Summary to a
  saved debrief, plus abandon to Home. collections-settings then reads those rows back on Home,
  History and Session Detail.

## Requirement coverage

| Criterion | Proved by |
| --- | --- |
| REQ-003 one Card composition; bar, body, emission follow state; one-cut geometry at every height | all three groups' containment probes (one `.clr-card` per group, 12px bar, no nested card); `src/ui/card*` unit tests; the four-skin pictures |
| REQ-004 headings inside cards; TimerDisplay, ScanLoader, EmptyState never wrapped; heading outline | workout-lifecycle timer/coaching probes; collections-settings rule sub-groups; TASK-026 `accessibility.spec.ts` (one h1, no skipped level, no block heading in `span.label`, no card in card) |
| REQ-005 stroke and text emission, 70% card ground, solid elements, body 1.25 | vendored stylesheet identified by the package hash; production drift guards in `src/test/design-system*`; rendered pictures in four skins and four widths |
| REQ-006 one breathing atmosphere | TASK-026 motion walk (one atmosphere survives navigation, blobs animate transform only); every record's `motion.running` lists `clr-drift-*` and `clr-breathe` and never a Quiet/Operational mode |
| REQ-009 TextAction and public mood glyphs | workout-lifecycle Review load suggestion (button, chevron, ≥40px, `:focus-visible`, Enter) and Summary mouth paths compared with vendored `icons.tsx`; TASK-026 header-target check |
| REQ-011 route and arrival motion | collections-settings 40ms `.clr-boot` arrival once per screen and no replay on tab change; TASK-026 interrupted forward entry cuts to back, interrupted tabs cut, reduced motion resolves at once |
| REQ-014 honest section states | loading, empty, error and Retry in every group; workout-lifecycle one loop (`data-loop="run"` only on the urgent rest, stilled loader still busy) |
| REQ-030 rendered acceptance and handoff | this document, the three indexes and `docs/design/CLEAR-0.14.3-OWNER-QA.md` |
| REQ-031 contained, sequential transition | `docs/design/0143-intake-baseline/shared-file-ownership.json`; this task edits its two documents, focused test and journal, plus the owner-approved Task027-only target selection in `playwright.config.ts` |

Keyboard and focus: Tab reach and bracket focus on selectable controls in entry-forms,
collections-settings and TASK-026; text fields own their focus. Responsive containment: one
ScrollRegion owner, no document scroll or sideways overflow, measured footer in reach at all four
sizes (TASK-026 and every group's short-phone pass).

## Local same-source proof

Two protected commands are run by the wrapper on this committed head. Their pass/fail and executed
counts are recorded in `docs/journal/2026-10-15.md` and the wrapper's receipt, not here: this
document is committed before they run so that both commands prove its exact head.

| Lane | Command | What it proves |
| --- | --- | --- |
| Deterministic integration | `execution-support.py browser --grep-invert 'live generation\|core loop:'` | current 0.14.3 applicable mobile-project coverage under the owner phone-only direction, executed in exact-case small batches through the reviewed original/actual command binding: the three evidence specs re-assert behaviour without rebinding pictures, plus accessibility, reduced motion, shell, viewport and route checks. Historical 0.9.7 BEFORE captures remain in their original package lane; the deployed-only matrix requires a deployed origin. The shared public OTP case remains selected. |
| Bounded genuine core loop | `execution-support.py live` | `e2e/core-loop.spec.ts` only: Welcome to Home with one genuine generation per viewport selected for proof (phone only under the owner's direction), behind the fail-closed single-dispatch guard (`attempted 1, forwarded 1, blocked 0`), the release gate refusing a dirty or unrecorded head. Same-source cached mobile proof retains its original commitAtCheck and is identified as cached validation; the failed extra tablet invocation remains reported |

Recorded October15 on6b2c152: the7phone batches produced254passes and2existing inapplicable
viewport-identity skips out of256actual named rows. The genuine phone core loop passed. The
unchanged broad live helper then failed on an extra tablet invocation when the backend rejected
the generated workout with GENERATION_FAILED / generation.duration_implausible (HTTP500).
The aggregate command remains failed; the ledger retains both reserved slots and both outcomes.
The explicit phone-only direction permits selecting the existing source-bound mobile result
with fresh deterministic prerequisites; no new generation, ledger reset, helper/backend change
or final deployed/owner acceptance follows from that cache selection. Final-head original
verification and the exact deployed obligations below remain required.

The live lane is bounded by the original pessimistic phase-wide five-proof-attempt ledger the
wrapper holds outside this repository. This task does not reset, extend or widen it, and authorizes
no spending or provider-policy change. Underlying provider retries and billing remain the existing
backend contract. A skipped, refused or inconclusive live run is reported as such and never counted
as a pass. Same-source proof shows the committed source works against the E2E project; it does not
show that a deployment serves that source.

## Exact deployed proof

Not claimed. No picture, record or command in this tree exercised a deployed origin: every
manifest records `deployedProof: false` and a local `testedDeployment`.

| Signal | State |
| --- | --- |
| CI on this branch's head | not run: the branch is not pushed from this workspace |
| Production deployment identity | not yet available for this candidate; existing production predates Task027 and does not prove its final head |
| Deployed route journeys (`E2E` → `Deployed exact-head no-model journeys (mobile)`) | not run for this head |
| Deployed nine-entry matrix (`e2e/generation-deployed-matrix.spec.ts`) | not run for this head; existing model-free mobile command required against the verified deployed origin |
| Bounded real-generation release proof (`E2E` → `Paid release canary (one generation)`) | not run for this head; an explicit release-operator dispatch and the original spending/attempt bounds apply |
| Owner whole-body QA | open; `docs/design/CLEAR-0.14.3-OWNER-QA.md` |

The existing `.github/workflows/e2e.yml` has distinct jobs: `Preview E2E (mobile + desktop)` is
the protected preview check; `Deployed exact-head no-model journeys (mobile)` checks the
production deployment against `main` before walking History, locations and appearance;
`Paid release canary (one generation)` is an explicit operator-dispatched real core loop,
guarded by the requested deployment's exact `main` SHA and the deterministic release lanes.
There is no workflow named `release-e2e`. The separate existing model-free nine-entry command is
`npx playwright test e2e/generation-deployed-matrix.spec.ts --project=mobile`, against the
verified deployed target. No workflow, protection, command assertion or spending limit is changed.

This is the audit's preparation-time proof status. The final operator handoff must record the
actual deployment URL/SHA, job/run results, nine-entry matrix evidence, bounded live-proof usage
and owner QA outcome. Local proof, healthy CI and task counts do not fill those fields.

## Exception ledger

| ID | Exception | Scope | Disposition |
| --- | --- | --- | --- |
| EX-01 | The atmosphere's endless drift and breathing loops (and an active timer's pulse) are running at capture | all groups; listed per picture under `matrix.stillMovingAtCapture` | recorded; entrances and state changes are waited out before every picture |
| EX-02 | No owned route renders the package `RadioButton`; single choices are `ChoiceGroup` chips with radio semantics | entry-forms | the solid-square mark is proved on the real `Checkbox`, which shares `.clr-check__box` |
| EX-03 | No field on the entry routes is disabled or read-only in a reachable state | entry-forms | disabled is pictured on buttons and chips; the `Input` frame stays with component tests |
| EX-04 | `/dev/gallery/ds` specimens load React from a CDN and the wrapper's server does not serve them | all groups | comparison is against the vendored component source the package hash identifies |
| EX-05 | The failed boot screen mounts outside the focus-bracket layer, so Retry shows the browser focus ring | entry-forms | recorded; focus remains visible |
| EX-06 | 20 recorded source dispositions with no rendered claim (cold loads masked by Boot, guard redirects, Review swap living on Workout), some superseded by later pictures | all groups | each names its owning source or mounted test in the manifest |
| EX-07 | Right after a reload under reduced motion, Home and Settings briefly report about ten running animations that end within the poll window | collections-settings | recorded; nothing is left running |
| EX-08 | One development run stalled a footer Cancel while a refusal toast was open; inferred, not confirmed from the trace | collections-settings | the lane dismisses the toast first; the shared toast host is outside these tasks |
| EX-09 | There is no generic pause; "paused" is the clock held at exact points | workout-lifecycle | product behaviour, not a gap |
| EX-10 | The queued set is resent by Try now or by the queue's own retry, whichever runs first | workout-lifecycle | the spec records which; committed records come from a Try now run |
| EX-11 | Forced colours needed an app-layer repair (`src/styles/a11y.css`) over the vendor's bracket-mode `outline: none` | TASK-026 | kept from reproduced evidence; no vendor edit |
| EX-12 | The polite toast variant is not raised by a real route | TASK-026 | proved through Settings' polite "Saved" status and `src/ui/toast-host.test.tsx` |
| EX-13 | Pictures predate this head's runtime source (the Home Settings `.clr-hit` target) and are not rebound | all groups | the deterministic browser lane re-asserts on this head; deployed pictures are owner QA |
| EX-14 | Exact deployed proof and production identity are not yet recorded for this candidate | this task | reported open above; never waived |
| EX-15 | `/settings/formats` (follow-up TASK-034/#469, E06) is source-proven absent at `c31ef865f60811df076db396a40f90517701380e`, so no BEFORE preview image exists | TASK-034 | no coverage waiver: corrected-driver12 actual passed cases/16 real PNGs on5b84f43; prior9fc matrix retained as history; strict matrix/byte/source gate remains mandatory and owner QA step13 remains open |

## Owner QA path

`docs/design/CLEAR-0.14.3-OWNER-QA.md` is the owner's walk on the deployed application after
merge: confirm the deployment SHA, then every route and state family above in the four skins at
phone and desktop, with keyboard, reduced motion and the real core loop.

## Approved capture sampling correction — 2026-10-16

The owner authorized a one-line polling-options correction in the Task036-owned workout-lifecycle capture test as a specific Task027 blocking repair. The final-phone failure had107passes and 1 failure across 108 executed cases: its state assertions passed, then the15-second finite-animation settling wait repeatedly sampled one animation. Independent read-only review supports a sampling collision between the default one-second poll cadence and the intended100ms session-timer digit transition; the original predicate did not record that animation's name. Explicit intervals 100/250/500ms retain the same 15-second deadline and expected zero finite animations. No assertion or application timer behavior is removed or changed.

Because an e2e source byte changes, the prior cached mobile proof is not proof for this new source. Fresh exact-source phone workout proof must reserve one original phase slot before dispatch; 2 of 5 were already consumed. All original phone cases, seven project checks, independent review/current criterion proof/protected delivery, exact-deployed proof and owner UAT remain required. The historical committed capture/image bindings remain immutable; new local behavioral checks are not relabeled as new deployed captures. Results for the new source are pending and will be retained in the existing external Task027 checkpoints before any delivery claim.

## Phone proof completed; audit wording correction — 2026-10-16T07:00:13.742Z

On clean `8ef59aab28225687302ce625ca134febe8abebf2`, the original seven phone batches completed with 254 passed, 2 original inapplicable viewport skips and 0 failed/not-run cases. The formerly failing Workout recovery capture passed in this complete run. Fresh local phone core-loop proof then passed one genuine generation with expected1/unexpected0/flaky0/skipped0, bound to runtime/test/helper/backend fingerprint `07c5ae5ba4f5e7fdc60e981523219224b2d3c657bc7259ed7117c23b6eb6f996`. The original ledger retains all previous successful and failed outcomes and now has 3 of 5 pessimistic reservations. These are local source-bound outcomes; exact-deployed proof and owner acceptance remain open.

The same original recovery passed Typecheck, Lint and design-system Lint, then stopped at the full unit suite: 4624 passed and 1 failed. The failing owned audit-label assertion requires the phrase “one genuine generation per viewport”; the phone-only wording above had dropped it. The correction clarifies that this bound applies to the owner-selected proof viewport, currently phone only. No test assertion, runtime source, model policy, helper, backend or generation behaviour changed. Seed, generated-types and Build were not reached. All nine original commands remain required on the new committed documentation head. Any retained same-source phone validation must preserve the genuine proof’s original commit and counts; it is not a new generation or fresh deployed result.

Actual receipts: `TASK027_POLLING_REPAIR_PHONE_VERIFICATION_COMPLETE_ACTUAL_ACK_2026-10-16.json`, `TASK027_POLLING_REPAIR_ORIGINAL_PUBLIC_RECOVERY_COMMAND_2_2026-10-16.json`, and `TASK027_POLLING_REPAIR_ORIGINAL_PUBLIC_RECOVERY_COMMAND_6_RAW_OUTCOME_2026-10-16.json` in the existing recovery evidence directory.

- TASK-004 later CI39588516964 retained the same U04 misses despite the motion experiment. CI screenshot shows the Vercel feedback overlay overlapping the centered action. The unproven motion correction and its structural/motion-test changes were withdrawn; current runtime is restored62161e8d, with vendor unchanged. Test-only documented x-vercel-skip-toolbar header excludes preview tooling without changing any hit samples/assertions or authentication/protections. Prior failed proof is retained; new exact-head protected CI remains required.

- Combined protected-main Task012/Task028 tree: `ff6001a07e183f00fa45666fc7b02ba54b3e8145173ba231bba9b60871799baf` after normal integration of actual main `785dd64`. Both complete histories above are retained; no screenshot identity is rebound. All original task/project checks, fresh criterion receipt and independent exact-head review remain required.

## TASK-034 current phone-only proof — 2026-10-22

The owner's current CLEAR scope is mobile-only. The newly introduced format
preview has four actual passing theme cases and eight real AFTER PNGs at normal
390×844 and short 390×320 phone viewports, collected by root in session31269
with zero failed or skipped cases. The current group is
`docs/design/evidence-0143/task034-format-preview-mobile`; consumer
`task034-format-preview-mobile`, scope `mobile-only-2026-10-22`.

The genuine captured source is `91255346e557e416d13326c7c01c7545d8a48f01`,
runtime `718ed686c533fb00082ed23516ff8603ccabc79df905a8ff942e656d2c1a79c0`,
and capture driver `bfa3ccd709bc4e1647c7962cd56def7e7becfd54a659d7f9391f99d5ed09d005`.
These original identities are retained rather than rewritten to the later
evidence commit. All route/interaction, real disposable-session, accessibility,
pixel/byte, canonical-scroll and no-generation/no-workout-write predicates
remain required by the strict offline evidence gate. No BEFORE image exists for
the preview route absent from baseline c31; `before: null` remains explicit.

The former twelve-case/sixteen-PNG wider group remains byte-identical historical
evidence, not current device scope. An earlier current-phone attempt failed one
case during boot; its partial group and trace were preserved outside the product
and are not counted as this passing invocation. This is local source-bound proof,
not exact deployed proof, release acceptance or owner UAT. Full native checks,
fresh criterion validation and protected exact-head delivery remain pending.
