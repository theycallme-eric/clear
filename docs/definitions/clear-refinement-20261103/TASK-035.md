# TASK-035 definition record: adaptive-training and progress report (R03)

Task: TASK-035
Requirement: REQ-035
Body: clear-refinement-20261103
Status: definition-only
Implementation claim: none
Criteria: AC-R035-01, AC-R035-02
Issue: #662
Accepted gallery reference: eded158cfd928d382c9a9409e2c372270312741d (explicit non-gallery disposition)

## Scope

This record is the focused product-definition deliverable for R03, "there should be a place where
users can see their adaptive training report as well as progress" [S02]. It is retained definition
work under G19 [S01]. It does not implement a report, a route, a screen, a chart, a metric set, a
report frequency or a profile. It does four things:

- it separates the authoritative completed observations the app records today from the readings
  derived from them and from the future targets the app suggests [S01] [S02];
- it lists where those readings already appear today, so placement options start from real owners
  [S30];
- it lists placement and content options without choosing one [S02];
- it states the exact owner decision that remains before any report can be built [S01] [S02].

Every claim below cites the source it rests on as `[Snn]`, and the list in Sources binds each `Snn`
to verified bytes. `base:` means the blob at the body's integration base `03087f7`. `repo:` means
the file at this task's revision, and `ref:accepted-gallery/` means the staged accepted-gallery
reference. Nothing here comes from memory or from the archived R7 preview.

## Sources

- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/CURRENT-REQUIREMENTS-AUTHORITY.md` sha256 `6916f4a3c2d798807792e7ff80fed684985cd5a7f8e8cb4ef651bb997d3b194c`. S01: G19 ("Retained request; placement/content open") and "Product-definition and data work must remain visible".
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md` sha256 `82b1daa663ff4d8001b78e40cfaef73ecba48f71e65000e397ff34caf9698de5`. S02: R03 (source, direction, retained constraints, open questions), R02 (progress belongs in a place intended for reviewing progress) and the existing-effort-capability note.
- `ref:accepted-gallery/src/dev/gallery-refinement-coverage.json` sha256 `6253aae08c731978308e700e32a32162e5299b1f74fe5a15d02239ac787e772a`. S03: the REQ-035 entry (no states, "explicit non-gallery disposition", AC-R035-01 and AC-R035-02).
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/DELIVERY-CROSSWALK.md` sha256 `15a39eaa03edd816f16a4a5d6d0c0343a2c718977e66bc32b961446be35fc9f6`. S04: the REQ-035 row ("Explicit non-gallery disposition").
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/gallery-crosswalk.md` sha256 `dda789929a52e84671ac1a2cf810567630f6d98e44199511d0d778eae3a6de36`. S05: the #662 / TASK-035 row ("not applicable to gallery") and the #663 / TASK-036 load-guidance row.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md` sha256 `ab9d7ff1ccb10ec0dd6bb19c351369b0b06dde708c9f54246ae87a4a7a214a7f`. S06: logging field ownership; session Feeling is distinct from categorical Effort.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/REUSE.md` sha256 `9f6b702c6daa40626c2ca3c47740be1862b538c72b0edfec18834aac36f8ce46`. S07: shared owners; persistence, History and copy/content definitions stay with native tasks and gallery fixtures do not close them.
- `base:supabase/migrations/20260921000003_workout_domain.sql` sha256 `e1fe4318818203c9482e84b012941941acf141db5af22a8e263215c3579991d2`. S08: `workout_sessions` (dates, focus, requested and effective intensity, durations, `mood`, `session_notes`, `counts_for_streak`) and the immutable `workout_exercises` prescription rows.
- `base:supabase/migrations/20260921000004_execution_domain.sql` sha256 `cdc028af8c6debd036e97df199ac9a47b944a9b99cebc054552f7826d33138f0`. S09: `exercise_set_logs` and `block_results`, and the rule that a null is "not recorded" while zero is a real result.
- `base:supabase/migrations/20261027000027_set_effort.sql` sha256 `98ac45e92134e5433592e8f79924dd205fa90588680574a9fc5d7e6825176db9`. S10: categorical per-set effort beside, never inside, `rpe`; nothing downstream reads it.
- `repo:supabase/migrations/20261110000029_block_result_effort.sql` sha256 `a3fa275c07e6ead54403e2abbbe25ea4bd91b7f2572942b1d8a933090053207e`. S11: MIG-A, categorical block effort beside the 1-10 `perceived_effort`.
- `repo:supabase/migrations/20261110000030_block_movement_results.sql` sha256 `ecd0ade73998e2f6ec83027c439a1cd465fecd7548d2ce754b2ee00a9c03d72a`. S12: MIG-B, per-movement timed actuals and loads.
- `repo:docs/specs/LOGGING_FIELD_CONTRACT.md` sha256 `25bf03de94af58c8aac53af87ebf715f7b3b7fe150f1f6c817414cac07492048`. S13: the field-by-field logging contract (status, writer, validator and readback owner of every field).
- `base:supabase/migrations/20260921000015_rest_days.sql` sha256 `b36e2e872323ecbbb1fc194f4c1e9d162977ee35cc8f462e95ce4cf98dbf61d4`. S14: `rest_days` with a reason (`rest`, `injury`, `sick`, `vacation`).
- `base:supabase/migrations/20260921000010_session_reconstruction.sql` sha256 `7666f01977ddd2d1a6e4ccb38da1633f5349936a14eab67294a22b9ff3054f96`. S15: `session_as_generated`, `session_as_intended_at_start` and `session_as_performed`.
- `repo:src/state/session-detail.ts` sha256 `07271dd91550f21dd675b384692dfc0bc58dc2ee9aa18b2ccbe9352c01eaa3dc`. S16: History detail read model (block effort and recorded movement actuals; an unobserved number is absent, never zero).
- `base:supabase/migrations/20260921000011_load_anchors.sql` sha256 `f0e053c8ceac1fbcdfc381145063e0204661188f29a28ea5dbddcd4aded10b7b`. S17: `load_anchors`, `anchor_evidence`, `is_deload`; no stored suggested weight.
- `base:src/state/anchors.ts` sha256 `c74b21ef5e3636cc2f99812f4ef8a7726d0ca7f9ea4319f88fcfddf060ae0391`. S18: the anchor (estimated one-rep max) derivation and its confidence.
- `base:src/state/progression.ts` sha256 `261096e9d08346eba95cbf1641eaceea0455b23a2ce31708b3c34b95872a5745`. S19: the rule table, confidence tiers and staleness that turn an anchor into a next prescription.
- `base:src/state/load-suggestions.ts` sha256 `dec93ed14f34cc5ae6f3202a10d29e7c621988d34c2f05e2a6f475074a8af636`. S20: the Review suggestion view and the this-session-only override that never rewrites an anchor.
- `base:supabase/migrations/20260921000012_conditioning_history.sql` sha256 `4370f6359fd924b889718b143c6e5b7f11beaaaa79b65462e508cd03891a7059`. S21: the conditioning read; the normalized score is derived, never stored.
- `base:src/state/conditioning.ts` sha256 `254d7db113b73e89fb2600a34aaf35d9ab8149bc0d2d0ae89ef7e3276f335286`. S22: conditioning score, like-for-like gate and the ready/hold/backing-off trend.
- `base:src/state/block-completion-provider.tsx` sha256 `2e7a784051b526b2d52ad8dc025eda28b7c22680dd43ed40c1b232ebe19d0d0a`. S23: the timed-block save provider; numeric effort is not asked and is written null.
- `base:src/state/deload.ts` sha256 `0f93e63cccda6bf08d7298336ce6ef84cc1474521ae020759622243512df27fb`. S24: the six deload triggers; a suggestion, never auto-applied.
- `base:src/state/deload-decisions.ts` sha256 `459f54807e40b6485d17e4a412d05f1ede5c6c7565ee6dff53681ad5264118e8`. S25: deload dismissals and overrides kept in this device's storage, not in a table.
- `base:supabase/functions/_shared/training-history.ts` sha256 `681f6439f32d55dbbf4908c2e57016c4c31722c660205a13a043ffc27da1ccf2`. S26: the TRAINING HISTORY block given to generation (labels only, session directive).
- `base:src/state/favorite-progression.ts` sha256 `31f7d48236ea9eced91d06215c50cc86030b8edf0b27f0b75921b6bb23d605aa`. S27: bests, last weights, run comparison and completion history for one favorite.
- `base:src/state/streak.ts` sha256 `ff6cf8e2a2b3f1a68f4f25610351010087771e5d99728cf24a0c3662dde1f8fb`. S28: the streak, derived and never stored.
- `base:src/state/session-suggestion.ts` sha256 `92644778529dbc8c7abbbb52c7eba725d3ab5850089382ac206c9aad96a08296`. S29: what to train next (least-recently-trained focus and an intensity).
- `base:src/app/router.tsx` sha256 `d74f09f450363c551dd49796328558a6d9afbef29f9b3a61abfd8bcbc3da7423`. S30: the app's routes.
- `base:src/ui/load-suggestion.tsx` sha256 `933c4ae7345e720bb817c931295e7bfa4e915f48fe107d79bb0c1caa533639e3`. S31: the Review suggestion and its "why this number" dialog.
- `base:src/ui/favorite-progression.tsx` sha256 `d77add4e7c43324f98f42ac647442ca62ccc21c9759155957499ed46c817bd4c`. S32: the favorite progression surface above the Review briefing.
- `base:src/ui/deload-banner.tsx` sha256 `979d2053babfb3fd7345a119ab31a293dc0c1d96843f90ce290e016e9e7da273`. S33: the deload banner on Generate.
- `base:src/ui/conditioning-score.tsx` sha256 `fc328d88655890a23ad63d3368404f13694218ad0b1a589a47f4aaab441bb9ae`. S34: the timed-block score line and like-for-like comparison.
- `base:src/app/Summary.tsx` sha256 `83af2ddef3ac3cc8ae239d2fdbfc5ae8ea877f53860df3cc6e288b0fa4504619`. S35: the post-session debrief (`/summary`).
- `base:src/app/Settings.tsx` sha256 `e55f5ecbe56c6f03c1da56ce6164d34043dd33c8b4becdb3e232b5ebcc6225c3`. S36: the one place the training profile is edited.
- `base:src/app/Home.tsx` sha256 `d15265d119cfdc3af46fe1dd810fb26b08a0112ee9dcf6027caea74e7251347a`. S37: Home's week strip, recent workouts and next-workout entry.
- `base:docs/requirements/DEFERRED.md` sha256 `b799f3f502f4102270f43634cfdf4735dff25ff0ca05ca78b06bc811bc8ebdfa`. S38: CHART-01, per-exercise charts cut in favour of a text delta.
- `base:docs/specs/OVR-01_progressive-overload.md` sha256 `236f0149ad13c65242b645bab5feac0cc09ec211d000a0ce0bfe4485d9e7abeb`. S39: what "progress" means per format, the density nudge and the deload rules.
- `base:docs/requirements/REQUIREMENTS.md` sha256 `44d488b92201f701dafe6e14afbe98fa56a4ea452bf570d003a0b211e0142ab5`. S40: OVR-01 to OVR-04 and FAV-02 (comparison framing dropped during a deload).
- `base:src/app/Generate.tsx` sha256 `bb8b8ccce8ffbf077fd8cb8444eb3b290934f8234d39399e1abdc8eb0218afcc`. S41: Generate renders the deload banner.

## Current observations

Authoritative completed observations: what the user actually did, as recorded rows. Each one is
written by an existing writer and read back through an existing reader. None of them is a target.

- **O1** Logged sets. `exercise_set_logs` records actual reps, actual duration, actual distance,
  weight with its own unit, and the historical 1-10 `rpe` per set [S09]. A null means "not
  recorded"; zero is a real result [S09]. Writers, validators and readback owners are listed per
  field in the logging contract [S13].
- **O2** Categorical set effort. One of three categories, or unanswered, stored in its own column
  beside `rpe` and never converted into it [S10]. Nothing downstream (anchors, progression,
  generation) reads it [S10].
- **O3** Timed block results. `block_results` records rounds completed, reps into the next round,
  minutes completed, highest rung, completion under the cap and the historical 1-10
  `perceived_effort` [S09]. The shipped timed save path does not ask for a numeric effort and writes
  `perceived_effort` as null [S23]; a categorical effort is never converted into it [S11].
- **O4** Categorical block effort and per-movement timed actuals. MIG-A adds a categorical block
  effort beside the 1-10 column [S11]. MIG-B adds per-movement partial amounts, the round they
  belong to, and actual loads [S12]. Their status and owners are the logging contract's [S13]. This
  record makes no claim about which hosted project has applied them [S11] [S12].
- **O5** Session facts. `workout_sessions` records the date, focus, requested and effective
  intensity, requested, computed and actual duration, `started_at`, `completed_at`, the five-step
  `mood`, `session_notes` and whether the session counts for the streak [S08]. The session Feeling
  is a different question from any effort [S06].
- **O6** Rest days. `rest_days` records a day off with its reason: rest, injury, sick or vacation
  [S14].
- **O7** As-performed reconstruction. `session_as_performed` answers what was actually done,
  separately from `session_as_generated` and `session_as_intended_at_start` [S15]. The History
  detail reads it, shows block effort as a category and recorded movement actuals, and never shows
  an unobserved number as zero [S16].

## Derived readings

Readings computed from the observations. They are not observations: each is recomputed from the
rows above, and none may be shown as if the user recorded it.

- **D1** Load anchors. `load_anchors` holds an estimated one-rep max per exercise and implement,
  recomputed from working sets only; warm-ups, deload sessions, active recovery and bodyweight are
  excluded [S17]. The arithmetic and the confidence (sessions behind it) are `anchors.ts`'s [S18].
- **D2** Conditioning score. One comparable number per timed block (reps per minute, completion
  ratio or rung) is computed, never stored [S21] [S22]. A comparison is allowed only between
  identical pieces [S22].
- **D3** Conditioning trend. `ready`, `hold` or `backing_off` over recent conditioning sections
  [S22] [S39]. `ready` requires a recorded numeric `perceived_effort` of 7 or less [S22], and the
  shipped timed save path writes that column as null [S23]. A window made only of results saved
  through that path therefore cannot read `ready`; a report would have to state this, not hide it.
- **D4** Favorite progression. For one favorite: bests, last weights, the last run against the one
  before and the completion history, each dated [S27]. During a deload the competitive framing is
  dropped [S27] [S40].
- **D5** Streak. Derived from sessions on every read and never stored [S28].
- **D6** Deload signals. Six triggers over recent history produce a suggestion with its reason
  [S24]. Dismissals and overrides are kept only in this device's storage [S25].

## Future targets

Suggestions about what to do next. A target is never an observation and is never written back as
performance.

- **T1** Suggested working weight. Computed on Review from the anchor through the rule table, with
  its confidence tier and staleness, and absent when there is no anchor [S19] [S20]. No suggested
  weight is stored [S17]. A user override changes this session's prescription only and never
  rewrites an anchor [S20].
- **T2** Prescribed targets. The accepted prescription rows (target reps, range or sequence, load
  guidance and value) are what the session asked for [S08]. A revision supersedes a row rather than
  changing it [S08] [S15].
- **T3** Generation directive. Generation receives labels only (`progressing`, `stalled`, staleness,
  confidence) and a session directive (`normal`, `deload` or `re_entry`), never an anchor number
  [S26].
- **T4** Conditioning nudge. The trend in D3 asks generation for a slightly harder, equal or easier
  next conditioning piece [S26] [S39].
- **T5** Deload suggestion. The banner on Generate offers a lighter session with the specific reason;
  it never auto-applies [S24] [S33].
- **T6** Next focus. Home's next-workout entry suggests the least-recently-trained focus and an
  intensity [S29] [S37].

## Where these readings appear today

No route is a report today. The routes are `/`, `/generate`, `/review`, `/workout`, `/summary`,
`/history`, `/history/:id`, `/settings` and `/settings/locations`, plus onboarding, sign-in and the
format preview [S30]. The readings above are spread over these existing surfaces:

- **V1** `/review`: the suggested weight per exercise with its "why this number" dialog (T1)
  [S31], and for a restored favorite the favorite progression above the briefing (D4) [S32].
- **V2** `/generate`: the deload banner above the intensity selector (T5) [S33] [S41].
- **V3** `/workout`: the timed-block score line, with a comparison only on an identical repeat
  (D2) [S34].
- **V4** `/summary`: the debrief's Feeling, notes and streak after one session (O5, D5) [S35].
- **V5** `/history/:id`: one session as performed (O1 to O4, O7) [S16] [S30].
- **V6** `/`: the week strip, recent workouts and next-workout entry (D5, T6) [S37].
- **V7** R02 removed a "last performance" row from the Review lift card because progress belongs in
  a place intended for reviewing progress [S02]. That place does not exist yet [S30].

## Options

No option is selected. These are inputs for the owner decision below, not a design.

Placement options:

- **P1** Inside History (`/history`), as a progress area beside the session list. It reuses the
  History read owners [S16] [S30].
- **P2** On Home (`/`), as an entry beside the week strip that opens the report [S37].
- **P3** A new dedicated report screen. It would need a new route, which this record does not name
  or approve [S02] [S30].
- **P4** After a session on Summary (`/summary`), as a "what changes next time" note for that one
  session [S35].
- **P5** No new place: keep the readings where they are (V1 to V6) and only make each one easier to
  find [S02] [S31] [S32] [S33] [S34].

Content options (categories of information already recorded or derived; not a metric set):

- **C1** Completed performance per exercise: recent logged sets with dates (O1, O2) [S09] [S10].
- **C2** Completed timed performance: block results and per-movement actuals, compared only
  like-for-like (O3, O4, D2) [S09] [S12] [S22].
- **C3** What the app has learned: anchors with their confidence and staleness (D1) [S18] [S19].
- **C4** What the app will suggest next and why: suggested weights, the session directive, the
  conditioning trend and any deload suggestion (T1, T3, T4, T5) [S20] [S24] [S26].
- **C5** Consistency: streak, rest days and their reasons (D5, O6) [S14] [S28].
- **C6** Favorite threads: the existing per-favorite progression (D4) [S27].

Constraints every option keeps, from the retained R03 decision:

- **K1** Read the same authoritative recorded performance and prepared training context as
  generation and Review; no separate per-screen calculation [S02]. The derived readings above are
  the single owners to reuse [S18] [S19] [S22] [S27].
- **K2** Show completed performance apart from suggested future targets [S02]. Observations (O),
  derived readings (D) and targets (T) keep different labels [S01].
- **K3** No competing editable profile. The training profile is edited only in Settings [S36]; a
  per-session load override already exists on Review and never rewrites an anchor [S20].
- **K4** No new chart shape without an owner decision. CHART-01 was cut in favour of a text delta
  such as a weight change over weeks [S38].
- **K5** Categories and numbers are not interchangeable. Categorical effort is never read onto the
  1-10 scale [S10] [S11], and the session Feeling is a different question [S06].
- **K6** Accessible and colour-independent: direction is a word and a glyph, never a colour alone
  [S32] [S34].

## Open owner decisions

- **R03-PLACEMENT-CONTENT**
  Owner: Eric (product owner, R03 source) [S02].
  Decision: choose where the adaptive-training and progress report lives (one of P1 to P5, or
  another named place) and which information it shows (a subset of C1 to C6, or another named set),
  including whether derived numbers such as anchors (C3) are shown to the user or only the
  suggestions they produce (C4) [S01] [S02].
  Also needed in the same decision: whether a report screen needs a new route (only if P3 is
  chosen) and whether it is read on demand or after each session (P4), because no route or report
  frequency is approved [S02] [S30].
  Blocks: any future report implementation task. Does not block: the unrelated shared presentation
  in this body [S01].

## Limitations

- No route, chart, metric set, report frequency, explanation format or editable duplicate profile is
  defined or approved here [S02]. P3 names no path and C1 to C6 are categories, not metrics [S02].
- No report is implemented by this body's UI consistency delta, and no gallery state shows one [S03]
  [S04] [S05].
- D3 cannot read `ready` from results saved through the shipped timed path while the numeric block
  effort is written null [S22] [S23]. Whether categorical effort should feed adaptation is outside
  R03; the register records effort capability without authorising a change to adaptive behaviour
  [S02].
- Deload dismissals live in one device's storage, so a report on another device cannot show them
  [S25].
- Load guidance and the actual-versus-target contract belong to TASK-036 (#663), and platform copy
  to the terminology audit TASK-037 (#664) [S05]. Persistence, History and copy definitions stay
  with their native tasks [S07]; a report built later consumes them and does not redefine them.
- Sources read from this revision (marked repo) pin its bytes. When a cited file changes, this
  record must be re-sourced before a report task relies on it [S13] [S16].

## Non-gallery disposition

- REQ-035 has an explicit non-gallery disposition at accepted gallery commit
  `eded158cfd928d382c9a9409e2c372270312741d`: no states, no shared owners and no semantic
  variables [S03] [S04].
- The gallery crosswalk marks #662 / TASK-035 "not applicable to gallery" and says no gallery
  report is required or implied [S05].
- A gallery state does not certify application adoption [S07], so none is invented here: this task
  adds no gallery specimen, route, CSS or production writer.

## Traceability

- Source note R03 (Eric, 29 October 2026) [S02] -> decision group G19 [S01] -> REQ-035 [S03] ->
  AC-R035-01 and AC-R035-02 [S03] -> TASK-035 (#662) [S05] -> this record -> check-01
  (`scripts/refinement/task-035-definition.test.mjs`).
- Evidence: EVID-1D0835D0F7B2 (G19), EVID-76CED19E0F10 (product-definition and data work must
  remain visible), EVID-61F2618D2BE0, EVID-307A9596F2E5, EVID-39767BA29C05 and EVID-39D9BD43BFE7
  (R03) [S01] [S02].
- AC-R035-01 is met by Current observations, Derived readings, Future targets, Options and Open
  owner decisions above. AC-R035-02 is met by this section, the Non-gallery disposition and the
  Limitations, which state that no report is implemented [S03].
- A future report implementation must cite this record and the owner's answer to
  R03-PLACEMENT-CONTENT. Unrelated shared presentation can proceed without it [S01].
