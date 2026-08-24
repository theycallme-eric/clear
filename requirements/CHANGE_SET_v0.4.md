# CLEAR Rebuild — Requirements v0.4 Change Set

> **Status:** proposal, for review before any schema is written
> **Revision 2 (2026-08-24):** §8 rewritten — exercise metadata derives from existing columns rather than being authored across 173 movements. `META-01` withdrawn. The fitness-reviewer dependency is removed, not worked around.
> **Scope:** data invariants · generation contract · duration rules · exercise metadata · user constraints
> **Deliberately excludes:** SQL. No tables, columns, indexes, or policies. Those follow once this is agreed.
> **Inputs:** the generation review, the Workout Intelligence System Map, the second-pass reduction, and two defects verified in the current codebase.

---

## 1. Why this change set exists

Two verified defects, not two opinions. Both are reproducible in the current code, and both are the kind that produce *plausible wrong answers* rather than visible failures.

### D5 — Duration validation is circular

`validateWorkout()` compares `workout.estimated_duration_mins` against the requested duration. That field is **asserted by Claude**. Nothing sums the prescribed work.

A session containing ninety minutes of sets, reps and rest passes validation by claiming forty-five. The duration check produces confidence without producing verification.

**Fix requires:** computable prescriptions (§5), a deterministic duration engine (§6), and removing the model's authority over the total.

### D6 — Swapped exercises are never persisted

Verified path through the current code:

1. Generation succeeds → `saveGeneratedWorkout()` writes the **original** prescription to the database.
2. The user swaps an exercise in Review → `useExerciseSwap` mutates **React state only**. No write.
3. `handleStartWorkout()` records a timestamp and navigates. **No write.**
4. The user performs the swapped workout.
5. Set logs attach to `exercise_set_logs.exercise_row_id` → rows describing the **original** exercises.

The only post-save writes to `exercises` are `weight_logged` and `exercise_notes` at completion.

**So: swap Deadlift for Romanian Deadlift, log 3×8 at 185, and the database records 3×8 at 185 *on Deadlift*.**

This is silent data corruption in exactly the table progressive overload will read. OVR-01's load anchors would compute deadlift capacity from RDL sets and never know. It is also the precise failure the prescribed/revised/performed model exists to prevent — which makes the three-state model a **correctness requirement**, not an architectural preference.

---

## 2. Data invariants

The schema must satisfy these. They are testable, and they are what the acceptance checks reduce to.

| # | Invariant |
|---|---|
| **I1** | A prescription is never mutated after generation. Revisions create new versions carrying lineage to what they replaced. |
| **I2** | Three states are independently reconstructable for any workout: **as generated**, **as intended at start**, **as performed**. |
| **I3** | Absence is typed. A missing value carries a reason — `not_recorded`, `skipped`, `not_applicable`. **Zero is a value, never an absence.** |
| **I4** | Execution data attaches to the exercise the user actually performed. It never migrates to a substitute and is never orphaned by one. |
| **I5** | Derived values never overwrite observations, and can cite the observations that produced them. |
| **I6** | Later preference or working-weight changes affect future generation only. Historical records are immutable. |
| **I7** | Every generated artifact records the versions that produced it: prompt, output schema, exercise library, validator. |

**I3 in practice.** A logged set with no weight is not a set at zero. An unlogged exercise is not a skipped exercise. A workout with no logs at all is not a workout that didn't happen. Every downstream confidence calculation depends on this distinction being in the data rather than inferred.

**I4 in practice.** This is D6 stated as a rule. When a substitution happens, the performed work belongs to the substitute — and the record shows both what was proposed and what replaced it.

---

## 3. The three states, precisely

Boundaries matter more than the concept, because most real interactions are ambiguous until you name them.

| Interaction | State it writes | Notes |
|---|---|---|
| Generation produces a workout | **prescribed** | Immutable from this moment |
| Exercise swap in Review | **revised** | New version + lineage. **Exists today, currently lost** |
| Section regeneration | **revised** | Lineage at section granularity |
| Full regeneration before start | **revised** | New prescription, lineage to parent; unaffected revisions preserved |
| Pre-start sets/reps edit (REV-04) | **revised** | Feature not built; schema must not preclude it |
| Different reps or weight entered while training | **performed** | Not an edit. The plan stood; the body did something else |
| Field left empty during training | **not recorded** | Never zero, never a skip |
| Exercise explicitly skipped | **performed: skipped** | A real observation, distinct from silence |

The distinction that matters most is the last three. **Changing reps mid-workout is not editing the plan** — it is recording what happened. Conflating them is how a system convinces itself the user is progressing when they are actually deviating.

---

## 4. Generation output contract v4.1

Changes to what Claude returns. Version bump because it breaks the current shape.

**Claude keeps:** exercise selection from a supplied candidate set · section composition and ordering · pairings and groupings · concise overview and section rationale · coaching emphasis for the day's anchor.

**Claude loses:**
- **Duration authority.** No `estimated_duration_mins`. Computed (§6).
- **Factual metadata.** No exercise `name`, no `equipment` display strings, no canonical cues. Hydrated from the catalog by ID. The model referencing a fact it cannot verify is how facts drift.
- **Free-form `reps`.** Replaced by a structured prescription (§5).
- **Intensity interpretation.** Receives a resolved profile (§7) rather than a 1–10 number to interpret.

**Claude gains:** a bounded candidate set per section, so eligibility is settled before composition rather than requested in prose · an explicit `session_function` and `anchor_relationship` per exercise (splitting today's overloaded single field) · a resolved intensity profile with hard ceilings.

**Consequence:** most of the prompt's ~380 lines describing *rules to follow* become *constraints already applied to the input*. The prompt gets shorter and the guarantees get stronger, because a rule enforced by candidate filtering cannot be forgotten by a model.

---

## 5. Structured prescriptions

The single change that unblocks duration computation, progression, and validation. Today `exercises.reps` is TEXT holding at least four data types — `"8"`, `"30 sec"`, `"AMRAP"`, `"15-12-9-6-3"`.

A prescription must express, in computable form:

- **Modality** — repetitions, time, distance, rounds, or mixed
- **Sets or rounds** — count
- **Work per set** — reps, or duration, or distance, depending on modality
- **Rep scheme** — fixed, or an explicit per-set sequence for ladders and pyramids
- **Load guidance** — as a band or a reference (percentage, RIR, bodyweight, "same as last time"), never a bare number the model invented
- **Rest** — between sets, and separately between rounds
- **Tempo** — where prescribed
- **Timer contract** — none, count-up, countdown, interval, or per-minute, with the parameters each requires
- **Interval role** — for schemes where a secondary movement fills the gap between rungs

**Ladders are the test case.** `"15-12-9-6-3"` must survive as five ordered work targets, because the ladder renderer needs them individually, duration needs their sum, and progression needs to know which rung was reached.

---

## 6. Duration calculation

Deterministic, in code, from the structured prescription. Claude's opinion is not an input.

**Per exercise:**

| Structure | Duration |
|---|---|
| standard | `sets × (work_time + rest_seconds)` |
| superset | `rounds × (work_A + work_B + rest_after_pair)` |
| circuit | `rounds × (Σ work + intra_transitions) + (rounds − 1) × round_rest` |
| emom | `minutes × 60` — fixed by definition |
| amrap | `minutes × 60` — fixed by definition |
| for_time | `min(time_cap, estimated_work_time)` |

**`work_time`** comes from modality: a duration prescription supplies it directly; a rep prescription computes `reps × seconds_per_rep`, adjusted when tempo is specified.

**Transitions** come from each exercise's setup class (§8) — the cost of loading a barbell is not the cost of picking up a kettlebell, and across a full session that difference is minutes.

**Section duration** = Σ exercise durations + inter-exercise transitions.
**Workout duration** = Σ section durations + inter-section transitions.

**Validation** compares *computed* against *requested*, ±10%. Failing that is a hard rejection, and the failure names which section overran — which makes it actionable rather than a retry in the dark.

**Open:** `seconds_per_rep` defaults. Needs a fitness-domain answer (§11), not an engineering guess.

---

## 7. Intensity normalization

The user-facing slider stays 1–10. Confirmed: a second dial pushes backend complexity onto someone walking into a gym.

Internally, `intensity + goal + duration + history + constraints` resolves — deterministically, in code — into a bounded profile:

- **Session effort** — target RPE band
- **Volume** — working-set range
- **Density** — work-to-rest ratio band
- **Maximum technical tier** — foundational · intermediate · advanced
- **Impact allowance** — low · moderate · high
- **Resistance guidance** — %1RM or RIR band

**This is the fix for compounding.** Today intensity 9 simultaneously selects the hardest movements, the heaviest loads, the most sets, the lowest reps and the tightest caps — five multiplications of "hard" that nothing notices. Resolved dimensions can be **capped independently**: a user with a persistent low-impact constraint gets intensity 9 as heavy-and-dense-but-low-impact, rather than everything maxed at once.

Both requested and effective values are retained, so an adjustment is visible rather than mysterious.

**Open:** the actual mapping values. Fitness-domain input (§11).

---

## 8. Exercise metadata — derived, not authored

**Revised.** The earlier version of this section proposed five new attributes and an authoring
workstream across 173 movements. That was solving a problem the codebase doesn't have.

### What duration actually needs

The duration engine (§6) needs two numbers per exercise:

| Input | Source | Why it works |
|---|---|---|
| **Seconds per rep** | `exercise_role` — already populated | A compound lift rep is slower than an accessory rep, which is slower than a conditioning rep. One default per role. |
| **Transition time** | `default_equipment` — already populated | Loading a barbell costs more than picking up a kettlebell. One default per equipment type. |

**Modality** — reps vs time vs distance — is not a per-exercise attribute at all. It is a property
of the *prescription*, and §5 makes it explicit there. A plank prescribed for 30 seconds and a plank
prescribed for 3 sets of 20 breaths differ in modality while being the same exercise.

**Net new authoring: zero.** Two lookup tables of roughly seven and six entries, derived from columns
that already exist.

### How the numbers get right

Ship the engine with role- and equipment-based defaults. Compare computed duration against actual
elapsed time — `workout_sessions.duration_mins` already records it. Where the error is consistent,
fix that role or that specific exercise.

This is the opposite of the authoring workstream: **evidence first, exceptions second.** If barbell
deadlifts consistently overrun their estimate, fix deadlifts. Do not pre-classify 173 movements on
speculation to avoid a problem that may only affect four of them.

A per-exercise override column exists for the exceptions. It starts empty.

### Deferred, with revival conditions

| Attribute | Deferred because | Revive when |
|---|---|---|
| `impact_category` | Only consumed by an impact constraint (§9), and no user has set one | A user sets an impact constraint and generation ignores it |
| `technical_demand` | Only feeds a soft composition preference the model can already make from its own knowledge | Generated sessions show a pattern of misplaced technical work that prompt guidance cannot fix |

Neither is load-bearing for D5, D6, or the three-state model. Both were proposed for a safety layer
that requires fitness-domain review to author responsibly — and deferring them removes that
dependency entirely rather than working around it.

### What this changes elsewhere

`META-01` is withdrawn. The metadata-authoring workstream does not exist. `DATA-04` shrinks from
"five attributes plus governance" to "two derivation tables plus an override column."

## 9. User-authored constraints

Replaces structured limitation modelling. **CLEAR does not model injuries.**

A constraint is something the user explicitly chose:

| Field | Values |
|---|---|
| Scope | exercise · movement pattern · equipment · impact |
| Action | **exclude** (hard, deterministic) · **avoid** (ranking penalty) · **prefer not** (soft) |
| Duration | this session · persistent |
| Note | free text — context only |

**The rule that keeps this safe: no constraint is ever inferred from free text.** "My left shoulder has been bothering me" is acknowledged, may make composition more conservative, and may prompt the user to add a constraint. It never *becomes* one silently.

This keeps CLEAR on the "respect what the user told us" side of a line it should not cross — and it is also the honest position, since inferring exclusions from described symptoms is clinical reasoning without clinical accountability.

Free text remains valuable as context for composition. It is simply never load-bearing for safety.

---

## 10. Requirement impact

### New

| ID | Scope | Milestone |
|---|---|---|
| `DATA-04` | Duration derivation: seconds-per-rep by role, transition time by equipment, per-exercise override | M0 |
| `DATA-05` | User-authored constraints: scope, action, duration, note | M0 |
| `GEN-06` | Deterministic duration engine + validation on computed totals | M1 |
| `GEN-07` | Intensity normalization into the bounded profile | M1 |

### Substantially revised

| ID | Change |
|---|---|
| `DATA-01` | Three-state model, typed absence, revision lineage, version stamping. This is the rewrite. |
| `CORE-03` | Schemas for structured prescriptions — every modality, every timer contract, ladders as ordered targets |
| `GEN-02` | Output contract v4.1: no duration, no invented facts, bounded candidates, resolved profile |
| `SES-01` | Persists all three states; **acceptance must include the D6 reproduction as a regression test** |
| `REV-02`, `REV-03` | Swaps create revisions with lineage rather than mutating in place |
| `EXE-02`, `EXE-03`, `EXE-04` | Renderers consume structured prescriptions instead of parsing strings |
| `EXE-05` | Rest timing from structured rest rather than inference |
| `OVR-01` | `reps_prescribed` now exists properly; rep-completion becomes computable rather than parsed |
| `DATA-03` | Types regenerate against the new schema |

### Unaffected

The entire ENV trunk, the DS trunk, AUTH, CORE-01/02/04, HOME, HIST, SET, FAV, PWA. **Roughly two-thirds of the graph does not move.**

---

## 11. Open decisions

Ordered by how much they block.

1. ~~Who reviews the exercise metadata?~~ **Resolved by §8.** No attribute remaining in the schema
   requires fitness-domain review. Duration derives from existing columns and is corrected by measured
   error; the two attributes that needed a reviewer are deferred. The safety mechanism is user-authored
   exclusions, where the user is the authority on their own body.
2. **Anchor taxonomy** *(decide before DATA-01)* — `anchor_type` holds movement patterns
   (`squat`/`hinge`/`press`/`pull`), body regions (`upper_body`/`lower_body`/`full_body`), and a
   modality (`power`) in one enum, used for both sessions and exercises. Splitting into session
   **focus** and exercise **movement pattern** makes coverage balancing and `suggest_anchor` precise,
   and removes a prose translation step from the prompt. No UI change. Recommended.
3. **Intensity mapping values** — the numbers behind the six dimensions in §7. Tunable after the
   schema lands; does not block it.
4. **After-start regeneration** — what is editable once a workout begins, and what locks. Still unresolved from the map.
5. **Global working-weight change scope** — one exercise, a movement family, an equipment variant, or all future prescriptions.
6. **REV-04 promotion** — the schema supports pre-start editing; whether it is built in M2 stays a product-priority call.
7. **Regeneration telemetry** — record how many times a workout was regenerated before starting, and optionally what was discarded. It is the only honest generation-quality signal obtainable without asking the user. Cheap now, invisible later.

---

## 12. Deferred — confirmed

Derived athlete state beyond OVR-01's load anchors · quality scoring · session blueprint and candidate ranking as *stored* artifacts (they are code, not schema) · wearables and readiness signals · analytics beyond basic events · calendar programming · any clinical ontology.

---

## 13. What this buys

Against the map's acceptance checks:

- Reconstruct prescribed / revised / performed — **yes**, via I1–I2
- Store a partial log without treating missing as zero — **yes**, via I3
- Preserve edits and execution through regeneration — **yes**, via I1 + I4
- Calculate and validate duration from structured prescriptions — **yes**, §5 + §6
- Deterministically exclude invalid exercises before composition — **yes**, §8 + §9, gated on coverage
- Cite the observations behind a recommendation — **yes**, via I5
- Distinguish raw history from derived state — **yes**, via I5
- Version prompts, schemas, metadata, validators — **yes**, via I7
- One Postgres deployment, no artificial boundaries — **yes**
- Add a readiness source later without redesign — **yes**; it enters as evidence, not as a core dependency
- Trace every rule to its enforcing layer — **yes**, §4 draws that line explicitly

And it fixes the two defects that are corrupting data today.
