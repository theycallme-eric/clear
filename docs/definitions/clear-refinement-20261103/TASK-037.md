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
- `repo:docs/specs/LOGGING_FIELD_CONTRACT.md` sha256 `cd0bc780c72f5ef364abffb395b9cfc85c42f98c7fd1608836c330f14e0b0f99`. S08: §1 rule 3 and §4, the four stored efforts and feeling, none derived from another.
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
- `repo:src/app/Onboarding.tsx` sha256 `97ae44b7c9b0bb4e0cdf88c31c38f60aedc632cb65c23083dfc674db3605d61f`. S19: Setup.
- `base:src/app/Home.tsx` sha256 `d15265d119cfdc3af46fe1dd810fb26b08a0112ee9dcf6027caea74e7251347a`. S20: Home.
- `base:src/app/ActiveSessionPrompt.tsx` sha256 `ec19f728831cf3287071ca8d6bf699395cc6ea7dec1ef8769cc54d55d005df94`. S21: the workout-in-progress prompt.
- `base:src/ui/favorite-list.tsx` sha256 `e4634982ae44e0e7364f0133d7d86235a0fae71a7536b62e52b0153e2e0dc740`. S22: Home favorites.
- `repo:src/app/Generate.tsx` sha256 `acbe668f35582711704f1421e2f8ae5c89ab141480f1c779d5a8eaa53c9f0c22`. S23: Generate at this revision.
- `base:src/ui/deload-banner.tsx` sha256 `979d2053babfb3fd7345a119ab31a293dc0c1d96843f90ce290e016e9e7da273`. S24: the deload banner.
- `base:src/state/deload.ts` sha256 `0f93e63cccda6bf08d7298336ce6ef84cc1474521ae020759622243512df27fb`. S25: deload reasons.
- `repo:src/app/Review.tsx` sha256 `d280eeee78e61db584cae7ac207eff57e07c589e343cb9b5231f8b9b5d6ed1e9`. S26: Review.
- `base:src/app/ReviewRoute.tsx` sha256 `36535e2f066ce138e6148b2ce124c66b14cb601c88ee25ebfdf7a10b0a020578`. S27: Review's route states.
- `base:src/ui/exercise-swap.tsx` sha256 `07e6e1852a69b6dc039d4f36e71175b64f09368fc4009cecd9719f39fe061548`. S28: Swap.
- `repo:src/ui/load-suggestion.tsx` sha256 `5afbc9f602169f59ac5bc65be70db8aa0fd1e72b40c720feae9f3e0e9abcd0dc`. S29: the suggested weight and its "why this number" dialog.
- `repo:src/state/load-suggestions.ts` sha256 `1ade2ebed06d0d4f8466de5c8901ac970ee8320435da8a24849c2225712271d2`. S30: the dialog's set and effort readings.
- `base:src/state/progression.ts` sha256 `261096e9d08346eba95cbf1641eaceea0455b23a2ce31708b3c34b95872a5745`. S31: the rule reads shown as the applied rule.
- `repo:src/ui/equipment-summary.tsx` sha256 `b03488945f5c8c8e7eb2dd09dd1234c4e734e7928ca58beaeab169891947e616`. S32: Overview equipment (Round 7's `EquipmentSummary`; the removed `src/ui/refinements/overview.tsx` held it before).
- `repo:src/ui/workout-chrome.tsx` sha256 `1d12d0f336aaa30b73df6bef93fbcaaaf805ab07ecf641622e865ec46bcbb8d0`. S33: the workout shell.
- `repo:src/app/Workout.tsx` sha256 `b3c23871510f48a7758d41bbee39d9c8ddda4778870f4e5feb9d86b426473b07`. S34: the workout route states.
- `repo:src/ui/set-logger.tsx` sha256 `0df2b9f6a970c614eabd5c3595d6781c847692abe433b4fd76a7fb1b9c28a77e`. S35: set logging at this revision.
- `repo:src/ui/set-logging-sheet.tsx` sha256 `df44b2d302417bdf5254ee8a4cac1d0573bdc9a85870a5db5885f2ef8d0ff91c`. S36: the set sheet and its confirmation title.
- `base:src/ui/set-sync-notice.tsx` sha256 `414e89956d10d2c384c8bc048256c696348c9919b3a7c6fb3ca6b9210358f164`. S37: the sync notice.
- `repo:src/ui/set-effort.tsx` sha256 `4f9b17b85443b9eb665f9a225c860c4c27ee7e6ac4fb146d8d6c68deb27b0dbf`. S38: the three-face Effort control.
- `repo:src/ui/emom-block.tsx` sha256 `3b929c38ca991d37d426d4de3ff4a90de9d58ba795d0dc98f94cd6796e720279`. S39: EMOM at this revision.
- `repo:src/ui/amrap-block.tsx` sha256 `54eef7218f47f13e2a418d72a492499b96fa95fb820f3e7c849d2d268073f2f7`. S40: AMRAP.
- `repo:src/ui/block-renderers-frame.tsx` sha256 `d44ded12720b67b315b7a53d0932d315e6e12c551afeda18ba6e8fb33c0f61e4`. S41: the Now and Next markers.
- `repo:src/ui/for-time-block.tsx` sha256 `5dd4fcd667b942b8f0bf93b77cb24af8c35cd337a3fa7d29cb74419e85c4eeae`. S42: For Time.
- `repo:src/ui/ladder-block.tsx` sha256 `78a23f06057779b25a13e58f57e675f4cc1c230e77c292a1d582259a3e970247`. S43: the ladder at this revision.
- `repo:src/ui/ladder-rungs.tsx` sha256 `7a0ecba22af4a15c532004161ae2b6ca7eeb20277f1523f7389996ca3b8196b8`. S44: the compact ladder presentation (Round 7's `LadderPrescription`, which the route's ladder draws; the removed `src/ui/refinements/ladder.tsx` held it before).
- `repo:src/state/ladder.ts` sha256 `653d4f44b8f1f0371247fd97b9b8b644e0f779503a9b43f8ec0a5a8a18cdf3ce`. S45: the rung notation.
- `repo:src/ui/circuit-block.tsx` sha256 `60136f826ff63c26490209c6582921300215f959029a71796465acfe62000c90`. S46: circuits.
- `repo:src/ui/timed-result-log.tsx` sha256 `a3c614a1dbfb31c726f02cc2ab10f72434f919cc1bee7a5f4dad3d38594ae634`. S47: the timed results log (Round 7's owner; the removed `src/ui/refinements/timed-result-log.tsx` held it before).
- `repo:src/ui/logging-overlay.tsx` sha256 `1ded9a9605f06fe941f4877cdc872c06cf70e938d783e75643bb8f4c219d0894`. S48: the logging dialog (Round 7's owner; the removed `src/ui/refinements/logging-overlay.tsx` held it before).
- `repo:src/ui/preparation-guide.tsx` sha256 `9323010a217b139faab44812cbca1ddba15c45de9f730c6c33c073c326d930d3`. S49: the warm-up and cooldown guide.
- `repo:src/app/Summary.tsx` sha256 `a41368374d043ff3243c4de5d8cd08f1692d73eece8d210f352c42be1fa08fdd`. S50: Summary.
- `base:src/ui/feeling-row.tsx` sha256 `df3d9da71bf2b6211a89ce7c9244bff4edf9c572c64984f8ba37fd8e2e19a777`. S51: the session Feeling question.
- `base:src/app/FavoriteToggle.tsx` sha256 `08f5f055ce37f2fe7a3de586e8a6279332c99e333a12699309d34947d6721d83`. S52: Save as favorite.
- `repo:src/app/History.tsx` sha256 `937227e98c293266cdaa904d9ea38bc42f9a3032c431746b56f5d6aaf1d526e5`. S53: History.
- `repo:src/state/history.ts` sha256 `eacbce2a9ce0a825a3a0f949e2a0b2ed7c1b7a0602a8e31d77c28a5090f206b8`. S54: History status and filter words.
- `repo:src/app/SessionDetail.tsx` sha256 `593c238b0a82a362bbf6de1af421f8335312eaa14cab8b489d3358b22a59c661`. S55: the History detail route.
- `base:src/ui/session-detail.tsx` sha256 `5d8699ad52d6cf3b7dae1ee6720ed92b7bccdf04123b83e7ce5873bda8e7a014`. S56: the History detail block and set table.
- `repo:src/state/session-detail.ts` sha256 `1e54a74e51df2fa24d26cc5d9c2c31862db626f9ddf6a7452c4bea01f88a7da2`. S57: the History detail readings.
- `base:src/app/Settings.tsx` sha256 `e55f5ecbe56c6f03c1da56ce6164d34043dd33c8b4becdb3e232b5ebcc6225c3`. S58: Settings.
- `base:src/app/LocationSettings.tsx` sha256 `2939d5d9a8794e60dd0c15f5ea5ba971dc718baa6f951edceb0b28917d4d6c87`. S59: places and equipment.
- `repo:src/app/FormatPreview.tsx` sha256 `37f79f6bddc86c6525008a0f5340671fcf5b150e8e95a59e4a6d0c49686e7e77`. S60: the read-only format preview.
- `repo:src/ui/exercise-coaching.tsx` sha256 `5a811256a70aa995e4ac6e48dd3fd2341493d07722bfb83a568d13cbcd4e17d7`. S61: coaching and notes.
- `base:src/ui/block-effort.tsx` sha256 `b18e157bd3047649898e52ecfddda73fdea9d57e5ae95d1e67771abafde91d9d`. S62: the numeric block-effort dialog.
- `base:src/state/conditioning.ts` sha256 `254d7db113b73e89fb2600a34aaf35d9ab8149bc0d2d0ae89ef7e3276f335286`. S63: the conditioning directive reasons.
- `repo:src/data/refinement-logging-contract.ts` sha256 `89fc44b234cc4f18657ebed72424c002df055dd920597c4b8598b103196704ae`. S64: the logging contract's field descriptions.
- `base:src/app/Generate.tsx` sha256 `bb8b8ccce8ffbf077fd8cb8444eb3b290934f8234d39399e1abdc8eb0218afcc`. S65: Generate at the base.
- `base:src/ui/emom-block.tsx` sha256 `2f8377a684d9d39efaeb2f5ce11f523a7df8ce504364d2762c158009a2687974`. S66: EMOM at the base.
- `base:src/ui/ladder-block.tsx` sha256 `5515b505ade2a6a3f5a157968abd6ea6110be598a74051ff60d5c1c941671045`. S67: the ladder at the base.
- `base:src/ui/set-logger.tsx` sha256 `23558fedda919b98413867528656f1af137955a7019dfff3c2ba50f8e9793dd1`. S68: set logging at the base.
- `repo:src/ui/timed-workout-flow.tsx` sha256 `d58b19f707cf92093953616fbff57b55d869964ba88aecdfb5d5f002684f007f`. S69: `TimedWorkoutFlow`, which draws the EMOM, AMRAP, For Time and ladder on `/workout`: their clocks, captions, markers, notes and the one Log results action.
- `repo:src/ui/block-renderers.tsx` sha256 `23e696d24b1a5fe2fd193c5f81e2d8e812c626f1524f5d76420b7c1b80d2eadb`. S70: `BlockSlot`, which hands every timed format to `TimedWorkoutFlow` under the product presentation.
- `repo:src/state/emom.ts` sha256 `7fdd8c588595e98c203f3bd9e668f37d180b4bbe55c76ad2d44dca1bd9e074cf`. S71: the EMOM minute and its movement labels, which `TimedWorkoutFlow` draws.
- `repo:src/app/AppRuntime.tsx` sha256 `490732740ee9dcc8c3f26a02b5900af54c891aa288bc64469fe79ed7d5016685`. S72: the app root, which mounts the product presentation for every route.
- `repo:src/ui/product-presentation.ts` sha256 `17a5127e9ad97655c791a17a3bc03a4eaac151940af2b025353a89499cb95c9b`. S73: the product presentation (`PRODUCT_PRESENTATION`) and its real timed save.
- `repo:src/state/workout-progress.ts` sha256 `80d6aeb631351e163b7ccdc0e369ec5addae42610b1ad2b1ae2fbf83681e43a4`. S74: each block's structure label (`structureIdentity`), which the timed cards' Start words carry.
- `repo:src/ui/timed-workout-flow.test.tsx` sha256 `94f81611c0d72365c4cd7a9e1ce9807527b497e6a77022d6e8f88b1fcf9cc108`. S75: the timed cards' tests, which read each card's Start words exactly as drawn.
- `repo:src/design-system/css/foundation.css` sha256 `7326b43e7adde389ae2ce39e749036d3b58de3cd98197c06273ece471a326cd1`. S76: Foundation 0.14.3's button style, which draws a button's words in capitals.

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
- **I9** EMOM and AMRAP (`/workout`), both drawn by `TimedWorkoutFlow` [S69] [S70] [S71] [S41] [S74]
  [S75]. Actions: `Start ${format === 'ladder' ? 'ladder' : block.identity.label}` over the
  structure labels `EMOM` and `AMRAP`, drawn as `Start EMOM` and `Start AMRAP`, then `Pause`,
  `Resume`, `Log results`, `Edit log`. States: `Minute ${minute.minute} of
  ${shape.minutes ?? '—'}`, ` · Rest`, `ODD MIN`, `EVEN MIN`, `Now`, `Next`, `Paused`, `Finished
  early`, `Time complete`, `Remaining`, `Log saved`. Helpers: `Log when complete`, `s rest at the
  end of each minute`, `Finished early, in minute ${minute.minute} of ${shape.minutes}. Continue when
  you are ready.`
- **I10** For Time, ladder and circuit (`/workout`): For Time and the ladder are drawn by
  `TimedWorkoutFlow`, the ladder's rounds by `LadderPrescription` and a scheduled ladder's status by
  `LadderBlock`; the circuit by `CircuitBlock` [S69] [S44] [S43] [S46] [S74] [S75]. Actions:
  `Start ${format === 'ladder' ? 'ladder' : block.identity.label}` over the structure label
  `FOR TIME`, drawn as `Start FOR TIME` and `Start ladder`, or `Start schedule` for a scheduled
  ladder, then `Pause`, `Resume`, `Log results`, `Resume ladder`, `Undo finish · resume ladder`,
  `Start round`, `Finish round`, `Take back a round`. States: `Elapsed`, `Cap reached`,
  `Finished`, `NOT STARTED`, `ON THE CLOCK`, `No rounds marked yet`, `rounds completed`, `No rounds
  recorded`, `Every prescribed round is recorded.`. Helpers: `Each round starts on the clock. Whatever is left of its
  interval is your rest.`, `This ladder prescribes no rungs — perform the movements as written.`,
  `The clock has run every scheduled round. Say how the block ended below.`
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
the cited files. Where Round 7 draws the copy through other code than the old build, the cited file
is the code that draws it on the route today, and a change read under the product presentation reads
only what that presentation draws. Applied changes were applied by the named earlier tasks, not by
this record.

- **X1** R09, Effort not RPE [S02]. Status: not applied. `<HeaderCell>RPE</HeaderCell>` remains in
  the History set table [S56], and E4 to E6 remain. The numeric reading under Effort is decision
  EFFORT-NUMERIC-READING [S02].
- **X2** R23, Generate helpers [S02]. Status: applied (TASK-024). `Uses this place’s equipment.` and
  `Optional, today only. Ongoing limits go in Settings.` were copy at the base [S65]. Round 7's
  Generate keeps them only for a screen without the product presentation, and the app root mounts
  `PRODUCT_PRESENTATION` for every route, so neither is drawn [S23] [S72] [S73].
- **X3** R40, EMOM captions [S02] [S01]. Status: applied (TASK-011). `NOT STARTED` and `WORK` were
  EMOM captions at the base [S66] and are not copy in `TimedWorkoutFlow`, which draws the EMOM on
  `/workout` [S69] [S71] [S70]; the minute `Minute ${minute.minute} of ${shape.minutes ?? '—'}` and
  the `Now` and `Next` markers stay [S69]. The presentation-less `EmomBlock` still holds both
  captions, and no route draws it [S39] [S70]. On `/workout` only a scheduled ladder's own status
  still says `NOT STARTED`, which R40 did not select (U4) [S43] [S69].
- **X4** R43, natural-end sentence [S02]. Status: applied (TASK-011). `The clock has run every
  prescribed minute. Continue when you are ready.` was copy at the base [S66] and is not copy in
  `TimedWorkoutFlow` [S69] [S71]; its `Log results` dialog replaces it [S69] [S47]. The
  presentation-less `EmomBlock` still holds it, and no route draws it [S39] [S70].
- **X5** R50, running helper [S02]. Status: not applied in `AmrapBlock`, where `Nothing to enter now.
  Record your rounds afterwards if you like.` is still copy [S40]. No route draws `AmrapBlock`: the
  AMRAP that `TimedWorkoutFlow` draws on `/workout` says `Log when complete` while it runs [S69]
  [S70]. The requested wording is `log when complete`; its casing was left to this pass [S02] and G20
  writes `Log when complete` [S01].
- **X6** R70, ladder suffix [S02]. Status: applied (TASK-012). `— same every round` was copy at the
  base [S67] and is not copy in the route's ladder rounds, which `LadderPrescription` draws from
  `ladderRoundReadings` [S44] [S45] [S69]. The presentation-less `LadderBlock` still holds it in its
  own rounds, which no route draws [S43] [S70].
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
- **U2** Status caption case: the timed cards write `Paused`, `Finished early` and `Elapsed` [S69],
  which the timer frame draws in capitals (`textTransform: 'uppercase'`) [S33], while a scheduled
  ladder writes `NOT STARTED`, `ON THE CLOCK` and `COMPLETE` in capitals [S43]. The Start words
  differ the same way, `Start FOR TIME` against `Start ladder` [S75]; the button draws both in
  capitals (`text-transform: uppercase`), so the difference is in the written words, not on screen
  [S76].
- **U3** Ending words: `Time complete`, `Cap reached`, `Finished early` and `Finished` [S69], a
  scheduled ladder's `COMPLETE` [S43], and History's `Finished under the cap` and `Stopped at the
  cap` [S57].
- **U4** The ladder's `NOT STARTED` caption [S43]; R40 named only the EMOM captions [S02].
- **U5** Explanatory sentences not selected for removal: `Each round starts on the clock. Whatever
  is left of its interval is your rest.` and `Start each round when you finish the last.` [S43], the
  second drawn by the format preview's for-time ladder (`PACING_NOTES[ladder.timing.mode]`) [S60],
  `Continue when you are ready.` [S69], and `No window prescribed — the clock is yours, and it
  reads`, which only the presentation-less `AmrapBlock` holds and no route draws [S40] [S70].
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
  used` [S47], `No movements are left in this` [S49], `No rounds marked yet` [S44], `Undo finish ·
  resume ladder` [S69], `logged` [S36].
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
- Round 7 draws some copy only without its product presentation, which the app root mounts for every
  route [S72] [S73]. The inventory reads the words written in each source, so a word behind such a
  branch is not drawn on the route: for example the set sheet's `Minimize` [S36] and Generate's
  `Uses this place’s equipment.` [S23]. No route draws the presentation-less `EmomBlock`,
  `AmrapBlock` or `ForTimeBlock`, because `BlockSlot` hands every timed format to
  `TimedWorkoutFlow`, so words only they write are not drawn; `TimedWorkoutFlow` still draws
  `AmrapComparison` from the AMRAP's module and writes some of the same words itself [S70] [S69] [S39]
  [S40] [S42].
- Words are quoted as each source writes them. The timer frame's caption and the Foundation button
  draw theirs in capitals (`textTransform: 'uppercase'`, `text-transform: uppercase`), so the screen
  shows `Paused` as PAUSED and `Start ladder` as START LADDER [S33] [S69] [S76].
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
