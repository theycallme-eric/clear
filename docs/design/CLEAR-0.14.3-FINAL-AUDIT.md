# CLEAR Design System 0.14.3 — Final Application Audit

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
| Runtime source hash of this audit's tree | `1ca975b89bb94885a153c66b72e59886a23176dd5ffd9ea8770aa3256f00834a` (audited at `a8838839392987358ad668cf0a3f6c6fde193a8fb226674823107cef36feedf9`, plus TASK-029, TASK-001, TASK-037, TASK-002, TASK-003, TASK-018, TASK-019, TASK-022, TASK-024, TASK-026, TASK-004, TASK-006, TASK-007, TASK-025, TASK-008, TASK-009, TASK-010, TASK-011, TASK-015, TASK-023, TASK-027, TASK-017, TASK-038, TASK-012 and TASK-013 changes below) |
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

- Combined TASK-012/current-main tree: `6b8661ac…` adds the preserved Home/Generate-prefill
  changes to protected-merged TASK-038 main `5d392c0`. Both candidate histories above remain
  intact, not represented as one linear sequence. Historical pictures remain historical;
  combined-tree task/project verification and independent exact-head acceptance are required.

- `6b8661ac…` to `1ca975b8…`: TASK-013 (REQ-008, JOURNEY-013, U21/U44) limits Home's Favorites
  tab to a three-row preview with a quiet full-list link past that limit, and keeps the selected
  tab and the full-list view as search params so a return to Home retains both. Recent-workout
  rows on Home and History share one hierarchy — title with its status, then day and focus, then
  requested minutes, actual minutes when recorded, and intensity — and long titles wrap inside the
  row. Zero, one, at-limit and more-than-limit favorites, and long-name, status and duration
  contexts, are owned by the Home and History suites. This changes Home and the shared history
  row; the historical pictures remain bound to their original trees (EX-13), not to this runtime.

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
