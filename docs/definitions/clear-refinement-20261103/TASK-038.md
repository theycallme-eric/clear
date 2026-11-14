# TASK-038 definition record: coaching and empty-state content inventory (G21)

Task: TASK-038
Requirement: REQ-038
Body: clear-refinement-20261103
Status: definition-only
Implementation claim: none
Criteria: AC-R038-01, AC-R038-02
Issue: #665
Accepted gallery reference: eded158cfd928d382c9a9409e2c372270312741d (state cards; grouped appearance only)

## Scope

This record is the definition deliverable for G21, "Review empty states/rules, starting with
repeated missing-coaching messages. Distinguish missing content, blank user notes, loading and
failure; verify fixture/catalog identity before diagnosing catalog gaps" [S01]. Its source is R73,
which asks for an empty-state review "rather than an approved replacement string/hide rule or a
started audit" [S02]. It changes no product copy, hides nothing and adds no feature. It does five
things:

- it inventories every state the Coaching and notes owner draws for a movement's guidance and for
  that movement's note, with the exact words the owner draws today [S09];
- it verifies the identity of every repository fixture that demonstrates those states against the
  catalog the database is given, before any catalog gap is diagnosed [S13] [S14] [S15];
- it records what the catalog itself answers, after that identity check [S15];
- it records that movement notes stay available whatever the guidance answers [S09] [S07];
- it states the unresolved hide/replacement/content rule as one scoped owner decision, with
  options and none selected [S01] [S02].

Every claim cites the source it rests on as `[Snn]`, and Sources binds each `Snn` to verified bytes.
`base:` means the blob at the body's integration base `03087f7`. `repo:` means the file at this
task's revision. `ref:accepted-gallery/` means the staged accepted-gallery reference. Quoted words
are copied from those bytes; a template substitution such as a movement's name is left out of the
quote.

## Sources

- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/CURRENT-REQUIREMENTS-AUTHORITY.md` sha256 `6916f4a3c2d798807792e7ff80fed684985cd5a7f8e8cb4ef651bb997d3b194c`. S01: G21 (empty states and rules), G11 (one grouped Coaching and notes disclosure) and "Product-definition and data work must remain visible".
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/authority/INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md` sha256 `82b1daa663ff4d8001b78e40cfaef73ecba48f71e65000e397ff34caf9698de5`. S02: R73 (empty-state pass and rules), R29 and R36 (the grouped disclosure and its accepted appearance).
- `ref:accepted-gallery/src/dev/gallery-refinement-coverage.json` sha256 `6253aae08c731978308e700e32a32162e5299b1f74fe5a15d02239ac787e772a`. S03: the REQ-038 entry (state `cards`, shared owners, limit).
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/DELIVERY-CROSSWALK.md` sha256 `15a39eaa03edd816f16a4a5d6d0c0343a2c718977e66bc32b961446be35fc9f6`. S04: the REQ-038 row.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/gallery-crosswalk.md` sha256 `dda789929a52e84671ac1a2cf810567630f6d98e44199511d0d778eae3a6de36`. S05: the #665 / TASK-038 row.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/REUSE.md` sha256 `9f6b702c6daa40626c2ca3c47740be1862b538c72b0edfec18834aac36f8ce46`. S06: shared owners, and missing-coaching rules kept as open definition work.
- `ref:accepted-gallery/docs/design/library/refinements-2026-11-04/LOGGING-FIELDS.md` sha256 `ab9d7ff1ccb10ec0dd6bb19c351369b0b06dde708c9f54246ae87a4a7a214a7f`. S07: the Movement note row (its own save and error ownership).
- `ref:accepted-gallery/src/ui/refinements/workout-card.tsx` sha256 `af52bde796d22a67b976deb78c846ac196984376f3fb8170427edb01596325f9`. S08: the accepted card's Coaching and notes disclosure (a note field per movement).
- `repo:src/ui/exercise-coaching.tsx` sha256 `abdba65a824c40c2a3d6225a12de542913e61ac50086709d27401b81dfd6c0f9`. S09: the Coaching and notes owner: guidance states, note field, writer status and their words.
- `base:src/state/exercise-queries.ts` sha256 `3dfb934c8e5810522d01ee6eea0d29a03fca98c9bb457bf082df1d639bfddc1c`. S10: the catalog read by slug and the note writer's cache.
- `base:src/data/exercises.ts` sha256 `c185de4f83eb6c2943e5794b1f52b7c99d1e2847036faee686b197a090091685`. S11: the catalog read (zero rows answer null) and the note update.
- `base:src/ui/view-state.tsx` sha256 `74d050a3ccabff78c14c19f861213832df6355865b7c9093f5494810ea12d8f1`. S12: the shared loading and error views.
- `base:supabase/migrations/20260921000000_catalog_domain.sql` sha256 `ef5046c13a26551af4911668a3e81fcbe5a1eb8c44ef85dbf611dbc723f03691`. S13: `exercise_definitions`, its regression link and its read policy.
- `base:supabase/migrations/20260921000003_workout_domain.sql` sha256 `e1fe4318818203c9482e84b012941941acf141db5af22a8e263215c3579991d2`. S14: `workout_exercises.exercise_id` and `exercise_notes`.
- `base:supabase/seed/010_exercise_definitions.sql` sha256 `c946e794ec72a858acf601ab5d0d3dfe57007224aff7f81ad87b7886cd427c58`. S15: the 140 catalog rows and their regression links.
- `base:supabase/seed/README.md` sha256 `b5ca166a1c73c6b4f6b15dca973adfb7398455cfc92c021d92afd61285fcb8ae`. S16: the seed is what the database is given; the repair migrations only add tags.
- `repo:src/dev/gallery-refinement-cards-data.ts` sha256 `af11d792ca463da0bc92cbba9ece1bd3d3894638110d835a88f0eab2683974f1`. S17: the cards state's synthetic blocks and their movement slugs.
- `repo:src/dev/gallery-refinement-coaching-data.ts` sha256 `7024eaa2eb94e1d57e1360cf7f3096d14daf1f14abdca655e0578df6b57e46a5`. S18: the gallery's in-memory library answers.
- `repo:src/dev/gallery-refinement-coaching.tsx` sha256 `27afcffed0fc252b92621e6e2992e1e7f12e0ba0f0c5e8bd7d5bfacfdc5bf441`. S19: the gallery's memory-only clients and the register's states specimen.
- `repo:src/dev/gallery-refinement-cards.tsx` sha256 `5cb80b11b5f968bca0b0ab8ef7d627b29729421917d561235f17b1d719f2ca55`. S20: the cards state draws the actual grouped owner.
- `repo:src/test/grouped-coaching-fixture.ts` sha256 `49d4499d789d50e12bdd7b4b122e853c48dd87ae286bef5573c63aab37c458d9`. S21: the shared test fixture's per-slug library answers.
- `repo:src/ui/group-exercise-coaching.test.tsx` sha256 `12c13e7061b21f807d58105b6993d529d8f3980ea4f6877eec2f6329563f6712`. S22: TASK-005's grouped-disclosure cases.
- `repo:src/ui/exercise-coaching.test.tsx` sha256 `af5ce47ef5fb775ef4dce62cdbf16872accc7dfc80564e7f1d74f53b74dbd1b6`. S23: the standalone panel's cases.
- `repo:src/data/refinement-logging-contract.ts` sha256 `bc692cc7eb8a101da9368dc3212a8cd0f16078feb723f44f62c89fd7556aec1b`. S24: the movement-note field contract.
- `repo:src/app/SessionDetail.tsx` sha256 `23db5e9b9221ccd1a51adc153f0371448caf49a940f38438b9d7085b47385274`. S25: the History detail's session notes reading.
- `repo:src/state/session-detail.ts` sha256 `07271dd91550f21dd675b384692dfc0bc58dc2ee9aa18b2ccbe9352c01eaa3dc`. S26: the History detail read model.
- `repo:src/ui/refinements/workout-card.tsx` sha256 `4836740f53c52919166339966b1caa5e4af5e4ae151be810d6944875d6d2cc5d`. S27: the app's `WorkoutCard` and its `coaching` slot.
- `repo:src/ui/refinements/movement.tsx` sha256 `47d9b1cf73f6f1d5ff567278a87ff376eac46716960db5e69811f33cfb00afa0`. S28: the shared movement identity owner.
- `repo:docs/definitions/clear-refinement-20261103/TASK-037.md` sha256 `b8f25e30a0175048adc91e12d270f31cd53bd1d86117da88da2e0bbdcfc12f38`. S29: the copy inventory and the COPY-VOICE owner decision.

## Current observations

How the guidance and the note are owned today. None of this is a proposal.

- **O1** One owner draws both halves. `GroupExerciseCoaching` draws one bottom disclosure for a
  grouped block with a labelled section per movement; `ExerciseCoaching` draws one panel per
  movement of a standard block [S09]. The grouped appearance was accepted and is preserved (R36,
  G11) [S01] [S02].
- **O2** The guidance is the catalog's. It is read by slug through `useExerciseDefinitionQuery`,
  only once the disclosure is first opened, and attributed `From the exercise library` [S09]
  [S10]. A read that finds no row answers `null`, which is a different answer from a failed read
  [S10] [S11].
- **O3** The note is the athlete's. It is the `exercise_notes` column on one prescription row,
  written through `saveNotes`, one row per save [S11] [S14] [S24]. A null is "no note", and an
  emptied field saves null [S24] [S09].
- **O4** The two halves fail apart. Each movement section holds its own guidance read and its own
  note field, draft, writer, status and error [S09], which is the Movement note row's "independent
  save/error ownership" [S07].
- **O5** Review draws no Coaching and notes: nothing is persisted before Start, so there is no
  prescription row for a note [S09].

## State inventory

Every state the owner draws, per movement section, in the owner's own words [S09]. The guidance
states (I1 to I7) and the note states (I8 to I12) are independent: any guidance state can sit
beside any note state [S09].

- **I1** Written guidance. The catalog row has cues or a regression: `From the exercise library`,
  then a `Cues` list and a `Regression` reading [S09].
- **I2** Blank cues. The row has no written cue: `No coaching cues are written for this movement.`
  A blank cue is dropped rather than drawn as an empty bullet [S09] [S23].
- **I3** Blank regression. The row's regression is null or blank: `No regression is written for
  this movement.` [S09] [S23].
- **I4** Missing catalog entry. The read finds no row: `The library has no entry for this movement,
  so there are no cues or regression.` It replaces both I2 and I3 [S09] [S11].
- **I5** Not yet read. Until the disclosure is first opened no guidance is read or drawn; the note
  field is already there [S09].
- **I6** Loading. `Reading coaching for` the movement, in the shared loading view, which says
  `Taking longer than usual` once slow [S09] [S12].
- **I7** Failure. `Coaching for` the movement `didn’t load`, with the error's message and a
  `Try again` action that reads again, inside that movement's section only [S09] [S12].
- **I8** Blank user note. With no stored note the field `Notes — ` the movement is empty and the
  status line says nothing; there is no "no note" sentence inside the disclosure [S09] [S24].
- **I9** Stored note. The field holds the stored note: the last successful save, otherwise the
  note the session row carried [S09] [S10].
- **I10** Saving. `Saving…` while the button stays busy [S09].
- **I11** Saved. `Note saved` with a check glyph, claimed only from the row that came back [S09].
- **I12** Not saved. `Not saved` with a warning glyph and `Your note didn’t save. It is still in the
  field — try again.`, keeping the typed text [S09] [S22].
- **I13** Repetition. Each section states its own answer, so movements that give the same answer
  repeat the same sentence once each; no hide or replacement rule was selected [S09] [S02]. In the
  gallery cards state the ten-station circuit repeats I4 ten times (F2) [S17] [S18] [S20].
- **I14** Adjacent, different field. The History detail's `No notes` is the session's own note,
  read from `session_notes`; the History read model does not read a movement's note [S25] [S26].
  It is listed so the two are not confused, not as a Coaching and notes state [S24].

## Fixture and catalog identity

Checked before any catalog gap is diagnosed (R73: "Whether these fixture movements reflect real
catalog gaps requires later verification") [S02].

- **F1** The catalog. The database is given 140 `exercise_definitions` rows by the seed, and the
  repair migrations add tags without inserting rows [S15] [S16]. Every authenticated user may read
  every row [S13]. A prescription's `exercise_id` references `exercise_definitions` and a catalog
  entry cannot be removed from under it [S14]. So a persisted prescription always has a catalog row
  its section can read: I4 cannot arise on `/workout` from the real catalog, and a read that fails
  is I7, not I4 [S11] [S13] [S14].
- **F2** The gallery cards state's library (`GALLERY_CATALOG`) [S17] [S18] [S15]. Its answers are
  synthetic, per slug, and only three of its slugs are catalog ids:
  - `back-squat`: in the catalog; library answer: no entry.
  - `romanian-deadlift`: not in the catalog (catalog row `rdl`); library answer: no entry.
  - `single-arm-kettlebell-overhead-reverse-lunge-to-knee-drive`: not in the catalog; library
    answer: written.
  - `push-up`: not in the catalog (catalog row `push-ups`); library answer: written.
  - `kb-swing`: not in the catalog (catalog row `swing`); library answer: written.
  - `mountain-climber`: not in the catalog (catalog row `mountain-climbers`); library answer: no
    entry.
  - `plank`: in the catalog; library answer: blank.
  - `burpee`: not in the catalog (catalog row `burpees`); library answer: written.
  - `wall-ball`: not in the catalog; library answer: written.
  - `alternating-dumbbell-renegade-row-to-push-up-and-reach`: not in the catalog; library answer:
    no entry.
  - The nine `station-` movements of the ten-station circuit: not in the catalog; library answer:
    no entry.
- **F3** The register's states specimen (`STATES_CATALOG`, the circuit) [S18] [S19] [S15]:
  - `kb-swing`: not in the catalog (catalog row `swing`); library answer: written.
  - `mountain-climber`: not in the catalog (catalog row `mountain-climbers`); library answer: blank.
  - `plank`: in the catalog; library answer: read fails.
- **F4** The shared test fixture (`COACHING_GUIDANCE`), used by TASK-005's checks [S21] [S22] [S15]:
  - `back-squat`: in the catalog; library answer: written.
  - `dumbbell-bench-press`: not in the catalog; library answer: written.
  - `chest-supported-row`: not in the catalog; library answer: no entry.
  - `kb-swing`: not in the catalog (catalog row `swing`); library answer: written.
  - `mountain-climber`: not in the catalog (catalog row `mountain-climbers`); library answer: blank.
  - `goblet-squat`: in the catalog; library answer: read fails once.
- **F5** Where a fixture slug is a catalog id, its answer is still synthetic and differs from the
  catalog row: the catalog's `back-squat`, `plank` and `goblet-squat` rows all have written cues
  [S15] [S17] [S18] [S21].
- **F6** The fixtures write a regression as prose, such as `Kettlebell deadlift` or `Easier`
  followed by the movement, while the catalog stores a regression as the id of another catalog row
  [S13] [S15] [S18] [S21].
- **F7** The R73 screenshot came from an earlier review preview whose fixture is not among the
  verified sources, so its movements cannot be identity-checked here; the repository's current
  fixtures are (F2 to F4) [S02].

## Catalog content findings

Diagnosed only after F1 to F7, and only from the catalog rows themselves [S15].

- **K1** Every "no entry" (I4) the fixtures demonstrate comes from a synthetic slug or a synthetic
  answer, not from a catalog gap: `mountain-climber`, `kb-swing`, `burpee` and `push-up` have
  catalog rows under other ids, and `back-squat` is a catalog row (F2 to F5) [S15] [S17] [S18]
  [S21].
- **K2** No catalog row has a blank cue list, so blank cues (I2) do not arise from the seeded
  catalog [S15].
- **K3** Only 11 of the 140 rows name a regression. Every other movement's opened section states
  `No regression is written for this movement.`, so this is the empty answer a real grouped
  disclosure repeats [S15] [S09].
- **K4** The owner draws a stored regression as it is, so a real section reads a catalog id such as
  `goblet-squat` under Regression, where every fixture shows prose (F6) [S09] [S15].
- **K5** Whether the catalog should gain rows such as `wall-ball`, more regressions or other
  content is a catalog-content question this record does not diagnose or repair (R73: "do not
  diagnose or repair the movement catalog during intake") [S02] [S15] [S17].

## Notes availability

- **N1** Movement notes stay available independently of missing coaching. In both the grouped
  section and the standalone panel the note field is drawn unconditionally beside the guidance,
  never inside the guidance's state: a missing entry (I4), blank guidance (I2, I3), a wait (I5,
  I6) or a failure (I7) never removes, hides or disables it [S09].
- **N2** The note has its own writer and status, so a missing entry still saves a note: TASK-005's
  case `AC-R005-01 keeps the note of a movement the library has no entry for, and saves it` and the
  panel's case `still saves a note for a movement the library has no entry for` prove it [S22]
  [S23].
- **N3** The accepted card draws a note field for every movement of its Coaching and notes
  disclosure, with no guidance condition [S08] [S27].

## Options

No option is selected. These are inputs for the owner decision below, not a design. None proposes
wording: any new words are decided under COPY-VOICE [S29].

Rules for empty guidance answers (I2, I3, I4):

- **H1** Keep as now: each section states its own answer, repeated per movement (I13) [S09] [S02].
- **H2** State a shared empty answer once per disclosure, for the movements that give it, instead
  of once per section [S02] [S09].
- **H3** Hide an empty answer: a section with no written guidance shows only its note field [S02]
  [S09].
- **H4** Read a missing entry (I4) as a fault rather than as content, since F1 shows it cannot arise
  for a persisted prescription; blank cues and regressions then follow H1, H2 or H3 [S02] [S14].

How a regression reads (K4):

- **Q1** Show the stored regression as it is, a catalog id [S09] [S15].
- **Q2** Show the name of the catalog row the regression names, which needs that row's name read
  as well [S13] [S15].

Scope of the wider review R73 records:

- **W1** Settle the rule for Coaching and notes only [S02].
- **W2** Also open the prospective cross-platform empty-state review as its own work; G21 keeps
  broader platform work "visible separately" [S01] [S02].

Constraints every option keeps:

- **C1** The note field stays in every section whatever the guidance answers (N1) [S09] [S07].
- **C2** Loading (I6) and failure (I7) stay distinct from the empty answers (I2 to I4) [S01] [S09].
- **C3** Guidance is only the library's authored content: no generated cue fills a gap [S09].
- **C4** The accepted grouped disclosure's appearance and placement stay (R36, G11) [S01] [S02].
- **C5** No catalog row is added or changed by choosing a rule (K5) [S02].
- **C6** No new string without the copy owner: wording goes through COPY-VOICE [S29].

## Open owner decisions

- **G21-COACHING-EMPTY-RULE**
  Owner: Eric (product owner, R73 source) [S02].
  Decision: choose the rule for empty guidance answers in Coaching and notes (one of H1 to H4, or
  another named rule) and how a regression reads (Q1 or Q2) [S01] [S02].
  Also needed in the same decision: whether the wider cross-platform empty-state review is opened
  as its own work (W1 or W2) [S01] [S02]. Any new words are then decided under COPY-VOICE [S29].
  Blocks: any change to whether or how the guidance's empty answers are drawn. Does not block: the
  note field, the accepted grouped disclosure, or unrelated shared presentation [S01] [S09].

## Gallery disposition

- The coverage map lists REQ-038 with state `cards`, the shared owners `movement.tsx` and
  `workout-card.tsx`, and the limit `Grouped appearance is demonstrated. Missing coaching/empty/error
  inventory and rules remain definition work.` [S03] [S04].
- The original crosswalk says the complete inventory and the unresolved rule "are not proven by
  gallery examples" [S05].
- The cards state already draws the actual `GroupExerciseCoaching` in `WorkoutCard`'s `coaching`
  slot, through memory-only clients [S19] [S20] [S27]. This task changes no gallery state, owner,
  CSS or token: no rule is selected, so nothing new can be demonstrated [S05] [S06].
- The shared owners were read and kept unchanged: `WorkoutCard` places the slot, and the grouped
  sections are labelled by the movement's name rather than by `MovementIdentity` [S27] [S28] [S09].

## Limitations

- No rule is implemented and no copy is changed: the owner still draws every answer in I1 to I14
  [S09].
- Catalog identity is checked against the seed and migrations the database is given, not against
  the hosted project's rows [S15] [S16].
- The R73 screenshot's fixture is not identity-checked (F7) [S02].
- The wording of every state stays with the copy inventory and COPY-VOICE [S29].
- A saved movement note is not read back on History (I14); whether it should be is outside REQ-038
  [S26].
- Sources read from this revision (marked repo) pin its bytes. When a cited file changes, this
  record must be re-sourced before a rule task relies on it [S09] [S17].

## Traceability

- Source note R73 [S02] -> decision groups G21 and G11 [S01] -> REQ-038 [S03] -> AC-R038-01 and
  AC-R038-02 [S03] -> TASK-038 (#665) [S05] -> this record -> check-01
  (`scripts/refinement/task-038-definition.test.mjs`).
- Evidence: EVID-C167F3DF2675 (G21) and EVID-76CED19E0F10 (product-definition and data work must
  remain visible) [S01].
- AC-R038-01 is met by State inventory, Fixture and catalog identity and Catalog content findings,
  in that order. AC-R038-02 is met by Notes availability, Options and Open owner decisions [S03].
- A future change to the empty answers must cite this record and the owner's answer to
  G21-COACHING-EMPTY-RULE. The note field and the accepted disclosure need neither [S01].
