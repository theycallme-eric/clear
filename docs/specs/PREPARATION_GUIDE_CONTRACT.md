# Preparation guide contract: Warm-up and Cooldown content and approximate duration

TASK-034, REQ-034 (AC-R034-01, AC-R034-02). Body `clear-refinement-20261103`. Status: engineering
definition with a typed reading and deterministic tests. It adds no route, component, clock, writer,
migration or live call, and it does not claim the accepted guide presentation is implemented.
TASK-022 (REQ-022, C49) draws it on `/review` and `/workout`; TASK-023 orders Review's Regenerate
after it.

Typed half: `src/state/preparation-guide.ts`. Check: `src/state/preparation-guide.test.ts`
(check-01). This file and the typed source record must agree; check-01 fails when an owner, a
never-read column or a missing reason named in code is absent here.

## 1. What the accepted guide shows

Accepted gallery reference `eded158cfd928d382c9a9409e2c372270312741d`, state
`/gallery/refinements?state=preparation`; G14 / C49; correction notes R01, R13, R14, R15, R36:

- the title `Warm-up` or `Cooldown`, never a generated custom title ("Prepare for the press");
- an approximate total time;
- the relevant movement names on separate lines;
- no explanatory paragraph and no per-movement prescription (weight, time, sets, rest).

R01 and R13 bound the illustration: "~4 minutes" and three rows illustrate the presentation; they are
not a duration or a required count. G14 adds: "Approximate duration/counts are data, not screenshot
constants." The reference scene's `minutes={5}` default and its sample names are not adopted.

## 2. Sources: one owner per field

| Field | Owner (module, export) | Reads | Never reads |
| --- | --- | --- | --- |
| Title | `src/state/onboarding.ts`, `sectionTypeLabel` | `section_type` | `section_title`, `section_notes` |
| Movements, composed (Review) | `src/state/schemas.ts`, `sessionAcceptanceSchema` | `workout.sections[].blocks[].exercises[].exercise_id`, every row in composed order | `sets`, `target_value`, `target_min`, `target_max`, `target_sequence`, `per_side`, `rest_seconds`, `tempo`, `load_type`, `load_value` |
| Movements, persisted (Workout) | `src/state/schemas.ts`, `sessionSnapshotSchema`; rows converted by `src/state/swap.ts`, `prescriptionFor` | active `workout_exercises` rows (`revision_status = 'active'`) by `order_index` | the same prescription columns, and `exercise_notes` |
| Name | `src/state/prescription.ts`, `exerciseName` | `exercise_id`, the catalog slug | `equipment`, `session_function` |
| Count | `src/state/preparation-guide.ts`, `composedPreparationGuide` | the movements listed | — |
| Approximate time | `supabase/functions/_shared/duration.ts`, `estimateDuration` (GEN-06, contract §7) | the section's blocks and prescriptions, `WORK_PER_SET_SECONDS`, `TRANSITION_SECONDS` | `estimated_duration_mins`, `computed_duration_mins`, `effective_duration_target_mins`, `requested_duration_mins` |

Rules:

- **Original movement selection.** Every prescribed movement in the section is listed in the order
  composed. Nothing is filtered, merged, deduplicated, curated or added. After a swap, the persisted
  reading lists the active replacement in the superseded row's place.
- **Same reading in both contexts.** The composed workout and the session accepted from it give the
  same title, names, count and time (check-01 proves it through the real sessions client).
- **Approximate time.** GEN-06's own estimate of the section alone: its blocks (sets × the
  work-per-set allowance, prescribed rest between sets, a block's declared clock for timed
  structures) plus one transition per movement. No session-level transition. Seconds round to whole
  minutes, at least one, and read `~N minutes` (`~1 minute` for one). No second duration model and
  no constant lives in the reading.
- **Not Overview's Duration.** The Overview fact stays the effective target (REV-01). The guide's
  time is the section's approximate cost and is never compared with the target.

## 3. Reading states

`preparationGuideReading(source, type)` takes the `QueryState` the consumer already holds — the
composed workout (`{ origin: 'composed', workout }`) or the session snapshot
(`{ origin: 'persisted', snapshot }`) — and answers one of:

- `loading` — the source is loading;
- `error` — the source failed (the same `AppError`), or a persisted row's target columns contradict
  its `target_kind` (`PERSISTENCE_READ_FAILED`, `reason: 'target_shape'`), which is never guessed;
- `missing`, with a reason, never an empty guide:
  - `no-workout` — the source answered with nothing (no handoff, no session);
  - `not-composed` — the workout has no section of this type (switched off, or a goal that does not
    compose it);
  - `no-movements` — the section exists with no active movement;
- `ready` — the guide: `type`, `origin`, `title`, `movements` (`key`, `exerciseId`, `name` only),
  `movementCount`, `approximateSeconds`, `approximateMinutes`, `durationText`.

The first section of the type is read; each enabled section is composed once. A consumer drawing
every section calls `composedPreparationGuide(section)` or `persistedPreparationGuide(entry)` per
section.

## 4. Observed reading (not a fixture constant)

The recorded generation response (`src/test/generation-response-fixtures.ts`, `VALID_RESPONSE`),
parsed by the edge parser, composes a two-movement Warm-up (`cat cow`, `worlds greatest stretch`,
each 2 sets with 30 s rest): 2 × (2 × 40 + 30) + 2 × 30 = 280 s, read as `~5 minutes`. It composes
no Cooldown, so its Cooldown reading is `missing` / `not-composed`.

## 5. Limitations and open owner review

- **The allowance is crude by design.** §7 counts every set, a timed hold included, as one fixed
  working-set allowance, so a long hold or slow mobility flow under-reads. The owner's word is
  "approximate"; this contract does not claim a prediction. Using stated hold times, or another rule,
  is an owner choice. It changes GEN-06's model or this one reading, never a consumer constant.
- **Names are the humanised catalog slug** (`exerciseName`), as on every movement row today. When the
  snapshot carries the catalog's display name, that one function changes.
- **The reading crosses a boundary.** The app imports GEN-06's pure estimator from
  `supabase/functions/_shared/duration.ts` (which itself imports only `src/`), so there is one
  duration owner rather than a copy that could drift. Nothing in that directory changed.
- **No presentation here.** The concise card, the separate preparation timer and the removal of
  Dismiss are TASK-022's. Regenerate's placement after Cooldown is TASK-023's.

## 6. Gallery disposition

The accepted state `/gallery/refinements?state=preparation` demonstrates the guide's appearance;
its coverage entry for REQ-034 states that content and duration source rules remain definition work.
The application gallery has no `preparation` state at this base, and the presentation owner that
state must draw is TASK-022's. This task therefore adds no gallery state, scene, CSS or synthetic
writer. TASK-022 adopts this reading in the routes and in that state, so the gallery draws data-derived
names and time instead of the reference's fixed `~5 minutes` and sample names. The shared owner
`src/dev/gallery-refinement-scenes.tsx` is unchanged.

## 7. Traceability

- AC-R034-01: §2 (sources, original selection, typed ownership) and §3; check-01 cases prefixed
  `AC-R034-01`.
- AC-R034-02: §3 (missing, loading, error, content) and §4; check-01 cases prefixed `AC-R034-02`,
  including the case proving the reading module holds no illustrated duration, count or sample
  movement.
- Sources: `CURRENT-REQUIREMENTS-AUTHORITY.md` G14 and C49; `INDIVIDUAL-CORRECTION-REGISTER-2026-11-03.md`
  R01, R13, R14, R15; gallery `REUSE.md` (open definition work: guide content/durations) and
  `gallery-refinement-coverage.json` (REQ-034, REQ-022).
