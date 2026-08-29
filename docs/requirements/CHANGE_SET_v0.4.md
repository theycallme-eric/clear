# CLEAR Rebuild — Requirements v0.4 Change Set

> **Status:** proposal, for review before any schema is written
> **Revision 3 (2026-08-24):** duration reduced from an engine to a plausibility guardrail. Intensity normalization narrowed to an ownership model. All duration metadata removed — `DATA-04` withdrawn. Invariants I1 and I3 simplified to state outcomes rather than mechanisms. Acceptance checks reframed as obligations on the forthcoming schema rather than claims about this document.
> **Scope:** data invariants · generation contract · structured prescriptions · duration guardrail · user constraints
> **Deliberately excludes:** SQL. No tables, columns, indexes, or policies. Those follow once this is agreed.

---

## 1. Why this change set exists

Two defects verified in the current codebase. Both produce *plausible wrong answers* rather than visible failures.

### D6 — Swapped exercises are never persisted

Verified path:

1. Generation succeeds → `saveGeneratedWorkout()` writes the **original** prescription.
2. The user swaps an exercise in Review → `useExerciseSwap` mutates **React state only**. No write.
3. `handleStartWorkout()` records a timestamp and navigates. **No write.**
4. The user performs the swapped workout.
5. Set logs attach to `exercise_set_logs.exercise_row_id` → rows describing the **original** exercises.

The only post-save writes to `exercises` are `weight_logged` and `exercise_notes` at completion.

**Swap Deadlift for Romanian Deadlift, log 3×8 at 185, and the database records 3×8 at 185 on Deadlift.**

Silent corruption of the table progressive overload will read. This makes the prescribed / revised / performed distinction a **correctness requirement**, not an architectural preference.

### D5 — Duration validation is tautological

`validateWorkout()` compares `workout.estimated_duration_mins` — a value **Claude asserts** — against the requested duration. The prompt tells Claude "45 minutes"; Claude writes 45; the validator confirms 45 ≈ 45.

The check cannot fail. It is not loose validation — it is zero validation wearing a tolerance.

**The fix is independence, not precision.** Any estimate the backend computes for itself is strictly better than a number the model was told the answer to. §7 is deliberately crude.

---

## 2. Data invariants

| # | Invariant |
|---|---|
| **I1** | The originally generated prescription remains **reconstructable**. Replacements and regenerations retain lineage to what they replaced. *The schema chooses the mechanism — revision records, snapshots, replacement references — whichever is simplest.* |
| **I2** | Three states are independently reconstructable for any workout: **as generated**, **as intended at start**, **as performed**. |
| **I3** | Execution items carry a status (`not_started` · `completed` · `skipped`). Actual values may be null. **Zero is a valid recorded value.** Prescription modality determines when a field is not applicable. **A null actual never means zero and never means skipped.** |
| **I4** | Execution data attaches to the exercise the user actually performed. It never migrates to a substitute and is never orphaned by one. |
| **I6** | Later preference or working-weight changes affect future generation only. Historical records are immutable. |

**I1 states an outcome, not an architecture.** Whole-workout versioning is one way to satisfy it and probably not the simplest.

**I3 replaces a per-field reason code with a per-item status.** A skipped exercise is a status, not three nulls with an annotation. An unlogged weight on a completed set is simply null, and null is never read as zero.

### Proportionate, not elaborate

**I5 (derived values cite their sources)** and **I7 (version stamping)** remain the right direction, implemented in proportion to demonstrated need.

**Minimum now:** generated workouts retain the **prompt version** and the **generation-contract version**. `workout_sessions.prompt_version` already exists, so this is a small extension.

**Not now:** versioning the exercise library and the validator. Add when something demonstrably needs to ask what the library looked like at generation time.

---

## 3. The three states, precisely

| Interaction | State it writes | Notes |
|---|---|---|
| Generation produces a workout | **prescribed** | The baseline everything else references |
| Exercise swap in Review | **revised** | Lineage to what it replaced. **Exists today, currently lost — this is D6** |
| Section regeneration | **revised** | Lineage at section granularity |
| Full regeneration before start | **revised** | Lineage to parent; unaffected revisions preserved |
| Pre-start sets/reps edit (REV-04) | **revised** | Feature not built; the schema must not preclude it |
| Different reps or weight entered while training | **performed** | Not an edit. The plan stood; the body did something else |
| Field left empty during training | **null** | Never zero, never a skip |
| Exercise explicitly skipped | **status: skipped** | A real observation, distinct from silence |

The last three carry the most weight. **Changing reps mid-workout is not editing the plan** — it is recording what happened. Conflating them is how a system convinces itself you are progressing when you are deviating.

---

## 4. Generation output contract v4.1

**Claude keeps:** exercise selection from a supplied candidate set · section composition and ordering · pairings and groupings · concise overview and section rationale · coaching emphasis for the day's focus.

**Claude loses:**
- **Duration authority.** Its estimate may still be returned as diagnostic information, but it is not consulted for validation.
- **Factual metadata.** No exercise `name`, no equipment display strings, no canonical cues or regressions. Hydrated from the catalog by ID. A model reproducing facts it cannot verify is how facts drift — and it is output tokens spent on data you already have.
- **Free-form `reps`.** Replaced by a structured prescription (§6).

**Claude gains:** a bounded candidate set per section, so eligibility is settled before composition rather than requested in prose · explicit `session_function` and `anchor_relationship` per exercise, splitting today's single overloaded field.

**Consequence:** rules currently described to the model in prose become constraints already applied to its input. The prompt gets shorter, the candidate list gets smaller, and a rule enforced by filtering cannot be forgotten.

---

## 5. Requested versus effective inputs

Both are retained on every generation. When a rule clamps or interprets an input — goal constraining an intensity range, duration trimming work — the requested value and the effective value are both recorded.

This is what makes an adjustment visible rather than mysterious, and it is the minimum needed to debug a generation six weeks later.

---

## 6. Structured prescriptions

**Approved because they support:** reliable execution renderers · timers · prescribed-versus-performed comparison · partial logging · progression · a basic duration plausibility check.

Today `exercises.reps` is TEXT holding at least four data types — `"8"`, `"30 sec"`, `"AMRAP"`, `"15-12-9-6-3"`. Every consumer parses strings and guesses.

A prescription expresses, as discriminated data:

- **Modality** — repetitions · time · distance · rounds. Determines which fields apply and which are not applicable.
- **Sets or rounds** — count
- **Work per set** — reps, duration, or distance, per modality
- **Rep scheme** — fixed, or an explicit ordered sequence for ladders and pyramids
- **Load guidance** — a band or reference (percentage, RIR, bodyweight, "same as last time"), never a bare number the model invented
- **Rest** — between sets, and separately between rounds
- **Tempo** — structured or display-oriented. **Not consumed by duration in this implementation.**
- **Timer contract** — none · count-up · countdown · interval · per-minute, with each one's parameters
- **Interval role** — for schemes where a secondary movement fills the gap between rungs

**Ladders are the test case.** `"15-12-9-6-3"` survives as five ordered targets, because the renderer needs them individually and progression needs to know which rung was reached. Note this removes string parsing rather than adding it.

**This does not imply every repetition converts to an exact number of seconds.** Structured prescriptions exist for execution, logging, and comparison. Duration is a beneficiary, not the justification.

---

## 7. Duration plausibility check

**Purpose: reject workouts that clearly cannot fit. Not predict completion time.**

The backend computes a rough estimate independently of Claude. Crude on purpose — the bar it has to clear is a check that currently always passes.

| Component | Rule |
|---|---|
| Standard work | fixed **30–45 second allowance per set** |
| Inter-set rest | `(sets − 1) × rest_seconds` — no rest after the final set |
| Superset / circuit rest | shared rest counted **once per completed round** |
| EMOM · AMRAP | declared duration |
| For Time | **the full time cap** — the user may need all of it |
| Transitions | a small fixed allowance per exercise or section |
| Tolerance | **~15–20%**, generous by design |

**Explicitly not doing:** parsing tempo · seconds-per-rep classification · equipment-based transition tables · per-exercise duration overrides · a separate duration service.

**Acceptance test:** a workout whose prescribed work and required rest clearly cannot fit the selected duration is rejected or trimmed. That is the whole job.

**On tuning from real data:** `workout_sessions.duration_mins` records actual elapsed time, and `workout_sections` already carries `started_at` and `completed_at` — so a persistent overrun can be traced to a *section*. It cannot be attributed to a specific exercise without finer timing than the product captures. Any future calibration should adjust the global allowance, not manufacture per-exercise precision from data that cannot support it.

---

## 8. Intensity — ownership, not normalization

The user-facing control stays **1–10**. A second dial pushes backend complexity onto someone walking into a gym.

The earlier six-dimensional deterministic profile is **withdrawn from v0.4**. It promised technical-tier and impact ceilings enforced against catalog metadata that §9 defers — a rule that cannot be enforced is not a rule.

Instead, a clear division of what governs what:

| Input | Governs |
|---|---|
| **Intensity** | Intended session effort |
| **Goal** | Load, rep, rest, and density character |
| **Duration** | How much work fits |
| **Experience** | Soft technical-complexity guidance |
| **Explicit constraints** | Deterministic exclusions, where catalog data supports enforcement |
| **History** | Repetition avoidance and future loading context |

**Requested and effective intensity are both retained** when goal rules clamp or adjust it (§5).

This still addresses the compounding problem the review identified — intensity no longer silently multiplies load, volume, density, complexity, and impact at once, because those now have distinct owners. It does so without inventing mappings or depending on metadata that does not exist.

The multidimensional profile remains a plausible future direction. It is not an M1 requirement until its mappings and supporting metadata are defined.

---

## 9. Exercise metadata

**No new per-exercise metadata is required.**

The duration check in §7 uses fixed allowances held as **code constants**, plus `rest_seconds` and `sets`, which the prescription already carries. Nothing needs a table.

Explicitly withdrawn: role-speed tables · equipment-transition tables · per-exercise duration overrides · the metadata-authoring workstream.

**Still deferred:** `impact_category` and `technical_demand`. Both existed for a safety layer requiring fitness-domain review to author responsibly. Deferring them removes that dependency rather than working around it.

Revival conditions: impact returns when an impact constraint exists *and* the catalog can enforce it; technical demand returns if generated sessions show a pattern of misplaced technical work that prompt guidance cannot fix.

---

## 10. User-authored constraints

CLEAR does not model injuries.

**Supported initially** — the three enforceable against existing catalog data:

| Scope | Enforced by |
|---|---|
| **Exercise** | direct ID exclusion |
| **Movement pattern** | existing anchor / component tagging |
| **Equipment** | existing `equipment_options` |

Each constraint carries an action (**exclude** — hard and deterministic · **avoid** — ranking penalty · **prefer not** — soft), a duration (**this session** · **persistent**), and an optional note.

**No impact constraint** until the catalog carries enough impact data to enforce it. Offering a constraint the system cannot honor is worse than not offering it.

### Free text

Free text may influence Claude's composition as **best-effort context**. It does not create a persistent or deterministic exclusion.

CLEAR does not diagnose injuries or silently convert symptom descriptions into stored rules. Claude may read "left shoulder has been bothering me" and compose conservatively — that is useful, and it is not presented as a safety mechanism. A deterministic exclusion comes from an explicit user selection, always.

---

## 11. Requirement impact

### New

| ID | Scope | Milestone |
|---|---|---|
| `DATA-05` | User-authored constraints: exercise, movement pattern, equipment | M0 |
| `GEN-06` | Duration plausibility check, allowances as code constants | M1 |

`DATA-04` (duration metadata) is **withdrawn**. `GEN-07` (intensity normalization) is **withdrawn** — §8 is an ownership model, not a subsystem.

### Substantially revised

| ID | Change |
|---|---|
| `DATA-01` | Three-state model, item status, lineage, prompt and contract version stamping |
| `CORE-03` | Schemas for structured prescriptions — every modality, every timer contract, ladders as ordered targets |
| `GEN-02` | Output contract v4.1: no duration authority, no invented facts, bounded candidates |
| `SES-01` | Persists all three states; **acceptance must include the D6 reproduction as a regression test** |
| `REV-02`, `REV-03` | Swaps create revisions with lineage rather than mutating in place |
| `EXE-02`, `EXE-03`, `EXE-04` | Renderers consume structured prescriptions instead of parsing strings |
| `EXE-05` | Rest timing from structured rest rather than inference |
| `OVR-01` | Prescribed reps become computable rather than parsed |
| `DATA-03` | Types regenerate against the new schema |

### Unaffected

The entire ENV trunk, the DS trunk, AUTH, CORE-01/02/04, HOME, HIST, SET, FAV, PWA. **Roughly two-thirds of the graph does not move.**

---

## 12. Scope

### Required now

1. Fix D6 — preserve prescribed, revised, and performed
2. Performance logs attach to the exercise actually performed
3. Structured prescriptions with discriminated modalities
4. Lightweight duration plausibility calculation
5. Persist requested and effective generation inputs
6. Version the prompt and generation contract
7. Explicit exercise, movement-pattern, and equipment exclusions
8. Update execution renderers and regression tests for the new contract

Item 8 is the largest work item and the easiest to underestimate — every structure renderer changes.

### Open decisions

- **Anchor taxonomy** — `anchor_type` holds movement patterns, body regions, and a modality in one enum used for both sessions and exercises. Splitting session **focus** from exercise **movement pattern** makes coverage balancing and `suggest_anchor` precise and removes a prose translation step from the prompt. No UI change; exercises are already tagged. *Recommended, cheaper now than later.*
- **REV-04 promotion** — the schema supports pre-start editing; whether it ships in M2 is a product-priority call
- **After-start regeneration** — what is editable once a workout begins, and what locks
- **Global working-weight change scope** — one exercise, a movement family, an equipment variant, or all future prescriptions

### Deferred

Seconds-per-rep metadata · equipment-transition tables · per-exercise duration overrides · precise duration calibration · full six-dimensional intensity normalization · deterministic technical and impact ceilings · impact constraints without catalog coverage · derived athlete state beyond OVR-01 · wearables · advanced regeneration analytics · quality scoring · calendar programming · any clinical ontology.

---

## 13. Obligations on the forthcoming schema

This document contains no schema, so it cannot claim these are satisfied. **The schema and generation-contract proposals must demonstrate how they meet them.**

- Reconstruct what was prescribed, what was revised, and what was performed
- Store a partial log without treating null as zero or as a skip
- Preserve unaffected revisions and execution data through regeneration
- Attach execution data to the exercise actually performed, through substitution
- Compute a duration estimate independently of Claude, sufficient to reject implausible workouts
- Deterministically exclude constrained exercises, patterns, and equipment before composition
- Retain requested and effective generation inputs
- Retain prompt and generation-contract versions on every generated workout
- Support one Postgres deployment without artificial boundaries

Claims about citing observations for future recommendations, adding readiness integrations without redesign, and full rule traceability are **deferred until a schema demonstrates them.** They are not asserted here.
