# TASK-037 definition record: platform language and terminology audit (G20)

Task: TASK-037
Requirement: REQ-037
Body: clear-refinement-20261103
Status: definition-only
Implementation claim: none
Criteria: AC-R037-01, AC-R037-02
Issue: #664
Accepted gallery reference: eded158cfd928d382c9a9409e2c372270312741d (explicit non-gallery disposition)

## Scope

This record is the definition deliverable for the platform copy pass that R45 asks for: "Inventory
awkward/inconsistent language, terminology, action labels and state/helper messages; agree on compact
language/tone rules before applying them" [S02]. It is retained definition work under G20 [S01]. It
changes no product copy. It does five things:

- it inventories the titles, actions, states and helper messages of every route surface as they are
  written in the source at this revision [S12];
- it lists every visible use of `RPE` and keeps the numeric historical and categorical efforts apart
  under the Effort label (R09) [S02] [S08];
- it records each explicitly selected copy change with its verified status at this revision [S01]
  [S02];
- it proposes a short terminology and voice baseline, marked as a proposal [S01] [S02];
- it lists the undecided items and the exact owner decisions that remain [S02].

Every claim cites the source it rests on as `[Snn]`, and Sources binds each `Snn` to verified bytes.
`base:` means the blob at the body's integration base `03087f7`, used for files this body has not
changed. `repo:` means the file at this task's revision. `ref:accepted-gallery/` means the staged
accepted-gallery reference. Quoted strings are copied from those bytes; a template substitution is
left out of the quote.

## Sources

- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/CURRENT-REQUIREMENTS-AUTHORITY.md` sha256 `6916f4a3c2d798807792e7ff80fed684985cd5a7f8e8cb4ef651bb997d3b194c`. S01: G20 (copy/terminology/tone pass), G21 (empty states), G07 (planned or stopped work never becomes performed work).
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md` sha256 `82b1daa663ff4d8001b78e40cfaef73ecba48f71e65000e397ff34caf9698de5`. S02: R09, R23, R40, R43, R45, R50, R63, R70, R71, R72, R112 and the other groups' selected removals.
- `ref:accepted-gallery/src/dev/gallery-refinement-coverage.json` sha256 `6253aae08c731978308e700e32a32162e5299b1f74fe5a15d02239ac787e772a`. S03: the REQ-037 entry (no states, "explicit non-gallery disposition", its limit).
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/DELIVERY-CROSSWALK.md` sha256 `15a39eaa03edd816f16a4a5d6d0c0343a2c718977e66bc32b961446be35fc9f6`. S04: the REQ-037 row.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/gallery-crosswalk.md` sha256 `dda789929a52e84671ac1a2cf810567630f6d98e44199511d0d778eae3a6de36`. S05: the #664 / TASK-037 row ("not applicable to gallery") and the #665 / TASK-038 row.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md` sha256 `ab9d7ff1ccb10ec0dd6bb19c351369b0b06dde708c9f54246ae87a4a7a214a7f`. S06: session Feeling is distinct from categorical Effort.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/REUSE.md` sha256 `9f6b702c6daa40626c2ca3c47740be1862b538c72b0edfec18834aac36f8ce46`. S07: copy/content definitions stay with native tasks; gallery fixtures do not close them.
- `repo:docs/specs/LOGGING_FIELD_CONTRACT.md` sha256 `25bf03de94af58c8aac53af87ebf715f7b3b7fe150f1f6c817414cac07492048`. S08: §1 rule 3 and §4, the four stored efforts and feeling, none derived from another.
- `base:supabase/migrations/20260921000004_execution_domain.sql` sha256 `cdc028af8c6debd036e97df199ac9a47b944a9b99cebc054552f7826d33138f0`. S09: `rpe` and `perceived_effort`, each 1 to 10 or null.
- `base:supabase/migrations/20261027000027_set_effort.sql` sha256 `98ac45e92134e5433592e8f79924dd205fa90588680574a9fc5d7e6825176db9`. S10: the `set_effort` categories, stored beside and never inside `rpe`.
- `repo:supabase/migrations/20261110000029_block_result_effort.sql` sha256 `a3fa275c07e6ead54403e2abbbe25ea4bd91b7f2572942b1d8a933090053207e`. S11: MIG-A, categorical block effort beside `perceived_effort`.
- `base:src/app/router.tsx` sha256 `d74f09f450363c551dd49796328558a6d9afbef29f9b3a61abfd8bcbc3da7423`. S12: the routes.
- `base:src/app/ErrorBoundary.tsx` sha256 `ae14b25043f3284e41a374c511dc5e95dfbf656573ccd40abd91cae51b78ad9f`. S13: the display-error screen.
- `base:src/ui/view-state.tsx` sha256 `74d050a3ccabff78c14c19f861213832df6355865b7c9093f5494810ea12d8f1`. S14: the shared loading and error views.
- `base:src/app/NotFound.tsx` sha256 `fc1843b4c2b3e8aa6d153babdad1b17f5fa25c5c2551648e026f29b25f3db7bd`. S15: the unknown-route screen.
- `base:src/app/guards.tsx` sha256 `7b666f9528e60ee09b5a74e53442dbf7c9fb0b9b226ea4474cc5d174cf91cf78`. S16: the session and account guards.
- `base:src/app/Welcome.tsx` sha256 `04a29a640203a31b5d7ecef27ff670793ade1771c9269feb0fcda44f2405eda9`. S17: Welcome.
- `base:src/app/Login.tsx` sha256 `99014df73cf831f394929da64baf37493020b914b328c04569231c7ae2aa1467`. S18: sign-in.
- `repo:src/app/Onboarding.tsx` sha256 `648d6d2ab85414f28ac2f4604cedb3dba6b2a570084061e6b6367a57f626e67b`. S19: Setup.
- `base:src/app/Home.tsx` sha256 `d15265d119cfdc3af46fe1dd810fb26b08a0112ee9dcf6027caea74e7251347a`. S20: Home.
- `base:src/app/ActiveSessionPrompt.tsx` sha256 `ec19f728831cf3287071ca8d6bf699395cc6ea7dec1ef8769cc54d55d005df94`. S21: the workout-in-progress prompt.
- `base:src/ui/favorite-list.tsx` sha256 `e4634982ae44e0e7364f0133d7d86235a0fae71a7536b62e52b0153e2e0dc740`. S22: Home favorites.
- `repo:src/app/Generate.tsx` sha256 `d30bb9f342399d2c4aacd13fdc8da6072a6432373b4362fa6f54fe2887163f26`. S23: Generate at this revision.
- `base:src/ui/deload-banner.tsx` sha256 `979d2053babfb3fd7345a119ab31a293dc0c1d96843f90ce290e016e9e7da273`. S24: the deload banner.
- `base:src/state/deload.ts` sha256 `0f93e63cccda6bf08d7298336ce6ef84cc1474521ae020759622243512df27fb`. S25: deload reasons.
- `repo:src/app/Review.tsx` sha256 `2dfd4c1bd8965b649e31fe146ebaaebb59aea38bb65d3918312fc5bcd6f66424`. S26: Review.
- `base:src/app/ReviewRoute.tsx` sha256 `36535e2f066ce138e6148b2ce124c66b14cb601c88ee25ebfdf7a10b0a020578`. S27: Review's route states.
- `base:src/ui/exercise-swap.tsx` sha256 `07e6e1852a69b6dc039d4f36e71175b64f09368fc4009cecd9719f39fe061548`. S28: Swap.
- `repo:src/ui/load-suggestion.tsx` sha256 `5afbc9f602169f59ac5bc65be70db8aa0fd1e72b40c720feae9f3e0e9abcd0dc`. S29: the suggested weight and its "why this number" dialog.
- `repo:src/state/load-suggestions.ts` sha256 `1ade2ebed06d0d4f8466de5c8901ac970ee8320435da8a24849c2225712271d2`. S30: the dialog's set and effort readings.
- `base:src/state/progression.ts` sha256 `261096e9d08346eba95cbf1641eaceea0455b23a2ce31708b3c34b95872a5745`. S31: the rule reads shown as the applied rule.
- `repo:src/ui/refinements/overview.tsx` sha256 `c716b4491fe7ac42ddba69bd2d423f9436897b967d1dba0ef159b3e337c72558`. S32: Overview equipment.
- `repo:src/ui/workout-chrome.tsx` sha256 `8725f51798f1526309b4deeff4edc37c0cf632af57c41a4b6c507ee3e60acae1`. S33: the workout shell.
- `repo:src/app/Workout.tsx` sha256 `c884dc3afb8cfe9cb96859b84f8b3a59713badb51c4cd9dde99e4a1524f88586`. S34: the workout route states.
- `repo:src/ui/set-logger.tsx` sha256 `be0db9f76679ef9b9c139931a02162095fa2b139290498f354b5fe38795842df`. S35: set logging at this revision.
- `repo:src/ui/set-logging-sheet.tsx` sha256 `a2c4fec9ef32b9896267271e52cd6de3ba3ac1a58a068ba965988c83ae2b6e39`. S36: the set sheet and its confirmation title.
- `base:src/ui/set-sync-notice.tsx` sha256 `414e89956d10d2c384c8bc048256c696348c9919b3a7c6fb3ca6b9210358f164`. S37: the sync notice.
- `repo:src/ui/set-effort.tsx` sha256 `241ad4f21916ea296e6812f324b53daa36472d9fc3161a30758a48056f89a911`. S38: the three-face Effort control.
- `repo:src/ui/emom-block.tsx` sha256 `e9dbba9d59eda6dc63588371c898e240800958f60e50814e2966ab1c4ab1962a`. S39: EMOM at this revision.
- `repo:src/ui/amrap-block.tsx` sha256 `44c14ed983c2265e4969ef0bcab1df50fb8a188767bcd0e2a07199a83fb1ac17`. S40: AMRAP.
- `repo:src/ui/block-renderers-frame.tsx` sha256 `92af03a7761471a81dc043ea6a63495abfa746aa322386ee842af9dcd136bb40`. S41: the Now and Next markers.
- `repo:src/ui/for-time-block.tsx` sha256 `d487b364737ef6dfb06bc233ef07040dabe7ff4a131cf55af6be087dcf4229b1`. S42: For Time.
- `repo:src/ui/ladder-block.tsx` sha256 `ea83e8305bfca48454548be25c06e9bbf417b1ef1d03ee00ad3b681c3124df02`. S43: the ladder at this revision.
- `repo:src/ui/refinements/ladder.tsx` sha256 `4f21728452d29e58e0463a4276b2bd9c984e218f0e8d6f32da29016451b76f50`. S44: the compact ladder presentation.
- `repo:src/state/ladder.ts` sha256 `ed9ed551cde8c373d3122f2196534bd2fd68acf90e6e715e0d382e2cd3b0367b`. S45: the rung notation.
- `repo:src/ui/circuit-block.tsx` sha256 `ea380b9764afae3a44b16d07280534238f11a0bc483b8bb3d2991cff8f989742`. S46: circuits.
- `repo:src/ui/refinements/timed-result-log.tsx` sha256 `25e0e0052423f4bb6deafc2ad9c6e91a6ab9222a15525be99fbd7fe38b5e469f`. S47: the timed results log.
- `repo:src/ui/refinements/logging-overlay.tsx` sha256 `0e2c8ee2360e42fcb532c8f15e14d8ac86bcec612670dbb272535fe485e62066`. S48: the logging dialog.
- `repo:src/ui/preparation-guide.tsx` sha256 `f697c744833e6335c1caa3d022347d4e2346d4e3839fe1c04a98c4ff841ebf20`. S49: the warm-up and cooldown guide.
- `repo:src/app/Summary.tsx` sha256 `a6440aa38ee917f4c50c049f4a33ad5a998209ec0c116b631b167fcf2b23e701`. S50: Summary.
- `base:src/ui/feeling-row.tsx` sha256 `df3d9da71bf2b6211a89ce7c9244bff4edf9c572c64984f8ba37fd8e2e19a777`. S51: the session Feeling question.
- `base:src/app/FavoriteToggle.tsx` sha256 `08f5f055ce37f2fe7a3de586e8a6279332c99e333a12699309d34947d6721d83`. S52: Save as favorite.
- `repo:src/app/History.tsx` sha256 `04225641303cc5377c9104858e5367388b73591453c11d4db93241c9e22cbb42`. S53: History.
- `repo:src/state/history.ts` sha256 `eacbce2a9ce0a825a3a0f949e2a0b2ed7c1b7a0602a8e31d77c28a5090f206b8`. S54: History status and filter words.
- `repo:src/app/SessionDetail.tsx` sha256 `23db5e9b9221ccd1a51adc153f0371448caf49a940f38438b9d7085b47385274`. S55: the History detail route.
- `base:src/ui/session-detail.tsx` sha256 `5d8699ad52d6cf3b7dae1ee6720ed92b7bccdf04123b83e7ce5873bda8e7a014`. S56: the History detail block and set table.
- `repo:src/state/session-detail.ts` sha256 `07271dd91550f21dd675b384692dfc0bc58dc2ee9aa18b2ccbe9352c01eaa3dc`. S57: the History detail readings.
- `base:src/app/Settings.tsx` sha256 `e55f5ecbe56c6f03c1da56ce6164d34043dd33c8b4becdb3e232b5ebcc6225c3`. S58: Settings.
- `base:src/app/LocationSettings.tsx` sha256 `2939d5d9a8794e60dd0c15f5ea5ba971dc718baa6f951edceb0b28917d4d6c87`. S59: places and equipment.
- `repo:src/app/FormatPreview.tsx` sha256 `37f79f6bddc86c6525008a0f5340671fcf5b150e8e95a59e4a6d0c49686e7e77`. S60: the read-only format preview.
- `repo:src/ui/exercise-coaching.tsx` sha256 `abdba65a824c40c2a3d6225a12de542913e61ac50086709d27401b81dfd6c0f9`. S61: coaching and notes.
- `base:src/ui/block-effort.tsx` sha256 `b18e157bd3047649898e52ecfddda73fdea9d57e5ae95d1e67771abafde91d9d`. S62: the numeric block-effort dialog.
- `base:src/state/conditioning.ts` sha256 `254d7db113b73e89fb2600a34aaf35d9ab8149bc0d2d0ae89ef7e3276f335286`. S63: the conditioning directive reasons.
- `repo:src/data/refinement-logging-contract.ts` sha256 `bc692cc7eb8a101da9368dc3212a8cd0f16078feb723f44f62c89fd7556aec1b`. S64: the logging contract's field descriptions.
- `base:src/app/Generate.tsx` sha256 `bb8b8ccce8ffbf077fd8cb8444eb3b290934f8234d39399e1abdc8eb0218afcc`. S65: Generate at the base.
- `base:src/ui/emom-block.tsx` sha256 `2f8377a684d9d39efaeb2f5ce11f523a7df8ce504364d2762c158009a2687974`. S66: EMOM at the base.
- `base:src/ui/ladder-block.tsx` sha256 `5515b505ade2a6a3f5a157968abd6ea6110be598a74051ff60d5c1c941671045`. S67: the ladder at the base.
- `base:src/ui/set-logger.tsx` sha256 `23558fedda919b98413867528656f1af137955a7019dfff3c2ba50f8e9793dd1`. S68: set logging at the base.

## Current observations

The inventory, one item per surface. Each item quotes the surface's own titles, actions, states and
helper messages from the cited files. It is representative, not a dump of every string; the
`RPE` sweep in the next section is complete. None of it is a proposal.

- **I1** Shell, failures and guards (every route) [S13] [S14] [S15] [S16]. Titles: `Display error`,
  `Page not found`. Actions: `Reload`, `Retry`, `Return to CLEAR`, `Sign in again`, `Try again`.
  States: `Taking longer than usual`, `Request failed`, `Checking session`, `Checking your account`,
  `Your account didn’t load`, `Your session couldn’t be confirmed`. Helpers: `This screen stopped
  rendering. Your data is safe.`
- **I2** Welcome and sign-in (`/welcome`, `/login`) [S17] [S18]. Titles: `Welcome`, `Your email`,
  `Your code`. Actions: `Get started`, `Send code`, `Verify`, `Resend code`, `Change email`. States:
  `Code sent to`, `It expires in a few minutes.`, `Resend in`, `Try again in`. Helpers: `New or
  returning, enter your email and we’ll send a one-time code.`, `6–10 digits`.
- **I3** Setup (`ONBOARDING_ROUTE`) [S19] [S12]. Titles: `Set up CLEAR`, `Equipment`, `Experience`,
  `Goal`, `Work around`, `Sections this goal enables`. Actions: `Next`, `Back`, `Skip`, `Finish
  setup`, `Try again`. States: `Saving your setup`, `Your setup didn’t save`, `Not chosen`. Helpers:
  `Nothing was stored, and your answers are still here. Try again when you’re ready.`, `Change them
  later in Settings.`, `Note · optional`.
- **I4** Home (`/`) [S20] [S21] [S22]. Titles: `Today`, `This week`, `Recent workouts`, `Suggested
  next`, `Favorites`, `You have a workout in progress`, `Remove from favorites?`. Actions: `Generate
  workout`, `View history`, `Resume workout`, `Abandon it`, `Mark Rest Day`, `Save rest day`,
  `Cancel`, `Start`, `Keep it`. States: `No streak yet.`, `No favorites yet`, `No workouts yet`,
  `Rest day saved.`, `Reading your training week`, `This week didn’t load`, `The rest day wasn’t
  saved. Try again.`. Helpers: `Choose a focus and the rest is filled in.`, `Save a workout from its
  summary to start it again here.`, `is still running. Resume it, or abandon it and keep`, `Tracked
  data including completion history and personal bests will be lost.`
- **I5** Generate (`/generate`) [S23] [S24]. Titles: `Generate`, `Goal`, `Focus`, `Time available`,
  `Intensity`, `Train hard today?`, `Deload suggested`. Actions: `Generate workout`, `Use the
  recommended focus`, `Recovery session`, `Keep it easier`, `Go hard anyway`, `Open Settings`, `Add a
  place`, `Apply deload`, `Not today`. States: `Reading your history`, `Your places didn’t load`, `No
  places yet`, `Deload applied`. Helpers: `First workout: choose a starting focus.`, `Your history
  could not be read. Retry, or choose the focus for this workout.`, `Change the intensity if you
  disagree.`, `You know things it doesn’t — this is the only time it asks.`
- **I6** Review (`/review`) [S26] [S27] [S28] [S29] [S32]. Titles: `Review`, `Overview`, `Movements`,
  `Why this number`, `Required equipment`, `Discard this workout?`, `Swap movement`. Actions: `Start
  workout`, `Regenerate`, `Discard and regenerate`, `Keep it`, `Swap`, `Undo swap`, `Keep`, `Use this
  weight`, `Use the suggestion`. States: `Nothing to review`, `Finding alternatives`, `Alternatives
  didn’t load`, `Nothing else fits this slot`, `Reading load history`, `Suggested weights didn’t
  load`. Helpers: `This workout has not been saved, so nothing is lost from your history.`,
  `Everything this location can do here is already in the workout.`, `None — bodyweight only`.
- **I7** Workout shell (`/workout`) [S33] [S34]. Titles: `Workout`, `Sections`, `All sections`,
  `Abandon workout?`. Actions: `Previous`, `Next section`, `Finish workout`, `Abandon`, `Keep going`,
  `Skip rest`, `Try again`. States: `Not started`, `In progress`, `Complete`, `Loading session`, `Your
  session didn’t load`, `That didn’t save`, `Returning home`. Helpers: `Everything logged so far is
  kept. The workout stops here: it cannot be picked back up, and it does not count towards your
  streak.`
- **I8** Set logging (`/workout`) [S35] [S36] [S37] [S38]. Titles: `Logged sets`, `Extra set`,
  `Clear set`, `logged` (the `Set N logged` confirmation). Actions: `Log`, `Edit`, `Minimize`, `Save
  correction`, `Keep set`, `Clear`, `Try now`. States: `Saved`, `Saving`, `On this device only`,
  `Sets waiting to sync`, `Warmup`. Helpers: `Enter a weight of zero or more`, `Enter zero or more`,
  `Nothing is lost — they’ll be sent when the connection returns, and logging the next set still
  works.` Effort words: `Effort`, `Too hard`, `About right`, `Too easy`.
- **I9** EMOM and AMRAP (`/workout`) [S39] [S40] [S41]. Actions: `Start EMOM`, `Start AMRAP`.
  States: `PAUSED`, `FINISHED EARLY`, `COMPLETE`, `REST`, `NO CLOCK`, `MIN ${view.minute} OF
  ${view.minutes}`, `Now`, `Next`, `Paused`, `AMRAP complete`, `Cap reached`. Helpers: `Continue when
  you are ready.`, `Nothing to enter now. Record your rounds afterwards if you like.`, `As many rounds
  as possible. This block prescribes no window, so it ends when you do.`, `No window prescribed — the
  clock is yours, and it reads`.
- **I10** For Time, ladder and circuit (`/workout`) [S42] [S43] [S44] [S46]. Actions: `Start For
  Time`, `Start ladder`, `Start schedule`, `Undo finish · Resume ladder`, `Start round`, `Finish
  round`, `Take back a round`. States: `Ready`, `Racing the clock`, `Finished under cap`, `Finished`,
  `NOT STARTED`, `ON THE CLOCK`, `No rounds marked yet`, `rounds completed`, `No rounds recorded`,
  `Every prescribed round is recorded.`. Helpers: `Each round starts on the clock. Whatever is left
  of its interval is your rest.`, `Start each round when you finish the last. Nothing here moves on
  by itself — you say how far you got.`, `Any partial work belongs to round`, `The clock has run every
  scheduled round. Say how the block ended below.`
- **I11** Timed results and the preparation guide (`/workout`, `/review`) [S47] [S48] [S49]. Titles:
  `Log results`, `Rounds completed`, `Reps into the next round`, `Work completed`. Actions:
  `Complete`, `Incomplete`, `Close log`, `Start`, `Pause`, `Add`. States: `Completed in round`,
  `Weight used`, `No movements are left in this`, `Reading the`, `didn’t load`. Helpers: `At most`,
  `Enter a distance in`, `Effort · optional`, `Notes · optional`.
- **I12** Summary (`/summary`) [S50] [S51] [S52]. Titles: `Summary`, `Nice work`, `Debrief`, `How do
  you feel?`, `Streak`. Actions: `Save and close`, `Save as favorite`, `Retry`. States: `Not
  recorded`, `Through yesterday`, `That session didn’t load`, `Saved to favorites`. Helpers: `No
  streak yet. Sessions on consecutive days build one.`, `Notes · optional`.
- **I13** History and its detail (`/history`, `/history/:id`) [S53] [S54] [S55] [S56] [S57]. Titles:
  `History`, `Workout history`, `Workout`, `Overview`, `Sections`. Actions: `Show all entries`, `Load
  older workouts`, `Open history`, `Restart`, `All entries`, `Completed`, `Partial`. States: `No
  workouts yet`, `Nothing matches this filter`, `Workout not found`, `Not scored`, `No notes`, `No
  sets logged`, `Finished under the cap`, `Stopped at the cap`. Labels: `Mood`, `Effort`,
  `<HeaderCell>RPE</HeaderCell>`.
- **I14** Settings and places (`/settings`, `/settings/locations`) [S58] [S59]. Titles: `Settings`,
  `Training`, `Limitations`, `Appearance`, `Places and equipment`, `Session`, `Delete this place?`.
  Actions: `Manage places`, `Preview formats`, `Sign out`, `Add place`, `Save place`, `Make default`,
  `Edit`, `Delete`. States: `Reading your settings`, `Your settings didn’t load`, `No places yet`,
  `Default for generation`. Helpers: `Nothing recorded. Tick anything a workout should work around.`,
  `Signing out clears this device’s copy of your data.`, `Generation uses this place and the
  equipment saved with it.`, `Add where you train and what equipment is available there.`
- **I15** Format preview (`FORMAT_PREVIEW_ROUTE`) [S60] [S12]. Titles: `Workout formats`, `Strength
  formats`, `Conditioning formats`. States: `Read-only preview`, `Not scored`, `RPE 7`. Helpers:
  `Fixed examples of how each format is shown. Nothing here generates or starts a workout, logs a
  set, or changes your training.`
- **I16** Coaching and notes (`/review`, `/workout`) [S61]. Titles: `Coaching and notes`, `Cues`,
  `Regression`. Actions: `Save note`, `Try again`. States: `Note saved`, `Not saved`, `From the
  exercise library`. Helpers: `The library has no entry for this movement, so there are no cues or
  regression.`, `Your note didn’t save. It is still in the field — try again.`

## Effort and RPE

R09: "I don't want to use RPE as a front end title anywhere"; the label change does not convert legacy
numeric values into categories [S02]. These items are observations at this revision.

- **E1** Four stored values are called effort or feeling, and none is derived from another [S08]:
  per-set `effort` in the `set_effort` categories `too_hard`, `about_right`, `too_easy` [S10]; the
  historical per-set `rpe`, 1 to 10 [S09]; the historical block `perceived_effort`, 1 to 10 [S09];
  and the session `mood`, 1 to 5 [S08].
- **E2** A category is never converted into a number on the 1 to 10 scale, and the reverse is not
  done either [S10] [S11] [S08]. The current UI writes `rpe` and `perceived_effort` as null; older
  rows keep their historical numbers [S08].
- **E3** History detail labels the historical block number `Effort` and reads it with `of 10` [S56]
  [S57]. Its set table still heads the historical per-set number `<HeaderCell>RPE</HeaderCell>` and
  reads each cell as `RPE ${formatNumber(row.rpe)}` [S56] [S57]. History draws no categorical effort
  [S08].
- **E4** The deload banner says `RPE ${DELOAD_RPE_CAP} ceiling` [S24]; deload reasons say `stalled at
  RPE ${STALL_RPE}+.` and `Everything has felt like an RPE ${EFFORT_RPE} this week` [S25].
- **E5** The "why this number" dialog reads `RPE not recorded`, `No RPE recorded across` and `median
  across` for the last session [S30], and shows a rule read such as `RPE 7.5–8.5, all reps completed`
  under `Rule applied` [S31] [S29].
- **E6** The read-only format preview shows sample set values `RPE 7` and `RPE 8` [S60].
- **E7** Two `RPE` strings are not frontend copy: `DIRECTIVE_REASON` is generation input [S63], and
  the logging contract's field
  descriptions (for example `historical numeric per-set
  RPE; never written by the current UI (null)`) are contract text [S64].
- **E8** Categorical effort reads as words or faces: the legend `Effort`, the choices `Too hard`,
  `About right`, `Too easy`, the saved reading `Effort: ` [S38], and `Effort · optional` in the timed
  log [S47].
- **E9** The session question `How do you feel?` is Feeling, a different question from Effort [S51]
  [S06]; History detail labels the same value `Mood` [S55].
- **E10** `BlockEffortDialog` still holds a numeric capture, `How hard was that?` and `Record effort`
  [S62]; no current save path asks for a number (E04) [S08].

## Selected copy changes

Each explicitly selected change, with its status at this revision, read from the string literals of
the cited files. Applied changes were applied by the named earlier tasks, not by this record.

- **X1** R09, Effort not RPE [S02]. Status: not applied. `<HeaderCell>RPE</HeaderCell>` remains in
  the History set table [S56], and E4 to E6 remain. The numeric reading under Effort is decision
  EFFORT-NUMERIC-READING [S02].
- **X2** R23, Generate helpers [S02]. Status: applied (TASK-024). `Uses this place’s equipment.` and
  `Optional, today only. Ongoing limits go in Settings.` were copy at the base [S65] and are not copy
  now [S23].
- **X3** R40, EMOM captions [S02] [S01]. Status: applied (TASK-011). `NOT STARTED` and `WORK` were
  EMOM captions at the base [S66] and are not now; the minute `MIN ${view.minute} OF ${view.minutes}`
  and the `Now` and `Next` markers stay [S39] [S41].
- **X4** R43, natural-end sentence [S02]. Status: applied (TASK-011). `The clock has run every
  prescribed minute. Continue when you are ready.` was copy at the base [S66]; the log replaces it
  [S39].
- **X5** R50, running helper [S02]. Status: not applied. `Nothing to enter now. Record your rounds
  afterwards if you like.` is still copy [S40]. The requested wording is `log when complete`; its
  casing was left to this pass [S02] and G20 writes `Log when complete` [S01].
- **X6** R70, ladder suffix [S02]. Status: applied (TASK-012). `— same every round` was copy at the
  base [S67] and is not copy now [S44].
- **X7** R71, ladder instruction paragraph [S02]. Status: applied (TASK-012). `Move through the
  rounds at your own pace inside the cap.` was copy at the base [S67] and is not now [S43]. Two
  sibling pacing sentences remain (U5) [S43].
- **X8** R72, rung notation [S02]. Status: applied (TASK-012) in the live rung tiles as `${numbers} ×
  ${name}${side}` [S45] [S44]. R72 forbids a blind platform-wide removal of units [S02].
- **X9** R112, superset paragraph [S02]. Status: applied (TASK-017). `Tick each movement you
  performed. A blank field is saved as not recorded.` was copy at the base [S68] and is not now
  [S35].
- **X10** Selected removals in other decision groups (R02, R04, R08, R14, R32, R41, R47, R57) stay
  with their own groups and tasks [S02] [S07]; this record does not re-audit them.

## Terminology and voice proposal

Status: proposal. Nothing here is approved or applied. Short direct language is a first-pass
direction and this is not a finalized voice guide [S01].

- **T1** Effort. The one visible name for how hard work felt; `RPE` is never a visible title or
  label (R09) [S02]. Historical numbers keep their 1 to 10 scale and read as numbers, as History
  already reads block effort with `of 10` [S57]; categories read as their words `Too hard`, `About
  right`, `Too easy` [S38]. Neither is converted into the other [S08].
- **T2** Log. Entering performed work: `Log`, `Log results`, `Log round` [S35] [S47], and the
  requested end-of-window Log action and `log when complete` [S02].
- **T3** Save. Keeping something that is not performed work: `Save note`, `Save place`, `Save rest
  day`, `Save and close` [S61] [S59] [S20] [S50].
- **T4** Optional marker. ` · optional` after the label, as in `Notes · optional`, `Note · optional`
  and `Effort · optional` [S47] [S19].
- **T5** Loading and failure. A loading state starts `Reading`, a read failure ends `didn’t load`,
  the dominant forms today [S20] [S23] [S58].
- **T6** Feeling. The session's five-step question stays Feeling, never Effort [S06] [S08].
- **W1** Short and direct. A first pass, not a final voice [S01].
- **W2** Remove added instruction and do not replace it with a paraphrase (R71, R112) [S02] [S01].
- **W3** No filler that restates the visible work; R70's suffix read as AI-added [S02].
- **W4** Copy follows behaviour and data. A wording change never changes logging, stored values or
  their meaning (R09, R23, R50) [S02].
- **W5** Truthful states. Words never turn planned or stopped work into performed work [S01].
- **W6** Units and notation. Quantity, movement and unit meaning stay; no blind removal of units
  (R72) [S02].
- **W7** Empty states and missing coaching copy follow G21 and TASK-038, not this proposal [S01]
  [S05].

## Undecided items

Each is open: no answer is chosen here.

- **U1** Retry wording: `Retry` [S14] [S23] [S53] and `Try again` [S16] [S34] [S61] name the same
  action.
- **U2** Status caption case: `PAUSED` and `FINISHED EARLY` [S39], `ON THE CLOCK` [S43], against
  `Paused` and `Racing the clock` [S42].
- **U3** Ending words: `COMPLETE` [S39], `AMRAP complete` [S40], `Finished under cap` [S42],
  `Finished` [S43], `Finished under the cap` and `Stopped at the cap` [S57].
- **U4** The ladder's `NOT STARTED` caption [S43]; R40 named only the EMOM captions [S02].
- **U5** Explanatory sentences not selected for removal: `Each round starts on the clock. Whatever
  is left of its interval is your rest.`, `Start each round when you finish the last.` [S43],
  `Continue when you are ready.` [S39], `No window prescribed — the clock is yours, and it reads`
  [S40].
- **U6** `Clear` the verb [S38] [S51] and `Clear set` [S36] beside the name in `Set up CLEAR` [S19]
  and `Return to CLEAR` [S15].
- **U7** Consequence verbs: `Abandon` [S33], `Discard and regenerate` [S26], `Remove` [S22],
  `Delete` [S59], `Clear set` [S36].
- **U8** Loading exceptions to T5: `Loading session` [S34], `Checking session` [S16], `Finding
  alternatives` [S28], `Saving your setup` [S19].
- **U9** Logged or recorded: `Logged sets` [S35], `No rounds recorded` and `Every prescribed round
  is recorded.` [S46], `Not recorded` [S50].
- **U10** Spelling: `Warmup` [S35] against ` · warm-up` [S56].
- **U11** Feeling or Mood: `How do you feel?` [S51] against `Mood` [S55].
- **U12** Optional marker on the set sheet: `Effort` [S38] against `Effort · optional` [S47].
- **U13** Copy added by this body's tasks and accepted only with them: `Completed in round`, `Weight
  used` [S47], `No movements are left in this` [S49], `No rounds marked yet`, `Any partial work
  belongs to round` [S44], `Undo finish · Resume ladder` [S43], `logged` [S36].
- **U14** R50's casing: `log when complete` [S02] or `Log when complete` [S01].
- **U15** The dormant numeric capture `How hard was that?` [S62], beside the categorical faces
  [S38].

## Options

No option is selected. These are inputs for the owner decisions below, not a design.

- **N1** For EFFORT-NUMERIC-READING: read every historical number as History's block reading does,
  `Effort N of 10` [S08] [S57].
- **N2** A column headed Effort with bare numbers, the scale stated once in its caption [S56] [S02].
- **N3** Effort as the word, the number kept only where the 1 to 10 scale is the subject, as in the
  deload and rule reads [S25] [S31].
- **A1** For U1: `Retry` everywhere [S14].
- **A2** For U1: `Try again` everywhere [S34].
- **Y1** For COPY-APPLY: a follow-up copy task cites this record and applies X1 and X5 with the
  owner's answers [S03].
- **Y2** For COPY-APPLY: a pending task that already touches the surface applies them, named by the
  owner [S03].
- **K1** Every option keeps categories as words and numbers on their own scale [S08] [S10].

## Open owner decisions

- **COPY-VOICE**
  Owner: Eric (product owner, R45 source) [S02].
  Decision: accept, amend or reject the terms T1 to T6 and the rules W1 to W7, and answer or defer
  U1 to U15 (A1 or A2 for U1) [S01] [S02].
  Blocks: any future platform-wide copy rewrite. Does not block: the already selected changes X1 to X9
  [S01].
- **EFFORT-NUMERIC-READING**
  Owner: Eric (R09 source) [S02].
  Decision: how a historical number reads under the Effort label (N1, N2 or N3) in the History set
  table, the deload copy and the "why this number" dialog [S56] [S24] [S29].
  Blocks: applying R09 beyond the History column heading [S02].
- **COPY-APPLY**
  Owner: Eric, with the controller for the task assignment [S03].
  Decision: which task applies the selected but not applied X1 (R09) and X5 (R50), Y1 or Y2, because
  this definition task changes no product copy [S03] [S04].
  Blocks: closing G20's selected changes in the product [S01].

## Limitations

- This task changes no product copy, code, route, gallery state or another task's test [S03] [S07].
- The few approved examples are not a complete voice guide; T1 to T6 and W1 to W7 are a proposal
  [S01] [S02].
- The inventory is representative per surface; only the `RPE` sweep is complete, and check-01 scans
  the frontend for it [S12] [S02].
- Gallery fixtures are not inventoried: the gallery draws the route owners and does not close copy
  definitions [S07]. Server-side generation text is not frontend copy [S63].
- Empty states and missing coaching rules belong to TASK-038 (G21) [S01] [S05].
- Sources marked repo pin this revision's bytes. When a cited file changes, this record must be
  re-sourced before a copy task relies on it [S08] [S23].

## Non-gallery disposition

- REQ-037 has an explicit non-gallery disposition at accepted gallery commit
  `eded158cfd928d382c9a9409e2c372270312741d`: no states, no shared owners and no semantic variables
  [S03] [S04].
- The gallery crosswalk marks #664 / TASK-037 "not applicable to gallery": the inventory and
  proposal are a definition artifact, not a component specimen [S05].
- Existing selected copy is not a completed platform audit, and a gallery state does not certify
  application adoption [S05] [S07]. This task adds no gallery specimen, route, CSS or writer.

## Traceability

- Source notes R09, R23, R40, R45, R50, R70, R71, R72 and R112 [S02] -> decision group G20 [S01] ->
  REQ-037 [S03] -> AC-R037-01 and AC-R037-02 [S03] -> TASK-037 (#664) [S05] -> this record ->
  check-01 (`scripts/refinement/task-037-definition.test.mjs`).
- Evidence: EVID-F1CA58C8F8CF (G20), EVID-76CED19E0F10 (product-definition and data work must remain
  visible), EVID-A8BBE1D1CAFB, EVID-5D7D1D861CE6, EVID-588799E96D5F and EVID-D7466F08C2C8 (R09),
  EVID-2CC0423F1253, EVID-0FB6EA12D51D, EVID-68E7E9878523 and EVID-B791E50FF6A0 (R45),
  EVID-E93E0D7F20F0, EVID-23A8EF90367F, EVID-AA942F361914 and EVID-ECA54B20E8CF (R50) [S01] [S02].
- AC-R037-01 is met by Current observations, Effort and RPE, and Selected copy changes. AC-R037-02
  is met by the Terminology and voice proposal, Undecided items, Options and Open owner decisions
  COPY-VOICE, EFFORT-NUMERIC-READING and COPY-APPLY [S03].
- A future copy task must cite this record and the owner's answers before it rewrites product copy
  [S02].
